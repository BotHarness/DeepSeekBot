-- Delivery registrations only: no prompts, request history or execution authority.
CREATE TABLE live_activities (
  handle TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  token TEXT,
  expires_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  timestamp INTEGER NOT NULL DEFAULT 0,
  terminal INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL DEFAULT '',
  delivered_revision INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  UNIQUE(host_id, client_id)
);
CREATE INDEX live_activities_device ON live_activities(host_id, device_id);
CREATE INDEX live_activities_expiry ON live_activities(expires_at);
