"""
Custom verifier for <course-id>.
Only needed when SQLVerifier (from backend.course) is not appropriate.
"""

from __future__ import annotations

from typing import Any

from backend.course import Verifier, VerifierResult


class CustomVerifier(Verifier):
    # Change to "verified" ONLY if scoring is 100% deterministic (no LLM involved).
    badge_kind = "ai_assessed"

    def verify(self, task: dict[str, Any], answer: str) -> VerifierResult:
        raise NotImplementedError("Implement deterministic grading or wire up an AI assessor.")
