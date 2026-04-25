# Claude Handoff: BraiMD x OpenClaw (Active Build Context)

Last updated: 2026-04-25 (UTC)  
Branch: `cursor/migrations-002-nullable-user-fk-f4b2-stacked`

## TL;DR

- BraiMD is in migration-driven schema mode.
- `001_initial` and `002_nullable_user_fk` are implemented.
- OpenClaw currently integrates through `GET /api/skills/search?trigger=...`.
- Keep this contract stable until migration/API lane reaches planned `006`.
- This handoff is optimized for Claude/Cowork agents to continue without re-discovery.

## Current repository state

- Core docs:
  - `docs/design-decisions.md` (architectural rationale)
  - `docs/active-context.md` (canonical cross-repo integration contract)
  - `docs/claude-handoff.md` (this file)
- OpenClaw mirror context:
  - `openclaw-drop-in/docs/braimd-active-context.md`
- Migrations:
  - `migrations/001_initial.sql`
  - `migrations/002_nullable_user_fk.sql`
  - `migrations/README.md`

## Migration status

### Applied/implemented

1. `001_initial`
   - Baseline schema in migration form.
   - Explicit `InnoDB`, `utf8mb4`, `utf8mb4_unicode_ci`.
   - Adds `schema_migrations`.

2. `002_nullable_user_fk`
   - `skills.user_id` -> `NULL DEFAULT 1`.
   - Scaffolding for Phase 2 auth without breaking Phase 1 behavior.
   - API create path allows omitted/null `user_id` and defaults to seed user `1`.

### Planned sequence

3. `003`: skill versioning (`skill_versions` + `skills.active_version_id`)  
4. `004`: operational audit (`skill_audit_log`)  
5. `005`: `agents` + `agent_skills` junction  
6. `006`: OpenClaw-facing routes (`/skills/:slug/active`, `/agents/:slug/bundle`)

## Current BraiMD <-> OpenClaw contract (must remain stable for now)

### Request

- Method: `GET`
- Path: `/api/skills/search`
- Query: `?trigger=<keyword>`
- Required header: `x-api-key: <raw key>`
- Optional tracing headers:
  - `X-Agent-ID`
  - `X-Session-ID`
  - `X-Platform-Source`

### Response statuses

- `success`
- `intercept`
- `not_found`
- `ambiguous`

OpenClaw drop-in parser location:
- `openclaw-drop-in/BraiMDService.ts`

## Environment mapping

### BraiMD

- `API_KEY_HASH` = SHA-256 hash of raw key
- `API_KEY_ID` = identity label for logs

### OpenClaw

- `BRAIMD_URL` = BraiMD base URL
- `BRAIMD_API_KEY` = raw key whose hash equals BraiMD `API_KEY_HASH`

## Verification baseline

Use these commands in BraiMD:

```sh
scripts/bootstrap-env.sh
scripts/up.sh
scripts/smoke.sh
scripts/run-tests.sh
```

API sanity:

```sh
curl -H "x-api-key: $BRAIMD_API_KEY" "http://localhost:3000/api/skills/search?trigger=move"
```

## Known constraints

- Prototype-first architecture; production rewrite is planned later.
- Business invariants are app-layer enforced; DB handles structural integrity.
- Multi-user auth/session enforcement is deferred to Phase 2.
- Do not break existing OpenClaw search contract until migration/API `006` lands.

## Next-step prompt for Claude (copy/paste)

```text
You are continuing BraiMD work with OpenClaw integration in mind.

Read these files first:
1) docs/claude-handoff.md
2) docs/active-context.md
3) docs/design-decisions.md
4) migrations/README.md
5) openclaw-drop-in/BraiMDService.ts
6) src/services/skillSearchService.js

Hard constraints:
- Keep /api/skills/search contract and response statuses stable (success/intercept/not_found/ambiguous).
- Keep migration flow forward-only and numbered.
- Node 20, CommonJS, Express 4, mysql2 raw SQL, no ORM.

Current completed migrations:
- 001_initial
- 002_nullable_user_fk

Task:
- Propose and implement migration 003 for skill versioning:
  - add skill_versions
  - add skills.active_version_id
  - backfill existing skills.content into v1 published rows
  - keep API compatibility for current OpenClaw integration
- Include tests/verification SQL and update docs where necessary.
```

