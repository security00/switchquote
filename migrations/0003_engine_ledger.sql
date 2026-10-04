-- Pluggable engines: spend_events gains `engine` and kind 'tag' (fallback language-tagging pass).
-- SQLite can't alter a CHECK constraint, so the table is rebuilt; every existing row is kept.
-- `engine` has a default so a Worker still on the previous version keeps inserting during deploy.
CREATE TABLE spend_events_new (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_email TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('stt', 'translate', 'tag')),
  engine TEXT NOT NULL DEFAULT '',
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

INSERT INTO spend_events_new (id, day, user_id, user_email, kind, engine, provider, model, ref, audio_seconds, micro_usd, cost_source, namespace, status, http_status, created_at)
SELECT id, day, user_id, user_email, kind,
       CASE WHEN kind = 'stt' THEN provider ELSE 'translate' END,
       provider, model, ref, audio_seconds, micro_usd,
       CASE WHEN cost_source = 'openrouter_usage_cost' THEN 'provider_returned'
            ELSE cost_source END,
       namespace, status, http_status, created_at
FROM spend_events;

DROP TABLE spend_events;
ALTER TABLE spend_events_new RENAME TO spend_events;
CREATE INDEX IF NOT EXISTS idx_spend_events_day ON spend_events (day);
CREATE INDEX IF NOT EXISTS idx_spend_events_engine ON spend_events (engine, day);

ALTER TABLE transcripts ADD COLUMN lang_tags TEXT;
