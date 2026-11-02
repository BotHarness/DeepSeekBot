-- Daily Hot / New / Rising snapshots (ADR-0267). A run is recorded even when a section comes out
-- empty, so the latest run decides what each section shows and an empty day never falls back to
-- an older list. Rows keep their rank and the score that ranked them.
CREATE TABLE ranking_runs (
  day TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE ranking_snapshots (
  day TEXT NOT NULL,
  section TEXT NOT NULL CHECK (section IN ('hot', 'new', 'rising')),
  rank INTEGER NOT NULL,
  bot_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  PRIMARY KEY (day, section, rank)
);

CREATE INDEX indexed_repositories_listed_by_first_seen
  ON indexed_repositories (visibility, first_seen_at DESC);
