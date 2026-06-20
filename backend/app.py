"""FastAPI entry point. Loads the active course manifest at startup."""

from __future__ import annotations

import importlib.util
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
logger = logging.getLogger(__name__)

_COURSES_DIR = Path(__file__).parent.parent / "courses"


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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _load_active_manifest()
    from backend.course import get_active  # after manifest runs so course is registered
    course = get_active()
    logger.info("BigSper booted — active course: %s (%s)", course.id, course.name)
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
    from backend.course import get_active
    course = get_active()
    return {"status": "ok", "active_course": course.id, "course_name": course.name}
