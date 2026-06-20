"""FastAPI entry point. Loads the active course manifest at startup."""

from __future__ import annotations

import importlib.util
import logging
import os
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
logger = logging.getLogger(__name__)

_COURSES_DIR = Path(__file__).parent.parent / "courses"

# Startup diagnostics cached here so /health is fast and side-effect-free.
_startup: dict = {}


def _load_active_manifest() -> None:
    active = os.environ.get("ACTIVE_COURSE", "sql")
    manifest_path = _COURSES_DIR / active / "manifest.py"
    if not manifest_path.exists():
        raise RuntimeError(
            f"Manifest not found for course {active!r}: {manifest_path}. "
            "Check ACTIVE_COURSE and ensure courses/<id>/manifest.py exists."
        )
    spec = importlib.util.spec_from_file_location(f"courses.{active}.manifest", manifest_path)
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    logger.info("Loaded manifest: courses/%s/manifest.py", active)


def _sqlite_ping(course) -> dict:
    """Verify SQLite sandbox: load seed, list tables."""
    seed_path: Path | None = getattr(course.verifier, "seed_sql_path", None)
    try:
        conn = sqlite3.connect(":memory:")
        if seed_path and Path(seed_path).exists():
            conn.executescript(Path(seed_path).read_text())
        tables = [
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall()
        ]
        conn.close()
        return {"ok": True, "tables": tables}
    except Exception as exc:
        logger.error("sqlite_ping failed: %s", exc)
        return {"ok": False, "tables": [], "error": str(exc)}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    import backend.llm as llm
    from backend.course import get_active
    from backend.engine import rag

    _load_active_manifest()
    course = get_active()
    logger.info("BigSper booted — active course: %s (%s)", course.id, course.name)

    concept_count = len(course.graph.get("nodes", []))
    logger.info("concept graph: %d nodes", concept_count)

    # Build / refresh RAG index from corpus
    chroma_chunks = await rag.build_index(course.corpus_dir, course.id)

    # SQLite sandbox ping
    sqlite_info = _sqlite_ping(course)

    # Live LLM chat ping
    llm_ok = False
    llm_error = ""
    try:
        reply = await llm.chat([{"role": "user", "content": "ping"}], tier="cheap")
        llm_ok = bool(reply)
        logger.info("llm ping ok — reply: %r", reply[:60] if reply else "")
    except Exception as exc:
        llm_error = str(exc)
        logger.warning("llm ping failed: %s", exc)

    # Embed probe (records which path ran in llm._last_embed_provider)
    embed_path = "not_run"
    embed_error = ""
    try:
        await llm.embed(["healthcheck"])
        embed_path = llm.last_embed_provider()
    except Exception as exc:
        embed_error = str(exc)
        logger.warning("embed probe failed: %s", exc)

    _startup.update(
        {
            "active_course": course.id,
            "course_name": course.name,
            "concept_count": concept_count,
            "chroma_chunks": chroma_chunks,
            "sqlite": sqlite_info,
            "llm_ping": {"ok": llm_ok, **({"error": llm_error} if llm_error else {})},
            "embed_path": embed_path,
            **({"embed_error": embed_error} if embed_error else {}),
        }
    )

    all_ok = sqlite_info["ok"] and llm_ok and embed_path not in ("not_run",)
    _startup["status"] = "ok" if all_ok else "degraded"
    logger.info("startup diagnostics: %s", _startup)

    yield


app = FastAPI(title="BigSper", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return _startup


# ---------------------------------------------------------------------------
# Diagnostic endpoints
# ---------------------------------------------------------------------------

class AnswerRequest(BaseModel):
    session_id: str
    answer_index: int   # 0-based index into question.options


class TaskGenerateRequest(BaseModel):
    weak_concepts: list[str]


class TaskVerifyRequest(BaseModel):
    task_id: str
    submission: str


class LessonRequest(BaseModel):
    concept_id: str
    profile: dict


class RerenderRequest(BaseModel):
    concept_id: str
    profile: dict
    sources: list[dict] | None = None


@app.get("/graph")
async def graph_data():
    """Return the active course concept graph (nodes + edges)."""
    from backend.course import get_active
    return get_active().graph


@app.get("/profile_dimensions")
async def profile_dimensions():
    """Return the available profile dimension options."""
    from backend.engine import lessons
    return lessons.get_profile_dimensions()


@app.post("/lesson")
async def lesson(body: LessonRequest):
    """
    Retrieve corpus chunks for concept_id and generate a grounded micro-lesson.
    Response includes sources used for citation.
    """
    from backend.engine import lessons
    result = await lessons.fetch_lesson(body.concept_id, body.profile)
    return result


@app.post("/lesson/rerender")
async def lesson_rerender(body: RerenderRequest):
    """
    Re-render the lesson for concept_id with a new profile.
    Pass sources from a previous /lesson response to skip re-retrieval.
    """
    from backend.engine import lessons
    result = await lessons.rerender_lesson(body.concept_id, body.profile, body.sources)
    return result


@app.post("/task/generate")
async def task_generate(body: TaskGenerateRequest):
    """
    Generate a practice task for the given weak concepts.
    Returns task_id + prompt + schema context (no reference solution).
    """
    from backend.engine import tasks
    try:
        return await tasks.generate_task(body.weak_concepts)
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc


@app.post("/task/verify")
async def task_verify(body: TaskVerifyRequest):
    """
    Grade a submission against the stored reference solution.
    Returns scorecard: passed, score, badge, signals, evidence, narrative.
    """
    from backend.engine import tasks
    try:
        return await tasks.verify_task(body.task_id, body.submission)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/diagnostic/start")
async def diagnostic_start():
    """Begin a new adaptive diagnostic session. Returns session_id + first question."""
    from backend.engine import diagnostic
    session_id, question = await diagnostic.start_session()
    return {
        "session_id": session_id,
        "question_number": 1,
        "question": question.model_dump(),
        "done": False,
    }


@app.post("/diagnostic/answer")
async def diagnostic_answer(body: AnswerRequest):
    """
    Submit an answer to the current question.
    Returns next question, or mastery map when the session completes.
    """
    from backend.engine import diagnostic
    try:
        grade, next_q, mastery = await diagnostic.record_and_advance(
            body.session_id, body.answer_index
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    response: dict = {"grade": grade.model_dump()}
    if mastery is not None:
        response["done"] = True
        response["mastery"] = mastery
    else:
        response["done"] = False
        response["question"] = next_q.model_dump()  # type: ignore[union-attr]
    return response
