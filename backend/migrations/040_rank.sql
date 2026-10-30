-- Real local rank-grid scans. Separate from the educational rank-grid simulator (no shared tables/code).
-- rank_snapshots / keywords (000_base.sql) are untouched.
CREATE TABLE IF NOT EXISTS rank_scans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  keyword_id TEXT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  grid_size INTEGER NOT NULL,
  radius_m INTEGER NOT NULL,
  center_lat REAL NOT NULL,
  center_lng REAL NOT NULL,
  center_source TEXT,
  state TEXT NOT NULL DEFAULT 'running',  -- running | completed | partial | provider_error
  provider TEXT,
  points_total INTEGER NOT NULL DEFAULT 0,
  points_ok INTEGER NOT NULL DEFAULT 0,
  points_failed INTEGER NOT NULL DEFAULT 0,
  avg_position REAL,
  visibility REAL,
  schedule_id TEXT,
  scan_date TEXT NOT NULL,                -- UTC YYYY-MM-DD
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_rank_scans_kw ON rank_scans(business_id, keyword_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rank_scans_user_time ON rank_scans(user_id, created_at);

CREATE TABLE IF NOT EXISTS rank_scan_points (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES rank_scans(id) ON DELETE CASCADE,
  grid_row INTEGER NOT NULL,
  grid_col INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  position INTEGER,                       -- NULL = not found in provider results (or error, see error column). Never filled.
  ranking_url TEXT,
  visibility REAL,
  raw_count INTEGER,
  error TEXT,                             -- non-null = provider call failed (distinct from not found)
  competitors_json TEXT,                  -- only what the provider returned; NULL when absent
  provider TEXT,
  observed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rank_points_scan ON rank_scan_points(scan_id);

CREATE TABLE IF NOT EXISTS scan_schedules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  keyword_id TEXT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  grid_size INTEGER NOT NULL,
  radius_m INTEGER NOT NULL,
  frequency TEXT NOT NULL,                -- weekly | monthly
  plan_code TEXT,                         -- plan at create/update time; used for caps by the cron job
  next_run_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER,
  last_scan_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (business_id, keyword_id)
);
CREATE INDEX IF NOT EXISTS idx_scan_schedules_due ON scan_schedules(active, next_run_at);
