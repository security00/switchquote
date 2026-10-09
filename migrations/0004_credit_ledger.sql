-- Credits replace the minute ledger. 60 units = 1 credit ≈ 1 minute of default-engine audio.
-- Pools are spent grant → subscription → pack. Packs expire; signup and subscription units do not.
-- Existing minute_ledger rows are copied so a balance already spent is not granted again.

ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('signup', 'subscription', 'pack', 'charge', 'refund')),
  pool TEXT NOT NULL CHECK (pool IN ('grant', 'subscription', 'pack')),
  units INTEGER NOT NULL,
  ref TEXT,
  lot_id TEXT,
  sku TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_signup ON credit_ledger (user_id) WHERE kind = 'signup';
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_ref ON credit_ledger (ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON credit_ledger (user_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_lot ON credit_ledger (lot_id);

INSERT INTO credit_ledger (id, user_id, kind, pool, units, ref, lot_id, sku, expires_at, created_at)
SELECT
  id,
  user_id,
  CASE kind WHEN 'grant' THEN 'signup' ELSE kind END,
  'grant',
  seconds,
  CASE WHEN kind = 'grant' OR ref IS NULL THEN NULL ELSE kind || ':' || ref END,
  NULL,
  NULL,
  NULL,
  created_at
FROM minute_ledger;

UPDATE credit_ledger
SET lot_id = (
  SELECT g.id FROM credit_ledger AS g
  WHERE g.user_id = credit_ledger.user_id AND g.kind = 'signup'
  LIMIT 1
)
WHERE kind IN ('charge', 'refund');

-- grants_enabled is set only after a paid Checkout Session or invoice.paid.
-- Subscription status alone is not enough: some payment methods go active before funds clear.
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  price_id TEXT NOT NULL,
  status TEXT NOT NULL,
  interval TEXT NOT NULL CHECK (interval IN ('month', 'year')),
  credits_per_month INTEGER NOT NULL,
  period_start INTEGER,
  period_end INTEGER,
  grants_enabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id, grants_enabled);

CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
