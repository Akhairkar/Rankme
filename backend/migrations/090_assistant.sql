-- AI assistant module (assistant.js). Stores every generated insight set / draft / summary for audit and history.
-- Nothing here is ever published automatically. Retention: rows older than 180 days are deleted by the
-- "assistant-retention" job. evidence_json holds the (already redacted) evidence the output was based on.
CREATE TABLE IF NOT EXISTS assistant_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,            -- an insight topic, "draft:<kind>" or "monthly_progress"
  state TEXT NOT NULL,            -- ai_assisted | deterministic_only | model_output_rejected | model_unavailable | template_only | insufficient_evidence
  model TEXT,                     -- NULL when no model contributed
  evidence_json TEXT NOT NULL,
  output_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assistant_runs_business ON assistant_runs(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assistant_runs_user ON assistant_runs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assistant_runs_created ON assistant_runs(created_at);
