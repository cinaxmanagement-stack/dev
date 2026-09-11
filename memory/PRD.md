# Zanelvo Dev Studio — Emergent Integration PRD

## Original task
Complete the Emergent-specific integration of an already-built, provider-independent AI dev studio
(`apps/zanelvo-dev-studio/`). Implement a real `EmergentUniversalKeyProvider` behind the existing
`LLMProvider` abstraction; do NOT rebuild orchestration, state machines, git, memory, UI, or tests.
Source of truth: GitHub `sassinfo05-sudo/freebuff`. Handoff: `docs/EMERGENT_INTEGRATION_HANDOFF.md`.

## Architecture (pre-existing, preserved)
- `providers/base.py::LLMProvider` — the single interface every agent goes through.
- `providers/registry.py::ModelRegistry` + `MODEL_PRESETS` — provider selection per role.
- `agents/runner.py::call_structured` — primary→fallback (once), AgentRun + LLMInvocation logging,
  JSON extraction/repair (`extract_json`).
- `services/settings_service.py` — resolves `EMERGENT_UNIVERSAL_KEY` env / encrypted secret.
- `services/usage_tracker.py` — records only what a provider actually returns.

## What was implemented (2026-06 / this session)
- **`providers/emergent_provider.py`** — real provider backed by `emergentintegrations` (litellm
  proxy, Universal Key). Implements `list_models`, `generate`, `generate_structured`,
  `generate_with_vision`, `stream`, plus capability helpers. Lazy import (`_sdk`); `litellm.drop_params`
  scoped here (GPT-5 family only accepts temperature=1). Static served-model catalog across
  GPT/Claude/Gemini with honest capability metadata (no fabrication). Error normalization maps
  auth→`ProviderNotConfigured`, others→`ProviderError(code)` without leaking the key.
  A min output-token floor (64) is applied to the Gemini family so trivial/low-budget calls don't
  return empty text (Gemini can otherwise spend a tiny budget entirely on internal reasoning).
- **`providers/base.py`** — added `ProviderError(code, message)` for normalized failures.
- **`server.py`** — maps `ProviderError` → HTTP 502.
- **`requirements-devstudio.txt`** — added `emergentintegrations` (optional, lazily imported).
- **`frontend/src/pages/panels.tsx`** — removed the stale "(stub — no models yet)" label; the
  Universal Key secret input + `emergent` provider selector already existed.
- **Runtime hosting for Emergent preview**: symlinks `/app/backend`→app backend, `/app/frontend`→app
  frontend; `frontend` `start` script (vite on :3000, `allowedHosts:true`); `backend/.env`.
- **Tests**: `tests/test_devstudio_emergent_provider.py` (8 network-free) and
  `tests/manual_emergent_live.py` (live, needs key+network).

## Verification status
- Live provider (all 5 methods) across GPT/Claude/Gemini: PASS (real token usage, vision "Red").
- Deterministic suite: 65 passed (57 original untouched + 8 new).
- `python -c "import server"`: boots (62 routes).
- App via ingress: login, `/providers/models` (12 emergent models), `/providers/test` emergent → ok.

## Not implemented (honest)
- **Emergent MCP / job-handoff adapter**: no documented, stable Emergent job API was available in
  this environment, so per the task ("do not implement unless the documented API is available and
  stable") it was intentionally NOT built.
- **Full end-to-end task run (Test 9)**: requires a connected GitHub repo + PAT (not provided).
  Provider path is proven via `/providers/test`; the agent pipeline is unchanged and provider-agnostic.
- **Browser QA (Playwright)**: optional; requires `playwright install` in this runtime.

## Backlog / next
- P1: Provide a GitHub PAT and run one real end-to-end task on `emergent` models (Test 9).
- P2: Optional live model-discovery endpoint if Emergent later exposes one (currently static catalog).
- P2: Optional Emergent job-handoff adapter if/when a stable API is documented.
