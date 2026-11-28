CREATE TABLE skill_ranking_runs (
  day TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE skill_ranking_snapshots (
  day TEXT NOT NULL,
  section TEXT NOT NULL CHECK (section IN ('hot', 'new', 'rising')),
  rank INTEGER NOT NULL,
  skill_id TEXT NOT NULL REFERENCES marketplace_skills(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  PRIMARY KEY (day, section, rank)
);

CREATE INDEX skill_ranking_snapshots_by_skill ON skill_ranking_snapshots (skill_id);
CREATE INDEX skill_install_receipts_by_created ON skill_install_receipts (created_at, skill_id);
