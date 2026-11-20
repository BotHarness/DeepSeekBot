ALTER TABLE hosts ADD COLUMN bot_host_id TEXT;
ALTER TABLE hosts ADD COLUMN bot_public_key TEXT;
CREATE UNIQUE INDEX hosts_bot_identity ON hosts (account, bot_host_id) WHERE bot_host_id IS NOT NULL;
