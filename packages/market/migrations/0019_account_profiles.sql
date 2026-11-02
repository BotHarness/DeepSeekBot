-- Account Profiles: the author row becomes the Connect account's profile, so a Human can set a
-- display name and avatar before ever uploading. Terms are accepted at the first upload, so
-- terms_accepted_at becomes nullable. avatar is the public URL of an image in R2 under
-- authors/<author_id>/<sha256>.<ext>; uploaded listings copy it into author_avatar as owner copies
-- the name.
CREATE TABLE authors_next (
  account TEXT PRIMARY KEY,
  author_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  terms_accepted_at TEXT,
  created_at TEXT NOT NULL,
  avatar TEXT
);
INSERT INTO authors_next (account, author_id, display_name, terms_accepted_at, created_at)
  SELECT account, author_id, display_name, terms_accepted_at, created_at FROM authors;
DROP TABLE authors;
ALTER TABLE authors_next RENAME TO authors;

ALTER TABLE indexed_repositories ADD COLUMN author_avatar TEXT;
