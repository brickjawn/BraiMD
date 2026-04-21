# BraiMD Migrations

Numbered, append-only SQL migrations. See
[`docs/design-decisions.md`](../docs/design-decisions.md) decision 9 for why
this directory exists.

## Filename convention

```
NNN_short_snake_case_description.sql
```

- `NNN` is a zero-padded three-digit sequence starting at `001`. Never reuse a
  number, never renumber an existing file.
- One logical change per file. If a change needs both DDL and data backfill,
  keep them in the same file.
- Every migration records itself in `schema_migrations` so operators can see
  what has been applied:
  ```sql
  INSERT INTO schema_migrations (migration_id, notes) VALUES
  ('NNN_description', 'Short human-readable summary.')
  ON DUPLICATE KEY UPDATE applied_at = applied_at;
  ```

## How migrations are applied

### On fresh container start (normal path)

`docker-compose.yml` bind-mounts this directory at
`/docker-entrypoint-initdb.d/` inside the `braimd-db` container. MySQL's
entrypoint runs every `*.sql` file in alphabetical order **only on first boot**
(when the data volume is empty). That ordering is why the numeric prefix
matters.

To replay all migrations cleanly:

```sh
podman-compose down -v     # also drops db_data volume
podman-compose up -d
```

### On an existing database (manual path)

MySQL's entrypoint does not rerun `*.sql` files once the data volume is
populated. To apply a new migration to an already-running DB:

```sh
podman exec -i braimd-db \
  mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
  < migrations/NNN_new_migration.sql
```

Check `schema_migrations` to confirm it recorded itself:

```sh
podman exec -i braimd-db \
  mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
  -e 'SELECT * FROM schema_migrations ORDER BY id;'
```

## Conventions

- **Explicit `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`**
  on every `CREATE TABLE`. MySQL 8's default collation is
  `utf8mb4_0900_ai_ci`, which is not what decision 8 specifies.
- **Idempotent seed data** via `ON DUPLICATE KEY UPDATE id = id` so a reapplied
  migration does not error on existing rows.
- **Forward-only.** No `DOWN` migrations for the 260W prototype. To reverse a
  change, write a new migration that supersedes the previous one.
- **Schema only.** Application logic stays in `src/`. Business invariants go
  in the service layer per design decision 2.

## Historical note

Migration `001_initial.sql` replaces:

- `src/db/schema.sql` — pre-migrations DDL + seed, removed with migration 001
- `src/db/20260414_add_agent_logs_session_platform.sql` — the ad-hoc
  `ALTER TABLE` whose columns are now part of the 001 baseline

Removed together so fresh installs don't have two competing starting points.

Migration `002_nullable_user_fk.sql` follows by relaxing `skills.user_id` from
`NOT NULL` to `NULL DEFAULT 1` as prototype scaffolding for decision 4.
This preserves current behavior (seed user `id=1`) while removing a hard
schema blocker ahead of Phase 2 auth/session work.
