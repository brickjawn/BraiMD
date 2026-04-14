# Deliverable 3 — Entity Relationship Diagram: BraiMD

**Author:** brickjawn
**Date:** 2026-04-03

---

## Overview

BraiMD's data layer is a normalized MySQL 8.0 schema consisting of five tables. The design separates concerns into three domains: **identity** (users), **content** (skills), and **graph** (nodes + edges), with a fourth domain for **observability** (agent_logs). All foreign keys use `ON DELETE CASCADE` so that removing a skill automatically cleans up its node, edges, and log entries — no orphaned rows.

---

## Entity Relationship Diagram

```
 ┌─────────────────┐
 │     users        │
 ├─────────────────┤
 │ id          PK   │
 │ email       UQ   │
 │ password_hash    │
 │ created_at       │
 └────────┬────────┘
          │
          │ 1:M (user owns many skills)
          │
 ┌────────▼────────┐         1:1 (each skill         ┌─────────────────┐
 │     skills       │         has exactly one node)    │     nodes        │
 ├─────────────────┤ ───────────────────────────────> ├─────────────────┤
 │ id          PK   │                                  │ id          PK   │
 │ user_id     FK   │──┐                               │ user_id     FK   │
 │ name             │  │                               │ skill_id  FK,UQ  │
 │ description      │  │                               │ position_x       │
 │ content          │  │                               │ position_y       │
 │ triggers   JSON  │  │                               └───────┬─────────┘
 │ created_at       │  │                                       │
 └────────┬────────┘  │                               1:M (from) │ 1:M (to)
          │            │                                       │
          │ 1:M        │                               ┌───────▼─────────┐
          │            │                               │     edges        │
 ┌────────▼────────┐  │                               ├─────────────────┤
 │   agent_logs     │  │                               │ id          PK   │
 ├─────────────────┤  │                               │ from_node_id FK  │
 │ id          PK   │  │                               │ to_node_id   FK  │
 │ skill_id    FK ──┘  │                               └─────────────────┘
 │ used_at          │
 │ outcome          │
 │ agent_id         │
 │ client_ip        │
 └─────────────────┘
```

### Reading the Diagram

- **Arrows** indicate foreign key direction (child → parent).
- **1:M** = one-to-many. One user can own many skills.
- **1:1** = one-to-one. Each skill has exactly one node (enforced by `UNIQUE(skill_id)` on the nodes table). The node is auto-created when a skill is inserted.
- **1:M (from) / 1:M (to)** = a single node can appear as the prerequisite (`from_node_id`) in many edges, and a single node can depend on many prerequisites (`to_node_id` in many edges).

---

## Table Definitions

### users

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Unique user identifier |
| `email` | VARCHAR(255) | NOT NULL, UNIQUE | Login email address |
| `password_hash` | VARCHAR(255) | NOT NULL | Bcrypt hash (Phase 2); placeholder for now |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Registration timestamp |

### skills

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Unique skill identifier |
| `user_id` | INT | FK → users(id), NOT NULL, CASCADE | Owning user |
| `name` | VARCHAR(255) | NOT NULL | Extracted from YAML `name` frontmatter field |
| `description` | TEXT | nullable | Extracted from YAML `description` field |
| `content` | LONGTEXT | NOT NULL | Raw Markdown body (frontmatter stripped) |
| `triggers` | JSON | nullable | Array of trigger keywords, e.g. `["mysql", "setup"]` |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Upload timestamp |

### nodes

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Unique node identifier (graph layer) |
| `user_id` | INT | FK → users(id), NOT NULL, CASCADE | Owning user |
| `skill_id` | INT | FK → skills(id), NOT NULL, UNIQUE, CASCADE | 1:1 link to parent skill |
| `position_x` | INT | NOT NULL, DEFAULT 0 | Horizontal position on vis-network canvas |
| `position_y` | INT | NOT NULL, DEFAULT 0 | Vertical position on vis-network canvas |

### edges

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Unique edge identifier |
| `from_node_id` | INT | FK → nodes(id), NOT NULL, CASCADE | The prerequisite node |
| `to_node_id` | INT | FK → nodes(id), NOT NULL, CASCADE | The dependent node |

### agent_logs

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Unique log entry identifier |
| `skill_id` | INT | FK → skills(id), NOT NULL, CASCADE | Which skill was queried |
| `used_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | When the query occurred |
| `outcome` | VARCHAR(50) | nullable | `"success"` or `"prerequisite_blocked"` |
| `agent_id` | VARCHAR(100) | DEFAULT NULL | Identity from the API key (e.g. `"braimd-default"`) |
| `client_ip` | VARCHAR(45) | DEFAULT NULL | Requester IP (IPv4 or IPv6) |

---

## Relationships Summary

| Relationship | Type | FK Column | Constraint | Rationale |
|-------------|------|-----------|------------|-----------|
| users → skills | 1:M | `skills.user_id` | CASCADE | A user owns many skills; deleting a user removes all their skills |
| users → nodes | 1:M | `nodes.user_id` | CASCADE | Denormalized for future per-user tree queries |
| skills → nodes | 1:1 | `nodes.skill_id` | UNIQUE + CASCADE | Every skill has exactly one graph node; deleting a skill removes its node |
| nodes → edges (from) | 1:M | `edges.from_node_id` | CASCADE | A node can be a prerequisite for many others |
| nodes → edges (to) | 1:M | `edges.to_node_id` | CASCADE | A node can have many prerequisites |
| skills → agent_logs | 1:M | `agent_logs.skill_id` | CASCADE | Every agent query creates a log entry; deleting a skill cleans up its logs |

---

## Design Decisions

### Why are nodes and skills separate tables?

Skills hold **content** (Markdown, triggers, metadata). Nodes hold **graph state** (canvas position). Combining them would mix data concerns — updating a node's x/y position shouldn't touch the skill content row, and the graph rendering layer shouldn't need to SELECT the full LONGTEXT content column just to draw a circle on the canvas. The 1:1 relationship is enforced by the UNIQUE constraint on `nodes.skill_id`, and the node is auto-created inside the skill insert transaction.

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
