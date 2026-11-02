-- Replacing an Uploaded Bot (ADR-0267): the new files are staged under their own file set and the
-- listing switches to it only once every file is stored, then the old set is deleted. files_id
-- names the listing's current file set; NULL means the set stored under node_id itself.
ALTER TABLE indexed_repositories ADD COLUMN files_id TEXT;

-- The listing a pending upload replaces; NULL for a new Bot.
ALTER TABLE uploads ADD COLUMN replaces TEXT;

-- One row per replacement begun, for the 10 replacements per hour limit.
CREATE TABLE upload_replacements (
  account TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX upload_replacements_by_account ON upload_replacements (account, created_at);
