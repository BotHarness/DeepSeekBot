-- Uploaded Bots (ADR-0267): a second source beside Indexed Repositories. Listed uploads live in
-- indexed_repositories with source = 'upload', so browse, search, topics and moderation stay one
-- catalog; their files are in R2 under bots/<id>/<path> and listed in uploaded_files.
ALTER TABLE indexed_repositories ADD COLUMN source TEXT NOT NULL DEFAULT 'github'
  CHECK (source IN ('github', 'upload'));
ALTER TABLE indexed_repositories ADD COLUMN author_account TEXT;
ALTER TABLE indexed_repositories ADD COLUMN author_id TEXT;

CREATE INDEX indexed_repositories_by_author ON indexed_repositories (author_account);

-- account is the WorkOS user id and is never returned; author_id is the public, immutable ID.
CREATE TABLE authors (
  account TEXT PRIMARY KEY,
  author_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  terms_accepted_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- An upload in progress: files arrive one request each, then publish lists the Bot.
CREATE TABLE uploads (
  upload_id TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  presentation TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX uploads_by_account ON uploads (account);

CREATE TABLE uploaded_files (
  bot_id TEXT NOT NULL,
  path TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'script', 'image')),
  stored INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bot_id, path)
);
