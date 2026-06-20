# BigSper — The Future of Learning

> Adaptive tutoring engine · SQL placement-prep demo · 24-hour hackathon MVP

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

## Limitations

- No authentication (single-user demo)
- Single course in this demo; second course requires a new `courses/<id>/` directory
- Concept graph is hand-authored; no auto-builder
- Corpus must be manually populated before lessons can be generated

## Team

Vamsi Krishnamurthy — built in 24 hours.

## ATTRIBUTIONS

| Library | License | Use |
|---------|---------|-----|
| [FastAPI](https://fastapi.tiangolo.com/) | MIT | Backend API framework |
| [Uvicorn](https://www.uvicorn.org/) | BSD-3 | ASGI server |
| [OpenAI Python SDK](https://github.com/openai/openai-python) | Apache-2.0 | LLM + embedding client (all providers) |
| [ChromaDB](https://www.trychroma.com/) | Apache-2.0 | Vector store for corpus retrieval |
| [NetworkX](https://networkx.org/) | BSD-3 | Concept graph traversal |
| [python-dotenv](https://github.com/theskumar/python-dotenv) | BSD-3 | Environment config |
| [httpx](https://www.python-httpx.org/) | BSD-3 | Async HTTP |
| [React](https://react.dev/) | MIT | Frontend framework |
| [Vite](https://vitejs.dev/) | MIT | Frontend build tool |
| [Tailwind CSS](https://tailwindcss.com/) | MIT | Utility-first styling |
| [Recharts](https://recharts.org/) | MIT | Charts (gap heatmap, scorecard) |
