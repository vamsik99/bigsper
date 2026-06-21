"""FastAPI entry point. Loads the active course manifest at startup."""

from __future__ import annotations

import importlib.util
import logging
import os
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
logger = logging.getLogger(__name__)

import backend.auth as _auth  # noqa: E402 — after load_dotenv so AUTH_ENABLED is read

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
    from backend.engine import tasks as _tasks_mod
    from backend.engine.demo_cache import DEMO_TASK_ID, DEMO_TASK_DATA

    _load_active_manifest()
    course = get_active()
    logger.info("BigSper booted — active course: %s (%s)", course.id, course.name)

    concept_count = len(course.graph.get("nodes", []))
    logger.info("concept graph: %d nodes", concept_count)

    # Register demo task so SQLite verification works even when providers are down
    _tasks_mod._tasks[DEMO_TASK_ID] = DEMO_TASK_DATA
    logger.info("demo task registered: %s", DEMO_TASK_ID)

    # Build / refresh RAG index from corpus
    try:
        chroma_chunks = await rag.build_index(course.corpus_dir, course.id)
    except Exception as exc:
        logger.warning("RAG index build failed (degraded mode): %s", exc)
        chroma_chunks = 0

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
    allow_credentials=True,
)

router = APIRouter(prefix="/api")


def _redirect_uri(request: Request) -> str:
    """Callback URL — override with SCALEKIT_REDIRECT_URI in .env."""
    return os.getenv(
        "SCALEKIT_REDIRECT_URI",
        str(request.base_url).rstrip("/") + "/api/auth/callback",
    )


def _provider_error_response(detail: str) -> dict:
    """Friendly 200 response for provider outages — never returns 500 to the frontend."""
    return {
        "error": detail,
        "_provider_outage": True,
    }


# ---------------------------------------------------------------------------
# Auth endpoints (no-ops when AUTH_ENABLED=false or ScaleKit unavailable)
# ---------------------------------------------------------------------------

@router.get("/auth/status")
async def auth_status(request: Request):
    """Return {auth_enabled, user} for the current session."""
    token = request.cookies.get("bigsper_session")
    user = _auth.get_session(token)
    return {"auth_enabled": _auth.is_active(), "user": user}


@router.get("/auth/login")
async def auth_login(request: Request):
    """Redirect browser to ScaleKit hosted login. Falls back to / if auth not active."""
    try:
        login_url = _auth.get_login_url(_redirect_uri(request))
    except Exception as exc:
        logger.warning("auth/login error: %s", exc)
        return RedirectResponse("/?auth_error=login_failed")
    if not login_url:
        return RedirectResponse("/?auth_error=disabled")
    return RedirectResponse(login_url)


@router.get("/auth/callback")
async def auth_callback(request: Request, code: str = ""):
    """Exchange ScaleKit auth code, set session cookie, redirect to frontend."""
    if not code:
        return RedirectResponse("/?auth_error=no_code")
    try:
        user_info = _auth.exchange_code(code, _redirect_uri(request))
    except Exception as exc:
        logger.warning("auth/callback error: %s", exc)
        return RedirectResponse("/?auth_error=exchange_failed")
    if not user_info:
        return RedirectResponse("/?auth_error=exchange_failed")
    token = _auth.create_session(user_info)
    resp = RedirectResponse("/")
    resp.set_cookie(
        key="bigsper_session",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=86400,
    )
    return resp


@router.get("/auth/logout")
async def auth_logout(request: Request):
    """Clear session cookie and redirect to frontend."""
    token = request.cookies.get("bigsper_session")
    if token:
        try:
            _auth.delete_session(token)
        except Exception:
            pass
    resp = RedirectResponse("/")
    resp.delete_cookie("bigsper_session")
    return resp


@router.get("/health")
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


class ScorecardRequest(BaseModel):
    task_id: str
    submission: str
    concept_id: str
    mastery: dict[str, float] = {}


class LessonRequest(BaseModel):
    concept_id: str
    profile: dict


class RerenderRequest(BaseModel):
    concept_id: str
    profile: dict
    sources: list[dict] | None = None


class WalkthroughRequest(BaseModel):
    concept_id: str
    profile: dict
    sources: list[dict]  # corpus chunks already retrieved (no extra DB round-trip)


class TTSRequest(BaseModel):
    text: str
    language: str = "en"


@router.get("/course")
async def course_info():
    """Return active course metadata (id, name, description)."""
    try:
        from backend.course import get_active
        c = get_active()
        return {"id": c.id, "name": c.name, "description": c.description}
    except Exception as exc:
        return {"id": "unknown", "name": "BigSper", "description": ""}


@router.get("/graph")
async def graph_data():
    """Return the active course concept graph (nodes + edges)."""
    try:
        from backend.course import get_active
        return get_active().graph
    except Exception as exc:
        logger.error("graph endpoint failed: %s", exc)
        return {"nodes": [], "edges": [], "error": str(exc)}


@router.get("/profile_dimensions")
async def profile_dimensions():
    """Return the available profile dimension options."""
    try:
        from backend.engine import lessons
        return lessons.get_profile_dimensions()
    except Exception as exc:
        logger.warning("profile_dimensions failed: %s", exc)
        return {
            "depth": ["simpler", "standard", "deeper"],
            "example_domain": ["ecommerce", "sports", "finance"],
            "format": ["worked_example", "analogy", "step_by_step"],
        }


@router.post("/lesson")
async def lesson(body: LessonRequest):
    """
    Retrieve corpus chunks for concept_id and generate a grounded micro-lesson.
    Response includes sources used for citation. Falls back to demo cache on outage.
    """
    if not body.concept_id or not body.concept_id.strip():
        raise HTTPException(status_code=422, detail="concept_id must not be empty")

    from backend.engine import lessons
    from backend.engine.demo_cache import DEMO_LESSON_RESPONSE
    try:
        return await lessons.fetch_lesson(body.concept_id, body.profile)
    except Exception as exc:
        logger.warning("lesson failed for %r (%s) — serving cache", body.concept_id, exc)
        if body.concept_id == DEMO_LESSON_RESPONSE["concept_id"]:
            cached = dict(DEMO_LESSON_RESPONSE)
            cached["profile"] = body.profile
            return cached
        return {
            "concept_id": body.concept_id,
            "lesson": (
                "**Lesson temporarily unavailable** — AI provider is unreachable.\n\n"
                "Please try again in a moment, or continue to the Prove It tab to "
                "practice with the SQL exercise."
            ),
            "sources": [],
            "profile": body.profile,
            "no_corpus": True,
            "_from_cache": True,
        }


@router.post("/lesson/rerender")
async def lesson_rerender(body: RerenderRequest):
    """
    Re-render the lesson for concept_id with a new profile.
    Falls back to cache on provider outage.
    """
    if not body.concept_id or not body.concept_id.strip():
        raise HTTPException(status_code=422, detail="concept_id must not be empty")

    from backend.engine import lessons
    from backend.engine.demo_cache import DEMO_LESSON_RESPONSE
    try:
        return await lessons.rerender_lesson(body.concept_id, body.profile, body.sources)
    except Exception as exc:
        logger.warning("lesson/rerender failed for %r (%s) — serving cache", body.concept_id, exc)
        if body.concept_id == DEMO_LESSON_RESPONSE["concept_id"]:
            cached = dict(DEMO_LESSON_RESPONSE)
            cached["profile"] = body.profile
            return cached
        return {
            "concept_id": body.concept_id,
            "lesson": (
                "**Re-render temporarily unavailable** — AI provider is unreachable.\n\n"
                "The lesson shown above is the last successfully generated version."
            ),
            "sources": body.sources or [],
            "profile": body.profile,
            "no_corpus": False,
            "_from_cache": True,
        }


@router.post("/lesson/walkthrough")
async def lesson_walkthrough(body: WalkthroughRequest):
    """
    Generate a step-by-step walkthrough from pre-retrieved corpus sources.
    All steps are generated in ONE model call (well-researched promise holds).
    Stepping between steps is client-side — this endpoint is called once per concept/profile.
    Falls back to a single prose-fallback step on provider outage.
    """
    if not body.concept_id or not body.concept_id.strip():
        raise HTTPException(status_code=422, detail="concept_id must not be empty")

    from backend.engine import lessons
    try:
        steps = await lessons.generate_walkthrough(body.concept_id, body.profile, body.sources)
        return {"concept_id": body.concept_id, "steps": steps}
    except Exception as exc:
        logger.warning("lesson/walkthrough failed for %r (%s) — serving fallback", body.concept_id, exc)
        return {
            "concept_id": body.concept_id,
            "steps": [
                {
                    "title": "Walkthrough temporarily unavailable",
                    "body": (
                        "The AI provider is unreachable. "
                        "Please switch to the Read view to see the prose lesson."
                    ),
                    "code_snippet": None,
                    "highlight": None,
                }
            ],
            "_from_cache": True,
        }


@router.post("/tts")
async def tts_endpoint(body: TTSRequest):
    """
    Generate TTS audio (mp3) for the given text and language.
    Returns audio/mpeg bytes. Raises 503 on failure so the frontend can fall back
    to browser SpeechSynthesis or disable gracefully.
    Text is truncated to 2 000 characters for safety.
    """
    from backend import llm

    safe_text = body.text[:2000].strip()
    if not safe_text:
        raise HTTPException(status_code=422, detail="text must not be empty")
    try:
        audio_bytes = await llm.tts(safe_text, body.language)
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as exc:
        logger.warning("tts failed: %s", exc)
        raise HTTPException(status_code=503, detail=f"TTS unavailable: {exc}")


@router.post("/task/generate")
async def task_generate(body: TaskGenerateRequest):
    """
    Generate a practice task for the given weak concepts.
    Falls back to demo cache task on provider outage.
    """
    if not body.weak_concepts:
        raise HTTPException(status_code=422, detail="weak_concepts must not be empty")

    from backend.engine import tasks
    from backend.engine.demo_cache import DEMO_TASK_RESPONSE, DEMO_TASK_ID
    try:
        return await tasks.generate_task(body.weak_concepts)
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except Exception as exc:
        logger.warning("task/generate failed (%s) — serving demo cache task", exc)
        cached = dict(DEMO_TASK_RESPONSE)
        # Use first requested concept if available, keeps UI coherent
        if body.weak_concepts:
            cached = dict(DEMO_TASK_RESPONSE)
            cached["concept_id"] = body.weak_concepts[0]
        return cached


@router.post("/task/verify")
async def task_verify(body: TaskVerifyRequest):
    """
    Grade a submission against the stored reference solution.
    Returns scorecard: passed, score, badge, signals, evidence, narrative.
    """
    if not body.task_id or not body.task_id.strip():
        raise HTTPException(status_code=422, detail="task_id must not be empty")

    from backend.engine import tasks
    try:
        return await tasks.verify_task(body.task_id, body.submission)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("task/verify failed: %s", exc)
        return {
            "passed": False,
            "score": 0.0,
            "badge": {"label": "Verification error", "color": "gray", "icon": "!"},
            "signals": f"Verification encountered an error: {exc}",
            "evidence": {"expected_rows": [], "actual_rows": []},
            "narrative": "An error occurred while grading. Please try again.",
            "error": str(exc),
        }


@router.post("/scorecard")
async def scorecard_endpoint(body: ScorecardRequest):
    """
    Grade a submission and return a unified scorecard combining the diagnostic
    mastery score for the concept with the prove-it result (badge, evidence, narrative).
    Falls back to a graceful error response on failure.
    """
    if not body.task_id or not body.task_id.strip():
        raise HTTPException(status_code=422, detail="task_id must not be empty")

    from backend.engine import tasks
    from backend.engine import scorecard as sc
    try:
        verify_result = await tasks.verify_task(body.task_id, body.submission)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("scorecard verify_task failed: %s", exc)
        return {
            "concept_id": body.concept_id,
            "diagnostic": {"score": None, "tier": "unknown", "label": "—"},
            "prove_it": {
                "passed": False,
                "score": 0.0,
                "badge": {"label": "Error", "color": "gray", "icon": "!"},
                "signals": f"Grading error: {exc}",
                "evidence": {"expected_rows": [], "actual_rows": []},
                "narrative": "An error occurred while grading. Please try again.",
                "error": str(exc),
            },
        }
    try:
        return sc.build(body.concept_id, body.mastery, verify_result)
    except Exception as exc:
        logger.error("scorecard build failed: %s", exc)
        return {
            "concept_id": body.concept_id,
            "diagnostic": {"score": None, "tier": "unknown", "label": "—"},
            "prove_it": verify_result,
        }


@router.post("/faculty/report")
async def faculty_report(request: Request):
    """Aggregate cohort data. Requires faculty role when AUTH_ENABLED=true."""
    if _auth.is_active():
        token = request.cookies.get("bigsper_session")
        user = _auth.get_session(token)
        if not user or user.get("role") != "faculty":
            raise HTTPException(status_code=403, detail="Faculty role required")
    try:
        from backend.engine import faculty
        return faculty.build_report()
    except Exception as exc:
        logger.error("faculty/report failed: %s", exc)
        return {
            "error": "Report generation failed. Please try again.",
            "students": [],
            "cohort_mastery": {},
        }


@router.post("/diagnostic/start")
async def diagnostic_start():
    """Begin a new adaptive diagnostic session. Falls back to demo cache on LLM failure."""
    from backend.engine import diagnostic
    from backend.engine.demo_cache import DEMO_DIAGNOSTIC_RESPONSE
    try:
        session_id, question = await diagnostic.start_session()
        return {
            "session_id": session_id,
            "question_number": 1,
            "question": question.model_dump(),
            "done": False,
        }
    except Exception as exc:
        logger.warning("diagnostic/start failed (%s) — serving demo cache question", exc)
        return DEMO_DIAGNOSTIC_RESPONSE


@router.post("/diagnostic/answer")
async def diagnostic_answer(body: AnswerRequest):
    """
    Submit an answer to the current question.
    Returns next question, or mastery map when the session completes.
    On session-not-found (e.g. cache session), completes with pre-baked mastery.
    """
    if body.answer_index < 0 or body.answer_index > 10:
        raise HTTPException(status_code=422, detail="answer_index must be a non-negative integer")

    from backend.engine import diagnostic
    from backend.engine.demo_cache import DEMO_GRADE, DEMO_MASTERY
    try:
        grade, next_q, mastery = await diagnostic.record_and_advance(
            body.session_id, body.answer_index
        )
    except KeyError:
        # Session not found — cache session or expired; end gracefully
        logger.info("diagnostic/answer: session %r not found — ending with cache mastery", body.session_id)
        return {
            "grade": DEMO_GRADE,
            "done": True,
            "mastery": DEMO_MASTERY,
            "_from_cache": True,
        }
    except Exception as exc:
        logger.warning("diagnostic/answer failed (%s) — ending with cache mastery", exc)
        return {
            "grade": DEMO_GRADE,
            "done": True,
            "mastery": DEMO_MASTERY,
            "_from_cache": True,
        }

    response: dict = {"grade": grade.model_dump()}
    if mastery is not None:
        response["done"] = True
        response["mastery"] = mastery
    else:
        response["done"] = False
        response["question"] = next_q.model_dump()  # type: ignore[union-attr]
    return response


app.include_router(router)
