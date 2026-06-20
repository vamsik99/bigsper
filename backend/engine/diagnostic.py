"""
Adaptive diagnostic engine — fully course-agnostic.

Uses course.get_active() for all course data; contains zero subject-specific code.

Public surface used by app.py routes:
  gen_question(concept_node, difficulty)   -> Question
  grade_answer(question, answer_index)     -> GradeResult
  start_session()                          -> (session_id, Question)
  record_and_advance(session_id, idx)      -> (GradeResult, Question|None, mastery|None)

This module also powers module quizzes (same gen_question / grade_answer).
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

import networkx as nx
from pydantic import BaseModel, ValidationError

from backend import course as _course_mod
from backend import llm

logger = logging.getLogger(__name__)

MIN_QUESTIONS = 4
MAX_QUESTIONS = 6


# ---------------------------------------------------------------------------
# Pydantic models (shared with callers via import)
# ---------------------------------------------------------------------------

class Question(BaseModel):
    stem: str
    options: list[str]
    correct_index: int
    concept_id: str
    explanation: str


class GradeResult(BaseModel):
    correct: bool
    rationale: str


# ---------------------------------------------------------------------------
# In-memory session store  (single-process demo; no persistence needed)
# ---------------------------------------------------------------------------

_sessions: dict[str, dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# Graph helpers
# ---------------------------------------------------------------------------

def _build_graph(graph_json: dict[str, Any]) -> nx.DiGraph:
    G: nx.DiGraph = nx.DiGraph()
    for node in graph_json.get("nodes", []):
        G.add_node(node["id"], **node)
    for edge in graph_json.get("edges", []):
        G.add_edge(edge["from"], edge["to"])
    return G


def _root_nodes(G: nx.DiGraph) -> list[str]:
    """Nodes with no prerequisites (in-degree == 0), sorted by difficulty."""
    roots = [n for n in G.nodes if G.in_degree(n) == 0]
    return sorted(roots, key=lambda n: G.nodes[n].get("difficulty", 1))


# ---------------------------------------------------------------------------
# Question generation  (one retry on parse failure)
# ---------------------------------------------------------------------------

_SYS = (
    "You are an expert educational assessment author. "
    "Generate exactly one multiple-choice question that tests a learner's "
    "understanding of the given concept. "
    "Return ONLY valid JSON with this exact schema — no markdown, no extra keys: "
    '{"stem": "<question text>", '
    '"options": ["<A>", "<B>", "<C>", "<D>"], '
    '"correct_index": <0-3>, '
    '"explanation": "<brief explanation of why the answer is correct>"} '
    "correct_index is the 0-based index of the correct option. "
    "Keep the question concise, clear, and free of ambiguity."
)


async def gen_question(concept_node: dict[str, Any], difficulty: int) -> Question:
    """
    Generate an MCQ for concept_node at the given difficulty level.
    Retries once on parse failure; raises RuntimeError after two failures.
    """
    label = concept_node.get("label", concept_node["id"])
    description = concept_node.get("description", "")

    messages = [
        {"role": "system", "content": _SYS},
        {
            "role": "user",
            "content": (
                f"Concept: {label}\n"
                f"Description: {description}\n"
                f"Difficulty: {difficulty} out of 5\n\n"
                "Generate the JSON question now."
            ),
        },
    ]

    last_exc: Exception | None = None
    for attempt in range(2):
        try:
            data = await llm.chat_json(messages, tier="cheap")
            return Question(
                stem=str(data["stem"]),
                options=[str(o) for o in data["options"]],
                correct_index=int(data["correct_index"]),
                concept_id=concept_node["id"],
                explanation=str(data.get("explanation", "")),
            )
        except (KeyError, TypeError, ValidationError, ValueError) as exc:
            last_exc = exc
            logger.warning(
                "gen_question parse failure (attempt %d/2) for %r: %s",
                attempt + 1,
                concept_node["id"],
                exc,
            )

    raise RuntimeError(
        f"gen_question failed after 2 attempts for concept {concept_node['id']!r}: {last_exc}"
    )


# ---------------------------------------------------------------------------
# Answer grading  (deterministic — no LLM)
# ---------------------------------------------------------------------------

def grade_answer(question: Question, answer_index: int) -> GradeResult:
    """Compare answer_index against question.correct_index. Returns rationale."""
    correct = answer_index == question.correct_index
    if correct:
        rationale = f"Correct. {question.explanation}"
    else:
        rationale = (
            f"Incorrect. The right answer was option {question.correct_index + 1} "
            f"({question.options[question.correct_index]}). {question.explanation}"
        )
    return GradeResult(correct=correct, rationale=rationale)


# ---------------------------------------------------------------------------
# Session lifecycle
# ---------------------------------------------------------------------------

async def start_session() -> tuple[str, Question]:
    """
    Create a new diagnostic session.
    Traversal starts from root nodes (no prerequisites) and moves upward.
    Returns (session_id, first_question).
    """
    course = _course_mod.get_active()
    G = _build_graph(course.graph)

    roots = _root_nodes(G)
    if not roots:
        raise RuntimeError("Course graph has no root nodes (all nodes have prerequisites).")

    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        "G": G,
        "queue": list(roots),      # concept_ids yet to probe
        "asked": {},               # concept_id -> bool (True = correct)
        "current_question": None,
        "question_count": 0,
    }

    question = await _advance_to_next_question(session_id)
    return session_id, question


async def record_and_advance(
    session_id: str,
    answer_index: int,
) -> tuple[GradeResult, Question | None, dict[str, float] | None]:
    """
    Record the learner's answer, adapt the queue, and either:
      - return (grade, next_question, None)  if the session continues, or
      - return (grade, None, mastery_map)    if the session is complete.
    """
    state = _sessions.get(session_id)
    if state is None:
        raise KeyError(f"Session {session_id!r} not found.")

    question: Question = state["current_question"]
    if question is None:
        raise RuntimeError("No active question for this session.")

    grade = grade_answer(question, answer_index)

    G: nx.DiGraph = state["G"]
    queue: list[str] = state["queue"]
    asked: dict[str, bool] = state["asked"]
    cid = question.concept_id

    # Mark as answered
    asked[cid] = grade.correct

    # Remove current concept from the front of the queue (it was popped there)
    # (already removed in _advance_to_next_question; queue may have moved on)
    if queue and queue[0] == cid:
        queue.pop(0)

    if grade.correct:
        # On pass → enqueue successors (harder concepts this unlocks), difficulty-ordered
        new_nodes = [
            s for s in G.successors(cid)
            if s not in asked and s not in queue
        ]
        new_nodes.sort(key=lambda n: G.nodes[n].get("difficulty", 1))
        queue.extend(new_nodes)
    else:
        # On fail → prepend prerequisites (diagnose root weakness first)
        prereqs = [
            p for p in G.predecessors(cid)
            if p not in asked and p not in queue
        ]
        prereqs.sort(key=lambda n: G.nodes[n].get("difficulty", 1))
        queue[:0] = prereqs  # insert at front

    # Decide whether to stop
    n = state["question_count"]
    exhausted = all(q in asked for q in queue) or not _unanswered_in_queue(queue, asked)
    should_stop = n >= MAX_QUESTIONS or (n >= MIN_QUESTIONS and exhausted)

    if should_stop:
        mastery = _compute_mastery(G, asked)
        del _sessions[session_id]
        return grade, None, mastery

    next_q = await _advance_to_next_question(session_id)
    return grade, next_q, None


def _unanswered_in_queue(queue: list[str], asked: dict[str, bool]) -> bool:
    return any(cid not in asked for cid in queue)


async def _advance_to_next_question(session_id: str) -> Question:
    state = _sessions[session_id]
    G: nx.DiGraph = state["G"]
    queue: list[str] = state["queue"]
    asked: dict[str, bool] = state["asked"]

    # Skip concepts already answered
    while queue and queue[0] in asked:
        queue.pop(0)

    if not queue:
        raise RuntimeError("Question queue is empty — session should have terminated.")

    concept_id = queue[0]
    node_data = dict(G.nodes[concept_id])
    node_data["id"] = concept_id
    difficulty = node_data.get("difficulty", 1)

    question = await gen_question(node_data, difficulty)
    state["current_question"] = question
    state["question_count"] += 1
    return question


# ---------------------------------------------------------------------------
# Mastery computation
# ---------------------------------------------------------------------------

def _compute_mastery(G: nx.DiGraph, asked: dict[str, bool]) -> dict[str, float]:
    """
    Derive a mastery score (0..1) for every node touched by the diagnostic.

    Rules:
      - Directly answered correctly  → 1.0
      - Directly answered incorrectly → 0.0
      - Prerequisite of a failed node (inferred) → 0.3  (weak, not confirmed)
    """
    mastery: dict[str, float] = {}

    for cid, correct in asked.items():
        mastery[cid] = 1.0 if correct else 0.0

    failed_ids = {cid for cid, ok in asked.items() if not ok}
    for failed_id in failed_ids:
        for prereq in G.predecessors(failed_id):
            if prereq not in mastery:
                mastery[prereq] = 0.3  # inferred weak

    return mastery
