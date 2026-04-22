# BraiMD

A Markdown-based AI skill vault — store, organize, and query `.md` skills with YAML frontmatter so autonomous AI agents can retrieve the right instructions at runtime.

**Course:** IST 260W — Systems Analysis and Design
**Author:** brickjawn

---

## What It Does

BraiMD is a centralized repository where developers author skills as Markdown files with YAML frontmatter. The system parses the metadata automatically, organizes skills into a visual prerequisite tree, and exposes a REST API that AI agents can query by trigger keyword. If a skill has an unmet prerequisite, the agent gets the prerequisite content instead — enforcing a learning path.

### Key Features

- **Skill CRUD** — Create, read, update, and delete skills via web dashboard or REST API
- **YAML Frontmatter Parsing** — Automatic extraction of name, description, and triggers from Markdown headers
- **Prerequisite Tree** — Interactive vis-network graph with drag-to-connect edge creation and cycle detection
- **Agent API** — `GET /api/skills?trigger=keyword` returns structured JSON with prerequisite enforcement
- **Activity Logging** — Every agent query is logged with outcome, agent identity, and source IP
- **Fabric Import** — Bulk import 10 curated AI patterns from the Fabric repository via CLI script
- **Skill Templates** — Pre-built templates (Blank, Agent SOP, Code Analysis) for consistent authoring

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 20 (CommonJS) |
| Framework | Express 4 |
| Database | MySQL 8.0 |
| Templating | EJS + Tailwind CSS (CDN) |
| Editor | EasyMDE (CDN) |
| Tags | Tagify (CDN) |
| Graph | vis-network (CDN) |
| Containers | Podman Compose |

No build step. No frontend framework. No TypeScript.

---

## Quick Start

Scripted one-command laptop workflow (Podman preferred, Docker supported):

```sh
git clone <repo-url> && cd BraiMD

scripts/bootstrap-env.sh          # generate .env + API key
scripts/up.sh                     # pull/build + start full stack
scripts/smoke.sh                  # verify /health, /dashboard, API auth
scripts/run-tests.sh              # run the Node test suite
```

Open the dashboard:

```sh
xdg-open http://localhost:3000    # Linux
```

### Manual start (equivalent to the scripts above)

```sh
cp .env.example .env
# Edit .env — set DB_PASSWORD, DB_ROOT_PASSWORD, and API_KEY_HASH
podman-compose up -d
curl http://localhost:3000/health
# {"status":"ok"}
```

### Runtime modes

`scripts/up.sh` supports three modes — pick the one that matches your laptop:

| Flag | What it runs | When to use |
|------|--------------|-------------|
| _(default)_ | App **and** DB in containers (`docker-compose.yml`) | Normal laptop bring-up |
| `--rootless-fallback` | App-only container (`docker-compose.rootless-fallback.yml`) | Rootless host where bridge networking is blocked; use existing local MariaDB/MySQL |
| `--hybrid` | DB in a container, Node app on the host | Container build is restricted (e.g. no `/dev/net/tun` inside the sandbox) |

### Rootless Podman Notes (Linux)

If your host cannot create rootless bridge networks (`netavark ... create bridge ... Operation not supported`), this repo is configured to run with host networking.

- Main stack: `podman-compose up -d`
- App-only fallback (uses your existing local MariaDB): `podman-compose -f docker-compose.rootless-fallback.yml up -d`

### Generating an API Key

`scripts/bootstrap-env.sh` does this automatically and stores the **raw** key in
`.env.apikey` (chmod 600, gitignored). To regenerate manually:

```sh
# Generate a random key
openssl rand -hex 32
# Example output: a1b2c3d4...

# Hash it with SHA-256
echo -n "a1b2c3d4..." | sha256sum | awk '{print $1}'

# Put the HASH in .env as API_KEY_HASH
# Use the raw key in your x-api-key header when calling the API
```

---

## Routes

### Dashboard (EJS Web UI)

| Route | Purpose |
|-------|---------|
| `GET /dashboard` | Skill list |
| `GET /dashboard/create` | Upload skill form |
| `GET /dashboard/skills/:id` | View skill (rendered Markdown) |
| `GET /dashboard/skills/:id/edit` | Edit skill form |
| `POST /dashboard/skills/:id/delete` | Delete skill |
| `GET /dashboard/tree` | Interactive skill tree (vis-network) |
| `GET /dashboard/logs` | Agent activity log viewer |
| `GET /dashboard/help` | Documentation and API guide |

### REST API (Agent-Facing)

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/skills` | GET | API Key | List skills or search by `?trigger=` |
| `/api/skills/:id` | GET | API Key | Get single skill |
| `/api/skills` | POST | API Key | Create skill |
| `/api/skills/:id` | PUT | API Key | Update skill |
| `/api/skills/:id` | DELETE | API Key | Delete skill |
| `/api/edges` | POST | None | Create prerequisite edge |
| `/api/edges/:id` | DELETE | None | Delete edge |
| `/api/tree-data` | GET | None | Nodes + edges for vis-network |
| `/health` | GET | None | Health check |

---

## Database Schema

Five normalized tables with `ON DELETE CASCADE` on all foreign keys:

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `users` | Authentication (Phase 2) | — |
| `skills` | Markdown content + YAML metadata | `user_id` → users |
| `nodes` | Graph canvas positions | `skill_id` → skills (1:1, UNIQUE) |
| `edges` | Prerequisite links | `from_node_id`, `to_node_id` → nodes |
| `agent_logs` | Agent query history | `skill_id` → skills |

See [docs/erd.md](docs/erd.md) for the full ERD with column definitions and design decisions.

---

## Project Deliverables

| # | Deliverable | Location |
|---|-------------|----------|
| 1 | Requirements Analysis | [docs/requirements-analysis.md](docs/requirements-analysis.md) |
| 2 | Use Cases | [docs/use-case.md](docs/use-case.md) |
| 3 | Entity Relationship Diagram | [docs/erd.md](docs/erd.md) |
| 4 | Node.js Program | `src/` (this repository) |
| 5 | Support Plan | [docs/support-plan.md](docs/support-plan.md) |

---

## Project Layout

```
src/
  server.js              Express app entry point
  db/db.js               mysql2 connection pool
  db/schema.sql          DDL + seed data
  controllers/           skillController, edgeController, viewController
  routes/                skillRoutes, edgeRoutes, viewRoutes
  middleware/            apiKeyAuth (SHA-256 timing-safe)
views/                   EJS templates (index, create, edit, view, tree, logs, help)
  partials/              Shared header/footer
scripts/
  import_fabric.js       Bulk import Fabric AI patterns
docs/                    Project deliverables
docker-compose.yml       Podman Compose stack definition
Dockerfile               Node 20 Alpine image
.env.example             Environment variable template
```
