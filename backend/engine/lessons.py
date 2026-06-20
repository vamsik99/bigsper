"""
Lesson generation engine — course-agnostic.

Public surface:
  fetch_lesson(concept_id, profile)                       -> dict
  rerender_lesson(concept_id, profile, sources?)          -> dict
  get_profile_dimensions()                                -> dict
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_PROFILE_DIMENSIONS: dict[str, list[str]] = {
    "depth": ["simpler", "standard", "deeper"],
    "example_domain": ["ecommerce", "sports", "finance"],
    "format": ["worked_example", "analogy", "step_by_step"],
}


def get_profile_dimensions() -> dict[str, list[str]]:
    from backend import course as _course_mod

    course = _course_mod.get_active()
    return getattr(course, "profile_dimensions", DEFAULT_PROFILE_DIMENSIONS)


def _get_concept_node(course: Any, concept_id: str) -> dict[str, Any]:
    return next(
        (n for n in course.graph.get("nodes", []) if n["id"] == concept_id),
        {"id": concept_id, "label": concept_id, "description": ""},
    )


def _retrieve_chunks(concept_id: str, course_id: str, limit: int = 5) -> list[dict[str, Any]]:
    """Pull corpus chunks for concept_id from ChromaDB via metadata filter (no embedding needed)."""
    from backend.engine.rag import get_collection

    collection = get_collection(course_id)
    if collection.count() == 0:
        logger.info("rag: collection empty for course %r", course_id)
        return []

    try:
        results = collection.get(
            where={"concept_id": concept_id},
            include=["documents", "metadatas"],
            limit=limit,
        )
    except Exception as exc:
        logger.warning("rag.get failed for concept %r: %s", concept_id, exc)
        return []

    docs: list[str] = results.get("documents") or []
    metas: list[dict] = results.get("metadatas") or []

    if not docs:
        logger.info("rag: no chunks found for concept %r in course %r", concept_id, course_id)

    return [
        {
            "text": doc,
            "concept_id": meta.get("concept_id", concept_id),
            "chunk_idx": meta.get("chunk_idx", i),
        }
        for i, (doc, meta) in enumerate(zip(docs, metas))
    ]


_DEPTH_INSTRUCTIONS: dict[str, str] = {
    "simpler": (
        "Write a beginner-friendly, simplified explanation. "
        "Avoid jargon. Use short sentences and plain language."
    ),
    "standard": (
        "Write a clear standard-level explanation suitable for a learner "
        "preparing for SQL placement tests."
    ),
    "deeper": (
        "Write a thorough deep-dive: cover nuances, edge cases, "
        "performance implications, and common gotchas."
    ),
}

_FORMAT_INSTRUCTIONS: dict[str, str] = {
    "worked_example": (
        "Build the lesson around a concrete worked example first, "
        "then generalise to the rule."
    ),
    "analogy": (
        "Open with a vivid real-world analogy, then map it precisely "
        "to the SQL concept."
    ),
    "step_by_step": "Use a numbered step-by-step breakdown as the primary structure.",
}


def _build_messages(
    node: dict[str, Any], profile: dict[str, str], chunks: list[dict[str, Any]]
) -> list[dict[str, str]]:
    depth = profile.get("depth", "standard")
    domain = profile.get("example_domain", "generic")
    fmt = profile.get("format", "worked_example")

    corpus_text = "\n\n---\n\n".join(c["text"] for c in chunks)

    system = (
        "You are an expert technical educator writing concise SQL micro-lessons. "
        "Ground every factual claim in the corpus excerpts provided below. "
        "Do not introduce information absent from the corpus. "
        "If the corpus does not cover a detail, omit it rather than inventing it. "
        "Keep the lesson under 280 words. "
        "Use markdown: headings with ##, **bold** for key terms, ```sql blocks for code."
    )

    user = (
        f"## Concept: {node.get('label', node['id'])}\n"
        f"{node.get('description', '')}\n\n"
        f"## Corpus excerpts (sole authorised source)\n\n{corpus_text}\n\n"
        f"## Adaptation profile (follow strictly — never use the phrase 'learning styles')\n"
        f"- Depth: **{depth}** — {_DEPTH_INSTRUCTIONS.get(depth, '')}\n"
        f"- Example domain: **{domain}** — draw examples from a {domain} context where applicable\n"
        f"- Format: **{fmt}** — {_FORMAT_INSTRUCTIONS.get(fmt, '')}\n\n"
        f"Write the micro-lesson now. Begin directly with the content."
    )

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


async def fetch_lesson(concept_id: str, profile: dict[str, str]) -> dict[str, Any]:
    """
    Retrieve corpus chunks for concept_id then generate a grounded micro-lesson.
    Returns no_corpus=True if no chunks are indexed for this concept.
    """
    from backend import course as _course_mod
    from backend import llm

    course = _course_mod.get_active()
    node = _get_concept_node(course, concept_id)
    chunks = _retrieve_chunks(concept_id, course.id)

    if not chunks:
        label = node.get("label", concept_id)
        return {
            "concept_id": concept_id,
            "lesson": (
                f"**No corpus content indexed yet for '{label}'.**\n\n"
                f"To enable grounded lessons for this concept, add a file named "
                f"`{concept_id}.md` to `courses/sql/corpus/` and restart the server "
                f"to rebuild the index."
            ),
            "sources": [],
            "profile": profile,
            "no_corpus": True,
        }

    messages = _build_messages(node, profile, chunks)
    lesson_text = await llm.chat(messages, tier="strong")

    sources = [
        {"text": c["text"], "concept_id": c["concept_id"], "chunk_idx": c["chunk_idx"]}
        for c in chunks
    ]

    return {
        "concept_id": concept_id,
        "lesson": lesson_text,
        "sources": sources,
        "profile": profile,
        "no_corpus": False,
    }


async def rerender_lesson(
    concept_id: str,
    profile: dict[str, str],
    sources: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Re-render the lesson with a new profile.
    When sources are provided, reuses them (no ChromaDB round-trip needed).
    """
    from backend import course as _course_mod
    from backend import llm

    if not sources:
        return await fetch_lesson(concept_id, profile)

    course = _course_mod.get_active()
    node = _get_concept_node(course, concept_id)

    chunks = [
        {
            "text": s["text"],
            "concept_id": s.get("concept_id", concept_id),
            "chunk_idx": s.get("chunk_idx", i),
        }
        for i, s in enumerate(sources)
    ]

    messages = _build_messages(node, profile, chunks)
    lesson_text = await llm.chat(messages, tier="strong")

    return {
        "concept_id": concept_id,
        "lesson": lesson_text,
        "sources": sources,
        "profile": profile,
        "no_corpus": False,
    }
