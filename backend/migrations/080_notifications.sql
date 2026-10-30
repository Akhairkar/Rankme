-- Notifications, preferences, email outbox. Module: src/notifications.js
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  dedupe_key TEXT,
  read_at INTEGER,
  created_at INTEGER NOT NULL,
  emailed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_time ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications(user_id, dedupe_key, created_at);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  in_app INTEGER NOT NULL DEFAULT 1,
  email INTEGER NOT NULL DEFAULT 0,
  digest INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind)
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  notification_id TEXT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','suppressed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at INTEGER,
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_pending ON email_outbox(status, next_attempt_at, created_at);

-- Idempotency log for the fan-out and digest jobs (one row per source item that was already considered).
CREATE TABLE IF NOT EXISTS notification_fanout_log (
  source_key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
