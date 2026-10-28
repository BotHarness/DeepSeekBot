-- Daily Marketplace Digest (ADR-0267): one article per UTC day and language, written by a model
-- into fixed template slots from the latest Hot / New / Rising snapshot. sections is a JSON array of
-- { heading, body, bot } where bot is a listing id; the text is untrusted plain text, never markup.
CREATE TABLE digests (
  day TEXT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('zh', 'en')),
  title TEXT NOT NULL,
  lede TEXT NOT NULL,
  sections TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (day, lang)
);

-- Attempts per day, so rejected output is retried by later runs up to a fixed limit.
CREATE TABLE digest_runs (
  day TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
