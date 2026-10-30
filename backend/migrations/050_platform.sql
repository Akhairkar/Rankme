-- 050_platform: business profile extension, first-party analytics. Idempotent (safe to re-run).

-- SQLite has no ADD COLUMN IF NOT EXISTS, so extended business fields live in a side table.
CREATE TABLE IF NOT EXISTS business_profile_ext (
  business_id TEXT PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  address TEXT,
  state TEXT,
  pin_code TEXT,
  country TEXT,
  secondary_categories_json TEXT,
  service_areas_json TEXT,
  hours_json TEXT,
  description TEXT,
  language TEXT,
  timezone TEXT,
  lat REAL,
  lng REAL,
  archived_at INTEGER,
  updated_at INTEGER NOT NULL
);

-- Raw consented events: no IP, no user id, no personal data. visitor_hash = sha256(ip+ua+day+secret), rotates daily.
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  tool TEXT,
  path TEXT,
  lang TEXT,
  plan TEXT,
  visitor_hash TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_day ON analytics_events(day, event);

-- Daily rollup kept after raw rows are deleted (90 days). event='*' row = unique visitors for the day.
CREATE TABLE IF NOT EXISTS analytics_daily (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  tool TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT '',
  events INTEGER NOT NULL,
  visitors INTEGER NOT NULL,
  PRIMARY KEY (day, event, tool, plan)
);
