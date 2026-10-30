-- Workspaces, team roles, invitations, audit log. Additive only; `businesses` is NOT altered.
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_personal INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_personal ON workspaces(owner_user_id) WHERE is_personal=1;

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','manager','analyst','client')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  invited_by TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id, status);

-- Limited access for the `client` role: only the listed businesses.
CREATE TABLE IF NOT EXISTS business_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (business_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_business_members_user ON business_members(user_id);

-- Which workspace a business belongs to (unmapped business = creator's personal workspace).
CREATE TABLE IF NOT EXISTS business_workspace (
  business_id TEXT PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_business_workspace_ws ON business_workspace(workspace_id);

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','analyst','client')),
  business_ids_json TEXT,
  invited_by TEXT,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  accepted_by TEXT,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invitations_ws ON workspace_invitations(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT,
  ip_hash TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ws_time ON audit_logs(workspace_id, created_at DESC, id);
