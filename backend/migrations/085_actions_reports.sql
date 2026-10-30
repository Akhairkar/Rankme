-- Action Center tasks + shareable report snapshots. Modules: src/actions.js, src/reports.js
CREATE TABLE IF NOT EXISTS action_tasks (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('audit_finding','manual','assistant')),
  source_id TEXT,
  source_audit_id TEXT,
  finding_key TEXT,
  title TEXT NOT NULL,
  description TEXT,
  reason TEXT,
  evidence TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
  effort_minutes INTEGER,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','reopened','ignored')),
  assignee_user_id TEXT,
  created_by TEXT,
  completed_at INTEGER,
  completed_by TEXT,
  verified_audit_id TEXT,
  verified_at INTEGER,
  before_evidence TEXT,
  after_evidence TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_action_tasks_business ON action_tasks(business_id, status);
CREATE INDEX IF NOT EXISTS idx_action_tasks_finding ON action_tasks(business_id, finding_key);

CREATE TABLE IF NOT EXISTS action_task_notes (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES action_tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_action_task_notes_task ON action_task_notes(task_id, created_at);

-- Attachments are LINKS only. File uploads would need object storage (Cloudflare R2), which is not provisioned.
CREATE TABLE IF NOT EXISTS action_task_attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES action_tasks(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_action_task_attachments_task ON action_task_attachments(task_id);

CREATE TABLE IF NOT EXISTS report_snapshots (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('weekly','monthly','rank','website_audit','profile_audit','reviews','competitors','search_console','actions')),
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  generated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_report_snapshots_business ON report_snapshots(business_id, generated_at DESC);
-- A scheduled period is generated at most once per business and kind.
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_snapshots_schedule ON report_snapshots(business_id, kind, period_start, period_end) WHERE generated_by = 'system:schedule';

CREATE TABLE IF NOT EXISTS report_shares (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES report_snapshots(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at INTEGER,
  brand_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_report_shares_snapshot ON report_shares(snapshot_id);

CREATE TABLE IF NOT EXISTS report_schedules (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('weekly','monthly')),
  active INTEGER NOT NULL DEFAULT 1,
  last_snapshot_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (business_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_report_schedules_active ON report_schedules(active);
