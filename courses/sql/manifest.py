"""Register the SQL placement-prep course. Imported at startup by app.py."""

from __future__ import annotations

import json
from pathlib import Path

from backend.course import Course, SQLVerifier, register

_HERE = Path(__file__).parent


def _build() -> Course:
    graph = json.loads((_HERE / "graph.json").read_text())
    schema_path = _HERE / "schema.txt"
    schema_text = schema_path.read_text() if schema_path.exists() else ""
    verifier = SQLVerifier(
        seed_sql_path=_HERE / "seed.sql",
        schema_text=schema_text,
    )
    return Course(
        id="sql",
        name="SQL Placement Prep",
        description=(
            "Master SQL from basics through window functions. "
            "Tasks are graded deterministically against a SQLite sandbox."
        ),
        graph=graph,
        corpus_dir=_HERE / "corpus",
        verifier=verifier,
    )


register(_build())
