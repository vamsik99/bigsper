"""Course-agnostic faculty cohort report engine.

Loads cohort data from <course_dir>/cohort.json and aggregates it into:
  - class_heatmap: per-concept mastery distribution across the cohort
  - placement_ready_count: students averaging >= READINESS_THRESHOLD
  - weakest_concepts: bottom-N concepts by average cohort mastery
  - students: per-student readiness + prove-it summary, sorted by readiness
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

READINESS_THRESHOLD = 0.70  # avg mastery across known concepts


def _cohort_path() -> Path:
    from backend.course import get_active
    course = get_active()
    return course.corpus_dir.parent / "cohort.json"


def load_cohort() -> list[dict]:
    """Return all student records (mock cohort + live_run if present)."""
    path = _cohort_path()
    if not path.exists():
        logger.warning("cohort.json not found at %s", path)
        return []
    data = json.loads(path.read_text())
    students: list[dict] = list(data.get("students", []))
    live_run = data.get("live_run")
    if live_run:
        students.append(live_run)
    return students


def build_report() -> dict:
    """Aggregate cohort into the full faculty report payload."""
    from backend.course import get_active

    course = get_active()
    students = load_cohort()
    nodes: list[dict] = course.graph.get("nodes", [])
    concept_label: dict[str, str] = {n["id"]: n["label"] for n in nodes}
    concept_ids: list[str] = [n["id"] for n in nodes]

    # ------------------------------------------------------------------ heatmap
    class_heatmap: list[dict] = []
    for cid in concept_ids:
        mastered = partial = gap = unknown = 0
        scores: list[float] = []
        for s in students:
            score = s.get("mastery", {}).get(cid)
            if score is None:
                unknown += 1
            elif score >= 0.9:
                mastered += 1
                scores.append(score)
            elif score >= 0.25:
                partial += 1
                scores.append(score)
            else:
                gap += 1
                scores.append(score)

        class_heatmap.append(
            {
                "concept_id": cid,
                "concept_label": concept_label.get(cid, cid),
                "mastered": mastered,
                "partial": partial,
                "gap": gap,
                "unknown": unknown,
                "avg_score": round(sum(scores) / len(scores), 3) if scores else None,
            }
        )

    # ------------------------------------------------------- per-student summary
    student_reports: list[dict] = []
    placement_ready_count = 0

    for s in students:
        mastery: dict[str, float] = s.get("mastery") or {}
        known = [v for v in mastery.values() if v is not None]
        readiness = round(sum(known) / len(known), 3) if known else 0.0

        prove_it: dict = s.get("prove_it") or {}
        student_reports.append(
            {
                "id": s.get("id", ""),
                "name": s.get("name", ""),
                "readiness_score": readiness,
                "prove_it_score": prove_it.get("score"),
                "prove_it_passed": prove_it.get("passed"),
                "prove_it_badge": prove_it.get("badge_kind"),
                "prove_it_concept": prove_it.get("concept_id"),
            }
        )
        if readiness >= READINESS_THRESHOLD:
            placement_ready_count += 1

    student_reports.sort(key=lambda r: r["readiness_score"], reverse=True)

    # ------------------------------------------------------- weakest concepts
    assessed = [c for c in class_heatmap if c["avg_score"] is not None]
    assessed.sort(key=lambda c: c["avg_score"])  # type: ignore[arg-type]
    weakest = assessed[:5]

    return {
        "class_heatmap": class_heatmap,
        "placement_ready_count": placement_ready_count,
        "total_students": len(students),
        "weakest_concepts": weakest,
        "students": student_reports,
        "readiness_threshold": READINESS_THRESHOLD,
    }
