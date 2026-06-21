"""
Task engine — generate practice tasks and verify submissions.

Rules:
- Task generation delegates to course.verifier.generate_task() (course-specific).
- Verification delegates to course.verifier.verify() (always deterministic for SQL).
- The LLM only narrates; it never sets score, passed, or badge_kind.
- Tasks are persisted in-process so /task/verify can look up the reference solution.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

import backend.llm as llm
from backend.course import get_active

logger = logging.getLogger(__name__)

# In-process task store: task_id -> full task dict (including expected_sql)
_tasks: dict[str, dict[str, Any]] = {}


async def generate_task(weak_concepts: list[str]) -> dict[str, Any]:
    """
    Generate a practice task for the given weak concepts.
    Returns public task info (no reference solution exposed to client).
    """
    course = get_active()
    task = await course.verifier.generate_task(weak_concepts, llm, course)

    task_id = str(uuid.uuid4())
    _tasks[task_id] = task
    logger.info("generated task %s for concepts %s", task_id, weak_concepts)

    context = getattr(course.verifier, "schema_text", "") or ""
    return {
        "task_id": task_id,
        "prompt": task["prompt"],
        "concept_id": task.get("concept_id", ""),
        "context": context,
    }


async def verify_task(task_id: str, submission: str) -> dict[str, Any]:
    """
    Grade a submission against the stored task reference solution.
    Returns a scorecard: badge (from course.badge), deterministic signals/evidence,
    and an LLM-generated coaching narrative.
    """
    if not submission or not submission.strip():
        return {
            "passed": False,
            "score": 0.0,
            "badge": {"label": "Not submitted", "color": "gray", "icon": "—"},
            "signals": "No SQL submitted. Please write a query and try again.",
            "evidence": {"expected_rows": [], "actual_rows": []},
            "narrative": "Please enter a SQL query before submitting.",
            "error": None,
        }

    course = get_active()
    task = _tasks.get(task_id)
    if task is None:
        raise KeyError(f"Task {task_id!r} not found. Did /task/generate run first?")

    # Deterministic grading — LLM is NOT involved in this step
    result = course.verifier.verify(task, submission)
    badge = course.badge(result)

    # LLM narrates only; it never sees expected_sql or overrides the score
    narrative = await _narrate(result, task, submission)

    return {
        "passed": result.passed,
        "score": result.score,
        "badge": badge,
        "signals": result.feedback,
        "evidence": {
            "expected_rows": result.details.get("expected_rows", []),
            "actual_rows": result.details.get("actual_rows", []),
        },
        "narrative": narrative,
        "error": result.details.get("error"),
    }


async def _narrate(result, task: dict, submission: str) -> str:
    """LLM coaching narrative — never re-grades."""
    status = "correct" if result.passed else "incorrect"
    messages = [
        {
            "role": "system",
            "content": (
                "You are a concise technical tutor. The student's answer has already been graded "
                "deterministically — do NOT re-evaluate or override the grade. "
                "Your only job: write 2–3 sentences of coaching that explain what was right "
                "or what went wrong, and give one concrete tip for improvement if the answer "
                "was incorrect."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Exercise: {task['prompt']}\n\n"
                f"Student answer:\n{submission}\n\n"
                f"Grading outcome: {status}\n"
                f"System feedback: {result.feedback}\n\n"
                "Write your coaching now."
            ),
        },
    ]
    try:
        return await llm.chat(messages, tier="cheap")
    except Exception as exc:
        logger.warning("narrative LLM call failed: %s", exc)
        return result.feedback
