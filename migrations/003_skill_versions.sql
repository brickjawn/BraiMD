-- =============================================================================
-- BraiMD migration 003 — skill version history with active pointer
-- =============================================================================
-- Implements design decision 3:
--   * skill_versions is append-oriented content history
--   * skills.active_version_id points at the currently active version
--   * skills.content is removed so there is one source of truth for content
--
-- Application code enforces business invariants (for example, "active version
-- should be published") per design decision 2. The database enforces only
-- structural integrity: FKs, UNIQUE version numbers, and NOT NULL identity
-- columns.
-- =============================================================================

USE braimd_db;

CREATE TABLE skill_versions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    skill_id INT NOT NULL,
    version_number INT NOT NULL,
    status ENUM('draft', 'staging', 'published', 'deprecated') NOT NULL DEFAULT 'published',
    content LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INT NULL DEFAULT 1,
    changelog TEXT,
    UNIQUE KEY uk_skill_version (skill_id, version_number),
    INDEX idx_skill_versions_skill_status (skill_id, status),
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE skills
  ADD COLUMN active_version_id INT NULL AFTER content;

-- Backfill v1 from the previous inline content column.
INSERT INTO skill_versions (
    skill_id,
    version_number,
    status,
    content,
    created_at,
    created_by_user_id,
    changelog
)
SELECT
    id,
    1,
    'published',
    content,
    COALESCE(created_at, CURRENT_TIMESTAMP),
    COALESCE(user_id, 1),
    'Initial version backfilled from skills.content'
FROM skills
WHERE active_version_id IS NULL;

UPDATE skills s
JOIN skill_versions v
  ON v.skill_id = s.id
 AND v.version_number = 1
SET s.active_version_id = v.id
WHERE s.active_version_id IS NULL;

ALTER TABLE skills
  ADD CONSTRAINT fk_skills_active_version
    FOREIGN KEY (active_version_id) REFERENCES skill_versions(id) ON DELETE SET NULL;

ALTER TABLE skills
  DROP COLUMN content;

INSERT INTO schema_migrations (migration_id, notes) VALUES
('003_skill_versions', 'Decision 3: move skill content into skill_versions, set skills.active_version_id, and drop skills.content.')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
