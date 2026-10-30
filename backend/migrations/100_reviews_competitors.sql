-- Review analytics aggregates, Google data-retention log, competitor module. Idempotent.
-- Aggregates contain counts/averages only (no Google review content) and survive text purges.
CREATE TABLE IF NOT EXISTS review_monthly_aggregates (
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  month TEXT NOT NULL,                 -- UTC YYYY-MM
  count INTEGER NOT NULL,
  avg_rating REAL,
  five INTEGER NOT NULL DEFAULT 0,
  four INTEGER NOT NULL DEFAULT 0,
  three INTEGER NOT NULL DEFAULT 0,
  two INTEGER NOT NULL DEFAULT 0,
  one INTEGER NOT NULL DEFAULT 0,
  answered_count INTEGER NOT NULL DEFAULT 0,
  computed_at INTEGER NOT NULL,
  PRIMARY KEY (business_id, month)
);

-- One row per purge action. Counts only: never content.
CREATE TABLE IF NOT EXISTS data_retention_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  business_id TEXT,
  dataset TEXT NOT NULL,               -- review_text | google_locations_raw | search_console | competitor_places | review_rows
  action TEXT NOT NULL,                -- ttl_purge | disconnect_purge
  rows_affected INTEGER NOT NULL,
  ttl_days INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_retention_log_time ON data_retention_log(created_at);

CREATE TABLE IF NOT EXISTS competitor_profiles (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website TEXT,
  address_text TEXT,
  place_id TEXT,
  lat REAL,
  lng REAL,
  source TEXT NOT NULL DEFAULT 'user_entered',          -- user_entered | places_api | rank_provider
  verified_at INTEGER,
  verification_state TEXT NOT NULL DEFAULT 'unverified', -- unverified | verified | failed
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_competitor_profiles_biz ON competitor_profiles(business_id);

-- Candidates returned by Places Text Search, held server-side until the user confirms one.
CREATE TABLE IF NOT EXISTS competitor_place_candidates (
  competitor_id TEXT NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (competitor_id, place_id)
);

-- Google-derived facts for a confirmed place, kept apart from user-entered fields.
CREATE TABLE IF NOT EXISTS competitor_places_data (
  competitor_id TEXT PRIMARY KEY REFERENCES competitor_profiles(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  display_name TEXT,
  formatted_address TEXT,
  website_uri TEXT,
  rating REAL,
  user_rating_count INTEGER,
  source TEXT NOT NULL DEFAULT 'places_api',
  fetched_at INTEGER NOT NULL
);
