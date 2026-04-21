-- =============================================================================
-- BraiMD migration 002 — nullable user FK scaffolding on skills
-- =============================================================================
-- Implements design decision 4 (prototype multi-user scaffolding):
--   * user ownership columns exist now
--   * auth/session enforcement comes in Phase 2
--   * FK can be nullable during prototype development
--
-- For compatibility with existing app behavior, keep a default seed user (id=1)
-- so inserts that omit user_id remain deterministic.
-- =============================================================================

USE braimd_db;

ALTER TABLE skills
  MODIFY COLUMN user_id INT NULL DEFAULT 1;

INSERT INTO schema_migrations (migration_id, notes) VALUES
('002_nullable_user_fk', 'Decision 4 scaffolding: skills.user_id is now nullable with DEFAULT 1 until Phase 2 auth/session enforcement.')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
