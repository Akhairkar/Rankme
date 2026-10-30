-- Unified business audit engine (audit.js). Reuses audits / audit_issues from 000_base.sql.
-- Unified audits are stored with audits.audit_type = 'unified'; audits.status = 'completed' | 'partial'.
ALTER TABLE audits ADD COLUMN score_breakdown_json TEXT;   -- [{section,label,weight,points,max,available}]
ALTER TABLE audits ADD COLUMN checks_json TEXT;            -- every check result incl. pass/unavailable (no finding row)
ALTER TABLE audits ADD COLUMN findings_count INTEGER;
ALTER TABLE audits ADD COLUMN model_version TEXT;

-- audit_issues: explanation = why_it_matters, recommended_fix = recommended_action
ALTER TABLE audit_issues ADD COLUMN finding_key TEXT;      -- stable "<code>|<source>" key used for compare + carry-forward
ALTER TABLE audit_issues ADD COLUMN source TEXT;
ALTER TABLE audit_issues ADD COLUMN verification TEXT;     -- verified | user_provided | unavailable
ALTER TABLE audit_issues ADD COLUMN evidence TEXT;
ALTER TABLE audit_issues ADD COLUMN instructions_json TEXT; -- JSON array of step strings
ALTER TABLE audit_issues ADD COLUMN checked_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_audits_business_created ON audits(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_issues_audit ON audit_issues(audit_id);
