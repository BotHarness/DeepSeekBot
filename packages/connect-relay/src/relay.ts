import { createActivityRegistry, type ActivitySender } from './live-activity.js';
import type { AccessTokenVerifier } from './auth.js';
import { RecordQuotaError, type TunnelApi } from './cloudflare.js';
import type { D1Database } from './d1.js';
import type { EmailCode } from './email-code.js';
import type { PasswordAuth } from './password-auth.js';
import { ONLINE, pickVictim, pickZone, type EvictionTier, type PoolTunnel } from './pool.js';
import { logWorker } from './worker-log.js';

import { createBotNetworkHandlers } from './relay-bot-network.js';
import { type HostRow, HOST_ID, TEST_LABEL_PREFIX, randomHostId, validName } from './relay-host.js';
import { failure, json, readBody } from './relay-http.js';
import { createOfferHandler } from './relay-offers.js';
import { createRelayReclaimer } from './relay-reconcile.js';

export { TEST_LABEL_PREFIX, randomHostId } from './relay-host.js';
export { OFFER_PATH, SIGNATURE_HEADER } from './relay-offers.js';
export type { ReconcileReport } from './relay-reconcile.js';
export { hmac } from './relay-signatures.js';

export interface RelayOptions {
  activitySender?: ActivitySender;
  db: D1Database;
  verifier: AccessTokenVerifier;
  tunnels: TunnelApi;
  clientId: string;
  zone: string;
  zones?: readonly string[];
  zoneRecords?: number;
  zoneLimits?: Readonly<Record<string, number>>;
  allowedUsers: readonly string[];
  maxHosts: number;
  maxTunnels: number;
  reclaimAfterMs: number;
  reclaimBudget?: number;
  tunnelPrefix?: string;
  evictOfflineGraceMs?: number;
  evictProtectMs?: number;
  evictFreshMs?: number;
  limit?: (account: string) => Promise<boolean>;
  limitBot?: (account: string, hostId: string) => Promise<boolean>;
  limitRead?: (account: string) => Promise<boolean>;
  deleteUser?: (account: string) => Promise<void>;
  revokeSession?: (sessionId: string) => Promise<void>;
  emailCode?: EmailCode;
  passwordAuth?: PasswordAuth;
  deleteMarketplaceAuthor?: (accessToken: string) => Promise<void>;
  hostKey?: (hostId: string) => Promise<string>;
  fetchHost?: typeof fetch;
  now?: () => Date;
  hostId?: () => string;
  ownsLabel?: (label: string) => boolean;
}

interface PoolStatus {
  capacity: number;
  inUse: number;
  free: number;
  waiting: number;
  nextFreeAt?: string;
  guaranteedMinutes: number;
}

const USE_STEP_MS = 60_000;
class RelayFull extends Error {
  constructor(
    readonly reason: 'pool-full' | 'zone-full' | 'queued',
    readonly position: number,
  ) {
    super(reason);
  }
}

const WAIT_STALE_MS = 3 * 60 * 1000;
const POOL_CACHE_MS = 30_000;
const MAX_IDLE_SECONDS = 365 * 24 * 60 * 60;
const NO_VICTIM_RECHECK_MS = 60_000;
const RETRY_AFTER_SECONDS = 60;

const time = (value: string | null | undefined): number => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

function changes(result: unknown): number {
  const value = result as { changes?: number; meta?: { changes?: number } } | null;
  return value?.meta?.changes ?? value?.changes ?? 0;
}

export function createRelay(options: RelayOptions) {
  const { db, tunnels } = options;
  const now = options.now ?? (() => new Date());
  const nextHostId = options.hostId ?? randomHostId;
  const ownsLabel = options.ownsLabel ?? ((label: string) => !label.startsWith(TEST_LABEL_PREFIX));
  const activity = createActivityRegistry(db, options.activitySender, now);
  const allowAll = options.allowedUsers.length === 0 || options.allowedUsers.includes('*');
  const defaultZone = options.zone;
  const zones = [defaultZone, ...(options.zones ?? []).filter((zone) => zone !== defaultZone)];
  const zoneRecords = options.zoneRecords ?? 195;
  const limitOf = (zone: string) => options.zoneLimits?.[zone] ?? zoneRecords;
  const quotaUntil = new Map<string, number>();
  const budgetPerRun = options.reclaimBudget ?? 30;
  const TUNNEL_PREFIX = options.tunnelPrefix ?? 'dsb-';
  const policy = {
    offlineGraceMs: options.evictOfflineGraceMs ?? 2 * 60 * 1000,
    protectMs: options.evictProtectMs ?? 30 * 60 * 1000,
    freshMs: options.evictFreshMs ?? 30 * 60 * 1000,
  };
  const zoneOf = (row: Pick<HostRow, 'zone'>) => row.zone ?? defaultZone;
  const hostname = (row: Pick<HostRow, 'id' | 'zone' | 'label'>) =>
    `${row.label ?? row.id}.${zoneOf(row)}`;
  const log = (event: string, fields: Record<string, unknown>) =>
    logWorker('warn', { event, ...fields });
  const waitingCutoff = () => new Date(now().getTime() - WAIT_STALE_MS).toISOString();

  let poolCache: { at: number; value: PoolStatus } | undefined;
  const noVictimUntil = new Map<string, number>();
  const poolChanged = () => {
    poolCache = undefined;
    noVictimUntil.clear();
  };

  const poolStatus = async (): Promise<PoolStatus> => {
    const started = now().getTime();
    if (poolCache !== undefined && started - poolCache.at < POOL_CACHE_MS) return poolCache.value;
    const counts = await db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM hosts WHERE tunnel_id IS NOT NULL) AS live,
          (SELECT COUNT(*) FROM hosts WHERE tunnel_id IS NULL AND waiting_since IS NOT NULL AND refused_at >= ?) AS waiting`,
      )
      .bind(waitingCutoff())
      .first<{ live: number; waiting: number }>();
    const capacity = Math.min(
      options.maxTunnels,
      zones.reduce((sum, zone) => sum + limitOf(zone), 0),
    );
    const live = counts?.live ?? 0;
    const free = Math.max(0, capacity - live);
    const value: PoolStatus = {
      capacity,
      inUse: live,
      free,
      waiting: counts?.waiting ?? 0,
      ...(free === 0 ? { nextFreeAt: await nextFreeAt() } : {}),
      guaranteedMinutes: Math.round(policy.freshMs / 60_000),
    };
    poolCache = { at: started, value };
    return value;
  };

  const timeOf = (value: string | null | undefined) => {
    const parsed = Date.parse(value ?? '');
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const evictableAt = (
    row: Pick<
      HostRow,
      'tunnel_created_at' | 'last_used_at' | 'tunnel_status' | 'tunnel_inactive_since'
    >,
  ) =>
    row.tunnel_status !== null && ONLINE.has(row.tunnel_status)
      ? Math.max(
          timeOf(row.tunnel_created_at) + policy.freshMs,
          timeOf(row.last_used_at ?? row.tunnel_created_at) + policy.protectMs,
        )
      : timeOf(row.tunnel_inactive_since ?? row.tunnel_created_at) + policy.offlineGraceMs;

  const nextFreeAt = async () => {
    const { results } = await db
      .prepare(
        'SELECT tunnel_created_at, last_used_at, tunnel_status, tunnel_inactive_since FROM hosts WHERE tunnel_id IS NOT NULL',
      )
      .all<
        Pick<
          HostRow,
          'tunnel_created_at' | 'last_used_at' | 'tunnel_status' | 'tunnel_inactive_since'
        >
      >();
    const earliest = Math.min(...results.map(evictableAt));
    const current = now().getTime();
    return new Date(
      Number.isFinite(earliest) ? Math.max(current, earliest) : current,
    ).toISOString();
  };

  const queuePosition = async (row: HostRow) => {
    const ahead = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM hosts WHERE id != ? AND tunnel_id IS NULL
          AND waiting_since IS NOT NULL AND refused_at >= ? AND waiting_since < ?`,
      )
      .bind(row.id, waitingCutoff(), row.waiting_since ?? now().toISOString())
      .first<{ n: number }>();
    return (ahead?.n ?? 0) + 1;
  };

  const markWaiting = async (row: HostRow) => {
    const stamp = now().toISOString();
    const fresh =
      row.waiting_since !== null && row.refused_at !== null && row.refused_at >= waitingCutoff();
    await db
      .prepare('UPDATE hosts SET waiting_since = ?, refused_at = ? WHERE id = ?')
      .bind(fresh ? row.waiting_since : stamp, stamp, row.id)
      .run();
    if (!fresh) poolCache = undefined;
    row.waiting_since = fresh ? row.waiting_since : stamp;
    row.refused_at = stamp;
  };

  const hostState = (row: HostRow) => {
    if (row.tunnel_id !== null)
      return row.tunnel_status !== null && ONLINE.has(row.tunnel_status)
        ? 'connected'
        : 'connecting';
    if (row.waiting_since !== null && (row.refused_at ?? '') >= waitingCutoff()) return 'waiting';
    if (row.evicted_at !== null) return 'released';
    return 'offline';
  };

  const refreshTunnelStatus = async (row: HostRow) => {
    if (row.tunnel_id === null || (row.tunnel_status !== null && ONLINE.has(row.tunnel_status)))
      return;
    const tunnelId = row.tunnel_id;
    const state = await tunnels.tunnelState(tunnelId).catch(() => undefined);
    if (
      state === undefined ||
      (state.status === row.tunnel_status &&
        (state.inactiveSince ?? null) === row.tunnel_inactive_since)
    )
      return;
    await db
      .prepare(
        'UPDATE hosts SET tunnel_status = ?, tunnel_inactive_since = ? WHERE id = ? AND tunnel_id = ?',
      )
      .bind(state.status, state.inactiveSince ?? null, row.id, tunnelId)
      .run();
    row.tunnel_status = state.status;
    row.tunnel_inactive_since = state.inactiveSince ?? null;
  };

  const view = (row: HostRow) => ({
    id: row.id,
    name: row.name,
    hostname: hostname(row),
    createdAt: row.created_at,
    tunnel: row.tunnel_id !== null,
    ...(row.tunnel_id !== null && row.tunnel_status !== null
      ? { connected: ONLINE.has(row.tunnel_status) }
      : {}),
    ...(row.tunnel_id === null && row.evicted_at !== null ? { evicted: true } : {}),
    state: hostState(row),
    ...(row.tunnel_id !== null && row.tunnel_status !== null && ONLINE.has(row.tunnel_status)
      ? { protectedUntil: new Date(evictableAt(row)).toISOString() }
      : {}),
    ...(row.evicted_at !== null && row.tunnel_id === null ? { releasedAt: row.evicted_at } : {}),
    ...(hostState(row) === 'waiting' && row.waiting_since !== null
      ? { waitingSince: row.waiting_since }
      : {}),
    sessionKnown: row.session_id != null,
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

  const touch = async (id: string, at: number) => {
    if (!Number.isFinite(at)) return;
    const stamp = new Date(Math.min(at, now().getTime())).toISOString();
    await db
      .prepare(
        'UPDATE hosts SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)',
      )
      .bind(stamp, id, new Date(Math.min(at, now().getTime()) - USE_STEP_MS).toISOString())
      .run();
  };

  const clearTunnel = (
    id: string,
    tunnelId: string | null,
    extra = '',
    bound: string[] = [],
    released = true,
  ) => {
    poolChanged();
    return db
      .prepare(
        `UPDATE hosts SET label = CASE WHEN dns_record_id IS NULL THEN label ELSE COALESCE(?, label) END, tunnel_id = NULL, tunnel_created_at = NULL, dns_record_id = NULL, tunnel_status = NULL, tunnel_inactive_since = NULL${extra} WHERE id = ? AND tunnel_id IS ?`,
      )
      .bind(released ? nextHostId() : null, ...bound, id, tunnelId)
      .run();
  };

  const evict = async (victim: HostRow, tier: EvictionTier, forId: string) => {
    if (victim.tunnel_id !== null) await tunnels.deleteTunnel(victim.tunnel_id);
    if (victim.dns_record_id !== null)
      await tunnels.deleteRecord(zoneOf(victim), victim.dns_record_id);
    await clearTunnel(victim.id, victim.tunnel_id, ', evicted_at = ?', [now().toISOString()]);
    log('connect-evicted', { host: victim.id, tier, zone: zoneOf(victim), for: forId });
  };

  const ensureCapacity = async (current: HostRow, zone: string) => {
    for (let round = 0; round < 3; round += 1) {
      const counts = await db
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM hosts WHERE tunnel_id IS NOT NULL AND id != ?1) AS live,
            (SELECT COUNT(*) FROM hosts WHERE COALESCE(zone, ?2) = ?3 AND id != ?1
              AND (tunnel_id IS NOT NULL OR dns_record_id IS NOT NULL)) AS records`,
        )
        .bind(current.id, defaultZone, zone)
        .first<{ live: number; records: number }>();
      const tunnelsFull = (counts?.live ?? 0) >= options.maxTunnels;
      const zoneFull = (counts?.records ?? 0) >= limitOf(zone);
      if (!tunnelsFull && !zoneFull) {
        const free = Math.min(
          options.maxTunnels - (counts?.live ?? 0),
          limitOf(zone) - (counts?.records ?? 0),
        );
        const position = await queuePosition(current);
        if (position > free) {
          await markWaiting(current);
          throw new RelayFull('queued', position);
        }
        return;
      }
      const scope = zoneFull ? zone : '';
      if (now().getTime() < (noVictimUntil.get(scope) ?? 0)) {
        await markWaiting(current);
        throw new RelayFull(zoneFull ? 'zone-full' : 'pool-full', await queuePosition(current));
      }
      const { results } = await db
        .prepare(
          zoneFull
            ? 'SELECT * FROM hosts WHERE COALESCE(zone, ?) = ? AND (tunnel_id IS NOT NULL OR dns_record_id IS NOT NULL)'
            : 'SELECT * FROM hosts WHERE tunnel_id IS NOT NULL AND ? = ?',
        )
        .bind(...(zoneFull ? [defaultZone, zone] : [1, 1]))
        .all<HostRow>();
      const byId = new Map(results.map((row) => [row.id, row]));
      const candidates: PoolTunnel[] = results.map((row) => ({
        id: row.id,
        account: row.account,
        zone: zoneOf(row),
        tunnelCreatedAt: row.tunnel_created_at,
        lastUsedAt: row.last_used_at,
        status: row.tunnel_id === null ? 'gone' : row.tunnel_status,
        inactiveSince: row.tunnel_inactive_since,
      }));
      const requesterUse = time(current.last_used_at);
      const victim = pickVictim(
        candidates,
        {
          id: current.id,
          lastUsedAt: Number.isFinite(requesterUse) ? requesterUse : now().getTime(),
        },
        now().getTime(),
        policy,
      );
      if (victim === undefined) {
        const earliest = Math.min(
          ...results.filter((row) => row.tunnel_id !== null).map(evictableAt),
        );
        noVictimUntil.set(
          scope,
          Math.min(
            now().getTime() + NO_VICTIM_RECHECK_MS,
            Number.isFinite(earliest) ? earliest : 0,
          ),
        );
        log('connect-full', { host: current.id, zone, tunnelsFull, zoneFull });
        await markWaiting(current);
        throw new RelayFull(zoneFull ? 'zone-full' : 'pool-full', await queuePosition(current));
      }
      await evict(byId.get(victim.id) as HostRow, victim.tier, current.id);
    }
    await markWaiting(current);
    throw new RelayFull('pool-full', await queuePosition(current));
  };

  const zoneUse = async () => {
    const { results } = await db
      .prepare(
        'SELECT COALESCE(zone, ?) AS zone, COUNT(*) AS n FROM hosts WHERE tunnel_id IS NOT NULL OR dns_record_id IS NOT NULL GROUP BY COALESCE(zone, ?)',
      )
      .bind(defaultZone, defaultZone)
      .all<{ zone: string; n: number }>();
    return new Map(results.map((entry) => [entry.zone, entry.n]));
  };

  const usableZones = (accepted: ReadonlySet<string>, avoid?: string) => {
    const clock = now().getTime();
    return zones.filter(
      (zone) =>
        zone !== avoid &&
        (zone === defaultZone || accepted.has(zone)) &&
        (quotaUntil.get(zone) ?? 0) <= clock,
    );
  };

  const chooseZone = async (current: HostRow, accepted: ReadonlySet<string>) => {
    if (current.zone !== null) return current.zone;
    const usable = usableZones(accepted);
    if (usable.length === 0) return defaultZone;
    if (usable.length === 1) return usable[0] as string;
    return pickZone(usable, await zoneUse(), limitOf) ?? defaultZone;
  };

  const provision = async (row: HostRow, originPort: number, accepted: ReadonlySet<string>) => {
    let current = row;
    let created: string | undefined;
    for (;;) {
      const live =
        current.tunnel_id === null ? undefined : await tunnels.tunnelState(current.tunnel_id);
      if (current.tunnel_id !== null && live !== undefined) break;
      const zone = await chooseZone(current, accepted);
      await ensureCapacity(current, zone);
      const fresh = await tunnels.createTunnel(`${TUNNEL_PREFIX}${current.id}`);
      const stamp = now().toISOString();
      const claimed = changes(
        await db
          .prepare(
            `UPDATE hosts SET tunnel_id = ?, tunnel_created_at = ?, zone = COALESCE(zone, ?),
              last_used_at = COALESCE(last_used_at, ?), evicted_at = NULL,
              waiting_since = NULL, refused_at = NULL,
              tunnel_status = 'inactive', tunnel_inactive_since = NULL
            WHERE id = ? AND tunnel_id IS ?`,
          )
          .bind(fresh, stamp, zone, stamp, current.id, current.tunnel_id)
          .run(),
      );
      poolChanged();
      if (claimed === 0) await tunnels.deleteTunnel(fresh);
      const reread = await owned(current.id, current.account);
      if (reread === null) {
        await tunnels.deleteTunnel(fresh);
        return undefined;
      }
      current = reread;
      if (claimed === 1) {
        created = fresh;
        break;
      }
    }
    const tunnelId = current.tunnel_id as string;
    let record: string;
    try {
      record = await tunnels.pointHostname(
        zoneOf(current),
        hostname(current),
        tunnelId,
        current.dns_record_id ?? undefined,
      );
    } catch (error) {
      if (created !== undefined) {
        await tunnels.deleteTunnel(created).catch(() => undefined);
        await clearTunnel(current.id, created, '', [], false).catch(() => undefined);
      }
      if (error instanceof RecordQuotaError) {
        log('connect-zone-quota', { host: current.id, zone: zoneOf(current) });
        quotaUntil.set(zoneOf(current), now().getTime() + 10 * 60 * 1000);
        if (current.dns_record_id === null)
          await db
            .prepare('UPDATE hosts SET zone = NULL WHERE id = ? AND dns_record_id IS NULL')
            .bind(current.id)
            .run();
        await markWaiting(current);
        throw new RelayFull('zone-full', await queuePosition(current));
      }
      if (current.dns_record_id === null && zoneOf(current) !== defaultZone) {
        log('connect-zone-failed', { host: current.id, zone: zoneOf(current) });
        quotaUntil.set(zoneOf(current), now().getTime() + 10 * 60 * 1000);
        await db
          .prepare(
            'UPDATE hosts SET zone = ? WHERE id = ? AND dns_record_id IS NULL AND tunnel_id IS NULL AND zone = ?',
          )
          .bind(
            pickZone(usableZones(accepted, zoneOf(current)), await zoneUse(), limitOf) ?? null,
            current.id,
            zoneOf(current),
          )
          .run();
      }
      throw error;
    }
    await db
      .prepare('UPDATE hosts SET dns_record_id = ? WHERE id = ?')
      .bind(record, current.id)
      .run();
    await tunnels.configureIngress(tunnelId, hostname(current), originPort);
    await db
      .prepare('UPDATE hosts SET origin_port = ? WHERE id = ?')
      .bind(originPort, current.id)
      .run();
    return {
      hostname: hostname(current),
      token: await tunnels.tunnelToken(tunnelId),
      ...(options.hostKey === undefined
        ? {}
        : { account: current.account, relayKey: await options.hostKey(current.id) }),
    };
  };

  const { registerBotNetwork, botNetworkGrant } = createBotNetworkHandlers({
    options,
    db,
    now,
    owned,
    view,
    changes,
  });

  const unlink = async (row: HostRow) => {
    if (row.tunnel_id !== null) await tunnels.deleteTunnel(row.tunnel_id);
    if (row.dns_record_id !== null) await tunnels.deleteRecord(zoneOf(row), row.dns_record_id);
    await db.prepare('DELETE FROM live_activities WHERE host_id = ?').bind(row.id).run();
    await db.prepare('DELETE FROM hosts WHERE id = ?').bind(row.id).run();
    poolChanged();
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
    let failed = false;
    for (const row of results)
      await unlink(row).catch(() => {
        failed = true;
      });
    if (failed) return failure(502, 'upstream-unavailable');
    try {
      await options.deleteMarketplaceAuthor?.(accessToken);
      await options.deleteUser(account);
    } catch {
      return failure(502, 'upstream-unavailable');
    }
    return json(200, { deleted: true });
  };

  const requestOffer = createOfferHandler({ options, now, touch, hostname });

  const bearerToken = (request: Request) =>
    /^Bearer (\S+)$/u.exec(request.headers.get('authorization') ?? '')?.[1];

  const authorized = async (
    request: Request,
  ): Promise<{ account: string; sessionId?: string } | Response> => {
    const token = bearerToken(request);
    const identity = token === undefined ? undefined : await options.verifier.verify(token);
    if (identity === undefined) return failure(401, 'unauthorized');
    const { account, sessionId } = identity;
    if (
      request.method === 'GET' &&
      options.limitRead !== undefined &&
      !(await options.limitRead(account))
    )
      return failure(429, 'rate-limited');
    if (
      sessionId !== undefined &&
      (await db
        .prepare('SELECT 1 FROM revoked_sessions WHERE account = ? AND session_id = ?')
        .bind(account, sessionId)
        .first()) !== null
    )
      return failure(401, 'session-revoked');
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
    return identity;
  };

  const route = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname === '/v1/config') {
      if (request.method !== 'GET') return failure(405, 'method-not-allowed');
      return json(200, {
        clientId: options.clientId,
        deviceAuthorizationEndpoint: 'https://api.workos.com/user_management/authorize/device',
        tokenEndpoint: 'https://api.workos.com/user_management/authenticate',
        zone: defaultZone,
        zones,
        ...(options.emailCode === undefined ? {} : { emailCode: true }),
        ...(options.passwordAuth === undefined ? {} : { passwordAuth: true }),
      });
    }
    if (
      [
        '/v1/auth/password',
        '/v1/auth/password/register',
        '/v1/auth/password/verify',
        '/v1/auth/password/reset',
      ].includes(url.pathname)
    ) {
      if (request.method !== 'POST') return failure(405, 'method-not-allowed');
      if (!options.passwordAuth) return failure(503, 'password-unavailable');
      const body = await readBody(request, 24576);
      if (body === undefined) return failure(400, 'invalid-body');
      const ip = request.headers.get('cf-connecting-ip') ?? undefined;
      const userAgent = request.headers.get('user-agent') ?? undefined;
      const caller = { ...(ip ? { ip } : {}), ...(userAgent ? { userAgent } : {}) };
      try {
        const result = url.pathname.endsWith('/verify')
          ? await options.passwordAuth.verify({
              ...caller,
              pendingToken: body['pendingToken'],
              code: body['code'],
            })
          : url.pathname.endsWith('/reset')
            ? await options.passwordAuth.reset({ ...caller, email: body['email'] })
            : await options.passwordAuth.signIn({
                ...caller,
                email: body['email'],
                password: body['password'],
                register: url.pathname.endsWith('/register'),
              });
        return json(result.status, result.body);
      } catch {
        return failure(502, 'workos-unavailable');
      }
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
      /^\/v1\/hosts\/([^/]+)(\/tunnel|\/revoke|\/offer|\/live-activity|\/bot-network(?:\/grant)?)?$/u.exec(
        url.pathname,
      );
    if (url.pathname !== '/v1/hosts' && url.pathname !== '/v1/account' && hostMatch === null)
      return failure(404, 'not-found');
    const identity = await authorized(request);
    if (identity instanceof Response) return identity;
    const { account, sessionId } = identity;

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
        const reporter = url.searchParams.get('host');
        const idle = Number(url.searchParams.get('idle'));
        if (
          reporter !== null &&
          Number.isInteger(idle) &&
          idle >= 0 &&
          idle <= MAX_IDLE_SECONDS &&
          results.some((row) => row.id === reporter)
        )
          await touch(reporter, now().getTime() - idle * 1000);
        if (reporter === null) await Promise.allSettled(results.map(refreshTunnelStatus));
        return json(200, { hosts: results.map(view), pool: await poolStatus() });
      }
      if (request.method !== 'POST') return failure(405, 'method-not-allowed');
      const body = await readBody(request);
      if (!validName(body?.['name'])) return failure(400, 'invalid-host-name');
      const id = nextHostId();
      const created = changes(
        await db
          .prepare(
            'INSERT INTO hosts (id, account, name, created_at, session_id) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM hosts WHERE account = ?) < ? AND NOT EXISTS (SELECT 1 FROM deleted_accounts WHERE account = ?) AND NOT EXISTS (SELECT 1 FROM revoked_sessions WHERE account = ? AND session_id = ?)',
          )
          .bind(
            id,
            account,
            body['name'].trim(),
            now().toISOString(),
            sessionId ?? null,
            account,
            options.maxHosts,
            account,
            account,
            sessionId ?? null,
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
    if (hostMatch?.[2] === '/revoke') {
      if (request.method !== 'POST') return failure(405, 'method-not-allowed');
      if (sessionId === undefined) return failure(409, 'session-unknown');
      if (row.session_id === sessionId) return failure(409, 'current-host');
      const sessionKnown = row.session_id !== null;
      if (sessionKnown) {
        await db
          .prepare(
            'INSERT OR IGNORE INTO revoked_sessions (account, session_id, revoked_at) VALUES (?, ?, ?)',
          )
          .bind(account, row.session_id, now().toISOString())
          .run();
      }
      try {
        await unlink(row);
      } catch {
        return failure(502, 'upstream-unavailable');
      }
      let sessionRevoked = false;
      if (row.session_id !== null && options.revokeSession !== undefined) {
        try {
          await options.revokeSession(row.session_id);
          sessionRevoked = true;
        } catch {
          sessionRevoked = false;
        }
      }
      return json(200, { deleted: true, sessionRevoked, sessionKnown });
    }
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

    if (hostMatch?.[2] === '/live-activity') {
      if (request.method === 'POST') await touch(row.id, now().getTime());
      return activity(id, row.name, request);
    }

    if (hostMatch?.[2] === '/tunnel') {
      if (request.method !== 'POST') return failure(405, 'method-not-allowed');
      const body = await readBody(request);
      const port = body?.['originPort'];
      if (typeof port !== 'number' || !Number.isInteger(port) || port < 1024 || port > 65535)
        return failure(400, 'invalid-origin-port');
      await db
        .prepare(
          'UPDATE hosts SET session_id = COALESCE(?, session_id) WHERE id = ? AND account = ?',
        )
        .bind(sessionId ?? null, id, account)
        .run();
      try {
        const offered = body?.['zones'];
        const accepted = new Set(
          Array.isArray(offered)
            ? offered.filter((zone): zone is string => typeof zone === 'string').slice(0, 16)
            : [],
        );
        const tunnel = await provision(row, port, accepted);
        return tunnel === undefined ? failure(404, 'host-not-found') : json(200, tunnel);
      } catch (error) {
        if (error instanceof RelayFull)
          return json(503, {
            error: {
              code: 'relay-full',
              reason: error.reason,
              position: error.position,
              retryAfter: RETRY_AFTER_SECONDS,
              pool: await poolStatus(),
            },
          });
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

  const reclaim = createRelayReclaimer({
    db,
    tunnels,
    zones,
    options,
    now,
    time,
    ownsLabel,
    budgetPerRun,
    TUNNEL_PREFIX,
    zoneOf,
    hostname,
    log,
    clearTunnel,
    poolChanged,
  });

  return { fetch: route, reclaim };
}
