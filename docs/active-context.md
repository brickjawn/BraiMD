# BraiMD x OpenClaw Active Context

Last updated: 2026-04-21  
Purpose: shared integration context for parallel agent work across BraiMD and OpenClaw.

## 1) Source of truth and scope

- This file is the **current-state handoff artifact** for cross-repo work.
- Keep it append-only in spirit: update values, and add notes for reversals.
- BraiMD is authoritative for skill retrieval and prerequisite logic.
- OpenClaw is a thin consumer that fetches context at invocation time.

## 2) Canonical runtime contract (current)

### BraiMD endpoint used by OpenClaw

- Method: `GET`
- Path: `/api/skills/search`
- Query: `?trigger=<keyword>`
- Required header: `x-api-key: <raw key>`
- Optional tracing headers:
  - `X-Agent-ID`
  - `X-Session-ID`
  - `X-Platform-Source`

### Response shapes expected by OpenClaw

```json
{ "status": "success", "data": { "skill_id": 1, "name": "Skill", "content": "...", "prerequisites_cleared": true } }
```

```json
{ "status": "intercept", "data": { "requested_trigger": "x", "intercepted_by": { "skill_id": 2, "name": "Prereq", "content": "...", "reason": "..." }, "prerequisites_cleared": false } }
```

```json
{ "status": "not_found", "message": "No skill matches that trigger." }
```

```json
{ "status": "ambiguous", "trigger": "x", "message": "...", "candidates": [{ "skill_id": 1, "skill_name": "A" }] }
```

### OpenClaw client assumptions

From `openclaw-drop-in/BraiMDService.ts`:

- `BRAIMD_URL` default: `http://10.0.0.2:3000`
- `BRAIMD_API_KEY` required for auth
- Timeout/circuit-breaker: 2 seconds (`TIMEOUT_MS=2000`)
- On non-2xx or timeout/error: returns empty context string (fails open)

## 3) Environment mapping

### BraiMD `.env`

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `DB_ROOT_PASSWORD`
- `PORT` (default `3000`)
- `CORS_ORIGIN`
- `API_KEY_HASH` (SHA-256 hash of raw key)
- `API_KEY_ID` (log identity)

### OpenClaw env (integration subset)

- `BRAIMD_URL` -> BraiMD base URL (LAN or tunnel)
- `BRAIMD_API_KEY` -> raw secret whose SHA-256 equals BraiMD `API_KEY_HASH`

## 4) Migration and schema status (active)

- `001_initial` in `migrations/001_initial.sql`
  - explicit `InnoDB`, `utf8mb4`, `utf8mb4_unicode_ci`
  - creates baseline tables + seed + `schema_migrations`
- `002_nullable_user_fk` in `migrations/002_nullable_user_fk.sql`
  - `skills.user_id` is `NULL DEFAULT 1` (prototype scaffolding)

## 5) Parallel work lanes

### Lane A: BraiMD (schema/API)

- Keep `/api/skills/search` stable until OpenClaw adopts any new routes.
- Next planned migrations (tracked separately):
  - `003` skill versioning (`skill_versions` + `skills.active_version_id`)
  - `004` operational audit surface (`skill_audit_log`)
  - `005` `agents` + `agent_skills` junction
  - `006` OpenClaw-facing `/skills/:slug/active` and `/agents/:slug/bundle`

### Lane B: OpenClaw (consumer)

- Keep current BraiMD client path: `/api/skills/search`.
- Add feature flag for future endpoint swap:
  - Current: `search` contract
  - Future: `slug/active` and `agents/bundle` contract
- Preserve fail-open behavior on upstream errors/timeouts.

## 6) Cross-repo checklists

### Before merging BraiMD API changes

1. Confirm this file is updated if contract/headers/shape changed.
2. Validate with curl using real API key.
3. Verify OpenClaw drop-in still parses all statuses.

### Before merging OpenClaw client changes

1. Verify `BRAIMD_URL` and `BRAIMD_API_KEY` are set in target runtime.
2. Exercise success/intercept/not_found/ambiguous responses.
3. Confirm logs appear in BraiMD `/dashboard/logs` with session and platform headers.

## 7) Canonical test commands

```sh
# BraiMD
scripts/bootstrap-env.sh
scripts/up.sh
scripts/smoke.sh
scripts/run-tests.sh
```

```sh
# BraiMD API sanity (replace values)
curl -H "x-api-key: $BRAIMD_API_KEY" "http://localhost:3000/api/skills/search?trigger=move"
```

## 8) Where Claude agents should look first

- `docs/active-context.md` (this file)
- `docs/design-decisions.md`
- `migrations/README.md`
- `openclaw-drop-in/BraiMDService.ts`
- `src/services/skillSearchService.js`

