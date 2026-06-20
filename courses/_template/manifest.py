"""
Template manifest — copy to courses/<your-course-id>/manifest.py and fill in the blanks.
"""

from __future__ import annotations

import json
from pathlib import Path

from backend.course import Course, register

# from .verifier import CustomVerifier  # uncomment if you have a custom verifier

_HERE = Path(__file__).parent


def _build() -> Course:
    graph = json.loads((_HERE / "graph.json").read_text())

    # Choose a verifier. SQLVerifier is available from backend.course for SQL-style tasks.
    # from backend.course import SQLVerifier
    # verifier = SQLVerifier(seed_sql_path=_HERE / "seed.sql", schema_text="")
    # verifier = CustomVerifier()

    raise NotImplementedError("Replace this with a real verifier and fill in Course fields.")

    return Course(
        id="REPLACE_ME",        # must match the directory name under courses/
        name="REPLACE_ME",
        description="REPLACE_ME",
        graph=graph,
        corpus_dir=_HERE / "corpus",
        verifier=verifier,      # type: ignore[name-defined]
    )


register(_build())
