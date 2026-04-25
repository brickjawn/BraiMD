# Deliverable 3 — Entity Relationship Diagram: BraiMD

**Author:** brickjawn
**Date:** 2026-04-03

---

## Overview

BraiMD's data layer is a normalized MySQL 8.0 schema consisting of six domain tables plus a `schema_migrations` tracking table. The design separates concerns into four domains: **identity** (`users`), **skill metadata and versioned content** (`skills` + `skill_versions`), **graph relationships** (`nodes` + `edges`), and **observability** (`agent_logs`). Core child tables use cascading foreign keys so deleting a skill removes its graph node, prerequisite edges, versions, and related logs without orphaned rows.

---

## Entity Relationship Diagram

```
 ┌────────────────────┐
 │       users         │
 ├────────────────────┤
 │ id             PK   │
 │ username            │
 │ email          UQ   │
 │ password_hash       │
 │ created_at          │
 └─────────┬──────────┘
           │ 1:M
           │
 ┌─────────▼──────────┐      active version       ┌────────────────────┐
 │       skills        │──────────────────────────>│   skill_versions   │
 ├────────────────────┤                           ├────────────────────┤
 │ id             PK   │<──────────────────────────│ skill_id       FK   │
 │ user_id        FK   │      1:M history          │ id             PK   │
 │ active_version FK   │                           │ version_number      │
 │ name                │                           │ status              │
 │ description         │                           │ content             │
 │ triggers       JSON │                           │ created_by_user FK  │
 │ created_at          │                           │ changelog           │
 │ updated_at          │                           └────────────────────┘
 └──────┬──────┬──────┘
        │      │
        │      │ 1:M logs
        │      ▼
        │ ┌────────────────────┐
        │ │     agent_logs      │
        │ ├────────────────────┤
        │ │ id             PK   │
        │ │ skill_id       FK   │
        │ │ agent_id            │
        │ │ session_id          │
        │ │ platform            │
        │ │ client_ip           │
        │ │ query               │
        │ │ outcome             │
        │ │ used_at             │
        │ └────────────────────┘
        │
        │ 1:1 graph node
        ▼
 ┌────────────────────┐       prerequisite graph      ┌────────────────────┐
 │       nodes         │<─────────────────────────────│       edges         │
 ├────────────────────┤                              ├────────────────────┤
 │ id             PK   │─────────────────────────────>│ source_node_id FK   │
 │ user_id        FK   │                              │ target_node_id FK   │
 │ skill_id     FK,UQ  │                              │ id             PK   │
 │ x_coordinate        │                              │ user_id        FK   │
 │ y_coordinate        │                              └────────────────────┘
 └────────────────────┘
```

### Reading the Diagram

- **Arrows** indicate foreign key direction (child → parent).
- **1:M** = one-to-many. One skill can have many `skill_versions`; one user can own many skills.
- **1:1** = one-to-one. Each skill has exactly one graph node (enforced by `UNIQUE(skill_id)` on `nodes`). The node is auto-created when a skill is inserted.
- `skills.active_version_id` points to exactly one row in `skill_versions`; application logic ensures active versions are published.
- **Prerequisite graph:** an edge's `source_node_id` is the prerequisite and `target_node_id` is the dependent skill.

---

## Table Definitions

### users

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Unique user identifier |
| `username` | VARCHAR(255) | NOT NULL | Display/developer username |
| `email` | VARCHAR(255) | NOT NULL, UNIQUE | Login email address |
| `password_hash` | VARCHAR(255) | NOT NULL | Bcrypt hash (Phase 2); placeholder for now |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Registration timestamp |

### skills

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Unique skill identifier |
| `user_id` | INT | FK → users(id), NULL, DEFAULT 1, CASCADE | Prototype ownership scaffold; Phase 2 auth will enforce session user |
| `active_version_id` | INT | FK → skill_versions(id), NULL, SET NULL | Pointer to the currently active content version |
| `name` | VARCHAR(255) | NOT NULL | Extracted from YAML `name` frontmatter field |
| `description` | TEXT | nullable | Extracted from YAML `description` field |
| `triggers` | JSON | nullable | Array of trigger keywords, e.g. `["mysql", "setup"]` |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Upload timestamp |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | Metadata update timestamp |

### skill_versions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Unique version identifier |
| `skill_id` | INT | FK → skills(id), NOT NULL, CASCADE | Parent skill |
| `version_number` | INT | NOT NULL; UNIQUE with `skill_id` | Sequential version number per skill |
| `status` | ENUM | `draft`, `staging`, `published`, `deprecated`; default `published` | Lifecycle state |
| `content` | LONGTEXT | nullable | Raw Markdown body (frontmatter stripped) |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Version creation timestamp |
| `created_by_user_id` | INT | FK → users(id), NULL, DEFAULT 1, SET NULL | Prototype authorship scaffold |
| `changelog` | TEXT | nullable | Human-readable reason for the version |

### nodes

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Unique node identifier (graph layer) |
| `user_id` | INT | FK → users(id), NOT NULL, CASCADE | Owning user |
| `skill_id` | INT | FK → skills(id), NOT NULL, UNIQUE, CASCADE | 1:1 link to parent skill |
| `x_coordinate` | FLOAT | NOT NULL | Horizontal position on vis-network canvas |
| `y_coordinate` | FLOAT | NOT NULL | Vertical position on vis-network canvas |

### edges

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Unique edge identifier |
| `user_id` | INT | FK → users(id), NOT NULL, CASCADE | Owning user |
| `source_node_id` | INT | FK → nodes(id), NOT NULL, CASCADE | The prerequisite node |
| `target_node_id` | INT | FK → nodes(id), NOT NULL, CASCADE | The dependent node |

### agent_logs

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Unique log entry identifier |
| `skill_id` | INT | FK → skills(id), NULL, SET NULL | Which skill was queried, if any |
| `agent_id` | VARCHAR(100) | DEFAULT NULL | Identity from the API key (e.g. `"braimd-default"`) |
| `session_id` | VARCHAR(255) | DEFAULT NULL | Session correlation from gateway |
| `platform` | VARCHAR(100) | DEFAULT NULL | Source platform, e.g. OpenClaw |
| `client_ip` | VARCHAR(45) | DEFAULT NULL | Requester IP (IPv4 or IPv6) |
| `query` | TEXT | nullable | Trigger/query string |
| `outcome` | VARCHAR(255) | nullable | `"success"`, `"intercept"`, `"not_found"`, or `"ambiguous"` |
| `used_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | When the query occurred |

---

## Relationships Summary

| Relationship | Type | FK Column | Constraint | Rationale |
|-------------|------|-----------|------------|-----------|
| users → skills | 1:M | `skills.user_id` | CASCADE | A user owns many skills; deleting a user removes all their skills |
| users → skill_versions | 1:M | `skill_versions.created_by_user_id` | SET NULL | Preserve version history if the placeholder user changes |
| skills → skill_versions | 1:M | `skill_versions.skill_id` | CASCADE | A skill owns its append-only content history |
| skills → active version | 1:1 pointer | `skills.active_version_id` | SET NULL | The active content is a single FK pointer, not a mutable boolean flag |
| users → nodes | 1:M | `nodes.user_id` | CASCADE | Denormalized for future per-user tree queries |
| skills → nodes | 1:1 | `nodes.skill_id` | UNIQUE + CASCADE | Every skill has exactly one graph node; deleting a skill removes its node |
| nodes → edges (source) | 1:M | `edges.source_node_id` | CASCADE | A node can be a prerequisite for many others |
| nodes → edges (target) | 1:M | `edges.target_node_id` | CASCADE | A node can have many prerequisites |
| skills → agent_logs | 1:M | `agent_logs.skill_id` | SET NULL | Logs survive skill deletion with their historical outcome/query data |

---

## Design Decisions

### Why are nodes and skills separate tables?

Skills hold **metadata** (name, description, triggers, active version pointer). `skill_versions` holds the Markdown body and history. Nodes hold **graph state** (canvas position). Combining them would mix data concerns — updating a node's x/y position should not touch metadata or version rows, and listing a tree should not require selecting `LONGTEXT` content. The 1:1 relationship is enforced by the UNIQUE constraint on `nodes.skill_id`, and the node is auto-created inside the skill insert transaction.

### Why is content in `skill_versions` instead of `skills.content`?

Migration `003_skill_versions.sql` moved Markdown content out of `skills` and into append-only `skill_versions`. `skills.active_version_id` points at the currently active row. This makes "what content is active?" a single FK lookup and avoids dual-write drift between a cache column and a history table.

### Why do edges reference node IDs, not skill IDs?

Edges are a graph-layer concept. The vis-network frontend operates on node IDs for rendering and interaction. If edges referenced skill IDs directly, every graph operation would need an extra join through the nodes table to resolve coordinates. By keeping edges in the node domain, the tree data endpoint (`GET /api/tree-data`) can return nodes and edges in a single pass without cross-domain lookups. The edge controller resolves `skill_id → node_id` at insert time and then operates purely on the graph layer.

### Why is triggers a JSON column instead of a junction table?

A normalized approach would use a `skill_triggers` junction table with rows like `(skill_id, trigger_keyword)`. We chose JSON for three reasons: (1) triggers are always read and written as a complete set, never individually updated; (2) MySQL 8.0's `JSON_CONTAINS` provides adequate query performance for the expected data volume; (3) it keeps the YAML frontmatter → database mapping trivially simple — `gray-matter` extracts the array, and it goes straight into the column as-is. For a vault with thousands of skills, a junction table with a B-tree index would be more appropriate.

---

## Cardinality Notation

| Symbol | Meaning |
|--------|---------|
| 1:M | One-to-many — one parent row relates to many child rows |
| 1:1 | One-to-one — enforced by a UNIQUE constraint on the foreign key |
| PK | Primary key |
| FK | Foreign key |
| UQ | Unique constraint |
| CASCADE | `ON DELETE CASCADE` — child rows are automatically deleted when the parent is removed |
