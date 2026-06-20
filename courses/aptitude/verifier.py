"""
ExactMatchVerifier — deterministic verifier for aptitude questions.

The LLM generates a question with a single expected answer (number or simple string).
Grading compares the student's trimmed, lowercased response to the expected answer.
badge_kind is always "verified" — no LLM involved in scoring.
"""

from __future__ import annotations

from typing import Any

from backend.course import Verifier, VerifierResult


class ExactMatchVerifier(Verifier):
    badge_kind = "verified"

    def verify(self, task: dict[str, Any], answer: str) -> VerifierResult:
        expected = str(task.get("expected_answer", "")).strip().lower().replace(" ", "")
        actual = str(answer).strip().lower().replace(" ", "")
        passed = actual == expected
        return VerifierResult(
            score=1.0 if passed else 0.0,
            passed=passed,
            badge_kind=self.badge_kind,
            feedback=(
                "Correct!"
                if passed
                else f"Incorrect. Expected: {task.get('expected_answer')}. You answered: {answer.strip()}"
            ),
            details={
                "expected": task.get("expected_answer", ""),
                "actual": str(answer).strip(),
                "expected_rows": [],
                "actual_rows": [],
            },
        )

    async def generate_task(
        self, weak_concepts: list[str], llm, course
    ) -> dict[str, Any]:
        concept_ids = weak_concepts[:2] or ["arithmetic"]
        nodes = {n["id"]: n["label"] for n in course.graph.get("nodes", [])}
        concept_labels = [nodes.get(c, c) for c in concept_ids]
        valid_ids = list(nodes.keys())

        messages = [
            {
                "role": "system",
                "content": (
                    "You are an aptitude test question writer for campus placement exams.\n"
                    "Return ONLY a JSON object with exactly these keys:\n"
                    '  "prompt": string — clear problem statement, self-contained\n'
                    '  "expected_answer": string — exact answer as a plain number or simple ratio like "3:5" (no units, no explanation)\n'
                    f'  "concept_id": string — must be one of: {", ".join(valid_ids)}\n'
                    "Rules: one unambiguous correct answer; student types it in a text box. "
                    "No trick questions. Difficulty: moderate placement-exam level."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Create an aptitude question testing: {', '.join(concept_labels)}. "
                    f"Use concept_id: {concept_ids[0]}."
                ),
            },
        ]
        data = await llm.chat_json(messages, tier="strong")
        return {
            "prompt": data.get("prompt", "Solve the problem."),
            "expected_answer": str(data.get("expected_answer", "")).strip(),
            "concept_id": data.get("concept_id", concept_ids[0]),
        }
