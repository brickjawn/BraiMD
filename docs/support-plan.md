# Deliverable 5 — Support Plan: BraiMD

**Author:** brickjawn
**Date:** 2026-04-03

---

## 1. Deployment

BraiMD runs as a two-container stack via Podman Compose (rootless, daemonless). No cloud provider required — the entire stack runs on a single machine.

### Stack Components

| Container | Image | Port | Purpose |
|-----------|-------|------|---------|
| `braimd-app` | Node 20 Alpine (custom Dockerfile) | 3000 | Express API + EJS dashboard |
| `braimd-db` | MySQL 8.0 (official) | 3306 (internal) | Relational database |

### First-Time Setup

```sh
# 1. Clone the repository
git clone <repo-url> && cd BraiMD

# 2. Create environment file from the template
cp .env.example .env
# Edit .env with your credentials and API key hash

# 3. Start the stack
podman-compose up -d

# 4. Verify
curl http://localhost:3000/health
# Expected: {"status":"ok"}
```

On first boot, MySQL initializes the `braimd` database from the `migrations/` directory (mounted at `/docker-entrypoint-initdb.d/`). Files run in alphabetical order — the `NNN_*.sql` prefix enforces the apply sequence. `001_initial.sql` creates all five tables, seeds the default user (`user_id = 1`), and records itself in `schema_migrations`. See [migrations/README.md](../migrations/README.md) for the full convention.

### Restarting After Code Changes

Source directories (`src/` and `views/`) are bind-mounted into the app container, so file changes are immediately visible. Restart the app container to pick them up:

```sh
podman-compose restart app
```

No image rebuild is required for source or template changes. Only rebuild if `package.json` dependencies change:

```sh
podman-compose up -d --build app
```

### Stopping and Cleaning Up

```sh
podman-compose down          # stop containers, keep database volume
podman-compose down -v       # stop containers AND destroy database volume (fresh start)
```

---

## 2. Monitoring

### Health Check

The application exposes a health endpoint for automated monitoring:

```sh
curl http://localhost:3000/health
# {"status":"ok"}
```

The MySQL container has its own health check defined in `docker-compose.yml` using `mysqladmin ping`. The app container's `depends_on` condition ensures it only starts after the database reports healthy.

### Agent Activity Dashboard

The `/dashboard/logs` page displays the 100 most recent agent queries with:

- **Skill Name** — which skill was queried (linked to detail page)
- **Outcome** — `success` (skill returned) or `prerequisite_blocked` (dependency wall)
- **Agent ID** — which API key identity made the call
- **Client IP** — source address (useful for distinguishing hosts on the same network)
- **Timestamp** — when the query occurred

This provides real-time visibility into how AI agents are using the vault without requiring external monitoring tools.

### Container Logs

Application errors are logged to stdout via `console.error`. Access them with:

```sh
podman logs braimd-app           # application logs
podman logs braimd-db            # MySQL logs
podman logs -f braimd-app        # follow mode (live tail)
```

For persistence, pipe logs to a file:

```sh
podman logs braimd-app > logs/app_$(date +%Y%m%d).log 2>&1
```

---

## 3. Backup Strategy

### Database Backups

**Manual dump (recommended before any schema change):**

```sh
podman exec braimd-db mysqldump -u braimd -pbraimd_secret braimd > backup_$(date +%Y%m%d).sql
```

**Restore from dump:**

```sh
podman exec -i braimd-db mysql -u braimd -pbraimd_secret braimd < backup_20260403.sql
```

### Volume Snapshots

For a full binary backup of the database volume:

```sh
podman volume export BraiMD_db_data > db_volume_$(date +%Y%m%d).tar
```

Restore:

```sh
podman volume import BraiMD_db_data db_volume_20260403.tar
```

### Code

The Git repository is the source of truth for all application code, schema definitions, scripts, and documentation. Database content (skills, edges, logs) lives only in MySQL and should be backed up separately using the methods above.

### Recommended Schedule

| What | How | Frequency |
|------|-----|-----------|
| MySQL dump | `mysqldump` via podman exec | Daily (or before any schema change) |
| Volume snapshot | `podman volume export` | Weekly |
| Git push | `git push` | After every meaningful change |

---

## 4. Security Posture

### Current Measures (Phase 1)

| Layer | Mechanism | Configuration |
|-------|-----------|---------------|
| **HTTP Headers** | Helmet middleware | Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, etc. |
| **CORS** | Locked to configured origin | `CORS_ORIGIN` in `.env` (default: `http://localhost:3000`) |
| **Rate Limiting** | express-rate-limit | 100 requests per 15-minute window on `/api/` routes |
| **API Authentication** | SHA-256 API key hashing | `x-api-key` header verified via `crypto.timingSafeEqual` against `API_KEY_HASH` env var |
| **Input Validation** | Positive integer checks | All route parameters validated before database queries (NFR4) |
| **Secrets Management** | `.env` file | 600 permissions, gitignored, never committed |
| **Container Isolation** | Podman (rootless) | No daemon, no root privileges |

### Planned Measures (Phase 2+)

- **User Authentication:** bcrypt password hashing + express-session for dashboard login/register flows (FR1).
- **Per-User Scoping:** All queries filtered by `user_id` from the authenticated session, replacing the hardcoded `user_id = 1`.
- **HTTPS:** Caddy reverse proxy container for automatic TLS certificate management (Phase 3).

---

## 5. Known Issues and Mitigations

| Issue | Impact | Mitigation | Resolution |
|-------|--------|------------|------------|
| `user_id = 1` hardcoded | All skills belong to one user | Seed user in `schema.sql` ensures it exists on fresh setup | Phase 2: user auth with session-scoped user_id |
| No HTTPS | Traffic unencrypted | Running on localhost only; Tailscale tunnel for remote access | Phase 3: Caddy reverse proxy with auto-TLS |
| No automated tests | Regressions possible | Manual testing checklist (see Section 7) | Phase 4: test suite |
| Agent logs unbounded | Table grows indefinitely | Dashboard query limited to 100 rows; MySQL handles large tables well | Phase 2: log rotation or TTL-based cleanup |
| Edge routes unauthenticated | Dashboard-only consumers | Same-origin fetch; no sensitive data exposed | Phase 2: session auth for dashboard routes |

---

## 6. Roadmap

| Phase | Feature | Status | Target |
|-------|---------|--------|--------|
| **1** | Core CRUD, skill tree, agent API, activity logging, Fabric import | **Complete** | 2026-04-08 |
| **2** | User authentication (bcrypt + express-session), per-user scoping | Planned | 2026-04 |
| **3** | Caddy reverse proxy, HTTPS, production deployment | Planned | 2026-05 |
| **4** | Automated test suite, CI pipeline | Planned | 2026-05 |
| **5** | OpenClaw MCP integration (BraiMD as a tool source for the AI gateway) | Planned | 2026-06 |

---

## 7. Manual Testing Checklist (Demo Day)

Run through this checklist before any demo or submission to verify end-to-end functionality.

### Setup
- [ ] `podman-compose down -v` (clean state)
- [ ] `podman-compose up -d` (rebuild from scratch)
- [ ] `curl http://localhost:3000/health` returns `{"status":"ok"}`
- [ ] Dashboard loads at `http://localhost:3000`

### Skill CRUD (FR2, FR3)
- [ ] Create a skill via `/dashboard/create` using the Agent SOP template
- [ ] Verify skill appears on dashboard with correct name, description, and trigger badges
- [ ] Click skill name — rendered Markdown displays correctly
- [ ] Switch to "Raw" and "Split" tabs — both work
- [ ] Edit the skill — change name and add a trigger tag
- [ ] Delete the skill — confirm dialog, then verify removal from dashboard

### Skill Tree (FR4)
- [ ] Navigate to `/dashboard/tree` — graph renders with existing nodes
- [ ] Create an edge by clicking "Add Edge" and connecting two nodes
- [ ] Verify the arrow appears in the correct direction (prerequisite → dependent)
- [ ] Attempt to create a self-link — expect rejection toast
- [ ] Attempt to create a cycle (A→B→C→A) — expect rejection toast
- [ ] Delete an edge — verify removal from graph

### Agent API (FR5, FR6)
- [ ] Query with a valid trigger:
  ```sh
  curl -H "x-api-key: YOUR_KEY" "http://localhost:3000/api/skills?trigger=extract_wisdom"
  ```
  Expect `{"status":"ok", "skill_name": "...", "content": "..."}`
- [ ] Query a skill that has a prerequisite — expect `"prerequisite_required"` response
- [ ] Query with a non-existent trigger — expect `"not_found"` response
- [ ] Verify all queries appear in `/dashboard/logs` with correct outcome, agent_id, and client_ip

### Fabric Import (FR7)
- [ ] Run `node scripts/import_fabric.js`
- [ ] Verify 10 skills imported (check dashboard count)
- [ ] Verify imported skills have correct names, descriptions, and triggers

### Security (NFR4)
- [ ] API request without `x-api-key` header returns HTTP 401
- [ ] API request with wrong key returns HTTP 403
- [ ] Confirm rate limiting: send 101+ rapid requests to `/api/skills` and expect HTTP 429
