-- Google integrations: connection health, sync log, review replies, Search Console selection.
-- Idempotent. Refresh tokens stay in google_connections (encrypted); this table only holds state.
CREATE TABLE IF NOT EXISTS google_connection_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  needs_reconnect INTEGER NOT NULL DEFAULT 0,
  reconnect_flagged_at INTEGER,
  last_error_code TEXT,
  last_sync_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS google_sync_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,            -- reviews | performance | search_console
  state TEXT NOT NULL,
  code TEXT,
  item_count INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_google_sync_log_biz_kind ON google_sync_log(business_id, kind, created_at);

CREATE TABLE IF NOT EXISTS review_replies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  reply_text TEXT NOT NULL,
  status TEXT NOT NULL,          -- posted | failed
  error_code TEXT,
  confirmed_at INTEGER NOT NULL,
  posted_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_replies_review ON review_replies(review_id, created_at);

CREATE INDEX IF NOT EXISTS idx_gsc_properties_user_url ON search_console_properties(user_id, business_id, property_url);
CREATE INDEX IF NOT EXISTS idx_gsc_metrics_property_date ON search_console_metrics(property_id, date);
