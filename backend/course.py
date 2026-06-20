"""
Course / Verifier contract, registry, and SQLVerifier worked example.

Stability contract: do not rewrite this file.

Rules enforced by design:
- Engine modules call get_active(); they never import subject-specific symbols.
- Verifier.badge_kind == "verified" only when scoring is 100% deterministic.
- An LLM never produces a "verified" badge or score.
"""

from __future__ import annotations

import os
import sqlite3
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Core data types
# ---------------------------------------------------------------------------

@dataclass
class VerifierResult:
    score: float            # 0.0 – 1.0
    passed: bool
    badge_kind: str         # "verified" | "ai_assessed"
    feedback: str
    details: dict[str, Any] = field(default_factory=dict)


class Verifier(ABC):
    """Base class for all course verifiers."""

    badge_kind: str = "ai_assessed"

    @abstractmethod
    def verify(self, task: dict[str, Any], answer: str) -> VerifierResult:
        """Grade `answer` against `task`. Must be deterministic when badge_kind == 'verified'."""
        ...

    async def generate_task(
        self,
        weak_concepts: list[str],
        llm,  # backend.llm module — caller injects to avoid circular import
        course: "Course",
    ) -> dict[str, Any]:
        """Generate a practice task dict for the given weak concepts.

        Returns a dict compatible with verify(). Override in course-specific verifiers.
        """
        raise NotImplementedError(f"{type(self).__name__} does not implement generate_task.")


@dataclass
class Course:
    id: str
    name: str
    description: str
    graph: dict[str, Any]       # loaded from graph.json
    corpus_dir: Path
    verifier: Verifier

    def badge(self, result: VerifierResult) -> dict[str, str]:
        """Return display metadata for a VerifierResult badge."""
        _map = {
            "verified":    {"label": "Verified",    "color": "green", "icon": "✓"},
            "ai_assessed": {"label": "AI Assessed", "color": "blue",  "icon": "⚡"},
        }
        return _map.get(result.badge_kind, {"label": result.badge_kind, "color": "gray", "icon": "?"})


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

_registry: dict[str, Course] = {}


def register(course: Course) -> None:
    """Register a course. Called by each courses/<id>/manifest.py at import time."""
    _registry[course.id] = course


def get_active() -> Course:
    """Return the currently active course (set by ACTIVE_COURSE env, default 'sql')."""
    active_id = os.environ.get("ACTIVE_COURSE", "sql")
    if active_id not in _registry:
        raise RuntimeError(
            f"Active course {active_id!r} is not registered. "
            f"Registered: {list(_registry)}. "
            f"Ensure courses/{active_id}/manifest.py was imported at startup."
        )
    return _registry[active_id]


# ---------------------------------------------------------------------------
# SQLVerifier — worked example (deterministic; badge_kind = "verified")
# ---------------------------------------------------------------------------

class SQLVerifier(Verifier):
    """
    Deterministic verifier for SQL tasks.

    Executes both expected_sql and the learner's answer against an in-memory
    SQLite sandbox seeded from seed_sql_path, then compares result sets.
    badge_kind is always "verified" — an LLM is never involved in scoring.

    Task schema expected:
      {
        "prompt":       str,          # human-readable question
        "expected_sql": str,          # reference solution
        "concept_id":   str,          # links back to graph node
        "ordered":      bool          # True if row order matters (default False)
      }
    """

    badge_kind = "verified"

    def __init__(self, seed_sql_path: Path, schema_text: str = "") -> None:
        self.seed_sql_path = Path(seed_sql_path)
        self.schema_text = schema_text

    def _make_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        if self.seed_sql_path.exists():
            conn.executescript(self.seed_sql_path.read_text())
        return conn

    async def generate_task(self, weak_concepts: list[str], llm, course) -> dict[str, Any]:
        """Generate a SQL exercise grounded in the sandbox schema."""
        concept_ids = weak_concepts[:3] or ["general SQL"]
        schema = self.schema_text or "(schema not available — check courses/sql/schema.txt)"
        messages = [
            {
                "role": "system",
                "content": (
                    "You are an SQL instructor generating a deterministic practice exercise.\n\n"
                    f"Database schema (SQLite):\n{schema}\n\n"
                    "Return ONLY a JSON object with exactly these keys:\n"
                    '  "prompt": string — clear question for the student\n'
                    '  "expected_sql": string — a correct SQL SELECT query (SQLite syntax)\n'
                    '  "ordered": boolean — true only when row order matters for correctness\n'
                    "Rules: SELECT only (no DML). Use only tables/columns from the schema above. "
                    "Ensure expected_sql runs without error and returns at least one row."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Create a practical SQL exercise that tests: {', '.join(concept_ids)}. "
                    "The question should be answerable with a single SELECT statement."
                ),
            },
        ]
        data = await llm.chat_json(messages, tier="strong")
        return {
            "prompt": data.get("prompt", "Write a SQL SELECT query."),
            "expected_sql": str(data.get("expected_sql", "SELECT 1")).strip(),
            "concept_id": concept_ids[0],
            "ordered": bool(data.get("ordered", False)),
        }

    def verify(self, task: dict[str, Any], answer: str) -> VerifierResult:
        expected_sql: str | None = task.get("expected_sql")
        if not expected_sql:
            return VerifierResult(
                score=0.0,
                passed=False,
                badge_kind=self.badge_kind,
                feedback="Task has no expected_sql; cannot verify deterministically.",
            )

        try:
            expected_rows = _fetch_rows(self._make_db(), expected_sql)
            actual_rows = _fetch_rows(self._make_db(), answer)
        except sqlite3.Error as exc:
            return VerifierResult(
                score=0.0,
                passed=False,
                badge_kind=self.badge_kind,
                feedback=f"SQL error: {exc}",
                details={"error": str(exc)},
            )

        ordered: bool = task.get("ordered", False)
        passed = _rows_equal(expected_rows, actual_rows, ordered=ordered)
        return VerifierResult(
            score=1.0 if passed else 0.0,
            passed=passed,
            badge_kind=self.badge_kind,
            feedback=(
                "Correct — output matches expected result set."
                if passed else
                f"Output mismatch. Expected {len(expected_rows)} row(s), got {len(actual_rows)}."
            ),
            details={"expected_rows": expected_rows, "actual_rows": actual_rows},
        )


# ---------------------------------------------------------------------------
# Helpers (module-private)
# ---------------------------------------------------------------------------

def _fetch_rows(conn: sqlite3.Connection, sql: str) -> list[tuple]:
    cursor = conn.execute(sql)
    return [tuple(row) for row in cursor.fetchall()]


def _rows_equal(a: list[tuple], b: list[tuple], *, ordered: bool) -> bool:
    if len(a) != len(b):
        return False
    return a == b if ordered else sorted(str(r) for r in a) == sorted(str(r) for r in b)
