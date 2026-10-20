CREATE TABLE hosts (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  tunnel_id TEXT,
  tunnel_created_at TEXT,
  dns_record_id TEXT,
  origin_port INTEGER
);

CREATE INDEX hosts_account ON hosts (account, created_at);
CREATE INDEX hosts_tunnel ON hosts (tunnel_id) WHERE tunnel_id IS NOT NULL;
