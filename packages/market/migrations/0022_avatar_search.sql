ALTER TABLE marketplace_avatars ADD COLUMN tag_keys TEXT NOT NULL DEFAULT '[]';

CREATE VIRTUAL TABLE marketplace_avatars_fts USING fts5(
  name, description, tags, tokenize = 'trigram'
);

CREATE TABLE marketplace_avatar_tags (
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  avatar_id TEXT NOT NULL,
  PRIMARY KEY (tag, created_at, avatar_id)
) WITHOUT ROWID;

CREATE INDEX marketplace_avatar_tags_entry ON marketplace_avatar_tags (avatar_id);

CREATE TRIGGER marketplace_avatar_search_insert AFTER INSERT ON marketplace_avatars
WHEN new.visibility = 'listed' BEGIN
  INSERT INTO marketplace_avatars_fts (rowid, name, description, tags)
  VALUES (new.rowid, new.name, new.description, (SELECT group_concat(value, ' ') FROM json_each(new.tags)));
  INSERT OR IGNORE INTO marketplace_avatar_tags
  SELECT value, new.created_at, new.id FROM json_each(new.tag_keys);
END;

CREATE TRIGGER marketplace_avatar_search_delete AFTER DELETE ON marketplace_avatars BEGIN
  DELETE FROM marketplace_avatars_fts WHERE rowid = old.rowid;
  DELETE FROM marketplace_avatar_tags WHERE avatar_id = old.id;
END;

CREATE TRIGGER marketplace_avatar_search_update
AFTER UPDATE OF name, description, tags, tag_keys, visibility ON marketplace_avatars BEGIN
  DELETE FROM marketplace_avatars_fts WHERE rowid = old.rowid;
  DELETE FROM marketplace_avatar_tags WHERE avatar_id = old.id;
  INSERT INTO marketplace_avatars_fts (rowid, name, description, tags)
  SELECT new.rowid, new.name, new.description, (SELECT group_concat(value, ' ') FROM json_each(new.tags))
  WHERE new.visibility = 'listed';
  INSERT OR IGNORE INTO marketplace_avatar_tags
  SELECT value, new.created_at, new.id FROM json_each(new.tag_keys)
  WHERE new.visibility = 'listed';
END;

INSERT INTO marketplace_avatars_fts (rowid, name, description, tags)
SELECT a.rowid, a.name, a.description, (SELECT group_concat(value, ' ') FROM json_each(a.tags))
FROM marketplace_avatars a WHERE a.visibility = 'listed';
