-- Billing: Razorpay orders, invoices (GST), webhook idempotency, extended plan limits.
ALTER TABLE payments ADD COLUMN provider_order_id TEXT;
ALTER TABLE payments ADD COLUMN plan_code TEXT;
ALTER TABLE payments ADD COLUMN billing_interval TEXT;
ALTER TABLE payments ADD COLUMN taxable_minor INTEGER;
ALTER TABLE payments ADD COLUMN cgst_minor INTEGER;
ALTER TABLE payments ADD COLUMN sgst_minor INTEGER;
ALTER TABLE payments ADD COLUMN billing_name TEXT;
ALTER TABLE payments ADD COLUMN billing_gstin TEXT;
ALTER TABLE payments ADD COLUMN refunded_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN updated_at INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order ON payments(provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_provider_payment ON payments(provider_payment_id);

ALTER TABLE plan_entitlements ADD COLUMN max_audits_per_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plan_entitlements ADD COLUMN max_rank_scans_per_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plan_entitlements ADD COLUMN max_competitors INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plan_entitlements ADD COLUMN max_crawl_pages INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS processed_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT,
  received_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,               -- provider refund id
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_id);

CREATE TABLE IF NOT EXISTS invoice_counters (
  year INTEGER PRIMARY KEY,
  last_seq INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id) ON DELETE CASCADE,
  plan_code TEXT,
  billing_interval TEXT,
  taxable_minor INTEGER NOT NULL,
  cgst_minor INTEGER NOT NULL,
  sgst_minor INTEGER NOT NULL,
  total_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'paid',
  customer_name TEXT,
  customer_gstin TEXT,
  issued_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id, issued_at);
