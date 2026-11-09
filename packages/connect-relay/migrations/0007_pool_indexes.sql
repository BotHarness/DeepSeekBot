CREATE INDEX hosts_waiting ON hosts (waiting_since) WHERE tunnel_id IS NULL AND waiting_since IS NOT NULL;
CREATE INDEX hosts_reconcile ON hosts (cleanup_at, tunnel_created_at, id) WHERE tunnel_id IS NOT NULL OR dns_record_id IS NOT NULL;
