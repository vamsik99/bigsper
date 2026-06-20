# BigSper — The Future of Learning

> Adaptive tutoring engine · SQL placement-prep demo · 24-hour hackathon MVP

**Live demo:** _link available after deployment_

## Problem

Technical candidates plateau because generic study materials don't diagnose their specific gaps or
adapt teaching to how they actually think best. Faculty and coaches lack real-time visibility into
where their cohort is struggling.

## Users

- **Learners** preparing for SQL-heavy technical interviews
- **Faculty / coaches** tracking placement-readiness across a cohort

## Solution

BigSper runs a tight loop per learner:

```
Diagnose → Gap Heatmap → Teach the gap → Prove it → Scorecard → Faculty report
```

Three guarantees visible in the demo:

1. **Well-researched** — lessons generated only from retrieved, cited corpus chunks. Source always shown.
2. **Adaptive** — graph-based concept sequencing + re-rendering by depth / example-domain / format.
3. **Ground-truth verified** — scores are deterministic where possible; every score shows its badge.

## Setup

### Prerequisites

- Python 3.11+ and [uv](https://docs.astral.sh/uv/)
- Node 20+ and npm

### Backend

```bash
cp .env.example .env        # fill in your API keys
uv sync                     # installs dependencies into .venv
PYTHONPATH=. uvicorn backend.app:app --reload
# → http://localhost:8000/health
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:8000`, so the frontend calls `/api/health`.

### Add a new course

1. Copy `courses/_template/` to `courses/<your-id>/`
2. Author `graph.json`, populate `corpus/`, implement `manifest.py`
3. Set `ACTIVE_COURSE=<your-id>` in `.env` and restart the backend

## Stack

| Layer | Technology |
|-------|-----------|
| Backend API | FastAPI + Uvicorn (Python 3.11) |
| LLM generation | FastRouter (primary) → OpenAI fallback |
| Embeddings | Neysa (primary, 4 s timeout) → OpenAI fallback |
| Vector store | ChromaDB (local persistent) |
| SQL verification | SQLite (deterministic, in-process) |
| Concept graph | NetworkX |
| Auth (optional) | ScaleKit RBAC |
| Frontend | React + Vite + Tailwind CSS |
| Charts | Recharts |

## Models & Data

| Role | Default provider | Env var |
|------|-----------------|--------|
| Chat (generation) | FastRouter | `FASTROUTER_API_KEY` |
| Chat (fallback) | OpenAI | `OPENAI_API_KEY` |
| Embeddings | Neysa | `NEYSA_API_KEY` |
| Embeddings (fallback) | OpenAI | `OPENAI_API_KEY` |

Model tier controlled by `CHEAP_MODEL` and `STRONG_MODEL` env vars.
Corpus lives in `courses/sql/corpus/` — add chunked text or markdown files before running lessons.

## Guardrails

- Lessons are never generated without retrieved context (RAG-first; no hallucinated lessons).
- `"verified"` badges are awarded only by deterministic `SQLVerifier`, never by an LLM.
- Engine modules cannot import course-specific code — enforced structurally via `get_active()`.
- On any provider outage, pre-baked demo-path responses are served so the demo never crashes.

## Auth

Role-based access control via [ScaleKit](https://scalekit.com/) — set `AUTH_ENABLED=true` plus ScaleKit env vars to activate faculty login (RBAC: `student` / `faculty` roles). With `AUTH_ENABLED=false` (default) the header toggle remains the fallback and the full student loop runs with no login required.

## Limitations

- Auth is feature-flagged (off by default); single-user demo when flag is off
- Single course in this demo; second course requires a new `courses/<id>/` directory
- Concept graph is hand-authored; no auto-builder
- Corpus must be manually populated before lessons can be generated

---

## AI Impact Statement

### Tasks Automated

| Task | Before BigSper | With BigSper |
|------|---------------|-------------|
| Concept gap identification | Manual self-assessment or generic practice tests | Adaptive MCQ diagnostic → concept-level mastery map |
| Lesson generation | Human tutor or static material | RAG-grounded micro-lesson generated on demand, per gap |
| Exercise creation | Static problem banks | LLM generates a unique SQL exercise per session, tailored to weak concepts |
| Answer coaching | Synchronous tutor feedback | Instant coaching narrative after deterministic grading |
| Cohort reporting | Spreadsheet aggregation | Automated placement-readiness heatmap per faculty view |

### Models Used and Why

| Model tier | Provider (default) | Why |
|---|---|---|
| `CHEAP_MODEL` (generation, coaching) | FastRouter | Low-latency for high-frequency calls (MCQ generation, narrative); cost-efficient |
| `STRONG_MODEL` (lesson, task generation) | FastRouter → OpenAI fallback | Higher quality for the content learners read and act on |
| Embeddings | Neysa → OpenAI fallback | Neysa is faster for corpus indexing; OpenAI is the reliable fallback |

All chat providers are accessed through a **provider abstraction layer** (`backend/llm.py`) — swapping providers requires one env-var change, not code changes.

### Data Provenance

- **Corpus:** SQL instructional content self-collected from the Beeja Academy curriculum. Fully disclosed; no crawled or scraped material without consent.
- **Concept graph:** Hand-authored by the team; 19 nodes, 25 edges across SQL difficulty levels 1–5.
- **Sandbox database:** Synthetic `employees` / `departments` / `projects` schema seeded with fictional data (`courses/sql/seed.sql`).
- No learner data is stored beyond the in-process session (no database, no analytics pipeline).

### GUARDRAILS — The Three Guarantees as Mitigations

| Risk | Mitigation (Guarantee) |
|------|----------------------|
| LLM hallucinating lesson content | **Well-researched** — every lesson prompt includes only retrieved corpus chunks; the system prompt explicitly forbids content not in the corpus. If no chunks exist, a "no corpus" warning is returned rather than a generated lesson. |
| LLM inflating or manipulating scores | **Ground-truth verified** — the `SQLVerifier` is a deterministic SQLite comparison; the LLM only writes a coaching *narrative* after grading is done. Badge `"verified"` can never be set by an LLM. |
| Concept sequencing ignoring prerequisites | **Adaptive** — prerequisite edges in `graph.json` constrain traversal order; the diagnostic advances to harder concepts only on correct answers, and dives into prerequisites on failures. |

### Expected Impact

- **Individual learner:** 30–60 minute targeted session identifies and closes 1–3 concept gaps with a verified practice task, replacing hours of undirected practice.
- **Faculty:** Real-time cohort mastery heatmap surfaces systemic gaps (e.g. "80 % of cohort fails window functions") without manual aggregation.
- **Pluggability:** The course-agnostic engine (`backend/engine/`) can be aimed at any technical domain by adding a `courses/<id>/` directory — no engine code changes required.

---

## Team

Vamsi Krishna and Shivani Balakrishna

## ATTRIBUTIONS

| Library / Service | License | Use |
|-------------------|---------|-----|
| [FastAPI](https://fastapi.tiangolo.com/) | MIT | Backend API framework |
| [Uvicorn](https://www.uvicorn.org/) | BSD-3 | ASGI server |
| [OpenAI Python SDK](https://github.com/openai/openai-python) | Apache-2.0 | LLM + embedding client (all three providers share this SDK) |
| [ChromaDB](https://www.trychroma.com/) | Apache-2.0 | Local vector store for RAG corpus retrieval |
| [NetworkX](https://networkx.org/) | BSD-3 | Concept graph construction and traversal |
| [python-dotenv](https://github.com/theskumar/python-dotenv) | BSD-3 | Environment config loading |
| [Pydantic](https://docs.pydantic.dev/) | MIT | Request/response validation (via FastAPI) |
| [httpx](https://www.python-httpx.org/) | BSD-3 | Async HTTP (transitive dep of OpenAI SDK) |
| [React](https://react.dev/) | MIT | Frontend framework |
| [Vite](https://vitejs.dev/) | MIT | Frontend build tool + dev-server proxy |
| [Tailwind CSS](https://tailwindcss.com/) | MIT | Utility-first styling |
| [Recharts](https://recharts.org/) | MIT | Charts (gap heatmap radar, scorecard bar charts) |
| [ScaleKit](https://scalekit.com/) | Apache-2.0 | RBAC auth — student / faculty roles, hosted login |
| [FastRouter](https://fastrouter.ai/) | Commercial | LLM routing layer (primary chat provider) |
| [Neysa](https://neysa.ai/) | Commercial | Embedding provider (primary; 4 s timeout, OpenAI fallback) |
