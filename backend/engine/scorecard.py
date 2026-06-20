"""
Scorecard assembler — course-agnostic.

Combines the diagnostic mastery score for a concept with the prove-it
verify result into a unified scorecard. No LLM involvement; the badge_kind
on the prove-it side comes from the course Verifier contract.
"""
from __future__ import annotations

from typing import Any


def build(
    concept_id: str,
    diagnostic_mastery: dict[str, float],
    verify_result: dict[str, Any],
) -> dict[str, Any]:
    """
    Assemble a unified scorecard for one concept.

    :param concept_id: The concept that was taught and tested.
    :param diagnostic_mastery: Mastery map from the diagnostic session {concept_id: 0–1}.
    :param verify_result: Output of tasks.verify_task (passed, score, badge, …).
    :returns: Unified scorecard dict ready to JSON-serialize to the frontend.
    """
    diag_score = diagnostic_mastery.get(concept_id)

    if diag_score is None:
        diag_tier = "unknown"
        diag_label = "not assessed"
    elif diag_score >= 0.9:
        diag_tier = "mastered"
        diag_label = "mastered"
    elif diag_score >= 0.25:
        diag_tier = "partial"
        diag_label = "partial"
    else:
        diag_tier = "gap"
        diag_label = "gap"

    return {
        "concept_id": concept_id,
        "diagnostic": {
            "score": diag_score,
            "tier": diag_tier,
            "label": diag_label,
        },
        "prove_it": verify_result,
    }
