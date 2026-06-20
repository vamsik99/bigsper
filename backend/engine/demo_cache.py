"""
Pre-baked demo path cache.

Used when LLM/embedding providers are unreachable during live demos.
All data is deterministic — no API call required to serve these responses.
The demo task (DEMO_TASK_ID / DEMO_TASK_DATA) is registered in tasks._tasks
at app startup so SQLite verification still runs live against the real sandbox.
"""

from __future__ import annotations

# Fixed task_id for the pre-baked demo task
DEMO_TASK_ID = "bigsper-demo-cache-001"

# ---------------------------------------------------------------------------
# Diagnostic
# ---------------------------------------------------------------------------

DEMO_DIAGNOSTIC_RESPONSE = {
    "session_id": "demo-cache-session",
    "question_number": 1,
    "question": {
        "stem": (
            "Which SQL clause filters individual rows BEFORE "
            "any grouping or aggregation occurs?"
        ),
        "options": ["HAVING", "WHERE", "GROUP BY", "ORDER BY"],
        "correct_index": 1,
        "concept_id": "filtering",
        "explanation": (
            "WHERE filters rows before grouping; "
            "HAVING filters aggregated groups after GROUP BY."
        ),
    },
    "done": False,
    "_from_cache": True,
}

# Grade returned when session look-up fails (e.g. cache session answered)
DEMO_GRADE = {
    "correct": False,
    "rationale": (
        "Incorrect. The right answer was option 2 (WHERE). "
        "WHERE filters individual rows before any aggregation; "
        "HAVING filters groups produced by GROUP BY."
    ),
}

# Pre-baked mastery: filtering is a gap; select_basics is inferred weak
DEMO_MASTERY: dict[str, float] = {
    "filtering": 0.0,
    "select_basics": 0.3,
}

# ---------------------------------------------------------------------------
# Lesson for "filtering"
# ---------------------------------------------------------------------------

DEMO_LESSON_RESPONSE: dict = {
    "concept_id": "filtering",
    "lesson": (
        "## Filtering with WHERE\n\n"
        "The `WHERE` clause is SQL's row-level filter — it decides *which rows "
        "enter the query* before any computation happens.\n\n"
        "**Worked example** (e-commerce context)\n\n"
        "```sql\n"
        "-- Find employees earning more than $80,000\n"
        "SELECT name, salary\n"
        "FROM employees\n"
        "WHERE salary > 80000;\n"
        "```\n\n"
        "Only rows where `salary > 80000` are returned; all others are discarded "
        "before `SELECT` even runs.\n\n"
        "**Comparison operators**\n\n"
        "| Operator | Meaning |\n"
        "|----------|---------|\n"
        "| `=` | Equal |\n"
        "| `<>` / `!=` | Not equal |\n"
        "| `>`, `<`, `>=`, `<=` | Range comparisons |\n"
        "| `BETWEEN a AND b` | Inclusive range |\n"
        "| `IN (v1, v2, …)` | Match any value in list |\n"
        "| `LIKE 'A%'` | Pattern match (% = wildcard) |\n\n"
        "**NULL handling**\n\n"
        "NULL is never equal to anything — not even itself. "
        "Use `IS NULL` or `IS NOT NULL`:\n\n"
        "```sql\n"
        "SELECT * FROM employees WHERE department_id IS NULL;\n"
        "```\n\n"
        "**WHERE vs HAVING:** `WHERE` runs before grouping (filters rows); "
        "`HAVING` runs after `GROUP BY` (filters groups). "
        "Always prefer `WHERE` when possible — it shrinks the row set early "
        "and improves query performance."
    ),
    "sources": [],
    "profile": {
        "depth": "standard",
        "example_domain": "ecommerce",
        "format": "worked_example",
    },
    "no_corpus": False,
    "_from_cache": True,
}

# ---------------------------------------------------------------------------
# Task
# ---------------------------------------------------------------------------

DEMO_TASK_DATA: dict = {
    "prompt": (
        "Retrieve the name and salary of all employees earning more than $80,000, "
        "ordered by salary from highest to lowest."
    ),
    "expected_sql": (
        "SELECT name, salary FROM employees WHERE salary > 80000 ORDER BY salary DESC"
    ),
    "concept_id": "filtering",
    "ordered": True,
}

DEMO_TASK_RESPONSE: dict = {
    "task_id": DEMO_TASK_ID,
    "prompt": DEMO_TASK_DATA["prompt"],
    "concept_id": "filtering",
    "context": (
        "employees (id INTEGER, name TEXT, department_id INTEGER, "
        "salary REAL, hire_date TEXT)"
    ),
    "_from_cache": True,
}
