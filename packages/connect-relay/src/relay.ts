import type { AccessTokenVerifier } from './auth.js';
import type { TunnelApi } from './cloudflare.js';
import type { D1Database } from './d1.js';

export interface RelayOptions {
  db: D1Database;
  verifier: AccessTokenVerifier;
  tunnels: TunnelApi;
  clientId: string;
  zone: string;
  allowedUsers: readonly string[];
  maxHosts: number;
  maxTunnels: number;
  reclaimAfterMs: number;
  limit?: (account: string) => Promise<boolean>;
  hostKey?: (hostId: string) => Promise<string>;
  fetchHost?: typeof fetch;
  now?: () => Date;
  hostId?: () => string;
}

interface HostRow {
  id: string;
  account: string;
  name: string;
  created_at: string;
  tunnel_id: string | null;
  tunnel_created_at: string | null;
  dns_record_id: string | null;
  origin_port: number | null;
}

const HOST_ID = /^h[a-z2-7]{12}$/u;
const ONLINE = new Set(['healthy', 'degraded']);
const RECLAIM_BATCH = 15;
const VERIFIER_HASH = /^[A-Za-z0-9_-]{43}$/u;
const OFFER_TIMEOUT_MS = 10_000;
export const OFFER_PATH = '/botharness-device/connect/offer';
export const SIGNATURE_HEADER = 'x-botharness-relay-signature';

function base64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

export async function hmac(key: string, message: string): Promise<string> {
  const imported = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64Url(await crypto.subtle.sign('HMAC', imported, new TextEncoder().encode(message)));
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function failure(status: number, code: string): Response {
  return json(status, { error: { code } });
}

async function readBody(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

class RelayFull extends Error {}

function changes(result: unknown): number {
  const value = result as { changes?: number; meta?: { changes?: number } } | null;
  return value?.meta?.changes ?? value?.changes ?? 0;
}

export function randomHostId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `h${Array.from(bytes, (byte) => alphabet[byte % 32]).join('')}`;
}

function validName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    [...value].length <= 64 &&
    ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  );
}

export function createRelay(options: RelayOptions) {
  const { db, tunnels } = options;
  const now = options.now ?? (() => new Date());
  const nextHostId = options.hostId ?? randomHostId;
  const allowAll = options.allowedUsers.length === 0 || options.allowedUsers.includes('*');
  const hostname = (id: string) => `${id}.${options.zone}`;
  const view = (row: HostRow) => ({
    id: row.id,
    name: row.name,
    hostname: hostname(row.id),
    createdAt: row.created_at,
    tunnel: row.tunnel_id !== null,
  });

  const owned = (id: string, account: string) =>
    db
      .prepare('SELECT * FROM hosts WHERE id = ? AND account = ?')
      .bind(id, account)
      .first<HostRow>();

  const provision = async (row: HostRow, originPort: number) => {
    let current = row;
    for (;;) {
      const live =
        current.tunnel_id === null ? undefined : await tunnels.tunnelState(current.tunnel_id);
      if (current.tunnel_id !== null && live !== undefined) break;
      const active = await db
        .prepare('SELECT COUNT(*) AS n FROM hosts WHERE tunnel_id IS NOT NULL AND id != ?')
        .bind(current.id)
        .first<{ n: number }>();
      if ((active?.n ?? 0) >= options.maxTunnels) throw new RelayFull();
      const created = await tunnels.createTunnel(`dsb-${current.id}`);
      const claimed = changes(
        await db
          .prepare(
            'UPDATE hosts SET tunnel_id = ?, tunnel_created_at = ? WHERE id = ? AND tunnel_id IS ?',
          )
          .bind(created, now().toISOString(), current.id, current.tunnel_id)
          .run(),
      );
      if (claimed === 0) await tunnels.deleteTunnel(created);
      const reread = await owned(current.id, current.account);
      if (reread === null) {
        await tunnels.deleteTunnel(created);
        return undefined;
      }
      current = reread;
      if (claimed === 1) {
        const record = await tunnels.pointHostname(
          hostname(current.id),
          created,
          current.dns_record_id ?? undefined,
        );
        await db
          .prepare('UPDATE hosts SET dns_record_id = ? WHERE id = ?')
          .bind(record, current.id)
          .run();
        break;
      }
    }
    const tunnelId = current.tunnel_id as string;
    await tunnels.configureIngress(tunnelId, hostname(current.id), originPort);
    await db
      .prepare('UPDATE hosts SET origin_port = ? WHERE id = ?')
      .bind(originPort, current.id)
      .run();
    return {
      hostname: hostname(current.id),
      token: await tunnels.tunnelToken(tunnelId),
      ...(options.hostKey === undefined
        ? {}
        : { account: current.account, relayKey: await options.hostKey(current.id) }),
    };
  };

  const requestOffer = async (row: HostRow, account: string, request: Request) => {
    if (options.hostKey === undefined) return failure(503, 'offer-unavailable');
    const body = await readBody(request);
    const verifierHash = body?.['verifierHash'];
    if (typeof verifierHash !== 'string' || !VERIFIER_HASH.test(verifierHash))
      return failure(400, 'invalid-verifier');
    const name = body?.['name'];
    if (name !== undefined && !validName(name)) return failure(400, 'invalid-device-name');
    if (row.tunnel_id === null) return failure(409, 'host-offline');
    const payload = JSON.stringify({
      hostId: row.id,
      account,
      verifierHash,
      ...(name === undefined ? {} : { name: name.trim() }),
      issuedAt: now().toISOString(),
    });
    const signature = await hmac(await options.hostKey(row.id), payload);
    let reply: Response;
    try {
      reply = await (options.fetchHost ?? fetch)(`https://${hostname(row.id)}${OFFER_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: signature },
        body: payload,
        signal: AbortSignal.timeout(OFFER_TIMEOUT_MS),
      });
    } catch {
      return failure(409, 'host-offline');
    }
    if (reply.status >= 500) return failure(409, 'host-offline');
    const answer = (await reply.json().catch(() => undefined)) as
      | { offer?: unknown; expiresAt?: unknown; host?: { id?: unknown; name?: unknown } }
      | undefined;
    if (
      reply.status !== 200 ||
      typeof answer?.offer !== 'string' ||
      typeof answer.expiresAt !== 'string' ||
      typeof answer.host?.id !== 'string' ||
      typeof answer.host.name !== 'string'
    )
      return failure(502, 'host-refused');
    return json(200, {
      offer: answer.offer,
      expiresAt: answer.expiresAt,
      hostname: hostname(row.id),
      host: { id: answer.host.id, name: answer.host.name },
    });
  };

  const authorized = async (request: Request): Promise<string | Response> => {
    const token = /^Bearer (\S+)$/u.exec(request.headers.get('authorization') ?? '')?.[1];
    const account = token === undefined ? undefined : await options.verifier.verify(token);
    if (account === undefined) return failure(401, 'unauthorized');
    if (!allowAll && !options.allowedUsers.includes(account))
      return failure(403, 'account-not-allowed');
    if (request.method === 'POST' && options.limit !== undefined && !(await options.limit(account)))
      return failure(429, 'rate-limited');
    return account;
  };

  const route = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname === '/v1/config') {
      if (request.method !== 'GET') return failure(405, 'method-not-allowed');
      return json(200, {
        clientId: options.clientId,
        deviceAuthorizationEndpoint: 'https://api.workos.com/user_management/authorize/device',
        tokenEndpoint: 'https://api.workos.com/user_management/authenticate',
        zone: options.zone,
      });
    }
    const hostMatch = /^\/v1\/hosts\/([^/]+)(\/tunnel|\/offer)?$/u.exec(url.pathname);
    if (url.pathname !== '/v1/hosts' && hostMatch === null) return failure(404, 'not-found');
    const account = await authorized(request);
    if (account instanceof Response) return account;

    if (url.pathname === '/v1/hosts') {
      if (request.method === 'GET') {
        const { results } = await db
          .prepare('SELECT * FROM hosts WHERE account = ? ORDER BY created_at, id')
          .bind(account)
          .all<HostRow>();
        return json(200, { hosts: results.map(view) });
      }
      if (request.method !== 'POST') return failure(405, 'method-not-allowed');
      const body = await readBody(request);
      if (!validName(body?.['name'])) return failure(400, 'invalid-host-name');
      const id = nextHostId();
      const created = changes(
        await db
          .prepare(
            'INSERT INTO hosts (id, account, name, created_at) SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM hosts WHERE account = ?) < ?',
          )
          .bind(id, account, body['name'].trim(), now().toISOString(), account, options.maxHosts)
          .run(),
      );
      if (created === 0) return failure(409, 'host-limit');
      const row = await owned(id, account);
      return json(201, { host: view(row as HostRow) });
    }

    const id = hostMatch?.[1] ?? '';
    const row = HOST_ID.test(id) ? await owned(id, account) : null;
    if (row === null) return failure(404, 'host-not-found');

    if (hostMatch?.[2] === '/tunnel') {
      if (request.method !== 'POST') return failure(405, 'method-not-allowed');
      const port = (await readBody(request))?.['originPort'];
      if (typeof port !== 'number' || !Number.isInteger(port) || port < 1024 || port > 65535)
        return failure(400, 'invalid-origin-port');
      try {
        const tunnel = await provision(row, port);
        return tunnel === undefined ? failure(404, 'host-not-found') : json(200, tunnel);
      } catch (error) {
        if (error instanceof RelayFull) return failure(503, 'relay-full');
        return failure(502, 'upstream-unavailable');
      }
    }

    if (hostMatch?.[2] === '/offer') {
      if (request.method !== 'POST') return failure(405, 'method-not-allowed');
      return requestOffer(row, account, request);
    }

    if (request.method !== 'DELETE') return failure(405, 'method-not-allowed');
    try {
      if (row.tunnel_id !== null) await tunnels.deleteTunnel(row.tunnel_id);
      if (row.dns_record_id !== null) await tunnels.deleteRecord(row.dns_record_id);
    } catch {
      return failure(502, 'upstream-unavailable');
    }
    await db.prepare('DELETE FROM hosts WHERE id = ?').bind(row.id).run();
    return json(200, { deleted: true });
  };

  const reclaim = async (): Promise<{ reclaimed: string[] }> => {
    const { results } = await db
      .prepare('SELECT * FROM hosts WHERE tunnel_id IS NOT NULL ORDER BY tunnel_created_at')
      .all<HostRow>();
    const reclaimed: string[] = [];
    if (results.length === 0) return { reclaimed };
    const listed = await tunnels.listTunnels();
    const at = now().getTime();
    let attempted = 0;
    for (const row of results) {
      if (attempted >= RECLAIM_BATCH) break;
      const tunnelId = row.tunnel_id as string;
      const state = listed.states.get(tunnelId);
      if (state !== undefined && ONLINE.has(state.status)) continue;
      const since = Date.parse(state?.inactiveSince ?? row.tunnel_created_at ?? '');
      if (Number.isFinite(since) && at - since < options.reclaimAfterMs) continue;
      if (state === undefined && !listed.complete) continue;
      attempted += 1;
      try {
        if (state !== undefined) await tunnels.deleteTunnel(tunnelId);
        await db
          .prepare(
            'UPDATE hosts SET tunnel_id = NULL, tunnel_created_at = NULL WHERE id = ? AND tunnel_id = ?',
          )
          .bind(row.id, tunnelId)
          .run();
        reclaimed.push(row.id);
      } catch {
        continue;
      }
    }
    return { reclaimed };
  };

  return { fetch: route, reclaim };
}
