# Deliverable 2 — Use Cases: BraiMD

**Author:** brickjawn
**Date:** 2026-04-03

---

## Actors

| Actor | Type | Interface | Description |
|-------|------|-----------|-------------|
| **Developer** | Human | EJS web dashboard (`/dashboard`) | Authors, organizes, and manages skills through the browser UI. Views the skill tree and agent logs. |
| **AI Agent** | Machine | REST API (`/api/skills`) | Queries the vault by trigger keyword at runtime to retrieve skill instructions. Authenticates via `x-api-key` header. |

---

## Use Case Summary

| ID | Name | Actor(s) | Requirements |
|----|------|----------|-------------|
| UC-1 | Manage Skills (CRUD) | Developer | FR2, FR3, FR8 |
| UC-2 | Link Prerequisites (Edges) | Developer | FR4 |
| UC-3 | Query Skill by Trigger | AI Agent | FR5, FR6 |
| UC-4 | View Skill Tree | Developer | FR4 |
| UC-5 | View Agent Logs | Developer | FR6 |
| UC-6 | Bulk Import Fabric Patterns | Developer (CLI) | FR7 |

---

## UC-1: Manage Skills (CRUD)

| Field | Value |
|-------|-------|
| **Actor(s)** | Developer |
| **Preconditions** | BraiMD server is running; default user exists (`user_id = 1`) |
| **Trigger** | Developer navigates to the dashboard or create page |

**Main Flow — Create:**

1. Developer navigates to `/dashboard/create`.
2. System renders the upload form with a rich Markdown editor (EasyMDE), tag input (Tagify), and three template options (Blank, Agent SOP, Code Analysis).
3. Developer optionally selects a template, which pre-populates the editor with structured Markdown and YAML frontmatter.
4. Developer fills in the skill name, description, trigger tags, and Markdown content.
5. Developer clicks "Upload Skill."
6. System assembles YAML frontmatter from the form fields and concatenates it with the Markdown body.
7. System parses the combined string using `gray-matter` to extract `name`, `description`, and `triggers` into dedicated database columns, and stores the raw Markdown body in `content` (FR3).
8. System inserts the skill row into the `skills` table and auto-creates a corresponding node in the `nodes` table for the skill tree.
9. System redirects to the skill's detail view (`/dashboard/skills/:id`).

**Main Flow — Read:**

1. Developer navigates to `/dashboard`.
2. System queries all skills ordered by creation date (descending) and renders a table with ID, name, description, trigger badges, and created timestamp.
3. Developer clicks a skill name.
4. System fetches the skill, renders its Markdown content as HTML via `marked`, and displays it alongside raw Markdown in a tabbed interface (Rendered / Raw / Split View).

**Main Flow — Update:**

1. Developer clicks "Edit" on a skill's detail page.
2. System loads the skill into the edit form, pre-populating all fields and the EasyMDE editor.
3. Developer modifies any fields and clicks "Save Changes."
4. System re-parses the YAML frontmatter, updates the skill row, and redirects to the detail view.

**Main Flow — Delete:**

1. Developer clicks "Delete" on a skill's detail page.
2. System displays a browser confirmation dialog ("Are you sure?").
3. Developer confirms.
4. System deletes the skill. `ON DELETE CASCADE` automatically removes the associated node, any connected edges, and all agent log entries for that skill (NFR1).
5. System redirects to the dashboard.

**Alternate Flows:**

- **AF-1 (Empty name):** If the YAML frontmatter has no `name` field, system defaults to "Untitled Skill."
- **AF-2 (Missing content):** If the Markdown body is empty or not a string, system returns HTTP 400.
- **AF-3 (Skill not found):** If a skill ID does not exist on read/update/delete, system returns HTTP 404.

**Postconditions:** The `skills`, `nodes`, `edges`, and `agent_logs` tables reflect the change. On delete, all dependent rows are cascade-removed.

---

## UC-2: Link Prerequisites (Edges)

| Field | Value |
|-------|-------|
| **Actor(s)** | Developer |
| **Preconditions** | At least two skills exist in the vault |
| **Trigger** | Developer navigates to the skill tree page |

**Main Flow — Create Edge:**

1. Developer navigates to `/dashboard/tree`.
2. System fetches all nodes and edges from `/api/tree-data` and renders an interactive vis-network directed graph with hierarchical layout.
3. Developer clicks "Add Edge" in the vis-network toolbar.
4. Developer clicks the prerequisite node (source), then clicks the dependent node (target) to draw the connection.
5. System sends `POST /api/edges` with `{ from_skill_id, to_skill_id }`.
6. Edge controller resolves both skill IDs to their corresponding node IDs.
7. Edge controller checks for a duplicate edge (same `from_node_id` → `to_node_id`).
8. Edge controller runs a BFS ancestor walk starting from `from_node_id`, traversing parent edges upward, to verify that `to_node_id` is not already an ancestor of `from_node_id` (cycle detection — FR4).
9. System inserts the edge and returns HTTP 201 with the new edge ID.
10. vis-network graph refreshes to show the new arrow.

**Main Flow — Delete Edge:**

1. Developer selects an edge on the vis-network graph.
2. Developer clicks "Delete Selected" in the toolbar.
3. System sends `DELETE /api/edges/:id`.
4. System removes the edge row and returns HTTP 200.
5. Graph refreshes.

**Alternate Flows:**

- **AF-1 (Self-link):** If `from_skill_id === to_skill_id`, system returns HTTP 400: "A skill cannot be its own prerequisite."
- **AF-2 (Duplicate edge):** If the exact edge already exists, system returns HTTP 409: "This prerequisite link already exists."
- **AF-3 (Cycle detected):** If the new edge would create a circular dependency (A → B → C → A), the BFS walk returns true and the system returns HTTP 409: "This edge would create a circular dependency."
- **AF-4 (Missing node):** If either skill does not have a corresponding node row, system returns HTTP 404.

**Postconditions:** The `edges` table reflects the change. Prerequisite blocking is now active for the dependent skill when queried by agents (UC-3).

---

## UC-3: Query Skill by Trigger

| Field | Value |
|-------|-------|
| **Actor(s)** | AI Agent |
| **Preconditions** | API key is valid (or dev mode if `API_KEY_HASH` is unset); at least one skill with a matching trigger exists |
| **Trigger** | Agent sends `GET /api/skills?trigger=keyword` |

**Main Flow — Success:**

1. AI Agent sends `GET /api/skills?trigger=database_setup` with the `x-api-key` header.
2. API key middleware hashes the provided key with SHA-256 and performs a timing-safe comparison against `API_KEY_HASH` (NFR4).
3. Skill controller queries `SELECT ... FROM skills WHERE JSON_CONTAINS(triggers, ?)` using the trigger keyword.
4. System finds a matching skill with no inbound edges (no prerequisites).
5. System inserts an `agent_logs` row with `outcome = "success"`, `agent_id` (from API key identity), and `client_ip` (FR6).
6. System returns JSON:
   ```json
   {
     "status": "ok",
     "skill_name": "Database Setup Guide",
     "content": "## Step 1: Install MySQL..."
   }
   ```

**Alternate Flow — Prerequisite Blocked:**

1. Steps 1–3 same as above.
2. System finds a matching skill but it has an inbound edge (a prerequisite exists).
3. System queries the parent node via `edges → nodes → skills` join to retrieve the prerequisite skill.
4. System logs `outcome = "prerequisite_blocked"` (FR6).
5. System returns JSON:
   ```json
   {
     "status": "prerequisite_required",
     "skill_name": "Advanced MySQL Tuning",
     "prerequisite": {
       "skill_name": "Database Setup Guide",
       "content": "## Step 1: Install MySQL..."
     },
     "message": "You must complete \"Database Setup Guide\" before \"Advanced MySQL Tuning\"."
   }
   ```

**Alternate Flow — Not Found:**

1. Steps 1–3 same as above.
2. No skill matches the trigger keyword.
3. System returns JSON: `{ "status": "not_found", "message": "No skill matches that trigger." }`
4. No log entry is created.

**Alternate Flow — Auth Failure:**

1. Agent sends a request without `x-api-key` header or with an invalid key.
2. Middleware returns HTTP 401 ("API key required") or HTTP 403 ("Invalid API key").

**Postconditions:** The `agent_logs` table has a new entry recording the query outcome, agent identity, and source IP.

---

## UC-4: View Skill Tree

| Field | Value |
|-------|-------|
| **Actor(s)** | Developer |
| **Preconditions** | Server is running |
| **Trigger** | Developer navigates to `/dashboard/tree` |

**Main Flow:**

1. Developer navigates to `/dashboard/tree`.
2. System queries all nodes (joined with skill names) and all edges from the database.
3. Client-side JavaScript initializes a vis-network graph with hierarchical layout (top-down direction).
4. Each node displays the skill name as its label.
5. Each edge displays as a directed arrow from prerequisite to dependent skill.
6. Developer can zoom, pan, and drag nodes to rearrange the layout.
7. Developer can double-click a node to navigate to that skill's detail page (`/dashboard/skills/:id`).

**Alternate Flows:**

- **AF-1 (Empty vault):** If no skills exist, the graph renders empty. The "Add Edge" toolbar is still available but non-functional until nodes exist.

**Postconditions:** None — this is a read-only visualization. Edge creation/deletion is covered in UC-2.

---

## UC-5: View Agent Logs

| Field | Value |
|-------|-------|
| **Actor(s)** | Developer |
| **Preconditions** | At least one agent query has been recorded |
| **Trigger** | Developer navigates to `/dashboard/logs` |

**Main Flow:**

1. Developer navigates to `/dashboard/logs`.
2. System queries the 100 most recent `agent_logs` entries, joined with the `skills` table to resolve skill names.
3. System renders a table with columns: Log ID, Skill Name (linked to detail page), Outcome (`success` or `prerequisite_blocked`), Agent ID, Client IP, Timestamp.
4. Developer reviews the log to understand which skills agents are querying, which are being blocked by prerequisites, and which agent identities and IP addresses are making the calls.

**Alternate Flows:**

- **AF-1 (No logs):** If no agent queries have occurred, system displays an empty state message.

**Postconditions:** None — read-only view.

---

## UC-6: Bulk Import Fabric Patterns

| Field | Value |
|-------|-------|
| **Actor(s)** | Developer (CLI) |
| **Preconditions** | BraiMD server is running and reachable; internet access to GitHub |
| **Trigger** | Developer runs `node scripts/import_fabric.js` |

**Main Flow:**

1. Developer executes `node scripts/import_fabric.js` from the project root.
2. Script performs a health check against `GET /health` to confirm the server is reachable.
3. Script iterates through a curated list of 10 Fabric AI pattern names (e.g., `extract_wisdom`, `analyze_claims`, `write_essay`).
4. For each pattern, the script fetches `system.md` from the Fabric GitHub repository's raw content URL.
5. Script constructs YAML frontmatter with the pattern's name, a generated description, and trigger tags derived from the pattern name.
6. Script sends `POST /api/skills` with the assembled Markdown payload and optional `x-api-key` header.
7. Server parses the frontmatter, creates the skill, and auto-creates the corresponding node.
8. Script logs each successful import to the console with a 300ms delay between requests to respect GitHub's rate limits.

**Alternate Flows:**

- **AF-1 (Server unreachable):** Health check fails. Script exits with an error message.
- **AF-2 (GitHub fetch failure):** Individual pattern fetch fails (404, timeout). Script logs "SKIPPED" for that pattern and continues with the next one.
- **AF-3 (Duplicate skill):** If a skill with the same name already exists, the server creates a new row (no unique constraint on skill name). The developer can manually deduplicate via the dashboard.

**Postconditions:** Imported skills appear on the dashboard with auto-created nodes. They are immediately visible on the skill tree and queryable by agents via trigger keywords.

---

## Use Case Diagram (Text Representation)

```
                    ┌─────────────────────────────────────────┐
                    │              BraiMD System               │
                    │                                         │
  ┌──────────┐     │  ┌─────────────────────────────────┐    │
  │Developer │─────┼──│ UC-1: Manage Skills (CRUD)      │    │
  │          │─────┼──│ UC-2: Link Prerequisites (Edges) │    │
  │          │─────┼──│ UC-4: View Skill Tree            │    │
  │          │─────┼──│ UC-5: View Agent Logs            │    │
  │          │─────┼──│ UC-6: Bulk Import Fabric         │    │
  └──────────┘     │  └─────────────────────────────────┘    │
                    │                                         │
  ┌──────────┐     │  ┌─────────────────────────────────┐    │
  │ AI Agent │─────┼──│ UC-3: Query Skill by Trigger     │    │
  └──────────┘     │  └─────────────────────────────────┘    │
                    │                                         │
                    └─────────────────────────────────────────┘
```
