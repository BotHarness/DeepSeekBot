import { hostname as osHostname } from 'node:os';
import { createServer, type AddressInfo } from 'node:net';

import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';

import type { DeviceConnect } from './connect.js';

type Credentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;

export const CONNECT_RELAY = 'https://connect.botharness.ai';
const DEVICE_ENDPOINT = 'https://api.workos.com/user_management/authorize/device';
const TOKEN_ENDPOINT = 'https://api.workos.com/user_management/authenticate';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const WATCH_MS = 60_000;

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

export interface ConnectAccount {
  status(): AccountStatus;
  start(): Promise<void>;
  signIn(): Promise<AccountResult>;
  signOut(): Promise<AccountResult>;
  close(): Promise<void>;
}

interface AccountRecord {
  relay: string;
  clientId: string;
  refreshToken: string;
  email?: string;
  hostId?: string;
}

class AccountError extends Error {
  constructor(readonly issue: AccountIssue) {
    super(issue);
  }
}

function parseRecord(payload: unknown): AccountRecord | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const value = payload as Record<string, unknown>;
  if (
    typeof value['relay'] !== 'string' ||
    typeof value['clientId'] !== 'string' ||
    typeof value['refreshToken'] !== 'string'
  )
    return undefined;
  return {
    relay: value['relay'],
    clientId: value['clientId'],
    refreshToken: value['refreshToken'],
    ...(typeof value['email'] === 'string' ? { email: value['email'] } : {}),
    ...(typeof value['hostId'] === 'string' ? { hostId: value['hostId'] } : {}),
  };
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
  const relay = (
    options.relay ??
    process.env['DEEPSEEKBOT_CONNECT_RELAY'] ??
    CONNECT_RELAY
  ).replace(/\/+$/u, '');
  const fetcher = options.fetch ?? fetch;
  const hostName = options.hostName ?? osHostname;
  const freePort = options.freePort ?? freeLoopbackPort;
  const sleep = options.sleep ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  const record = options.record ?? (() => {});
  const { connect } = options;
  let status: AccountStatus = { state: 'signed-out' };
  let attempt = 0;
  let watch: ReturnType<typeof setInterval> | undefined;
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

  const read = async (): Promise<AccountRecord | undefined> => {
    try {
      const stored = await native().readRecord(key);
      return stored?.kind === 'grant' ? parseRecord(stored.payload) : undefined;
    } catch (error) {
      if (error instanceof AccountError) throw error;
      throw new AccountError('credential-unavailable');
    }
  };

  const save = async (next: AccountRecord): Promise<void> => {
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
  ): Promise<{ status: number; body: Record<string, unknown> }> => {
    let response: Response;
    try {
      response = await fetcher(`${relay}${path}`, {
        method,
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
    if (response.status >= 500) throw new AccountError('relay-unavailable');
    return { status: response.status, body: parsed };
  };

  const clientId = async (): Promise<string> => {
    const { status: code, body } = await relayCall('GET', '/v1/config');
    if (
      code !== 200 ||
      typeof body['clientId'] !== 'string' ||
      !/^client_[A-Za-z0-9]+$/u.test(body['clientId']) ||
      body['deviceAuthorizationEndpoint'] !== DEVICE_ENDPOINT ||
      body['tokenEndpoint'] !== TOKEN_ENDPOINT
    )
      throw new AccountError('relay-unavailable');
    return body['clientId'];
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
      if (reply.status >= 400 && reply.status < 500) throw new AccountError('session-expired');
      throw new AccountError('relay-unavailable');
    }
    if (typeof rotated === 'string' && rotated !== current.refreshToken) {
      current.refreshToken = rotated;
      await save(current);
    }
    return access;
  };

  const requestTunnel = async (current: AccountRecord, access: string, port: number) => {
    const reply = await relayCall('POST', `/v1/hosts/${current.hostId ?? ''}/tunnel`, access, {
      originPort: port,
    });
    if (reply.status === 404) return undefined;
    const { hostname, token } = reply.body;
    if (reply.status !== 200 || typeof hostname !== 'string' || typeof token !== 'string')
      throw new AccountError('relay-unavailable');
    return { hostname, token };
  };

  const link = async (current: AccountRecord, access: string): Promise<void> => {
    const reply = await relayCall('POST', '/v1/hosts', access, {
      name: hostName().slice(0, 64) || 'DeepSeekBot',
    });
    const id = (reply.body['host'] as { id?: unknown } | undefined)?.id;
    if (reply.status !== 201 || typeof id !== 'string') throw new AccountError('relay-unavailable');
    current.hostId = id;
    await save(current);
    record('linked', `host=${id}`);
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
        fail(error, current);
      }
    });

  const poll = async (
    run: number,
    id: string,
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
        status = {
          state: 'error',
          issue: error === 'expired_token' ? 'sign-in-expired' : 'sign-in-denied',
        };
        record('sign-in-failed', `error=${typeof error === 'string' ? error : reply.status}`);
        return;
      }
      const email = (reply.body['user'] as { email?: unknown } | undefined)?.email;
      try {
        await save({
          relay,
          clientId: id,
          refreshToken,
          ...(typeof email === 'string' ? { email } : {}),
        });
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
    }, options.watchMs ?? WATCH_MS);
    watch.unref?.();
  };

  return {
    status: () => ({ ...status }),
    async start() {
      startWatch();
      await sync();
    },
    async signIn() {
      if (options.credentials() === undefined) return { ok: false, code: 'credential-unavailable' };
      attempt += 1;
      const run = attempt;
      let id: string;
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
