-- Where to send the user after the Google sign-in round trip (allow-listed dashboard paths only).
CREATE TABLE IF NOT EXISTS oauth_state_meta (
  state_hash TEXT PRIMARY KEY,
  return_path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
