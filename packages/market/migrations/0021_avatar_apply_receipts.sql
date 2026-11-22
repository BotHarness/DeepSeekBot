CREATE TABLE avatar_apply_receipts (
  avatar_id TEXT NOT NULL REFERENCES marketplace_avatars(id) ON DELETE CASCADE,
  bot_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (avatar_id, bot_hash)
);
