import type { ActivityProvider } from '../live-activity/contract.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { hostname as osHostname } from 'node:os';
import { createServer, type AddressInfo } from 'node:net';

import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { z } from 'zod';

import type { DeviceConnect } from './connect.js';

type Credentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;

export const CONNECT_RELAY = 'https://connect.botharness.ai';
const DEVICE_ENDPOINT = 'https://api.workos.com/user_management/authorize/device';
const TOKEN_ENDPOINT = 'https://api.workos.com/user_management/authenticate';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const WATCH_MS = 60_000;
const OFFER_FRESH_MS = 60_000;
const VERIFIER_HASH = /^[A-Za-z0-9_-]{43}$/u;

export type AccountIssue =
  | 'relay-unavailable'
  | 'sign-in-denied'
  | 'sign-in-expired'
  | 'session-expired'
  | 'account-not-allowed'
  | 'host-limit'
  | 'credential-unavailable';

export interface AccountStatus {
  state: 'signed-out' | 'signing-in' | 'signed-in' | 'error';
  email?: string;
  hostId?: string;
  userCode?: string;
  verificationUri?: string;
  expiresAt?: string;
  issue?: AccountIssue;
}

export type AccountResult =
  | { ok: true; status: AccountStatus }
  | { ok: false; code: 'credential-unavailable' | 'relay-unavailable' };

export type OfferVerification = { ok: true; verifierHash: string; name?: string } | { ok: false };

export interface ConnectAccount {
  activity: ActivityProvider;
  status(): AccountStatus;
  verifyOffer(body: string, signature: string | undefined): Promise<OfferVerification>;
  accessToken(options?: { fresh?: boolean }): Promise<string | undefined>;
  start(): Promise<void>;
  signIn(): Promise<AccountResult>;
  signOut(): Promise<AccountResult>;
  close(): Promise<void>;
}

const relaySchema = z.string().url().brand<'ConnectRelay'>();
const clientIdSchema = z
  .string()
  .regex(/^client_[A-Za-z0-9]+$/u)
  .brand<'ConnectClientId'>();
const hostIdSchema = z.string().min(1).brand<'ConnectHostId'>();
const registrationSchema = z.object({
  kind: z.literal('registration').default('registration'),
  relay: relaySchema,
  clientId: clientIdSchema,
  hostId: hostIdSchema,
});
const sessionSchema = registrationSchema.omit({ hostId: true }).extend({
  kind: z.literal('session').default('session'),
  refreshToken: z.string(),
  email: z.string().optional(),
  hostId: hostIdSchema.optional(),
  account: z.string().optional(),
  relayKey: z.string().optional(),
});
const storedAccountSchema = z.union([sessionSchema, registrationSchema]);
const hostListSchema = z.object({ hosts: z.array(z.object({ id: hostIdSchema })) });
type AccountRecord = z.infer<typeof sessionSchema>;
type StoredAccount = z.infer<typeof storedAccountSchema>;
type ConnectClientId = z.infer<typeof clientIdSchema>;

class AccountError extends Error {
  constructor(readonly issue: AccountIssue) {
    super(issue);
  }
}

export function freeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

function originPort(connect: DeviceConnect): number | undefined {
  const origin = connect.status().origin;
  if (origin === undefined) return undefined;
  const port = Number(new URL(origin).port);
  return Number.isInteger(port) && port > 0 ? port : undefined;
}

export function createConnectAccount(options: {
  credentials: () => Credentials | undefined;
  connect: DeviceConnect;
  relay?: string;
  fetch?: typeof fetch;
  hostName?: () => string;
  freePort?: () => Promise<number>;
  sleep?: (ms: number) => Promise<void>;
  watchMs?: number;
  record?: (phase: string, detail?: string) => void;
}): ConnectAccount {
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
  const sleep = options.sleep ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  const record = options.record ?? (() => {});
  const { connect } = options;
  let status: AccountStatus = { state: 'signed-out' };
  let attempt = 0;
  let watch: ReturnType<typeof setInterval> | undefined;
  let cached: string | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };

  const native = (): Credentials => {
    const provider = options.credentials();
    if (provider === undefined) throw new AccountError('credential-unavailable');
    return provider;
  };

  const readStored = async (): Promise<StoredAccount | undefined> => {
    try {
      const stored = await native().readRecord(key);
      return stored?.kind === 'grant'
        ? storedAccountSchema.safeParse(stored.payload).data
        : undefined;
    } catch (error) {
      if (error instanceof AccountError) throw error;
      throw new AccountError('credential-unavailable');
    }
  };

  const read = async (): Promise<AccountRecord | undefined> => {
    const current = await readStored();
    return current?.kind === 'session' ? current : undefined;
  };

  const save = async (next: StoredAccount): Promise<void> => {
    try {
      await native().modifyRecord(key, async () => ({ kind: 'grant', payload: { ...next } }));
    } catch {
      throw new AccountError('credential-unavailable');
    }
  };

  const post = async (url: string, body: Record<string, string>) => {
    let response: Response;
    try {
      response = await fetcher(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString(),
      });
    } catch {
      throw new AccountError('relay-unavailable');
    }
    const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, body: parsed };
  };

  const relayCall = async (
    method: string,
    path: string,
    accessToken?: string,
    body?: unknown,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<{ status: number; body: Record<string, unknown> }> => {
    let response: Response;
    try {
      response = await fetcher(`${relay}${path}`, {
        method,
        ...(timeoutMs === undefined
          ? {}
          : {
              signal: signal
                ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
                : AbortSignal.timeout(timeoutMs),
            }),
        headers: {
          ...(accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` }),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new AccountError('relay-unavailable');
    }
    const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const code = (parsed['error'] as { code?: unknown } | undefined)?.code;
    if (response.status === 401) throw new AccountError('session-expired');
    if (code === 'account-not-allowed') throw new AccountError('account-not-allowed');
    if (code === 'host-limit') throw new AccountError('host-limit');
    if (response.status >= 500 || response.status === 429)
      throw new AccountError('relay-unavailable');
    return { status: response.status, body: parsed };
  };

  const clientId = async (): Promise<ConnectClientId> => {
    const { status: code, body } = await relayCall('GET', '/v1/config');
    const parsed = clientIdSchema.safeParse(body['clientId']);
    if (
      code !== 200 ||
      !parsed.success ||
      body['deviceAuthorizationEndpoint'] !== DEVICE_ENDPOINT ||
      body['tokenEndpoint'] !== TOKEN_ENDPOINT
    )
      throw new AccountError('relay-unavailable');
    return parsed.data;
  };

  const refresh = async (current: AccountRecord): Promise<string> => {
    const reply = await post(TOKEN_ENDPOINT, {
      grant_type: 'refresh_token',
      client_id: current.clientId,
      refresh_token: current.refreshToken,
    });
    const access = reply.body['access_token'];
    const rotated = reply.body['refresh_token'];
    if (!reply.ok || typeof access !== 'string') {
      if (reply.status >= 400 && reply.status < 500 && reply.status !== 408 && reply.status !== 429)
        throw new AccountError('session-expired');
      throw new AccountError('relay-unavailable');
    }
    if (typeof rotated === 'string' && rotated !== current.refreshToken) {
      current.refreshToken = rotated;
      await save(current);
    }
    cached = access;
    return access;
  };

  const requestTunnel = async (current: AccountRecord, access: string, port: number) => {
    const reply = await relayCall('POST', `/v1/hosts/${current.hostId ?? ''}/tunnel`, access, {
      originPort: port,
    });
    if (reply.status === 404) return undefined;
    const { hostname, token, account, relayKey } = reply.body;
    if (reply.status !== 200 || typeof hostname !== 'string' || typeof token !== 'string')
      throw new AccountError('relay-unavailable');
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

  const link = async (current: AccountRecord, access: string): Promise<void> => {
    const reply = await relayCall('POST', '/v1/hosts', access, {
      name: hostName().slice(0, 64) || 'Tobs',
    });
    const host = z.object({ id: hostIdSchema }).safeParse(reply.body['host']);
    if (reply.status !== 201 || !host.success) throw new AccountError('relay-unavailable');
    current.hostId = host.data.id;
    await save(current);
    record('linked', `host=${host.data.id}`);
  };

  const fail = (error: unknown, current?: AccountRecord): void => {
    const issue = error instanceof AccountError ? error.issue : 'relay-unavailable';
    status = {
      state: 'error',
      issue,
      ...(current?.email ? { email: current.email } : {}),
      ...(current?.hostId ? { hostId: current.hostId } : {}),
    };
    record('account-error', `issue=${issue}`);
  };

  const revoke = async (error: unknown, current?: AccountRecord): Promise<void> => {
    fail(error, current);
    if (!(error instanceof AccountError) || error.issue !== 'session-expired') return;
    attempt += 1;
    cached = undefined;
    await connect.disable();
    try {
      if (current?.hostId !== undefined)
        await save({
          kind: 'registration',
          relay: current.relay,
          clientId: current.clientId,
          hostId: current.hostId,
        });
      else await native().deleteRecord(key);
    } catch {
      record('revoke-failed');
      return;
    }
    record('revoked');
  };

  const check = (): Promise<void> =>
    serial(async () => {
      if (status.state !== 'signed-in') return;
      let current: AccountRecord | undefined;
      let listed: unknown;
      try {
        current = await read();
        if (current === undefined) {
          await connect.disable();
          status = { state: 'signed-out' };
          return;
        }
        const stored = current;
        const hosts = (token: string) => relayCall('GET', '/v1/hosts', token);
        const fresh = async () => hosts(await refresh(stored));
        const reply =
          cached === undefined
            ? await fresh()
            : await hosts(cached).catch((error: unknown) => {
                if (error instanceof AccountError && error.issue === 'session-expired')
                  return fresh();
                throw error;
              });
        listed = reply.body['hosts'];
      } catch (error) {
        if (error instanceof AccountError && error.issue === 'session-expired')
          await revoke(error, current);
        return;
      }
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

  const sync = (): Promise<void> =>
    serial(async () => {
      let current: AccountRecord | undefined;
      try {
        current = await read();
        if (current === undefined) {
          status = { state: 'signed-out' };
          return;
        }
        const access = await refresh(current);
        if (current.hostId === undefined) await link(current, access);
        const port = originPort(connect) ?? (await freePort());
        let tunnel = await requestTunnel(current, access, port);
        if (tunnel === undefined) {
          delete current.hostId;
          await link(current, access);
          tunnel = await requestTunnel(current, access, port);
        }
        if (tunnel === undefined) throw new AccountError('relay-unavailable');
        const enabled = await connect.enable(tunnel);
        if (!enabled.ok)
          throw new AccountError(
            enabled.code === 'credential-unavailable'
              ? 'credential-unavailable'
              : 'relay-unavailable',
          );
        const bound = originPort(connect);
        if (bound !== undefined && bound !== port) await requestTunnel(current, access, bound);
        status = {
          state: 'signed-in',
          ...(current.email ? { email: current.email } : {}),
          ...(current.hostId ? { hostId: current.hostId } : {}),
        };
      } catch (error) {
        await revoke(error, current);
      }
    });

  const poll = async (
    run: number,
    id: ConnectClientId,
    deviceCode: string,
    interval: number,
    expires: number,
  ): Promise<void> => {
    let wait = interval;
    while (run === attempt) {
      await sleep(wait * 1000);
      if (run !== attempt) return;
      if (Date.now() > expires) {
        status = { state: 'error', issue: 'sign-in-expired' };
        record('sign-in-expired');
        return;
      }
      let reply: Awaited<ReturnType<typeof post>>;
      try {
        reply = await post(TOKEN_ENDPOINT, {
          grant_type: DEVICE_GRANT,
          device_code: deviceCode,
          client_id: id,
        });
      } catch {
        continue;
      }
      if (run !== attempt) return;
      const error = reply.body['error'];
      if (error === 'authorization_pending') continue;
      if (error === 'slow_down') {
        wait += 5;
        continue;
      }
      const refreshToken = reply.body['refresh_token'];
      if (!reply.ok || typeof refreshToken !== 'string') {
        const expired = error === 'expired_token';
        status = { state: 'error', issue: expired ? 'sign-in-expired' : 'sign-in-denied' };
        record(
          expired ? 'sign-in-expired' : 'sign-in-failed',
          `error=${typeof error === 'string' ? error : reply.status}`,
        );
        return;
      }
      const email = (reply.body['user'] as { email?: unknown } | undefined)?.email;
      try {
        const saved = await serial(async () => {
          if (run !== attempt) return false;
          const previous = await readStored();
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
            const listed = await relayCall('GET', '/v1/hosts', access);
            const hosts = hostListSchema.safeParse(listed.body);
            if (listed.status !== 200 || !hosts.success)
              throw new AccountError('relay-unavailable');
            if (hosts.data.hosts.some((host) => host.id === previous.hostId))
              current.hostId = previous.hostId;
          }
          if (run !== attempt) return false;
          if (current.hostId === undefined) await connect.disable();
          cached = undefined;
          await save(current);
          return true;
        });
        if (!saved) return;
      } catch (saveError) {
        fail(saveError);
        return;
      }
      record('signed-in');
      await sync();
      return;
    }
  };

  const startWatch = () => {
    if (watch !== undefined) return;
    watch = setInterval(() => {
      const tunnel = connect.status().state;
      if (
        (status.state === 'signed-in' && (tunnel === 'error' || tunnel === 'off')) ||
        (status.state === 'error' && status.issue === 'relay-unavailable')
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
    try {
      current = await read();
    } catch {
      return { ok: false };
    }
    if (
      current?.relayKey === undefined ||
      current.hostId === undefined ||
      current.account === undefined ||
      signature === undefined
    )
      return { ok: false };
    const expected = createHmac('sha256', current.relayKey).update(body).digest();
    const presented = Buffer.from(signature, 'base64url');
    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
      record('offer-refused', 'reason=signature');
      return { ok: false };
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return { ok: false };
    }
    const issuedAt =
      typeof payload['issuedAt'] === 'string' ? Date.parse(payload['issuedAt']) : NaN;
    const { verifierHash, name } = payload;
    if (
      payload['hostId'] !== current.hostId ||
      payload['account'] !== current.account ||
      !(Math.abs(Date.now() - issuedAt) <= OFFER_FRESH_MS) ||
      typeof verifierHash !== 'string' ||
      !VERIFIER_HASH.test(verifierHash) ||
      (name !== undefined && typeof name !== 'string')
    ) {
      record('offer-refused', 'reason=payload');
      return { ok: false };
    }
    record('offer-signed');
    return { ok: true, verifierHash, ...(typeof name === 'string' ? { name } : {}) };
  };

  const activityCall = (body?: Record<string, unknown>, signal?: AbortSignal) =>
    serial(async () => {
      if (signal?.aborted || status.state !== 'signed-in') return { status: 503, body: {} };
      try {
        const current = await read();
        if (!current?.hostId) return { status: 503, body: {} };
        const call = (access: string) =>
          relayCall(
            body ? 'POST' : 'GET',
            `/v1/hosts/${current.hostId}/live-activity`,
            access,
            body,
            35_000,
            signal,
          );
        try {
          return await call(cached ?? (await refresh(current)));
        } catch (error) {
          if (!(error instanceof AccountError) || error.issue !== 'session-expired') throw error;
          return await call(await refresh(current));
        }
      } catch {
        return { status: 503, body: {} };
      }
    });
  return {
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
    verifyOffer,
    accessToken: (options) =>
      serial(async () => {
        if (status.state !== 'signed-in') return undefined;
        try {
          const current = await read();
          if (current === undefined) return undefined;
          return options?.fresh !== true && cached !== undefined ? cached : await refresh(current);
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
      attempt += 1;
      const run = attempt;
      let id: ConnectClientId;
      let reply: Awaited<ReturnType<typeof post>>;
      try {
        id = await clientId();
        reply = await post(DEVICE_ENDPOINT, { client_id: id });
      } catch {
        return { ok: false, code: 'relay-unavailable' };
      }
      const deviceCode = reply.body['device_code'];
      const userCode = reply.body['user_code'];
      const uri = reply.body['verification_uri_complete'] ?? reply.body['verification_uri'];
      if (
        !reply.ok ||
        typeof deviceCode !== 'string' ||
        typeof userCode !== 'string' ||
        typeof uri !== 'string'
      )
        return { ok: false, code: 'relay-unavailable' };
      const interval = Number(reply.body['interval']) > 0 ? Number(reply.body['interval']) : 5;
      const lifetime =
        Number(reply.body['expires_in']) > 0 ? Number(reply.body['expires_in']) : 300;
      const expires = Date.now() + lifetime * 1000;
      status = {
        state: 'signing-in',
        userCode,
        verificationUri: uri,
        expiresAt: new Date(expires).toISOString(),
      };
      record('sign-in-started');
      startWatch();
      void poll(run, id, deviceCode, interval, expires);
      return { ok: true, status: { ...status } };
    },
    signOut: () =>
      serial(async (): Promise<AccountResult> => {
        attempt += 1;
        let current: AccountRecord | undefined;
        try {
          current = await read();
        } catch {
          return { ok: false, code: 'credential-unavailable' };
        }
        if (current?.hostId !== undefined) {
          try {
            await relayCall('DELETE', `/v1/hosts/${current.hostId}`, await refresh(current));
          } catch {
            record('unlink-failed');
          }
        }
        await connect.disable();
        try {
          await native().deleteRecord(key);
        } catch {
          return { ok: false, code: 'credential-unavailable' };
        }
        status = { state: 'signed-out' };
        record('signed-out');
        return { ok: true, status: { ...status } };
      }),
    async close() {
      attempt += 1;
      clearInterval(watch);
      watch = undefined;
      await serial(async () => undefined);
    },
  };
}
