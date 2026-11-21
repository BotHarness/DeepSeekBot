CREATE TABLE avatar_ranking_runs (
  day TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE avatar_ranking_snapshots (
  day TEXT NOT NULL,
  section TEXT NOT NULL CHECK (section IN ('hot', 'new', 'rising')),
  rank INTEGER NOT NULL,
  avatar_id TEXT NOT NULL REFERENCES marketplace_avatars(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  PRIMARY KEY (day, section, rank)
);

CREATE INDEX avatar_ranking_snapshots_by_avatar ON avatar_ranking_snapshots (avatar_id);
CREATE INDEX avatar_apply_receipts_by_created ON avatar_apply_receipts (created_at, avatar_id);
