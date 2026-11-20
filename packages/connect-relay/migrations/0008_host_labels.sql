ALTER TABLE hosts ADD COLUMN label TEXT;

CREATE UNIQUE INDEX hosts_label ON hosts (label) WHERE label IS NOT NULL;
