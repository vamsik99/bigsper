"""RAG index: ingest corpus_dir, chunk, embed via llm.embed(), persist in ChromaDB."""

from __future__ import annotations

import logging
import os
from pathlib import Path

import chromadb

logger = logging.getLogger(__name__)

_CHROMA_PATH = os.environ.get(
    "CHROMA_PATH",
    str(Path(__file__).parent.parent.parent / ".chroma"),
)

_chroma_client: chromadb.PersistentClient | None = None


def _get_client() -> chromadb.PersistentClient:
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=_CHROMA_PATH)
    return _chroma_client


def get_collection(course_id: str) -> chromadb.Collection:
    return _get_client().get_or_create_collection(
        name=f"bigsper_{course_id}",
        metadata={"hnsw:space": "cosine"},
    )


def chunk_count(course_id: str) -> int:
    try:
        return get_collection(course_id).count()
    except Exception:
        return 0


def _chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    if not text.strip():
        return []
    chunks, start = [], 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start += chunk_size - overlap
    return chunks


async def build_index(corpus_dir: Path, course_id: str) -> int:
    """
    Ingest .txt and .md files from corpus_dir, chunk them, embed via llm.embed(),
    and upsert into ChromaDB. File stem is used as concept_id metadata.
    Returns total chunk count in the collection after indexing.
    """
    from backend import llm

    files = sorted(corpus_dir.glob("*.txt")) + sorted(corpus_dir.glob("*.md"))
    if not files:
        total = chunk_count(course_id)
        logger.info("rag: no corpus files in %s — collection has %d chunks", corpus_dir, total)
        return total

    collection = get_collection(course_id)
    all_docs: list[str] = []
    all_ids: list[str] = []
    all_metas: list[dict] = []

    for f in files:
        concept_id = f.stem
        chunks = _chunk_text(f.read_text(encoding="utf-8"))
        for i, chunk in enumerate(chunks):
            all_docs.append(chunk)
            all_ids.append(f"{course_id}_{concept_id}_{i}")
            all_metas.append({"concept_id": concept_id, "course_id": course_id, "chunk_idx": i})

    if not all_docs:
        total = collection.count()
        logger.info("rag: corpus files present but all empty — %d chunks in collection", total)
        return total

    all_embeddings: list[list[float]] = []
    for i in range(0, len(all_docs), 100):
        all_embeddings.extend(await llm.embed(all_docs[i : i + 100]))

    collection.upsert(ids=all_ids, embeddings=all_embeddings, documents=all_docs, metadatas=all_metas)
    total = collection.count()
    logger.info("rag: indexed %d chunks from %d files → %d total in collection", len(all_docs), len(files), total)
    return total
