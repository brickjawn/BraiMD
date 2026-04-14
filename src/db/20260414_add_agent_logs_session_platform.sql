ALTER TABLE agent_logs
  ADD COLUMN session_id VARCHAR(255) NULL AFTER agent_id,
  ADD COLUMN platform VARCHAR(100) NULL AFTER session_id;

CREATE INDEX idx_agent_logs_agent_session_used_at
  ON agent_logs (agent_id, session_id, used_at);
