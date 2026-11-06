import { createActivityRegistry, type ActivitySender } from './live-activity.js';
import type { AccessTokenVerifier } from './auth.js';
import type { TunnelApi } from './cloudflare.js';
import type { D1Database } from './d1.js';
import type { EmailCode } from './email-code.js';

export interface RelayOptions {
  activitySender?: ActivitySender;
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
  limitBot?: (account: string, hostId: string) => Promise<boolean>;
  deleteUser?: (account: string) => Promise<void>;
  emailCode?: EmailCode;
  deleteMarketplaceAuthor?: (accessToken: string) => Promise<void>;
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
  bot_host_id: string | null;
  bot_public_key: string | null;
}

const HOST_ID = /^h[a-z2-7]{12}$/u;
const ONLINE = new Set(['healthy', 'degraded']);
const RECLAIM_BATCH = 15;
const VERIFIER_HASH = /^[A-Za-z0-9_-]{43}$/u;
const OFFER_TIMEOUT_MS = 10_000;
export const OFFER_PATH = '/botharness-device/channel';
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

async function verifyBotProof(key: string, proof: unknown, statement: string): Promise<boolean> {
  if (typeof proof !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(proof)) return false;
  const imported = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signature = Uint8Array.from(
    atob(proof.replaceAll('-', '+').replaceAll('_', '/') + '='),
    (c) => c.charCodeAt(0),
  );
  return crypto.subtle.verify('HMAC', imported, signature, new TextEncoder().encode(statement));
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function failure(status: number, code: string, cause?: string): Response {
  return json(status, { error: cause === undefined ? { code } : { code, cause } });
}

async function readBody(
  request: Request,
  limit?: number,
): Promise<Record<string, unknown> | undefined> {
  try {
    let body: unknown;
    if (limit === undefined) body = await request.json();
    else {
      const reader = request.body?.getReader();
      if (reader === undefined) return undefined;
      const decoder = new TextDecoder();
      let text = '';
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > limit) {
            await reader.cancel();
            return undefined;
          }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        reader.releaseLock();
      }
      body = JSON.parse(text);
    }
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
  const activity = createActivityRegistry(db, options.activitySender, now);
  const allowAll = options.allowedUsers.length === 0 || options.allowedUsers.includes('*');
  const hostname = (id: string) => `${id}.${options.zone}`;
  const view = (row: HostRow) => ({
    id: row.id,
    name: row.name,
    hostname: hostname(row.id),
    createdAt: row.created_at,
    tunnel: row.tunnel_id !== null,
    ...(row.bot_host_id == null || row.bot_public_key == null
      ? {}
      : {
          botNetwork: { hostId: row.bot_host_id, publicKey: row.bot_public_key },
        }),
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

  const registerBotNetwork = async (row: HostRow, request: Request) => {
    if (options.hostKey === undefined) return failure(503, 'bot-network-unavailable');
    const body = await readBody(request, 4096);
    const { hostId, publicKey, issuedAt, proof } = body ?? {};
    if (
      typeof hostId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/u.test(hostId) ||
      typeof publicKey !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(publicKey) ||
      typeof issuedAt !== 'string' ||
      issuedAt.length > 40
    )
      return failure(400, 'invalid-bot-identity');
    if (
      typeof proof !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/u.test(proof) ||
      !(Math.abs(now().getTime() - Date.parse(issuedAt)) <= 60_000)
    )
      return failure(403, 'bot-host-proof-invalid');
    const statement = JSON.stringify({
      purpose: 'bot-network-registration-v1',
      connectHostId: row.id,
      hostId,
      publicKey,
      issuedAt,
    });
    if (!(await verifyBotProof(await options.hostKey(row.id), proof, statement)))
      return failure(403, 'bot-host-proof-invalid');
    if (row.bot_host_id != null && (row.bot_host_id !== hostId || row.bot_public_key !== publicKey))
      return failure(409, 'bot-host-identity-conflict');
    const duplicate = await db
      .prepare('SELECT id FROM hosts WHERE account = ? AND bot_host_id = ? AND id != ?')
      .bind(row.account, hostId, row.id)
      .first();
    if (duplicate !== null) return failure(409, 'bot-host-identity-conflict');
    try {
      const updated = changes(
        await db
          .prepare(`UPDATE hosts SET bot_host_id = ?, bot_public_key = ?
        WHERE id = ? AND account = ? AND (bot_host_id IS NULL OR (bot_host_id = ? AND bot_public_key = ?))`)
          .bind(hostId, publicKey, row.id, row.account, hostId, publicKey)
          .run(),
      );
      if (updated === 0) return failure(409, 'bot-host-identity-conflict');
    } catch {
      const conflict = await db
        .prepare('SELECT id FROM hosts WHERE account = ? AND bot_host_id = ? AND id != ?')
        .bind(row.account, hostId, row.id)
        .first();
      return conflict === null
        ? failure(503, 'bot-network-unavailable')
        : failure(409, 'bot-host-identity-conflict');
    }
    const registered = await owned(row.id, row.account);
    return registered === null
      ? failure(404, 'host-not-found')
      : json(200, { host: view(registered) });
  };

  const botNetworkGrant = async (sender: HostRow, request: Request) => {
    if (options.hostKey === undefined) return failure(503, 'bot-network-unavailable');
    if (sender.bot_host_id == null || sender.bot_public_key == null)
      return failure(409, 'bot-host-unregistered');
    const { recipientId, issuedAt, nonce, proof } = (await readBody(request, 4096)) ?? {};
    if (
      typeof recipientId !== 'string' ||
      !HOST_ID.test(recipientId) ||
      typeof issuedAt !== 'string' ||
      issuedAt.length > 40 ||
      typeof nonce !== 'string' ||
      !/^[a-zA-Z0-9_-]{32,128}$/u.test(nonce)
    )
      return failure(400, 'invalid-bot-peer');
    const statement = JSON.stringify({
      purpose: 'bot-network-grant-v1',
      connectHostId: sender.id,
      recipientId,
      issuedAt,
      nonce,
    });
    if (
      !(Math.abs(now().getTime() - Date.parse(issuedAt)) <= 60_000) ||
      !(await verifyBotProof(await options.hostKey(sender.id), proof, statement))
    )
      return failure(403, 'bot-host-proof-invalid');
    const recipient = await owned(recipientId, sender.account);
    if (recipient === null || recipient.bot_host_id == null || recipient.bot_public_key == null)
      return failure(404, 'host-not-found');
    const identity = (row: HostRow) => ({
      id: row.id,
      hostId: row.bot_host_id,
      publicKey: row.bot_public_key,
    });
    const payload = JSON.stringify({
      purpose: 'bot-network-peer-v1',
      account: sender.account,
      sender: identity(sender),
      recipient: identity(recipient),
      issuedAt: now().toISOString(),
      nonce,
    });
    return json(200, {
      grant: { payload, signature: await hmac(await options.hostKey(recipient.id), payload) },
    });
  };

  const unlink = async (row: HostRow) => {
    if (row.tunnel_id !== null) await tunnels.deleteTunnel(row.tunnel_id);
    if (row.dns_record_id !== null) await tunnels.deleteRecord(row.dns_record_id);
    await db.prepare('DELETE FROM live_activities WHERE host_id = ?').bind(row.id).run();
    await db.prepare('DELETE FROM hosts WHERE id = ?').bind(row.id).run();
  };

  const deleteAccount = async (account: string, accessToken: string) => {
    if (options.deleteUser === undefined) return failure(503, 'account-deletion-unavailable');
    await db
      .prepare('INSERT OR IGNORE INTO deleted_accounts (account, deleted_at) VALUES (?, ?)')
      .bind(account, now().toISOString())
      .run();
    const { results } = await db
      .prepare('SELECT * FROM hosts WHERE account = ?')
      .bind(account)
      .all<HostRow>();
    try {
      for (const row of results) await unlink(row);
      await options.deleteMarketplaceAuthor?.(accessToken);
      await options.deleteUser(account);
    } catch {
      return failure(502, 'upstream-unavailable');
    }
    return json(200, { deleted: true });
  };

  const requestOffer = async (row: HostRow, account: string, request: Request) => {
    if (options.hostKey === undefined) return failure(503, 'offer-unavailable');
    const body = await readBody(request);
    const verifierHash = body?.['verifierHash'];
    if (typeof verifierHash !== 'string' || !VERIFIER_HASH.test(verifierHash))
      return failure(400, 'invalid-verifier');
    const name = body?.['name'];
    if (name !== undefined && !validName(name)) return failure(400, 'invalid-device-name');
    if (row.tunnel_id === null) return failure(409, 'host-offline', 'no-tunnel');
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
        method: 'GET',
        signal: AbortSignal.timeout(OFFER_TIMEOUT_MS),
      });
    } catch (error) {
      return failure(
        409,
        'host-offline',
        (error as { name?: unknown } | null)?.name === 'TimeoutError' ? 'timeout' : 'unreachable',
      );
    }
    if (reply.status >= 500) return failure(409, 'host-offline', `http-${reply.status}`);
    const answer = (await reply.json().catch(() => undefined)) as
      | {
          encryption?: { protocol?: unknown; publicKey?: unknown };
          host?: { id?: unknown; name?: unknown };
        }
      | undefined;
    if (
      reply.status !== 200 ||
      answer?.encryption?.protocol !== 'connect-noise-xk-v1' ||
      typeof answer.encryption.publicKey !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(answer.encryption.publicKey) ||
      typeof answer.host?.id !== 'string' ||
      typeof answer.host.name !== 'string'
    )
      return failure(
        502,
        'host-refused',
        reply.status === 200 ? 'bad-offer' : `http-${reply.status}`,
      );
    return json(200, {
      enrollment: { body: payload, signature },
      encryption: answer.encryption,
      expiresAt: new Date(now().getTime() + 5 * 60 * 1000).toISOString(),
      hostname: hostname(row.id),
      host: { id: answer.host.id, name: answer.host.name },
    });
  };

  const bearerToken = (request: Request) =>
    /^Bearer (\S+)$/u.exec(request.headers.get('authorization') ?? '')?.[1];

  const authorized = async (request: Request): Promise<string | Response> => {
    const token = bearerToken(request);
    const account = token === undefined ? undefined : await options.verifier.verify(token);
    if (account === undefined) return failure(401, 'unauthorized');
    if (!allowAll && !options.allowedUsers.includes(account))
      return failure(403, 'account-not-allowed');
    if (
      new URL(request.url).pathname !== '/v1/account' &&
      (await db
        .prepare('SELECT 1 FROM deleted_accounts WHERE account = ?')
        .bind(account)
        .first()) !== null
    )
      return failure(401, 'unauthorized');
    const botCredential =
      options.limitBot !== undefined &&
      /^\/v1\/hosts\/h[a-z2-7]{12}\/bot-network(?:\/grant)?$/u.test(new URL(request.url).pathname);
    if (
      request.method === 'POST' &&
      !botCredential &&
      options.limit !== undefined &&
      !(await options.limit(account))
    )
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
        ...(options.emailCode === undefined ? {} : { emailCode: true }),
      });
    }
    if (url.pathname === '/v1/auth/email-code' || url.pathname === '/v1/auth/email-code/verify') {
      if (request.method !== 'POST') return failure(405, 'method-not-allowed');
      if (options.emailCode === undefined) return failure(503, 'email-code-unavailable');
      const body = await readBody(request, 4096);
      if (body === undefined) return failure(400, 'invalid-body');
      const ip = request.headers.get('cf-connecting-ip') ?? undefined;
      const userAgent = request.headers.get('user-agent') ?? undefined;
      try {
        const result =
          url.pathname === '/v1/auth/email-code'
            ? await options.emailCode.send({ email: body['email'], ...(ip ? { ip } : {}) })
            : await options.emailCode.verify({
                email: body['email'],
                code: body['code'],
                ...(ip ? { ip } : {}),
                ...(userAgent ? { userAgent } : {}),
              });
        return json(result.status, result.body);
      } catch {
        return failure(502, 'workos-unavailable');
      }
    }
    const hostMatch =
      /^\/v1\/hosts\/([^/]+)(\/tunnel|\/offer|\/live-activity|\/bot-network(?:\/grant)?)?$/u.exec(
        url.pathname,
      );
    if (url.pathname !== '/v1/hosts' && url.pathname !== '/v1/account' && hostMatch === null)
      return failure(404, 'not-found');
    const account = await authorized(request);
    if (account instanceof Response) return account;

    if (url.pathname === '/v1/account') {
      if (request.method !== 'DELETE') return failure(405, 'method-not-allowed');
      return deleteAccount(account, bearerToken(request)!);
    }

    if (url.pathname === '/v1/hosts') {
      if (request.method === 'GET') {
        const { results } = await db
          .prepare('SELECT * FROM hosts WHERE account = ? ORDER BY created_at, id')
          .bind(account)
          .all<HostRow>();
        const hosts = await Promise.all(
          results.map(async (row) => {
            if (row.tunnel_id === null) return view(row);
            try {
              const state = await tunnels.tunnelState(row.tunnel_id);
              return { ...view(row), connected: state !== undefined && ONLINE.has(state.status) };
            } catch {
              return view(row);
            }
          }),
        );
        return json(200, { hosts });
      }
      if (request.method !== 'POST') return failure(405, 'method-not-allowed');
      const body = await readBody(request);
      if (!validName(body?.['name'])) return failure(400, 'invalid-host-name');
      const id = nextHostId();
      const created = changes(
        await db
          .prepare(
            'INSERT INTO hosts (id, account, name, created_at) SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM hosts WHERE account = ?) < ? AND NOT EXISTS (SELECT 1 FROM deleted_accounts WHERE account = ?)',
          )
          .bind(
            id,
            account,
            body['name'].trim(),
            now().toISOString(),
            account,
            options.maxHosts,
            account,
          )
          .run(),
      );
      if (created === 0) return failure(409, 'host-limit');
      const row = await owned(id, account);
      return json(201, { host: view(row as HostRow) });
    }

    const id = hostMatch?.[1] ?? '';
    const row = HOST_ID.test(id) ? await owned(id, account) : null;
    if (row === null) return failure(404, 'host-not-found');
    if (
      request.method === 'POST' &&
      (hostMatch?.[2] === '/bot-network' || hostMatch?.[2] === '/bot-network/grant') &&
      options.limitBot !== undefined &&
      !(await options.limitBot(account, row.id))
    )
      return failure(429, 'rate-limited');

    if (hostMatch?.[2] === '/bot-network/grant') {
      if (request.method !== 'POST') return failure(405, 'method-not-allowed');
      return botNetworkGrant(row, request);
    }

    if (hostMatch?.[2] === '/bot-network') {
      if (request.method !== 'POST') return failure(405, 'method-not-allowed');
      return registerBotNetwork(row, request);
    }

    if (hostMatch?.[2] === '/live-activity') return activity(id, row.name, request);

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
      await unlink(row);
    } catch {
      return failure(502, 'upstream-unavailable');
    }
    return json(200, { deleted: true });
  };

  const reclaim = async (): Promise<{ reclaimed: string[] }> => {
    await db
      .prepare('DELETE FROM live_activities WHERE expires_at <= ?')
      .bind(now().getTime())
      .run();
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
