ALTER TABLE hosts ADD COLUMN zone TEXT;
ALTER TABLE hosts ADD COLUMN last_used_at TEXT;
ALTER TABLE hosts ADD COLUMN evicted_at TEXT;
ALTER TABLE hosts ADD COLUMN cleanup_at TEXT;
ALTER TABLE hosts ADD COLUMN tunnel_status TEXT;
ALTER TABLE hosts ADD COLUMN tunnel_inactive_since TEXT;

CREATE INDEX hosts_zone_records ON hosts (zone) WHERE dns_record_id IS NOT NULL;
ALTER TABLE hosts ADD COLUMN waiting_since TEXT;
ALTER TABLE hosts ADD COLUMN refused_at TEXT;
