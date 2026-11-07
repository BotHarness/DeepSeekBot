ALTER TABLE hosts ADD COLUMN session_id TEXT;

CREATE TABLE revoked_sessions (
  account TEXT NOT NULL,
  session_id TEXT NOT NULL,
  revoked_at TEXT NOT NULL,
  PRIMARY KEY (account, session_id)
);
