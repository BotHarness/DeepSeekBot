import { vi } from 'vitest';
import { createConnectAccount } from '../src/devices/connect-account.js';
import type { ConnectStatus, DeviceConnect } from '../src/devices/connect.js';

export const RELAY = 'https://relay.test';

export const CLIENT = 'client_01TEST';

export const RELAY_KEY = 'relay-key-for-hstudioaaaaa';

export const TOKEN = Buffer.from(JSON.stringify({ a: 'a', t: 't', s: 's' })).toString('base64');

export function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export function memoryCredentials() {
  const records = new Map<string, unknown>();
  return {
    records,
    provider: {
      readRecord: async (key: string) => records.get(key) as never,
      modifyRecord: async (key: string, mutate: (current: never) => Promise<unknown>) => {
        const next = await mutate(records.get(key) as never);
        if (next !== undefined) records.set(key, next);
        return records.get(key) as never;
      },
      deleteRecord: async (key: string) => {
        records.delete(key);
      },
    },
  };
}

export function fakeConnect(bindPort = 41001) {
  let status: ConnectStatus = { state: 'off' };
  const enabled: { hostname: string; token: string }[] = [];
  const connect: DeviceConnect = {
    status: () => ({ ...status }),
    route: () => undefined,
    start: async () => {},
    enable: async (input) => {
      enabled.push(input);
      status = {
        state: 'connected',
        hostname: input.hostname,
        origin: `http://127.0.0.1:${bindPort}`,
      };
      return { ok: true, status };
    },
    disable: async () => {
      status = { state: 'off' };
      return { ok: true, status };
    },
    close: async () => {},
  };
  return {
    connect,
    enabled,
    fail: () => (status = { ...status, state: 'error', issue: 'cloudflared-exited' }),
  };
}

export function fakeServices(
  options: {
    pending?: number;
    allowed?: boolean;
    deleted?: { workos: boolean };
    activity?: boolean;
    deviceError?: string;
    userId?: string;
    email?: string;
    hostId?: string;
    maxHosts?: number;
    listStatus?: number;
    listBody?: unknown;
    forgetAfterList?: boolean;
    signer?: boolean;
    onList?: () => Promise<void>;
    refreshExpired?: boolean;
    sessionRevoked?: boolean;
    relayFull?: Record<string, unknown>;
    pool?: Record<string, unknown>;
    protectedUntil?: string;
    offer?: (
      path: string,
      body: Record<string, unknown> | undefined,
      signal: AbortSignal | null | undefined,
    ) => Promise<Response>;
  } = {},
) {
  let pending = options.pending ?? 1;
  let refreshCount = 0;
  const calls: { method: string; path: string; auth?: string; body?: unknown }[] = [];
  const hosts = new Set<string>();
  const owners = new Map<string, string>();
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const raw = typeof init?.body === 'string' ? init.body : undefined;
    const form =
      raw && !raw.startsWith('{') ? Object.fromEntries(new URLSearchParams(raw)) : undefined;
    const body = raw?.startsWith('{') ? (JSON.parse(raw) as Record<string, unknown>) : form;
    const auth = new Headers(init?.headers).get('authorization') ?? undefined;
    calls.push({
      method,
      path: `${url.origin}${url.pathname}`,
      ...(url.search ? { search: url.search } : {}),
      ...(auth ? { auth } : {}),
      ...(body ? { body } : {}),
    });
    if (url.href === 'https://api.workos.com/user_management/authorize/device')
      return Response.json({
        device_code: 'dev-code',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://auth.test/device',
        verification_uri_complete: 'https://auth.test/device?code=ABCD-EFGH',
        interval: 1,
        expires_in: 300,
      });
    if (url.href === 'https://api.workos.com/user_management/authenticate') {
      if (form?.['grant_type'] === 'urn:ietf:params:oauth:grant-type:device_code') {
        if (pending-- > 0)
          return Response.json({ error: 'authorization_pending' }, { status: 400 });
        if (options.deviceError)
          return Response.json({ error: options.deviceError }, { status: 400 });
        return Response.json({
          access_token: 'access-0',
          refresh_token: 'refresh-0',
          user: { id: options.userId ?? 'user_alice', email: options.email ?? 'alice@example.com' },
        });
      }
      if (
        form?.['refresh_token'] === 'revoked' ||
        options.deleted?.workos ||
        options.refreshExpired
      )
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      refreshCount += 1;
      return Response.json({
        access_token: `access-${refreshCount}`,
        refresh_token: `refresh-${refreshCount}`,
      });
    }
    if (url.origin !== RELAY) return new Response('{}', { status: 404 });
    if (url.pathname.endsWith('/offer') && options.offer)
      return options.offer(url.pathname, body, init?.signal);
    if (url.pathname === '/v1/config')
      return Response.json({
        clientId: CLIENT,
        deviceAuthorizationEndpoint: 'https://api.workos.com/user_management/authorize/device',
        tokenEndpoint: 'https://api.workos.com/user_management/authenticate',
        zone: 'deepseekbot.dev',
      });
    if (options.deleted !== undefined)
      return Response.json({ error: { code: 'unauthorized' } }, { status: 401 });
    if (options.allowed === false)
      return Response.json({ error: { code: 'account-not-allowed' } }, { status: 403 });
    if (options.sessionRevoked)
      return Response.json({ error: { code: 'session-revoked' } }, { status: 401 });
    if (url.pathname.endsWith('/revoke') && method === 'POST') {
      const hostId = url.pathname.split('/')[3] ?? '';
      if (!hosts.delete(hostId))
        return Response.json({ error: { code: 'host-not-found' } }, { status: 404 });
      return Response.json({ deleted: true, sessionKnown: true, sessionRevoked: false });
    }
    if (url.pathname === '/v1/hosts' && method === 'GET') {
      await options.onList?.();
      const listed = [...hosts]
        .filter((id) => owners.get(id) === (options.userId ?? 'user_alice'))
        .map((id) => ({
          id,
          ...(options.protectedUntil ? { protectedUntil: options.protectedUntil } : {}),
        }));
      if (options.forgetAfterList) hosts.clear();
      return Response.json(
        options.listBody ?? { hosts: listed, ...(options.pool ? { pool: options.pool } : {}) },
        {
          status: options.listStatus ?? 200,
        },
      );
    }
    if (url.pathname === '/v1/hosts' && method === 'POST') {
      if (hosts.size >= (options.maxHosts ?? Infinity))
        return Response.json({ error: { code: 'host-limit' } }, { status: 409 });
      const hostId = options.hostId ?? 'hstudioaaaaa';
      hosts.add(hostId);
      owners.set(hostId, options.userId ?? 'user_alice');
      return Response.json({ host: { id: hostId } }, { status: 201 });
    }
    if (options.activity && url.pathname === '/v1/hosts/hstudioaaaaa/live-activity')
      return Response.json(
        method === 'GET'
          ? { bundleIdentifier: 'app.deepseekbot.mobile', source: 'Studio' }
          : { handle: 'opaque-handle', expiresAt: Date.now() + 60000 },
      );
    const tunnel = /^\/v1\/hosts\/([^/]+)\/tunnel$/u.exec(url.pathname)?.[1];
    if (tunnel !== undefined) {
      if (!hosts.has(tunnel) || owners.get(tunnel) !== (options.userId ?? 'user_alice'))
        return Response.json({ error: { code: 'host-not-found' } }, { status: 404 });
      if (options.relayFull)
        return Response.json(
          { error: { code: 'relay-full', ...options.relayFull } },
          { status: 503 },
        );
      return Response.json({
        hostname: `${tunnel}.deepseekbot.dev`,
        token: TOKEN,
        ...(options.signer === false
          ? {}
          : {
              account: options.userId ?? 'user_alice',
              relayKey: options.userId ? `${RELAY_KEY}-${options.userId}` : RELAY_KEY,
            }),
      });
    }
    if (method === 'DELETE') {
      hosts.delete(url.pathname.split('/').at(-1) ?? '');
      return Response.json({ deleted: true });
    }
    return new Response('{}', { status: 404 });
  });
  return { fetcher, calls, hosts, owners };
}

export async function settle(account: { status(): { state: string } }) {
  for (let index = 0; index < 50 && account.status().state === 'signing-in'; index += 1)
    await new Promise((done) => setImmediate(done));
}

export function setup(
  services = fakeServices(),
  port = 41001,
  watchMs = 60_000,
  onReady?: () => void,
  record?: Parameters<typeof createConnectAccount>[0]['record'],
  onAccountChanged?: () => void,
) {
  const credentials = memoryCredentials();
  const tunnel = fakeConnect(port);
  const account = createConnectAccount({
    credentials: () => credentials.provider,
    connect: tunnel.connect,
    relay: RELAY,
    fetch: services.fetcher as typeof fetch,
    hostName: () => 'Studio',
    freePort: async () => 41001,
    sleep: async () => {},
    watchMs,
    ...(onReady === undefined ? {} : { onReady }),
    ...(onAccountChanged === undefined ? {} : { onAccountChanged }),
    ...(record === undefined ? {} : { record }),
  });
  return { account, credentials, tunnel, services };
}
