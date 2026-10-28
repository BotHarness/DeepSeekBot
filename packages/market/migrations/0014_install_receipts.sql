-- Install Receipts (ADR-0267): one row per (entry, Host), keyed by a hash of the Host's random
-- marketplace-only identifier, never the Telemetry install id. installs is the cached count that
-- browse and detail return; created_at (epoch ms) lets daily snapshots rank recent installs.
CREATE TABLE install_receipts (
  bot_id TEXT NOT NULL,
  host_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (bot_id, host_hash)
);

CREATE INDEX install_receipts_by_time ON install_receipts (created_at);

ALTER TABLE indexed_repositories ADD COLUMN installs INTEGER NOT NULL DEFAULT 0;

-- Receipts share the per-address hourly limit, so request_events accepts the new action.
CREATE TABLE request_events_next (
  source_hash TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('challenge', 'submit', 'report', 'install')),
  created_at INTEGER NOT NULL
);
INSERT INTO request_events_next (source_hash, action, created_at)
  SELECT source_hash, action, created_at FROM request_events;
DROP TABLE request_events;
ALTER TABLE request_events_next RENAME TO request_events;
CREATE INDEX request_events_by_source ON request_events (source_hash, action, created_at);
