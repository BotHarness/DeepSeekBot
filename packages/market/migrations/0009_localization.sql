-- Localized presentation: README.<lang>.md variants, the bot.json `i18n` map, generated
-- one-line summaries for languages the author did not write, and their combined search text.
ALTER TABLE indexed_repositories ADD COLUMN readmes TEXT;
ALTER TABLE indexed_repositories ADD COLUMN localized TEXT;
ALTER TABLE indexed_repositories ADD COLUMN summary TEXT;
ALTER TABLE indexed_repositories ADD COLUMN summary_key TEXT;
ALTER TABLE indexed_repositories ADD COLUMN summary_checked_at TEXT;
ALTER TABLE indexed_repositories ADD COLUMN summary_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE indexed_repositories ADD COLUMN search_text TEXT;
UPDATE indexed_repositories SET readme_pushed_at = NULL;

DROP TRIGGER indexed_repositories_fts_insert;
DROP TRIGGER indexed_repositories_fts_delete;
DROP TRIGGER indexed_repositories_fts_update;
DROP TABLE indexed_repositories_fts;

CREATE VIRTUAL TABLE indexed_repositories_fts USING fts5(
  name,
  description,
  topics,
  readme,
  roles,
  search_text,
  content = 'indexed_repositories',
  content_rowid = 'rowid',
  tokenize = 'trigram'
);

CREATE TRIGGER indexed_repositories_fts_insert AFTER INSERT ON indexed_repositories BEGIN
  INSERT INTO indexed_repositories_fts (rowid, name, description, topics, readme, roles, search_text)
  VALUES (new.rowid, new.name, new.description, new.topics, new.readme, new.roles, new.search_text);
END;

CREATE TRIGGER indexed_repositories_fts_delete AFTER DELETE ON indexed_repositories BEGIN
  INSERT INTO indexed_repositories_fts (indexed_repositories_fts, rowid, name, description, topics, readme, roles, search_text)
  VALUES ('delete', old.rowid, old.name, old.description, old.topics, old.readme, old.roles, old.search_text);
END;

CREATE TRIGGER indexed_repositories_fts_update AFTER UPDATE ON indexed_repositories BEGIN
  INSERT INTO indexed_repositories_fts (indexed_repositories_fts, rowid, name, description, topics, readme, roles, search_text)
  VALUES ('delete', old.rowid, old.name, old.description, old.topics, old.readme, old.roles, old.search_text);
  INSERT INTO indexed_repositories_fts (rowid, name, description, topics, readme, roles, search_text)
  VALUES (new.rowid, new.name, new.description, new.topics, new.readme, new.roles, new.search_text);
END;

INSERT INTO indexed_repositories_fts (indexed_repositories_fts) VALUES ('rebuild');
