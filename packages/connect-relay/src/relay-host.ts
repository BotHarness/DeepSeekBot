export interface HostRow {
  id: string;
  account: string;
  name: string;
  created_at: string;
  tunnel_id: string | null;
  tunnel_created_at: string | null;
  dns_record_id: string | null;
  origin_port: number | null;
  bot_host_id: string | null;
  bot_public_key: string | null;
  session_id: string | null;
  zone: string | null;
  label?: string | null;
  last_used_at: string | null;
  evicted_at: string | null;
  waiting_since: string | null;
  refused_at: string | null;
  cleanup_at: string | null;
  tunnel_status: string | null;
  tunnel_inactive_since: string | null;
}

export const HOST_ID = /^h[a-z2-7]{12}$/u;

export const TEST_LABEL_PREFIX = 'hzzzz';

export function randomHostId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const id = `h${Array.from(bytes, (byte) => alphabet[byte % 32]).join('')}`;
    if (!id.startsWith(TEST_LABEL_PREFIX)) return id;
  }
}

export function validName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    [...value].length <= 64 &&
    ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  );
}
