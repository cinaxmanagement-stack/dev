# Test Credentials — Zanelvo Dev Studio

Single-admin app (no signup). Credentials come from `apps/zanelvo-dev-studio/backend/.env`.

## Admin login
- Endpoint: `POST /api/auth/login` with body `{"password": "<ADMIN_PASSWORD>"}`
- Password: `devstudio-admin`
- Auth is an HttpOnly cookie (`withCredentials`); no bearer token.

## Base URL
- Preview/ingress: same-origin. Frontend at `/`, API at `/api`.
- External: https://8f7ba8e4-97d6-49e0-b1d3-446f8323597d.preview.emergentagent.com

## Emergent Universal Key
- Set as `EMERGENT_UNIVERSAL_KEY` in backend `.env` (server-side only, never returned to client).
- Provider name in the app: `emergent`. Example working models: `gpt-5.4`, `claude-sonnet-4-6`,
  `gemini-2.5-flash`, `gemini-3.1-pro-preview`.

## Notes
- GitHub PAT is NOT configured; any full end-to-end task run (repo clone/analyze/plan/implement)
  requires a GitHub Personal Access Token set via Settings > Secrets or `DEVSTUDIO_GITHUB_TOKEN`.
