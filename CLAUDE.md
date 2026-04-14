# BraiMD

Markdown-based AI skill vault — store, organize, and query `.md` skills with YAML frontmatter. School project (Node.js + MySQL required by rubric).

## Stack

- **Runtime**: Node.js 20 (CommonJS, not ESM)
- **Framework**: Express 4, EJS templates, Tailwind CSS via CDN
- **Database**: MySQL 8.0
- **Infra**: Podman Compose — `braimd-app` (port 3000) + `braimd-db`
- **No build step** — no bundler, no TypeScript, no frontend framework

## Project Layout

```
src/
  server.js          # Express app entry point
  db/db.js           # mysql2 connection pool
  db/schema.sql      # DDL: users, skills, nodes, edges, agent_logs
  controllers/       # skillController, edgeController, viewController
  routes/            # skillRoutes, edgeRoutes, viewRoutes
views/               # EJS templates (index, create, edit, view, tree, logs, help)
  partials/          # Shared EJS partials
scripts/
  import_fabric.js   # Bulk-import Fabric patterns into DB
docker-compose.yml   # Full stack definition
Dockerfile           # Node 20-alpine image
```

## Running

```sh
podman-compose up -d          # start both containers
podman-compose restart app    # restart app after code changes (src/ is bind-mounted)
```

Health check: `curl http://localhost:3000/health`

## Key Routes

| Path | Purpose |
|------|---------|
| `GET /dashboard` | Skill list (index) |
| `GET /dashboard/create` | Create skill form |
| `GET /dashboard/edit/:id` | Edit skill form |
| `GET /dashboard/view/:id` | Render skill markdown |
| `GET /dashboard/tree` | Vis-network skill tree |
| `GET /dashboard/logs` | Agent log viewer |
| `GET /dashboard/help` | Help / API docs |
| `GET /api/skills` | JSON skill list |
| `GET /api/skills/:id` | JSON single skill |
| `POST /api/skills` | Create skill |
| `PUT /api/skills/:id` | Update skill |
| `DELETE /api/skills/:id` | Delete skill |
| `GET /api/skills/search?trigger=` | Search by trigger |
| `GET /api/tree-data` | Nodes + edges for vis-network |
| `POST /api/edges` | Create edge |
| `DELETE /api/edges/:id` | Delete edge |

## Database Schema (5 tables)

- `users` — id, email, password_hash (auth not yet implemented)
- `skills` — id, user_id (FK), name, description, content, triggers (JSON)
- `nodes` — id, user_id (FK), skill_id (FK unique), position_x/y
- `edges` — id, from_node_id (FK), to_node_id (FK)
- `agent_logs` — id, skill_id (FK), used_at, outcome, agent_id, client_ip

All skills currently use `user_id = 1` (hardcoded until auth is built).

## Conventions

- Plain JavaScript (CommonJS `require`), no TypeScript
- No ORM — raw SQL via `mysql2/promise` pool
- EJS templates with Tailwind utility classes
- External libs loaded via CDN (EasyMDE, Tagify, vis-network, marked)
- `.env` holds DB credentials — never commit, 600 perms
- Podman over Docker, rootless by default

## Upcoming Work

- **Phase 2**: User auth (bcrypt + express-session, login/register flows)
- **Phase 3**: Caddy reverse proxy for HTTPS
