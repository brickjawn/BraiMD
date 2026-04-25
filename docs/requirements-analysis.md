# Deliverable 1 — Requirements Analysis: BraiMD

**Author:** brickjawn
**Date:** 2026-03-23

---

## Project Goal

To develop a client-server Node.js application backed by a MySQL database that allows developers to create, manage, and logically link Markdown-based "skills" for autonomous AI agents to query and execute.

---

## 1. Requirements Analysis

### Business Requirements (The "Why")

- **BR1: Centralized Skill Repository.** The system must provide a standardized, centralized repository for AI agent instructions, eliminating the need to hardcode massive context windows into every prompt. Instead of scattering skill definitions across prompts, codebases, and documentation, all agent instructions live in one queryable vault.

- **BR2: Academic Criteria Fulfillment.** The project must successfully fulfill all academic criteria for a client-server architecture, demonstrating proficiency in relational database management (MySQL with foreign keys, cascading deletes, and JSON columns) and backend API routing (Express.js RESTful endpoints).

- **BR3: Reusable Agent Infrastructure.** The system must serve as reusable infrastructure that any AI agent — whether powered by OpenRouter, Ollama, or another backend — can query at runtime, decoupling skill authoring from agent implementation.

### User Requirements (The "Who")

- **Developers (Human Users):** Need a frictionless way to upload, edit, and organize `.md` files, relying on the system to automatically categorize them based on YAML metadata rather than manual data entry. They require a visual way to link prerequisite skills into a dependency tree, a rich Markdown editor for authoring, and a rendered preview for validation. Developers also need visibility into how agents are using the vault through activity logs.

- **AI Agents (Machine Users):** Need a lightweight, highly structured method to search for a specific task trigger and instantly retrieve the exact Markdown instructions required to execute that workflow. Agents must receive structured JSON responses with clear status indicators and prerequisite warnings when a skill has unmet dependencies.

### Functional Requirements (The "What")

- **FR1: User Authentication & Session Management.** The system must allow users to register, log in, and securely manage their own BraiMD environment. Each user's skills, nodes, and edges are scoped by `user_id` foreign keys. *(Planned — Phase 2; currently hardcoded to `user_id = 1`.)*

- **FR2: Markdown CRUD Operations.** The system must allow users to Create, Read, Update, and Delete Markdown skill files through both a web dashboard (EJS-rendered forms with EasyMDE editor) and a RESTful JSON API (`POST /api/skills`, `GET /api/skills/:id`, `PUT /api/skills/:id`, `DELETE /api/skills/:id`).

- **FR3: YAML Frontmatter Parsing.** The system must parse uploaded Markdown files to extract metadata — `name`, `description`, and `triggers` — from YAML frontmatter (via the `gray-matter` library) and store each field in its corresponding `skills` column while preserving the raw Markdown body in `skill_versions.content` as the active published version.

- **FR4: Skill Tree Graph Management.** The system must allow users to define prerequisites by linking skills together as Nodes and Edges, visualized via an interactive vis-network graph. Each skill auto-creates a corresponding node on insert. Users can drag-to-connect skills on the tree page, and edges represent prerequisite relationships. Prerequisite logic checks the immediate parent node only (not full recursive traversal) to accommodate MySQL's relational model for the MVP. The system must enforce acyclic graph integrity by performing cycle detection (BFS ancestor walk) before inserting any new edge, rejecting requests that would create circular dependencies.

- **FR5: Agent API Endpoint (Extra Functionality).** The system must expose a RESTful API endpoint (`GET /api/skills/search?trigger=keyword`, with `GET /api/skills?trigger=keyword` as a compatibility alias) allowing external AI agents to query and retrieve skill content dynamically. The endpoint uses MySQL's `JSON_CONTAINS` to match against the `triggers` JSON column and joins `skills.active_version_id` to `skill_versions` so agents receive the active Markdown version. If the matched skill has a prerequisite (an inbound edge), the API returns an `intercept` response with the parent skill's active content instead, enforcing the learning path.

- **FR6: Activity Logging.** The system must track and log when an AI agent accesses a specific skill, recording the `skill_id`, timestamp, outcome (`success`, `intercept`, `not_found`, or `ambiguous`), `agent_id`, `session_id`, `platform`, and `client_ip` in the `agent_logs` table. A dashboard view (`/dashboard/logs`) displays the 100 most recent log entries with all fields visible, enabling operators to distinguish queries from different agents and sources.

- **FR7: Bulk Import from Fabric Patterns.** The system must support bulk importing of Markdown skills from the Fabric AI patterns repository via a CLI script (`node scripts/import_fabric.js`), parsing each pattern's `system.md` into the database with auto-generated frontmatter.

- **FR8: Skill Templates.** The system must offer pre-built Markdown templates (Blank, Agent SOP, Code Analysis) on the create page to accelerate skill authoring and enforce consistent structure.

### Non-Functional Requirements (The "Characteristics")

- **NFR1: Relational Integrity.** The MySQL database must enforce strict foreign key constraints with `ON DELETE CASCADE` across all dependent tables (`skills → nodes → edges`, `skills → agent_logs`), so that deleting a skill automatically removes its associated tree nodes, edges, and log entries without leaving orphaned records.

- **NFR2: Performance.** The Agent API endpoint must process trigger queries and return the JSON payload in under 200ms to prevent timeouts during autonomous AI agent loops. MySQL's JSON indexing via `JSON_CONTAINS` and connection pooling via `mysql2` support this target.

- **NFR3: Usability.** The web dashboard must render raw Markdown into readable HTML (via `marked`) for human review and validation, alongside a rich text editor (EasyMDE) for authoring. Trigger tags use Tagify for intuitive multi-value input.

- **NFR4: Security.** The application must apply security headers via `helmet`, enforce CORS origin restrictions, apply rate limiting on API routes (100 requests per 15-minute window via `express-rate-limit`), and validate all route parameters as positive integers before database queries. The agent-facing API (`/api/skills`) must require API key authentication via the `x-api-key` header, verified against a SHA-256 hash stored in the environment using timing-safe comparison (`crypto.timingSafeEqual`) to prevent timing attacks. When no `API_KEY_HASH` is configured, the middleware operates in dev mode (passthrough) to preserve local development ergonomics.

- **NFR5: Containerization.** The full application stack (Node.js app + MySQL 8.0) must run in isolated containers via Podman Compose, with health checks on the database, bind-mounted source directories for development, and persistent volumes for database storage.

### System Requirements (The "How")

- **SR1: Backend Framework.** The backend application must be constructed using Node.js 20 (CommonJS modules) and the Express.js 4 framework.

- **SR2: Database.** The database must be a relational MySQL 8.0 system, utilizing connection pooling via the `mysql2/promise` library. The current schema comprises seven tables: `schema_migrations`, `users`, `skills`, `skill_versions`, `nodes`, `edges`, and `agent_logs`.

- **SR3: Templating.** The client-facing interface must use EJS server-side templates with Tailwind CSS (loaded via CDN) for styling. No frontend build step or JavaScript framework is required.

- **SR4: Container Runtime.** The application stack must be deployable via `podman-compose up -d`, producing two containers (`braimd-app` on port 3000, `braimd-db` on MySQL's default port) with the database initialized from numbered SQL files in `migrations/` on first run.

- **SR5: External Libraries (CDN).** The client must load EasyMDE (Markdown editor), Tagify (tag input), vis-network (graph visualization), and marked (Markdown rendering) via CDN — no bundler or build toolchain required.

---

## 2. Methods for Requirements Elicitation

**Method Used: Interview**

For a specialized developer tool like BraiMD, a structured interview format is the most effective elicitation method. It allows deep exploration of workflows, edge cases, and integration patterns that surveys would miss. Below are five targeted interview questions with realistic responses from the lead developer's perspective.

---

### Q1: How do you envision the physical process of adding a new "skill" to the BraiMD system?

**Answer:** I want to write the skills locally in my standard code editor. When I'm done, I'll log into the BraiMD dashboard, hit "Create," and either paste the full Markdown text or pick a template — like the Agent SOP template — and fill in the blanks. The system needs to be smart enough to read the YAML frontmatter at the top of the file to grab the title, description, and trigger tags automatically. I don't want to fill out ten separate form fields. I also want a rich editor with a toolbar and live preview so I can verify formatting before saving. For bulk onboarding, I should be able to run a script that imports an entire folder of patterns — like the Fabric AI repository — in one shot.

**Requirements Derived:**
- FR2 (Markdown CRUD via dashboard and API)
- FR3 (YAML frontmatter auto-parsing)
- FR7 (Bulk Fabric import)
- FR8 (Skill templates)
- NFR3 (Usability — EasyMDE editor with preview)

---

### Q2: When an autonomous AI agent queries the vault, what exact format does it need the data returned in to be useful?

**Answer:** AI agents need structured, predictable responses. When the agent hits the API endpoint with a search trigger — say `/api/skills/search?trigger=database_setup` — the server should return a standard JSON object. It needs a `status` indicator (`"success"`, `"intercept"`, `"not_found"`, or `"ambiguous"`), the skill name, and the raw, unrendered Markdown string from the active skill version so the LLM can read the step-by-step instructions directly. If no skill matches the trigger, return a clear `"not_found"` status so the agent can handle it gracefully without crashing. And every query should be logged automatically so I can see what skills are actually being used.

**Requirements Derived:**
- FR5 (Agent API with JSON response format)
- FR6 (Automatic activity logging on agent queries)
- NFR2 (Performance — sub-200ms responses)

---

### Q3: How should the system handle a situation where an AI agent requests an advanced skill but hasn't completed the prerequisite?

**Answer:** That's exactly why we need the edge/node tree logic. If an agent asks for instructions on "Deploying a Node app," the system should check the database for prerequisite edges. If there's a prerequisite linked to it — like "Docker Basics" — the API should return an `"intercept"` status along with the parent skill's name and active-version content, telling the agent what it needs to learn first. Log that interaction as `"intercept"` so I can see how often agents hit dependency walls. For the MVP, just check the immediate parent — don't try to walk the entire ancestry tree recursively. That keeps the SQL simple and the response fast.

**Requirements Derived:**
- FR4 (Skill tree with nodes and edges)
- FR5 (Prerequisite enforcement in API responses)
- FR6 (Logging with `intercept` outcome)
- NFR1 (Cascading deletes when a skill is removed)

---

### Q4: Where and how will this application and its database be hosted and managed?

**Answer:** I run everything in containers using Podman — it's rootless and daemonless, which is perfect for my setup. I want the full stack defined in a single `docker-compose.yml`: one container for the Node app, one for MySQL 8.0. The database should initialize itself from numbered migration files on first boot, and the app container should wait for a database health check before starting. For development, I need the `src/` and `views/` directories bind-mounted so I can edit code on my host and just restart the app container — no rebuild needed. Eventually I'll add a Caddy container for HTTPS reverse proxy, but that's Phase 3.

**Requirements Derived:**
- NFR5 (Containerization via Podman Compose)
- SR4 (Two-container stack with health checks)
- SR2 (MySQL 8.0 with schema auto-init)

---

### Q5: What are the security considerations and strict academic criteria required for this system to be considered complete?

**Answer:** Security-wise, I want Helmet for HTTP headers, CORS locked to my origin, and rate limiting on the API so someone can't hammer it. All user input — especially route parameters — needs validation before it touches a SQL query. For the academic rubric, it absolutely must use a Node.js backend and a MySQL database with proper foreign keys and relational integrity. It has to demonstrate standard CRUD operations through both a web interface and an API. The visual skill tree mapping and the REST API for AI agents serve as the required "extra functionality" beyond basic CRUD. User authentication with bcrypt and sessions is the next milestone to show proper access control.

**Requirements Derived:**
- NFR4 (Security — Helmet, CORS, rate limiting, input validation)
- NFR1 (Relational integrity with foreign keys)
- FR1 (User authentication — Phase 2)
- FR2 (CRUD via web + API)
- SR1, SR2 (Node.js + MySQL — academic requirement)
