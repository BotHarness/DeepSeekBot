CREATE TABLE discovery_cursors (
  phase TEXT PRIMARY KEY CHECK (phase IN ('bots', 'skills')),
  repo_node_id TEXT NOT NULL
);
