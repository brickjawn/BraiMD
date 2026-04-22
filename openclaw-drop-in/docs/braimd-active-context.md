# BraiMD API Context Mirror (for OpenClaw)

Last synced: 2026-04-21  
Source: `BraiMD/docs/active-context.md`

Purpose: keep OpenClaw work BraiMD-aware without switching repos.

## 1) Canonical BraiMD contract used today

### Request

- Method: `GET`
- Path: `/api/skills/search`
- Query: `?trigger=<keyword>`
- Required header: `x-api-key: <raw key>`
- Optional trace headers:
  - `X-Agent-ID`
  - `X-Session-ID`
  - `X-Platform-Source`

### Response shapes

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

## 2) OpenClaw client assumptions (current)

From `openclaw-drop-in/BraiMDService.ts`:

- `BRAIMD_URL` default: `http://10.0.0.2:3000`
- `BRAIMD_API_KEY` required for auth
- Timeout/circuit-breaker: 2 seconds (`TIMEOUT_MS=2000`)
- On non-2xx or timeout/error: return empty context string (fail open)

## 3) Env wiring

- OpenClaw `BRAIMD_URL` -> BraiMD base URL
- OpenClaw `BRAIMD_API_KEY` -> raw key whose SHA-256 equals BraiMD `API_KEY_HASH`

## 4) Migration/status awareness

Current BraiMD migration baseline relevant to OpenClaw:

- `001_initial` (explicit InnoDB + utf8mb4 + utf8mb4_unicode_ci)
- `002_nullable_user_fk` (`skills.user_id` is `NULL DEFAULT 1`)

## 5) Forward compatibility notes

- Keep consuming `/api/skills/search` until BraiMD lands and stabilizes:
  - `/skills/:slug/active`
  - `/agents/:slug/bundle`
- Preserve handling for all four statuses: `success`, `intercept`, `not_found`, `ambiguous`.

## 6) Quick verification

```sh
curl -H "x-api-key: $BRAIMD_API_KEY" \
  "$BRAIMD_URL/api/skills/search?trigger=move"
```

If response is non-2xx or times out, OpenClaw should continue with empty injected context.
