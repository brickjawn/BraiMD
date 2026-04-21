-- =============================================================================
-- BraiMD migration 001 — initial schema (consolidated baseline)
-- =============================================================================
-- Implements design decisions 8 (InnoDB + utf8mb4 + utf8mb4_unicode_ci) and 9
-- (numbered migrations). Consolidates what used to live in src/db/schema.sql and
-- the ad-hoc 20260414_add_agent_logs_session_platform.sql into a single baseline
-- so fresh deployments have one starting point.
--
-- Explicit ENGINE / CHARSET / COLLATE on every table because MySQL 8's default
-- collation (utf8mb4_0900_ai_ci) is accent-insensitive but not the version-
-- pinned utf8mb4_unicode_ci that design-decisions.md mandates.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS braimd_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE braimd_db;

ALTER DATABASE braimd_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Migration tracking (decision 9)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    migration_id VARCHAR(64) NOT NULL UNIQUE,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 1. users  (Phase 2 will enforce real auth; Phase 1 seeds a single user)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. skills
-- NOTE: user_id is NOT NULL in this baseline per the current prototype shape.
-- Migration 002 will relax this per decision 4 (nullable user FK scaffolding).
-- ---------------------------------------------------------------------------
CREATE TABLE skills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    triggers JSON,
    content LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. nodes  (1:1 with skills; canvas coordinates for the tree view)
-- ---------------------------------------------------------------------------
CREATE TABLE nodes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    skill_id INT UNIQUE,
    x_coordinate FLOAT NOT NULL,
    y_coordinate FLOAT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4. edges  (directed: source is the prerequisite, target depends on it)
-- ---------------------------------------------------------------------------
CREATE TABLE edges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    source_node_id INT NOT NULL,
    target_node_id INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (source_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_node_id) REFERENCES nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5. agent_logs  (query history surfaced on /dashboard/logs)
-- Operational audit (decision 5 → skill_audit_log) is a separate follow-up.
-- ---------------------------------------------------------------------------
CREATE TABLE agent_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    skill_id INT,
    agent_id VARCHAR(100),
    session_id VARCHAR(255),
    platform VARCHAR(100),
    client_ip VARCHAR(45),
    query TEXT,
    outcome VARCHAR(255),
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_agent_logs_agent_session_used_at (agent_id, session_id, used_at),
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Seed data (idempotent via ON DUPLICATE KEY UPDATE id = id)
-- ---------------------------------------------------------------------------
INSERT INTO users (id, username, email, password_hash)
VALUES (1, 'crocboot', 'tony@example.com', 'hashed_password_123')
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO skills (id, user_id, name, triggers, content) VALUES
(1, 1, 'Basic Navigation',   '["move", "walk", "go"]',            '# Basic Navigation\nLearn to move.'),
(2, 1, 'Object Interaction', '["grab", "use", "open"]',           '# Object Interaction\nLearn to grab.'),
(3, 1, 'Advanced Combat',    '["attack", "strike", "defend"]',    '# Advanced Combat\nMaster combat.')
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO nodes (id, user_id, skill_id, x_coordinate, y_coordinate) VALUES
(1, 1, 1, 100.0,  50.0),
(2, 1, 2, 100.0, 150.0),
(3, 1, 3, 250.0, 150.0)
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO edges (id, user_id, source_node_id, target_node_id) VALUES
(1, 1, 1, 2),
(2, 1, 2, 3)
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO agent_logs (id, skill_id, agent_id, session_id, platform, client_ip, query, outcome) VALUES
(1, 1, 'OpenClaw-v1', 'session-demo-1', 'OpenClaw', '192.168.1.5', 'How do I walk forward?', 'Success - Skill provided')
ON DUPLICATE KEY UPDATE id = id;

-- ---------------------------------------------------------------------------
-- Record this migration
-- ---------------------------------------------------------------------------
INSERT INTO schema_migrations (migration_id, notes) VALUES
('001_initial', 'Baseline: 5 tables with explicit InnoDB + utf8mb4_unicode_ci. Consolidates prior schema.sql and 20260414_add_agent_logs_session_platform.sql.')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
