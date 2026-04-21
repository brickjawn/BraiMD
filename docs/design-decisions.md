# BraiMD Design Decisions

**Status:** Living document. Append new decisions as they're made; don't rewrite old ones. If a decision is reversed, add a new entry explaining why rather than editing the original.

**Scope:** Architectural rationale for the IST 260W prototype build. Decisions marked `[PROTOTYPE]` are scoped to the semester deliverable and will be revisited in the post-semester production rewrite.

---

## 1. Project endgame

**Decision:** Prototype-then-rewrite.

The 260W build is a course deliverable optimized for the rubric and semester timeline. A production rewrite will follow as a separate repo/effort after the semester ends, informed by what this prototype teaches.

**Rationale:** Building production-grade from day one under a semester deadline produces either a rushed production system or a late course deliverable. Both are bad outcomes. Prototype-first lets the course rubric be the forcing function for a working MVP without committing to architectural choices that production would demand (multi-tenant ownership models, full auth flows, caching infrastructure).

**Implication for schema:** Design for extensibility where it's free (nullable FKs for user ownership), but don't build infrastructure for features not needed to demo. Every table should earn its place on the rubric.

---

## 2. Invariant enforcement strategy

**Decision:** Application-layer enforcement for business invariants. Database-layer enforcement for structural integrity only (foreign keys, UNIQUE constraints, NOT NULL).

**Rationale:**

Business invariants — rules like "a skill's active_version_id must point to a version with status='published'" — live in the application service layer, enforced as pre-check queries before mutations.

Structural integrity — referential consistency, uniqueness on junction tables, NOT NULL on identity columns — lives in the database schema because FKs and UNIQUE are baseline SQL hygiene, not exotic features.

This split reflects separation-of-concerns:

- **Database:** stores data, prevents structurally-impossible states (orphan FKs, duplicate junction rows).
- **Application:** enforces rules that express domain logic (workflow states, permissions, ownership).

**Rejected alternative:** Database triggers and CHECK constraints for business invariants.

Triggers were considered and rejected for the prototype because:

- The mutation surface is small (~4-6 endpoints); per-endpoint checks are not burdensome
- Trigger errors surface as `SQLSTATE 45000` rather than stack traces with context, slowing debugging under deadline pressure
- MySQL trigger limitations (a trigger cannot modify the table that fired it) introduce schema-specific workarounds that eat time
- Testability is worse — triggers require a live MySQL instance; app-layer logic can be unit-tested with standard tooling
- IST 260W is web-application-focused; rubric rewards code organization over database wizardry

**Post-semester consideration:** DB-layer enforcement (triggers, CHECK constraints, stored procedures) becomes more attractive at scale — 50+ endpoints, multiple services, or compliance requirements that mandate enforcement at the data layer. The production rewrite should evaluate:

- A `CHECK (status IN ('draft','staging','published','deprecated'))` constraint on `skill_versions.status`
- A trigger enforcing the "active_version_id must be published" invariant
- Stored procedures for complex state transitions (e.g., `promote_version(skill_id, version_id)`)

---

## 3. Versioning model

**Decision:** Slowly Changing Dimension Type 2 with a pointer in the parent table.

```
skills (id, name, active_version_id FK, ...)
skill_versions (id, skill_id FK, version_number, system_prompt, status, ...)
```

Promotion is a single atomic write: `UPDATE skills SET active_version_id = ? WHERE id = ?`.

**Rationale:**

The naive alternative — `is_active` boolean flag on `skill_versions` — requires enforcing the invariant "exactly one active version per skill" in application code, across two writes (demote old active, promote new active). Between those writes, even in a transaction, application code can observe zero-or-two active versions depending on isolation level. This is a concurrency bug class the schema should make impossible, not the application layer should manage.

The pointer approach makes "more than one active version" structurally impossible because there's only one pointer to update.

**Implication:** `skill_versions` is effectively append-only. Versions are never modified once written; authorship is tracked via `created_at` and `created_by_user_id`. Promotion and retirement happen at the `skills.active_version_id` pointer, not by mutating version rows. This also gives a clean "what was the active version at time T" query via joins across the audit log (see decision 5).

---

## 4. Multi-user scaffolding

**Decision:** `[PROTOTYPE]` Schema includes user ownership columns from day one, but Phase 1 seeds a single user and allows NULL in FK columns. Real auth deferred to Phase 2.

**Schema shape:**

- `users` table present, seeded with one row (the developer)
- `skills.author_user_id` nullable FK, defaults to seed user
- `skill_versions.created_by_user_id` nullable FK, defaults to seed user
- No session management, login flows, or password verification in Phase 1

**Rationale:**

The cost of adding user FK columns at schema creation time is trivial. The cost of retrofitting them after tables have production data is painful. Scaffolding multi-user support now, even without exercising it, preserves schema optionality without requiring auth infrastructure before the rubric needs it.

Phase 2 adds the enforcement (columns become NOT NULL) and auth flows when login is actually built.

**Explicitly out of scope for prototype:**

- Organization-level ownership (orgs, org_memberships)
- Row-level access control (ACLs, sharing)
- Public/private/org visibility flags
- Any real authentication beyond a hardcoded session or dev bypass

These are legitimate production concerns but would consume the semester. Document them in the write-up as "future work."

---

## 5. Audit log separation

**Decision:** Two distinct audit surfaces:

- `skill_versions` tracks **content history** (what the skill said at each version)
- `skill_audit_log` tracks **operational history** (who activated, deprecated, tagged, assigned to agents)

**Rationale:**

Conflating these into a single table muddies both concerns. "Show me the evolution of this skill's prompt text" is a `skill_versions` query. "Show me who promoted v5 to active and when" is a `skill_audit_log` query. Different indexes, different consumers, different growth patterns (one grows on edits, the other grows on operations).

**Rubric-visible benefit:** the separation demonstrates that the designer understands content versioning and operational audit are different problems. Many student projects conflate them; distinguishing them shows systems-design maturity.

---

## 6. Skill-to-agent mapping

**Decision:** Junction table (`agent_skills`) with composite primary key `(agent_id, skill_id)`. Each row carries assignment metadata (`added_at`, `added_by_user_id`).

**Rejected alternative:** "Skill packs" as an intermediate layer (agent → pack → skills, many-to-many twice).

**Rationale:**

Packs are a legitimate design for production scale (1000+ skills, curated bundles). For the prototype with ~20 seeded skills, packs add a table and a join without adding demo value. The rubric rewards normalization rigor on simple use cases; packs would be over-engineering.

**Post-semester consideration:** If BraiMD grows a catalog of 100+ skills and users want to subscribe agents to curated bundles (e.g., "all coding skills," "all writing skills"), revisit with a `skill_packs` table and an `agent_skill_packs` junction. Packs can be versioned independently of their member skills if that becomes a requirement.

---

## 7. OpenClaw integration model

**Decision:** Pull with short TTL cache. OpenClaw calls `GET /skills/{slug}/active` at agent invocation time, caches the response for ~60 seconds.

**API surface (Phase 3):**

- `GET /skills/{slug}/active` — returns the currently-active version's system_prompt
- `GET /agents/{slug}/bundle` — returns all skills assigned to the named agent, with their active version content

**Rejected alternatives:**

- **Push (event-driven):** BraiMD emits webhook/message events on skill updates, OpenClaw subscribes. More complex infrastructure (message broker or webhook listener), low marginal benefit for semester demo.
- **Direct DB access:** OpenClaw queries BraiMD's MySQL with read-only credentials. Fastest, but couples the two systems at the data layer, making schema evolution painful.

**Rationale:**

Pull-with-cache is the simplest model that achieves the demo goal ("user edits skill in BraiMD → next Discord turn uses new prompt within cache TTL"). Real-time isn't needed; near-real-time (60-second lag) is indistinguishable from real-time in a conversational context.

BraiMD remains authoritative. OpenClaw doesn't know or care about BraiMD's internal schema — it consumes a stable API contract. Schema can evolve without breaking the consumer.

---

## 8. Database engine and configuration

**Decision:** MySQL 8.0+ with InnoDB engine, `utf8mb4` charset, `utf8mb4_unicode_ci` collation.

**Rationale:**

- **InnoDB:** required for foreign key enforcement and transactional integrity. MyISAM doesn't support FKs and is deprecated for this use case.
- **utf8mb4:** supports full Unicode including emoji and 4-byte characters. System prompts may contain special characters, code samples, or non-Latin scripts — utf8mb4 handles all.
- **utf8mb4_unicode_ci:** case-insensitive collation for human-readable text fields (skill names, tag names). Prevents "Python" and "python" from appearing as separate tags due to case mismatch.
- **MySQL 8.0+:** enables functional indexes, JSON data type, CHECK constraint enforcement (post-8.0.16), and window functions. These are not heavily used in Phase 1 but are available when needed.

---

## 9. Governance discipline

**Decision:** `[PROTOTYPE]` Lightweight decision-log and scout-log discipline, scoped to this repo.

This document (`docs/design-decisions.md`) captures architectural rationale. A separate file — `docs/decision-log.md` or commit history itself — captures incremental decisions as they're made.

**Rationale:**

The OpenClaw project has demonstrated the value of written rationale + append-only governance logs for complex work. BraiMD's scope is smaller but not trivially so; applying the same discipline at reduced scale is a habit worth building.

**Phase 1 minimum:**

- This design-decisions.md, updated when significant choices are made
- Commit messages describe the why, not just the what
- Schema changes go in numbered migration files (`migrations/001_initial.sql`, `002_add_audit_log.sql`) rather than mutating `schema.sql` in place

**Out of scope for prototype:** ZFS snapshots, cryptographic integrity chains, multi-peer sync governance. The OpenClaw discipline exists because OpenClaw is a long-running production system; BraiMD is a semester project with a single developer and a git remote.

---

## Decisions deferred to post-semester rewrite

Captured here so future-me has a punch list instead of re-discovering them:

- Multi-tenant ownership model (user-scoped vs org-scoped vs hybrid)
- Skill packs as a first-class entity with independent versioning
- Database-layer enforcement of business invariants (triggers, CHECK constraints)
- Event-driven integration (webhooks, message broker) for real-time OpenClaw updates
- Row-level access control and visibility flags
- Full authentication and session management
- Database migration tooling (Flyway, Liquibase, or similar)
- Horizontal scaling considerations (read replicas, caching layer)

None of these are required for the prototype. All of them become relevant at production scale.

---

## How to update this document

- **Adding a new decision:** append a new numbered section. Don't renumber existing sections.
- **Reversing a decision:** add a new section titled "Revision to Decision N" with the new choice and rationale. Leave the original in place as history.
- **Prototype-scoped decisions:** mark with `[PROTOTYPE]` tag so the post-semester review knows which items to revisit.
- **Rationale discipline:** every decision captures both the choice AND the alternative that was rejected. "Why this" is worth as much as "what this."
