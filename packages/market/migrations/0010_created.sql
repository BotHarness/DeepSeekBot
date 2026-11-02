-- GitHub repository creation time for `sort=created`. Rows indexed before this column start from
-- the time the Marketplace first saw them; the next refresh replaces that with GitHub's value.
ALTER TABLE indexed_repositories ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
UPDATE indexed_repositories SET created_at = first_seen_at;

CREATE INDEX indexed_repositories_listed_by_created
  ON indexed_repositories (visibility, created_at DESC, node_id DESC);
