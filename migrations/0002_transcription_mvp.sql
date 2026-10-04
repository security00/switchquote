-- SwitchQuote transcription MVP: Google accounts, one-time minute grants, transcripts,
-- USD spend breaker ledgers, paid-call log and operator alert log.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  image TEXT,
  google_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Generated secrets (auth/signing fallbacks) and one-time operator codes.
CREATE TABLE IF NOT EXISTS app_secrets (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Minute ledger in seconds. kind: 'grant' (one-time signup grant, unique per user),
-- 'charge' (negative, one per transcript), 'refund' (positive, failed provider call).
CREATE TABLE IF NOT EXISTS minute_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('grant', 'charge', 'refund')),
  seconds INTEGER NOT NULL,
  ref TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_minute_ledger_grant ON minute_ledger (user_id) WHERE kind = 'grant';
CREATE UNIQUE INDEX IF NOT EXISTS idx_minute_ledger_ref ON minute_ledger (kind, ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_minute_ledger_user ON minute_ledger (user_id);

CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'done', 'failed')),
  filename TEXT NOT NULL,
  mime TEXT,
  bytes INTEGER NOT NULL,
  duration_sec REAL NOT NULL,
  engine TEXT NOT NULL,
  segments_json TEXT,
  translation_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transcripts_user ON transcripts (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_transcripts_expires ON transcripts (expires_at);

-- Daily USD ledgers (micro-USD). ledger_key: '<ns>global' or '<ns>user:<id>'.
CREATE TABLE IF NOT EXISTS spend_ledger (
  ledger_key TEXT NOT NULL,
  day TEXT NOT NULL,
  micro_usd INTEGER NOT NULL DEFAULT 0,
  calls INTEGER NOT NULL DEFAULT 0,
  alert80_at INTEGER,
  alert100_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (ledger_key, day)
);

-- Every paid provider call, kept for audit (never deleted with test data).
CREATE TABLE IF NOT EXISTS spend_events (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_email TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('stt', 'translate')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  ref TEXT,
  audio_seconds REAL,
  micro_usd INTEGER NOT NULL,
  cost_source TEXT NOT NULL,
  namespace TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  http_status INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spend_events_day ON spend_events (day);

CREATE TABLE IF NOT EXISTS alert_log (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  message_id TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);
