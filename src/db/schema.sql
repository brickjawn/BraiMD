-- =============================================================================
-- BraiMD Database Schema (Updated for Deliverable 1B)
-- =============================================================================

CREATE DATABASE IF NOT EXISTS braimd_db;
USE braimd_db;

-- 1. Users Table (Phase 2)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Skills Table (Added user_id to separate data per user)
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
);

-- 3. Nodes Table (Added user_id for fast graph queries)
CREATE TABLE nodes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    skill_id INT UNIQUE, 
    x_coordinate FLOAT NOT NULL,
    y_coordinate FLOAT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

-- 4. Edges Table (Added user_id per the audit recommendation)
CREATE TABLE edges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    source_node_id INT NOT NULL,
    target_node_id INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (source_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- 5. Agent Logs Table (Added FR6 requirements: agent_id and client_ip)
CREATE TABLE agent_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    skill_id INT,
    agent_id VARCHAR(100),   -- Which bot/agent made the request
    session_id VARCHAR(255), -- Session correlation from gateway
    platform VARCHAR(100),   -- Source platform (e.g. OpenClaw)
    client_ip VARCHAR(45),   -- IPv4 or IPv6 tracking
    query TEXT,
    outcome VARCHAR(255),
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_agent_logs_agent_session_used_at (agent_id, session_id, used_at),
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL
);

-- ==========================================
-- UPDATED MOCK DATA 
-- ==========================================

INSERT INTO users (id, username, email, password_hash) 
VALUES (1, 'crocboot', 'tony@example.com', 'hashed_password_123')
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO skills (id, user_id, name, triggers, content) VALUES 
(1, 1, 'Basic Navigation', '["move", "walk", "go"]', '# Basic Navigation\nLearn to move.'),
(2, 1, 'Object Interaction', '["grab", "use", "open"]', '# Object Interaction\nLearn to grab.'),
(3, 1, 'Advanced Combat', '["attack", "strike", "defend"]', '# Advanced Combat\nMaster combat.')
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO nodes (id, user_id, skill_id, x_coordinate, y_coordinate) VALUES 
(1, 1, 1, 100.0, 50.0),
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
