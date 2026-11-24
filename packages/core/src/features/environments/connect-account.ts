import { createConnectBotNetwork } from '../../devices/connect-bot-network.js';
import { randomBytes } from 'node:crypto';
import { hostname as osHostname } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { z } from 'zod';

import { CONNECT_ZONES } from '../../devices/routes.js';

import { createAccountRelationshipSession, verifySignedOffer } from './connect-account-offers.js';
import { freeLoopbackPort, originPort } from './connect-account-ports.js';
import {
  AccountError,
  CONNECT_RELAY,
  DEVICE_ENDPOINT,
  DEVICE_GRANT,
  REQUEST_TIMEOUT_MS,
  TOKEN_ENDPOINT,
  createConnectAccountRequests,
  poolSchema,
} from './connect-account-requests.js';
import { createConnectAccountStorage } from './connect-account-storage.js';
import {
  connectedHostsSchema,
  hostIdSchema,
  hostListSchema,
  relaySchema,
  revokedHostSchema,
  type AccountRecord,
  type AccountResult,
  type AccountStatus,
  type ConnectAccount,
  type ConnectAccountOptions,
  type ConnectClientId,
  type ConnectedHostsResult,
  type OfferVerification,
  type StoredAccount,
} from './connect-account-types.js';

const WATCH_MS = 60_000;
const TUNNEL_TIMEOUT_MS = 30_000;
const MAX_TIMER_SECONDS = 2_147_483_647 / 1000;
const authorizationSeconds = z
  .union([z.number(), z.string().trim().min(1).transform(Number)])
  .pipe(z.number().positive().max(MAX_TIMER_SECONDS));
const authorizationTimingSchema = z.object({
  interval: authorizationSeconds.default(5),
  expires_in: authorizationSeconds,
});
const terminalDeviceErrors = new Set(['access_denied', 'expired_token', 'invalid_grant']);

export function createConnectAccount(options: ConnectAccountOptions): ConnectAccount {
  const key = credentialKey('botharness-core', 'connect-account');
  const relay = relaySchema.parse(
    (options.relay ?? process.env['DEEPSEEKBOT_CONNECT_RELAY'] ?? CONNECT_RELAY).replace(
      /\/+$/u,
      '',
    ),
  );
  const fetcher = options.fetch ?? fetch;
  const hostName = options.hostName ?? osHostname;
  const freePort = options.freePort ?? freeLoopbackPort;
  const sleep = (ms: number, signal: AbortSignal) =>
    options.sleep?.(ms) ?? delay(ms, undefined, { signal });
  const record = options.record ?? (() => {});
  const { requestError, post, relayCall, clientId } = createConnectAccountRequests(
    relay,
    fetcher,
    record,
  );
  const { connect } = options;
  let status: AccountStatus = { state: 'signed-out' };
  const setStatus = (next: AccountStatus): void => {
    const changed =
      next.state !== status.state ||
      next.email !== status.email ||
      next.hostId !== status.hostId ||
      next.userCode !== status.userCode ||
      next.verificationUri !== status.verificationUri ||
      next.expiresAt !== status.expiresAt ||
      next.issue !== status.issue ||
      next.protectedUntil !== status.protectedUntil ||
      JSON.stringify(next.wait) !== JSON.stringify(status.wait) ||
      JSON.stringify(next.pool) !== JSON.stringify(status.pool);
    status = next;
    if (changed) options.onAccountChanged?.();
  };
  let attempt = 0;
  let attemptAbort = new AbortController();
  const advanceAttempt = () => {
    attempt += 1;
    const previous = attemptAbort;
    const next = new AbortController();
    attemptAbort = next;
    previous.abort();
    return next.signal;
  };
  const relationshipEpoch = randomBytes(16).toString('hex');
  let watch: ReturnType<typeof setInterval> | undefined;
  let cached: string | undefined;
  const shutdown = new AbortController();
  let signOutRequested = false;
  let canResumeSession = true;
  const sessionBlocked = () => signOutRequested || shutdown.signal.aborted;
  let queue: Promise<unknown> = Promise.resolve();

  const serial = <T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
    const run = () => {
      signal?.throwIfAborted();
      return work();
    };
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    if (signal === undefined) return next;
    return new Promise<T>((resolve, reject) => {
      const cancel = () =>
        reject(
          signal.reason instanceof Error
            ? signal.reason
            : new Error('Connect account operation cancelled', { cause: signal.reason }),
        );
      if (signal.aborted) cancel();
      else signal.addEventListener('abort', cancel, { once: true });
      next
        .finally(() => signal.removeEventListener('abort', cancel))
        .then((value) => (signal.aborted ? cancel() : resolve(value)), reject);
    });
  };

  const { native, readStored, read, save } = createConnectAccountStorage(options, key);

  const refresh = async (current: AccountRecord, signal = attemptAbort.signal): Promise<string> => {
    const refreshSignal = AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
    const guard = () => {
      if (refreshSignal.aborted) throw new AccountError('relay-unavailable');
    };
    guard();
    const reply = await post(
      'refresh-token',
      TOKEN_ENDPOINT,
      {
        grant_type: 'refresh_token',
        client_id: current.clientId,
        refresh_token: current.refreshToken,
      },
      refreshSignal,
    );
    guard();
    const access = reply.body['access_token'];
    const rotated = reply.body['refresh_token'];
    if (!reply.ok || typeof access !== 'string') {
      if (reply.status >= 400 && reply.status < 500 && reply.status !== 408 && reply.status !== 429)
        throw new AccountError('session-expired');
      if (reply.status >= 500 || reply.status === 408 || reply.status === 429)
        throw new AccountError('relay-unavailable');
      throw requestError('identity', 'refresh-token', {
        reason: 'invalid-response',
        status: reply.status,
      });
    }
    if (typeof rotated === 'string' && rotated !== current.refreshToken) {
      current.refreshToken = rotated;
      await save(current);
    }
    guard();
    if (!sessionBlocked()) cached = access;
    return access;
  };

  const requestTunnel = async (
    current: AccountRecord,
    access: string,
    port: number,
    signal: AbortSignal,
  ) => {
    const reply = await relayCall(
      'tunnel',
      'POST',
      `/v1/hosts/${current.hostId ?? ''}/tunnel`,
      access,
      {
        originPort: port,
        zones: CONNECT_ZONES,
      },
      TUNNEL_TIMEOUT_MS,
      signal,
    );
    if (reply.status === 404) return undefined;
    const { hostname, token, account, relayKey } = reply.body;
    if (reply.status !== 200 || typeof hostname !== 'string' || typeof token !== 'string')
      throw requestError('relay', 'tunnel', { reason: 'invalid-response', status: reply.status });
    const signer = typeof account === 'string' && typeof relayKey === 'string';
    if (
      (signer && (current.account !== account || current.relayKey !== relayKey)) ||
      (!signer && current.relayKey !== undefined)
    ) {
      if (signer) Object.assign(current, { account, relayKey });
      else {
        delete current.account;
        delete current.relayKey;
      }
      await save(current);
    }
    return { hostname, token };
  };

  const link = async (
    current: AccountRecord,
    access: string,
    signal: AbortSignal,
  ): Promise<void> => {
    const reply = await relayCall(
      'register-host',
      'POST',
      '/v1/hosts',
      access,
      { name: hostName().slice(0, 64) || 'Tobs' },
      undefined,
      signal,
    );
    const host = z.object({ id: hostIdSchema }).safeParse(reply.body['host']);
    if (reply.status !== 201 || !host.success)
      throw requestError('relay', 'register-host', {
        reason: 'invalid-response',
        status: reply.status,
      });
    current.hostId = host.data.id;
    await save(current);
    record('linked', `host=${host.data.id}`);
  };

  const fail = (error: unknown, current?: AccountRecord): void => {
    const issue = error instanceof AccountError ? error.issue : 'relay-unavailable';
    const wait = error instanceof AccountError ? error.wait : undefined;
    const pool = error instanceof AccountError ? error.pool : undefined;
    const since = status.wait?.since ?? new Date().toISOString();
    setStatus({
      state: 'error',
      issue,
      recovery:
        (issue === 'relay-unavailable' || issue === 'relay-full') &&
        canResumeSession &&
        current !== undefined
          ? 'automatic'
          : 'sign-in',
      ...(current?.email ? { email: current.email } : {}),
      ...(current?.hostId ? { hostId: current.hostId } : {}),
      ...(issue === 'relay-full' && wait !== undefined ? { wait: { ...wait, since } } : {}),
      ...(pool === undefined ? {} : { pool }),
    });
    record('account-error', `issue=${issue}`);
  };

  const retireSession = async (current: StoredAccount | undefined): Promise<void> => {
    canResumeSession = false;
    cached = undefined;
    await connect.disable();
    if (current?.hostId !== undefined) {
      await save({
        kind: 'registration',
        relay: current.relay,
        clientId: current.clientId,
        hostId: current.hostId,
      });
    } else {
      try {
        await native().deleteRecord(key);
      } catch {
        throw new AccountError('credential-unavailable');
      }
    }
  };

  const revoke = async (error: unknown, current?: AccountRecord): Promise<void> => {
    fail(error, current);
    if (
      !(error instanceof AccountError) ||
      (error.issue !== 'session-expired' && error.issue !== 'session-revoked')
    )
      return;
    advanceAttempt();
    try {
      await retireSession(current);
    } catch {
      record('revoke-failed');
      return;
    }
    record('revoked');
  };

  const check = (): Promise<void> => {
    const signal = attemptAbort.signal;
    return serial(async () => {
      if (signal.aborted || sessionBlocked() || status.state !== 'signed-in') return;
      let current: AccountRecord | undefined;
      let listed: unknown;
      try {
        current = await read();
        if (signal.aborted) return;
        if (current === undefined) {
          await connect.disable();
          if (!signal.aborted) setStatus({ state: 'signed-out' });
          return;
        }
        const stored = current;
        const idle = connect.idleSeconds?.();
        const listPath =
          stored.hostId !== undefined && idle !== undefined
            ? `/v1/hosts?host=${encodeURIComponent(stored.hostId)}&idle=${String(idle)}`
            : '/v1/hosts';
        const hosts = (token: string) =>
          relayCall('list-hosts', 'GET', listPath, token, undefined, undefined, signal);
        const fresh = async () => hosts(await refresh(stored, signal));
        const reply =
          cached === undefined
            ? await fresh()
            : await hosts(cached).catch((error: unknown) => {
                if (error instanceof AccountError && error.issue === 'session-expired')
                  return fresh();
                throw error;
              });
        if (signal.aborted) return;
        listed = reply.body['hosts'];
        const pool = poolSchema.safeParse(reply.body['pool']);
        if (status.state === 'signed-in') {
          const own = Array.isArray(listed)
            ? (listed as unknown[]).find(
                (host) => (host as { id?: unknown } | null)?.id === stored.hostId,
              )
            : undefined;
          const until = z.iso
            .datetime()
            .safeParse((own as { protectedUntil?: unknown } | undefined)?.protectedUntil);
          const { protectedUntil: _previous, ...rest } = status;
          setStatus({
            ...rest,
            ...(pool.success ? { pool: pool.data } : {}),
            ...(until.success ? { protectedUntil: until.data } : {}),
          });
        }
      } catch (error) {
        if (
          !signal.aborted &&
          error instanceof AccountError &&
          (error.issue === 'session-expired' || error.issue === 'session-revoked')
        )
          await revoke(error, current);
        return;
      }
      if (signal.aborted) return;
      const hostId = current.hostId;
      if (
        Array.isArray(listed) &&
        hostId !== undefined &&
        !listed.some((host) => (host as { id?: unknown } | null)?.id === hostId)
      ) {
        record('host-missing', `host=${hostId}`);
        void sync();
      }
    });
  };

  const sync = (): Promise<void> => {
    const signal = attemptAbort.signal;
    return serial(async () => {
      if (signal.aborted || sessionBlocked() || !canResumeSession) return;
      let current: AccountRecord | undefined;
      try {
        current = await read();
        if (signal.aborted) return;
        if (current === undefined) {
          setStatus({ state: 'signed-out' });
          return;
        }
        const access = await refresh(current, signal);
        if (current.hostId === undefined) await link(current, access, signal);
        const port = originPort(connect) ?? (await freePort());
        let tunnel = await requestTunnel(current, access, port, signal);
        if (signal.aborted) return;
        if (tunnel === undefined) {
          delete current.hostId;
          await link(current, access, signal);
          tunnel = await requestTunnel(current, access, port, signal);
        }
        if (signal.aborted) return;
        if (tunnel === undefined)
          throw requestError('relay', 'tunnel', { reason: 'invalid-response', status: 404 });
        const enabled = await connect.enable(tunnel);
        if (!enabled.ok) {
          record('account-connect-error', `operation=enable-tunnel refusal=${enabled.code}`);
          throw new AccountError(
            enabled.code === 'credential-unavailable'
              ? 'credential-unavailable'
              : 'relay-unavailable',
          );
        }
        let reconciled = false;
        try {
          if (signal.aborted) return;
          const bound = originPort(connect);
          if (
            bound !== undefined &&
            bound !== port &&
            (await requestTunnel(current, access, bound, signal)) === undefined
          )
            throw requestError('relay', 'tunnel', { reason: 'invalid-response', status: 404 });
          if (signal.aborted) return;
          reconciled = true;
        } finally {
          if (!reconciled) await connect.disable();
        }
        const becameReady = status.state !== 'signed-in' || status.hostId !== current.hostId;
        setStatus({
          state: 'signed-in',
          ...(current.email ? { email: current.email } : {}),
          ...(current.hostId ? { hostId: current.hostId } : {}),
        });
        if (becameReady && !signal.aborted) options.onReady?.();
      } catch (error) {
        if (!signal.aborted) await revoke(error, current);
      }
    });
  };

  const poll = async (
    signal: AbortSignal,
    id: ConnectClientId,
    deviceCode: string,
    interval: number,
    expires: number,
  ): Promise<void> => {
    let wait = interval;
    const expired = (deadline?: AbortSignal): boolean => {
      if (!deadline?.aborted && Date.now() < expires) return false;
      setStatus({ state: 'error', issue: 'sign-in-expired' });
      record('sign-in-expired');
      return true;
    };
    while (!signal.aborted) {
      try {
        await sleep(Math.min(wait * 1000, Math.max(0, expires - Date.now())), signal);
      } catch (error) {
        if (signal.aborted) return;
        throw error;
      }
      if (signal.aborted) return;
      if (expired()) return;
      let reply: Awaited<ReturnType<typeof post>>;
      const tokenSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(Math.max(1, Math.ceil(expires - Date.now()))),
      ]);
      try {
        reply = await post(
          'device-token',
          TOKEN_ENDPOINT,
          {
            grant_type: DEVICE_GRANT,
            device_code: deviceCode,
            client_id: id,
          },
          tokenSignal,
        );
      } catch {
        wait *= 2;
        continue;
      }
      if (signal.aborted) return;
      if (expired(tokenSignal)) return;
      const error = reply.body['error'];
      if (
        (reply.status >= 500 && (typeof error !== 'string' || !terminalDeviceErrors.has(error))) ||
        (typeof error !== 'string' && (reply.status === 408 || reply.status === 429))
      ) {
        wait *= 2;
        continue;
      }
      if (error === 'authorization_pending') continue;
      if (error === 'slow_down') {
        wait += 5;
        continue;
      }
      const refreshToken = reply.body['refresh_token'];
      if (typeof error === 'string' || !reply.ok || typeof refreshToken !== 'string') {
        const expired = error === 'expired_token';
        setStatus({ state: 'error', issue: expired ? 'sign-in-expired' : 'sign-in-denied' });
        record(
          expired ? 'sign-in-expired' : 'sign-in-failed',
          `error=${typeof error === 'string' ? error : reply.status}`,
        );
        return;
      }
      const email = (reply.body['user'] as { email?: unknown } | undefined)?.email;
      try {
        const saved = await serial(async () => {
          if (signal.aborted) return false;
          const previous = await readStored();
          if (signal.aborted) return false;
          await retireSession(previous);
          if (signal.aborted) return false;
          const current: AccountRecord = {
            kind: 'session',
            relay,
            clientId: id,
            refreshToken,
            ...(typeof email === 'string' ? { email } : {}),
          };
          if (previous?.relay === relay && previous.clientId === id && previous.hostId) {
            const access = reply.body['access_token'];
            if (typeof access !== 'string') throw new AccountError('session-expired');
            const listed = await relayCall(
              'list-hosts',
              'GET',
              '/v1/hosts',
              access,
              undefined,
              undefined,
              signal,
            );
            const hosts = hostListSchema.safeParse(listed.body);
            if (listed.status !== 200 || !hosts.success)
              throw requestError('relay', 'list-hosts', {
                reason: 'invalid-response',
                status: listed.status,
              });
            if (hosts.data.hosts.some((host) => host.id === previous.hostId))
              current.hostId = previous.hostId;
          }
          if (signal.aborted) return false;
          await save(current);
          if (signal.aborted) return false;
          signOutRequested = false;
          canResumeSession = true;
          return true;
        });
        if (!saved || signal.aborted) return;
      } catch (saveError) {
        if (!signal.aborted) fail(saveError);
        return;
      }
      record('signed-in');
      await sync();
      return;
    }
  };

  const startWatch = () => {
    if (shutdown.signal.aborted || watch !== undefined) return;
    watch = setInterval(() => {
      if (sessionBlocked()) return;
      const tunnel = connect.status().state;
      if (
        (status.state === 'signed-in' && (tunnel === 'error' || tunnel === 'off')) ||
        (status.state === 'error' && status.recovery === 'automatic')
      )
        void sync();
      else if (status.state === 'signed-in') void check();
    }, options.watchMs ?? WATCH_MS);
    watch.unref?.();
  };

  const verifyOffer = async (
    body: string,
    signature: string | undefined,
  ): Promise<OfferVerification> => {
    let current: AccountRecord | undefined;
    const generation = attempt;
    if (sessionBlocked() || status.state !== 'signed-in') return { ok: false };
    try {
      current = await read();
    } catch {
      return { ok: false };
    }
    if (
      generation !== attempt ||
      sessionBlocked() ||
      status.state !== 'signed-in' ||
      current?.relayKey === undefined ||
      current.hostId === undefined ||
      current.account === undefined ||
      signature === undefined
    )
      return { ok: false };
    return verifySignedOffer(
      {
        body,
        signature,
        relayKey: current.relayKey,
        hostId: current.hostId,
        account: current.account,
      },
      record,
    );
  };

  const activityCall = (
    body?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ status: number; body: Record<string, unknown> }> =>
    serial(async () => {
      if (signal?.aborted || sessionBlocked() || status.state !== 'signed-in')
        return { status: 503, body: {} };
      const generationSignal = attemptAbort.signal;
      const requestSignal =
        signal === undefined ? generationSignal : AbortSignal.any([signal, generationSignal]);
      try {
        const current = await read();
        requestSignal.throwIfAborted();
        if (!current?.hostId) return { status: 503, body: {} };
        const call = (access: string) => {
          requestSignal.throwIfAborted();
          return relayCall(
            'live-activity',
            body ? 'POST' : 'GET',
            `/v1/hosts/${current.hostId}/live-activity`,
            access,
            body,
            35_000,
            requestSignal,
          );
        };
        try {
          return await call(cached ?? (await refresh(current, generationSignal)));
        } catch (error) {
          if (!(error instanceof AccountError) || error.issue !== 'session-expired') throw error;
          requestSignal.throwIfAborted();
          return await call(await refresh(current, generationSignal));
        }
      } catch {
        return { status: 503, body: {} };
      }
    }, signal).catch(() => ({ status: 503, body: {} }));
  const botNetwork = createConnectBotNetwork({
    fetch: fetcher,
    revoked: () =>
      sessionBlocked() ||
      status.state === 'signed-out' ||
      (status.state === 'error' &&
        (status.issue === 'session-expired' || status.issue === 'session-revoked')),
    session: () =>
      serial(async () => {
        if (sessionBlocked() || status.state !== 'signed-in') return undefined;
        const generation = attempt;
        try {
          const stored = await read();
          if (generation !== attempt || !stored?.hostId || !stored.account || !stored.relayKey)
            return undefined;
          const accessToken = cached ?? (await refresh(stored));
          const localId = stored.hostId;
          return {
            relay,
            accountId: stored.account,
            localId,
            relayKey: stored.relayKey,
            accessToken,
            refresh: () =>
              serial(async () => {
                if (
                  sessionBlocked() ||
                  attempt !== generation ||
                  status.state !== 'signed-in' ||
                  status.hostId !== localId
                )
                  return undefined;
                try {
                  const latest = await read();
                  if (
                    attempt !== generation ||
                    !latest ||
                    latest.hostId !== localId ||
                    latest.account !== stored.account
                  )
                    return undefined;
                  return await refresh(latest);
                } catch (error) {
                  if (
                    error instanceof AccountError &&
                    (error.issue === 'session-expired' || error.issue === 'session-revoked')
                  )
                    await revoke(error, stored);
                  return undefined;
                }
              }),
            current: () =>
              !sessionBlocked() &&
              attempt === generation &&
              status.state === 'signed-in' &&
              status.hostId === localId,
          };
        } catch {
          return undefined;
        }
      }),
  });
  return {
    botNetwork,
    activity: {
      async capability(signal) {
        const result = await activityCall(undefined, signal);
        return result.status === 200 &&
          typeof result.body['bundleIdentifier'] === 'string' &&
          typeof result.body['source'] === 'string'
          ? {
              bundleIdentifier: result.body['bundleIdentifier'],
              ...(typeof result.body['source'] === 'string'
                ? { source: result.body['source'] }
                : {}),
            }
          : undefined;
      },
      call: activityCall,
    },
    status: () => ({ ...status }),
    connectedHosts: (signal) =>
      serial(async (): Promise<ConnectedHostsResult> => {
        if (sessionBlocked()) return { ok: false, code: 'signed-out' };
        const generationSignal = attemptAbort.signal;
        const requestSignal =
          signal === undefined ? generationSignal : AbortSignal.any([signal, generationSignal]);
        let current: AccountRecord | undefined;
        try {
          requestSignal.throwIfAborted();
          current = await read();
          requestSignal.throwIfAborted();
          if (current === undefined) return { ok: false, code: 'signed-out' };
          const access = await refresh(current, generationSignal);
          requestSignal.throwIfAborted();
          const reply = await relayCall(
            'list-hosts',
            'GET',
            '/v1/hosts',
            access,
            undefined,
            undefined,
            requestSignal,
          );
          const parsed = connectedHostsSchema.safeParse(reply.body);
          if (reply.status !== 200 || !parsed.success)
            return { ok: false, code: 'relay-unavailable' };
          return {
            ok: true,
            hosts: parsed.data.hosts.map((host) => ({
              id: host.id,
              name: host.name,
              hostname: host.hostname,
              createdAt: host.createdAt,
              ...(host.connected === undefined ? {} : { connected: host.connected }),
              current: current?.hostId === host.id,
              sessionKnown: host.sessionKnown,
              ...(host.botNetwork === undefined ? {} : { botNetwork: host.botNetwork }),
            })),
          };
        } catch (error) {
          if (
            !generationSignal.aborted &&
            error instanceof AccountError &&
            (error.issue === 'session-expired' || error.issue === 'session-revoked')
          )
            await revoke(error, current);
          return {
            ok: false,
            code: error instanceof AccountError ? error.issue : 'relay-unavailable',
          };
        }
      }, signal).catch((): ConnectedHostsResult => ({ ok: false, code: 'relay-unavailable' })),
    async revokeConnectedHost(hostId) {
      let retryLink = false;
      const result = await serial(async (): Promise<AccountResult> => {
        if (sessionBlocked()) return { ok: false, code: 'signed-out' };
        const generationSignal = attemptAbort.signal;
        let current: AccountRecord | undefined;
        try {
          current = await read();
          if (current === undefined) return { ok: false, code: 'signed-out' };
          if (current.hostId === hostId) return { ok: false, code: 'current-host' };
          if (!hostIdSchema.safeParse(hostId).success || hostId.length > 255)
            return { ok: false, code: 'invalid-host-id' };
          const reply = await relayCall(
            'revoke-host',
            'POST',
            `/v1/hosts/${encodeURIComponent(hostId)}/revoke`,
            await refresh(current, generationSignal),
            undefined,
            undefined,
            generationSignal,
          );
          if (reply.status === 404) return { ok: false, code: 'host-not-found' };
          if (reply.status === 409) {
            const parsed = z
              .object({ error: z.object({ code: z.enum(['current-host', 'session-unknown']) }) })
              .safeParse(reply.body);
            return {
              ok: false,
              code: parsed.success ? parsed.data.error.code : 'relay-unavailable',
            };
          }
          const parsed = revokedHostSchema.safeParse(reply.body);
          if (reply.status !== 200 || !parsed.success)
            return { ok: false, code: 'relay-unavailable' };
          retryLink = status.issue === 'host-limit';
          record(
            'account-host-revoked',
            `sessionKnown=${parsed.data.sessionKnown} sessionRevoked=${parsed.data.sessionRevoked}`,
          );
          return {
            ok: true,
            status: { ...status },
            sessionKnown: parsed.data.sessionKnown,
            sessionRevoked: parsed.data.sessionRevoked,
          };
        } catch (error) {
          if (
            !generationSignal.aborted &&
            error instanceof AccountError &&
            (error.issue === 'session-expired' || error.issue === 'session-revoked')
          )
            await revoke(error, current);
          return {
            ok: false,
            code: error instanceof AccountError ? error.issue : 'relay-unavailable',
          };
        }
      });
      if (result.ok && retryLink) await sync();
      return result.ok ? { ...result, status: { ...status } } : result;
    },
    verifyOffer,
    relationshipSession: () =>
      serial(async () => {
        if (sessionBlocked() || status.state !== 'signed-in') return undefined;
        const generation = attempt;
        const generationSignal = attemptAbort.signal;
        const stored = await read();
        if (!stored?.account || !stored.hostId || !stored.relayKey) return undefined;
        const accountId = stored.account;
        const registrationId = stored.hostId;
        const current = () =>
          !sessionBlocked() &&
          generation === attempt &&
          status.state === 'signed-in' &&
          status.hostId === registrationId;
        if (!current()) return undefined;
        const token = cached ?? (await refresh(stored, generationSignal));
        if (!current()) return undefined;
        return createAccountRelationshipSession({
          accountId,
          registrationId,
          generation: `${relationshipEpoch}:${generation}`,
          signal: generationSignal,
          current,
          token,
          relayCall,
          requestError,
          refreshToken: (signal) =>
            serial(async () => {
              if (!current()) throw new AccountError('session-expired');
              const latest = await read();
              if (
                !current() ||
                !latest ||
                latest.account !== accountId ||
                latest.hostId !== registrationId
              )
                throw new AccountError('session-expired');
              signal.throwIfAborted();
              return refresh(latest, generationSignal);
            }, signal),
        });
      }),
    accessToken: (options) =>
      serial(async () => {
        if (sessionBlocked() || status.state !== 'signed-in') return undefined;
        const signal = attemptAbort.signal;
        try {
          const current = await read();
          if (signal.aborted || current === undefined) return undefined;
          return options?.fresh !== true && cached !== undefined
            ? cached
            : await refresh(current, signal);
        } catch {
          return undefined;
        }
      }),
    async start() {
      startWatch();
      await sync();
    },
    async signIn() {
      if (options.credentials() === undefined) return { ok: false, code: 'credential-unavailable' };
      if (shutdown.signal.aborted) return { ok: false, code: 'relay-unavailable' };
      const signal = advanceAttempt();
      const refuse = (): AccountResult => {
        if (!signal.aborted && status.state === 'signing-in')
          fail(new AccountError('relay-unavailable'));
        return { ok: false, code: 'relay-unavailable' };
      };
      let id: ConnectClientId;
      let reply: Awaited<ReturnType<typeof post>>;
      try {
        id = await clientId(signal);
        const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
        requestSignal.throwIfAborted();
        reply = await post(
          'device-authorization',
          DEVICE_ENDPOINT,
          { client_id: id },
          requestSignal,
        );
        requestSignal.throwIfAborted();
      } catch {
        return refuse();
      }
      if (signal.aborted) return { ok: false, code: 'relay-unavailable' };
      const timing = authorizationTimingSchema.safeParse(reply.body);
      const deviceCode = reply.body['device_code'];
      const userCode = reply.body['user_code'];
      const uri = reply.body['verification_uri_complete'] ?? reply.body['verification_uri'];
      if (
        !reply.ok ||
        !timing.success ||
        typeof deviceCode !== 'string' ||
        typeof userCode !== 'string' ||
        typeof uri !== 'string'
      ) {
        requestError('identity', 'device-authorization', {
          reason: 'invalid-response',
          status: reply.status,
        });
        return refuse();
      }
      const { interval, expires_in: lifetime } = timing.data;
      const expires = Date.now() + lifetime * 1000;
      setStatus({
        state: 'signing-in',
        userCode,
        verificationUri: uri,
        expiresAt: new Date(expires).toISOString(),
      });
      record('sign-in-started');
      startWatch();
      void poll(signal, id, deviceCode, interval, expires);
      return { ok: true, status: { ...status } };
    },
    signOut: () => {
      signOutRequested = true;
      canResumeSession = false;
      cached = undefined;
      advanceAttempt();
      const signal = shutdown.signal;
      return serial(async (): Promise<AccountResult> => {
        let current: AccountRecord | undefined;
        try {
          current = await read();
        } catch {
          return { ok: false, code: 'credential-unavailable' };
        }
        if (current?.hostId !== undefined) {
          try {
            await relayCall(
              'delete-host',
              'DELETE',
              `/v1/hosts/${current.hostId}`,
              await refresh(current, signal),
              undefined,
              undefined,
              signal,
            );
          } catch {
            record('unlink-failed');
          }
        }
        const disabled = await connect.disable();
        if (!disabled.ok) return { ok: false, code: 'credential-unavailable' };
        try {
          await native().deleteRecord(key);
        } catch {
          return { ok: false, code: 'credential-unavailable' };
        }
        setStatus({ state: 'signed-out' });
        record('signed-out');
        return { ok: true, status: { ...status } };
      });
    },
    async close() {
      shutdown.abort();
      advanceAttempt();
      clearInterval(watch);
      watch = undefined;
      await serial(async () => undefined);
    },
  };
}
