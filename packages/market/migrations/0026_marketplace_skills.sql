CREATE TABLE marketplace_skills (
  id TEXT PRIMARY KEY,
  repo_node_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  skill_md TEXT NOT NULL,
  files TEXT NOT NULL DEFAULT '[]',
  scripts TEXT NOT NULL DEFAULT '[]',
  scan TEXT NOT NULL CHECK (scan IN ('clean', 'warning', 'blocked')),
  findings TEXT NOT NULL DEFAULT '[]',
  commit_sha TEXT NOT NULL,
  stars INTEGER NOT NULL DEFAULT 0,
  pushed_at TEXT NOT NULL,
  curated INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL CHECK (visibility IN ('listed', 'hidden_missing', 'rejected', 'blocked')),
  installs INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_refreshed_at TEXT NOT NULL,
  UNIQUE (repo_node_id, path)
);

CREATE INDEX marketplace_skills_listed
  ON marketplace_skills (visibility, installs DESC, stars DESC, name, id);

CREATE TABLE skill_install_receipts (
  skill_id TEXT NOT NULL,
  target_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (skill_id, target_hash)
);
