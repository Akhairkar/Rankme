PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  picture_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS google_connections (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_ciphertext TEXT NOT NULL,
  scope TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS google_locations (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_name TEXT NOT NULL,
  account_name TEXT,
  location_name TEXT,
  raw_json TEXT NOT NULL,
  synced_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, resource_name)
);

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  website_url TEXT,
  phone TEXT,
  address_json TEXT,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS business_locations (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  google_resource_name TEXT,
  name TEXT NOT NULL,
  address_json TEXT,
  latitude REAL,
  longitude REAL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  last_synced_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audits (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  audit_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  score INTEGER,
  source_url TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_issues (
  id TEXT PRIMARY KEY,
  audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  explanation TEXT,
  evidence_json TEXT,
  recommended_fix TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  issue_id TEXT REFERENCES audit_issues(id) ON DELETE SET NULL,
  priority TEXT NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS keywords (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  location_name TEXT NOT NULL,
  device TEXT NOT NULL DEFAULT 'desktop',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rank_snapshots (
  id TEXT PRIMARY KEY,
  keyword_id TEXT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  checked_at INTEGER NOT NULL,
  position REAL,
  visibility REAL,
  ranking_url TEXT,
  provider TEXT,
  raw_reference_json TEXT
);

CREATE TABLE IF NOT EXISTS competitors (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  place_reference TEXT,
  website_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  business_location_id TEXT NOT NULL REFERENCES business_locations(id) ON DELETE CASCADE,
  google_review_name TEXT NOT NULL,
  reviewer_display_name TEXT,
  rating INTEGER,
  review_text TEXT,
  review_time INTEGER,
  reply_status TEXT NOT NULL DEFAULT 'unknown',
  raw_reference_json TEXT,
  synced_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  storage_reference TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  current_period_start INTEGER,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  provider_payment_id TEXT,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL,
  verified_at INTEGER,
  raw_reference_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id TEXT REFERENCES businesses(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  provider TEXT,
  units INTEGER NOT NULL DEFAULT 1,
  estimated_cost_minor INTEGER,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_states_created ON oauth_states(created_at);
CREATE INDEX IF NOT EXISTS idx_google_locations_user_sync ON google_locations(user_id, synced_at);
CREATE INDEX IF NOT EXISTS idx_businesses_user ON businesses(user_id);
CREATE INDEX IF NOT EXISTS idx_business_locations_business ON business_locations(business_id);
CREATE INDEX IF NOT EXISTS idx_audits_business ON audits(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_issues_audit ON audit_issues(audit_id);
CREATE INDEX IF NOT EXISTS idx_action_items_business ON action_items(business_id);
CREATE INDEX IF NOT EXISTS idx_keywords_business ON keywords(business_id);
CREATE INDEX IF NOT EXISTS idx_rank_snapshots_keyword_time ON rank_snapshots(keyword_id, checked_at);
CREATE INDEX IF NOT EXISTS idx_competitors_business ON competitors(business_id);
CREATE INDEX IF NOT EXISTS idx_reviews_location ON reviews(business_location_id);
CREATE INDEX IF NOT EXISTS idx_reports_business ON reports(business_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_user_time ON usage_events(user_id, created_at);


CREATE TABLE IF NOT EXISTS plan_entitlements (
  plan_code TEXT PRIMARY KEY,
  max_businesses INTEGER NOT NULL,
  max_locations INTEGER NOT NULL,
  max_keywords INTEGER NOT NULL,
  rank_tracking_enabled INTEGER NOT NULL DEFAULT 0,
  review_monitoring_enabled INTEGER NOT NULL DEFAULT 0,
  reports_enabled INTEGER NOT NULL DEFAULT 0,
  competitor_tracking_enabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subscription_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  provider_event_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user ON subscription_events(user_id, created_at);
