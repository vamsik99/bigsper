# CLAUDE.md — BigSper Engineering Reference

## Product

BigSper is a **course-agnostic adaptive tutoring engine** demoed on SQL placement prep.
"The future of learning" — meets every learner where they are, teaches to verified mastery.

### The Loop

```
Diagnose → Gap Heatmap (concept graph) → Teach the gap (RAG-grounded, preference-adapted)
→ Prove it (ground-truth task) → Scorecard with verification badges → Faculty cohort report
```

### Three Guarantees (must be visible in the demo)

1. **Well-researched** — lessons are generated ONLY from retrieved, cited corpus chunks; the source
   is shown. Never generate a lesson without retrieved context. If retrieval returns nothing, surface
   a "no corpus content yet" warning rather than hallucinating.

2. **Adaptive** — graph-based sequencing (prerequisite ordering) + representation adaptivity: the
   same concept is re-rendered by learner preference. Preference dimensions:
   - **depth**: overview / standard / deep-dive
   - **example-domain**: finance / e-commerce / healthcare / generic
   - **format**: prose / bullet / code-first
   Never use the term "learning styles" (debunked). Frame all adaptivity in terms of the
   dimensions above.

3. **Ground-truth verified** — deterministic grading where possible. Each score carries a badge
   derived from the verifier kind via `course.badge`. Possible badge values:
   - `"verified"` — output of a deterministic verifier (e.g. SQLVerifier)
   - `"ai_assessed"` — LLM-graded open-ended response
   **An LLM never sets a `"verified"` badge or a verified score.**

---

## Pluggability Mandate (non-negotiable)

- `backend/course.py` is the stable contract. **Do not rewrite it.** It defines `Course`,
  `Verifier`, `VerifierResult`, the registry, `get_active()`, and `SQLVerifier` as a worked
  example.

- Engine modules under `backend/engine/` **may only get the current course via
  `course.get_active()`**. They must **never** import from a course module or hard-code any
  subject name (SQL, Python, etc.). If engine code knows it's SQL, that is a bug.

- A course lives entirely under `courses/<id>/`:
  - `graph.json` — concept graph (nodes + directed prerequisite edges)
  - `corpus/` — chunked corpus files (text / markdown)
  - `verifier.py` — optional custom verifier (when `SQLVerifier` is not appropriate)
  - `manifest.py` — imports `Course`, `Verifier`, `register` from `backend.course`, builds the
    `Course` object, and calls `register()` at module level

- The active course is selected by the `ACTIVE_COURSE` environment variable (default `"sql"`).
  `app.py` dynamically imports `courses/<ACTIVE_COURSE>/manifest.py` at startup.

---

## Provider Abstraction

`backend/llm.py` is the **only** place that touches LLM/embedding providers.

| Symbol | What it does |
|--------|-------------|
| `get_client(provider)` | Returns an `openai.AsyncOpenAI` instance for the named provider |
| `chat(messages, tier)` | Routes to **FastRouter** (`FASTROUTER_API_KEY`), model from `CHEAP_MODEL` / `STRONG_MODEL` |
| `chat_json(messages, tier)` | Same as `chat`, enforces `response_format=json_object`, parses and returns `dict` |
| `embed(texts)` | Tries **Neysa** (`NEYSA_API_KEY`) with 4-second timeout; on any error or timeout falls back to **OpenAI** (`OPENAI_API_KEY`); logs which path ran |

Providers:
- `"fastrouter"` — default for chat/generation (`FASTROUTER_API_KEY`, `FASTROUTER_BASE_URL`)
- `"openai"` — direct fallback for chat + embeddings fallback (`OPENAI_API_KEY`)
- `"neysa"` — default for embeddings (`NEYSA_API_KEY`, `NEYSA_BASE_URL`)

---

## File Layout

```
bigsper/
├── CLAUDE.md               ← this file
├── README.md
├── LICENSE
├── .env.example
├── .gitignore
├── pyproject.toml          ← uv-managed Python 3.11 project
├── backend/
│   ├── __init__.py
│   ├── app.py              ← FastAPI app; lifespan loads the active course manifest
│   ├── course.py           ← Course/Verifier contract + registry + SQLVerifier (stable; do not rewrite)
│   ├── llm.py              ← provider abstraction (FastRouter / OpenAI / Neysa)
│   └── engine/             ← engine modules (diagnose, heatmap, teach, verify, report)
│       └── __init__.py
├── courses/
│   ├── _template/          ← copy-paste starting point for a new course
│   │   ├── graph.json
│   │   ├── corpus/
│   │   ├── verifier.py
│   │   └── manifest.py
│   └── sql/                ← SQL placement prep (active demo course)
│       ├── graph.json      ← SQL concept graph (nodes + prerequisite edges)
│       ├── corpus/         ← corpus chunks (populated before demo)
│       ├── seed.sql        ← SQL to build & seed the sandbox SQLite DB
│       └── manifest.py     ← registers the SQL Course at import time
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        └── index.css
```

---

## Attribution

Core features are built fresh during the hackathon. Pre-existing libraries are allowed **with
attribution in `README.md > ATTRIBUTIONS`**. Never copy course content or training data without
clear provenance.

---

## Non-Goals (24-hour hack scope)

- **No auth** — single-user demo only
- **No second course** — only SQL in the demo; pluggability is structural, not exercised with a
  second course yet
- **No auto-built graph** — the SQL concept graph is hand-authored; no graph-extraction pipeline
- **No learning-styles framing** — never use that term; use depth / example-domain / format
- **No subjective grading in the demo** — `"verified"` badge via `SQLVerifier` only;
  `"ai_assessed"` badge exists in the contract but the demo showcases deterministic verification
