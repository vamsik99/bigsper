"""Aptitude course manifest — registers the Aptitude Course at import time."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from backend.course import Course, register

_HERE = Path(__file__).parent


def _load_verifier():
    spec = importlib.util.spec_from_file_location(
        "courses.aptitude.verifier", _HERE / "verifier.py"
    )
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod.ExactMatchVerifier


def _build() -> Course:
    graph = json.loads((_HERE / "graph.json").read_text())
    ExactMatchVerifier = _load_verifier()
    verifier = ExactMatchVerifier()
    return Course(
        id="aptitude",
        name="Aptitude",
        description="Quantitative aptitude for campus placement exams.",
        graph=graph,
        corpus_dir=_HERE / "corpus",
        verifier=verifier,
    )


register(_build())
