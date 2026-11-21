CREATE TABLE marketplace_avatars (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL REFERENCES authors(account) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  tags TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'listed',
  content_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (account, request_key)
);

CREATE INDEX marketplace_avatars_browse ON marketplace_avatars (visibility, created_at DESC, id DESC);
