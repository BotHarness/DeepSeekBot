import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { createConnectAccount } from '../src/devices/connect-account.js';
import type { ConnectStatus, DeviceConnect } from '../src/devices/connect.js';
import { runConnectCommand } from '../src/bots/cli-connect.js';

const RELAY = 'https://relay.test';
const CLIENT = 'client_01TEST';
const RELAY_KEY = 'relay-key-for-hstudioaaaaa';
const TOKEN = Buffer.from(JSON.stringify({ a: 'a', t: 't', s: 's' })).toString('base64');

function memoryCredentials() {
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

function fakeConnect(bindPort = 41001) {
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

function fakeServices(options: { pending?: number; allowed?: boolean } = {}) {
  let pending = options.pending ?? 1;
  let refreshCount = 0;
  const calls: { method: string; path: string; auth?: string; body?: unknown }[] = [];
  const hosts = new Set<string>();
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
        return Response.json({
          access_token: 'access-0',
          refresh_token: 'refresh-0',
          user: { id: 'user_alice', email: 'alice@example.com' },
        });
      }
      if (form?.['refresh_token'] === 'revoked')
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      refreshCount += 1;
      return Response.json({
        access_token: `access-${refreshCount}`,
        refresh_token: `refresh-${refreshCount}`,
      });
    }
    if (url.origin !== RELAY) return new Response('{}', { status: 404 });
    if (url.pathname === '/v1/config')
      return Response.json({
        clientId: CLIENT,
        deviceAuthorizationEndpoint: 'https://api.workos.com/user_management/authorize/device',
        tokenEndpoint: 'https://api.workos.com/user_management/authenticate',
        zone: 'deepseekbot.dev',
      });
    if (options.allowed === false)
      return Response.json({ error: { code: 'account-not-allowed' } }, { status: 403 });
    if (url.pathname === '/v1/hosts' && method === 'POST') {
      hosts.add('hstudioaaaaa');
      return Response.json({ host: { id: 'hstudioaaaaa' } }, { status: 201 });
    }
    const tunnel = /^\/v1\/hosts\/([^/]+)\/tunnel$/u.exec(url.pathname)?.[1];
    if (tunnel !== undefined) {
      if (!hosts.has(tunnel))
        return Response.json({ error: { code: 'host-not-found' } }, { status: 404 });
      return Response.json({
        hostname: `${tunnel}.deepseekbot.dev`,
        token: TOKEN,
        account: 'user_alice',
        relayKey: RELAY_KEY,
      });
    }
    if (method === 'DELETE') {
      hosts.delete(url.pathname.split('/').at(-1) ?? '');
      return Response.json({ deleted: true });
    }
    return new Response('{}', { status: 404 });
  });
  return { fetcher, calls, hosts };
}

async function settle(account: { status(): { state: string } }) {
  for (let index = 0; index < 50 && account.status().state === 'signing-in'; index += 1)
    await new Promise((done) => setImmediate(done));
}

function setup(services = fakeServices(), port = 41001) {
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
    watchMs: 60_000,
  });
  return { account, credentials, tunnel, services };
}

describe('Connect account sign-in', () => {
  it('signs in with the device flow, links the Host and enables its tunnel', async () => {
    const { account, credentials, tunnel, services } = setup();
    const started = await account.signIn();
    expect(started).toMatchObject({
      ok: true,
      status: {
        state: 'signing-in',
        userCode: 'ABCD-EFGH',
        verificationUri: 'https://auth.test/device?code=ABCD-EFGH',
      },
    });
    await settle(account);
    expect(account.status()).toEqual({
      state: 'signed-in',
      email: 'alice@example.com',
      hostId: 'hstudioaaaaa',
    });
    expect(tunnel.enabled).toEqual([{ hostname: 'hstudioaaaaa.deepseekbot.dev', token: TOKEN }]);
    const stored = [...credentials.records.values()][0] as { payload: Record<string, unknown> };
    expect(stored.payload).toEqual({
      relay: RELAY,
      clientId: CLIENT,
      refreshToken: 'refresh-1',
      email: 'alice@example.com',
      hostId: 'hstudioaaaaa',
      account: 'user_alice',
      relayKey: RELAY_KEY,
    });
    expect(services.calls.find((call) => call.path.endsWith('/authorize/device'))?.body).toEqual({
      client_id: CLIENT,
    });
    expect(services.calls.filter((call) => call.path === `${RELAY}/v1/hosts`)[0]).toMatchObject({
      auth: 'Bearer access-1',
      body: { name: 'Studio' },
    });
    expect(services.calls.find((call) => call.path.endsWith('/tunnel'))?.body).toEqual({
      originPort: 41001,
    });
    await account.close();
  });

  it('accepts only fresh offers the relay signed for this Host and account', async () => {
    const { account } = setup(fakeServices({ pending: 0 }));
    const verifierHash = Buffer.alloc(32, 3).toString('base64url');
    const sign = (payload: Record<string, unknown>, key = RELAY_KEY) => {
      const body = JSON.stringify(payload);
      return { body, signature: createHmac('sha256', key).update(body).digest('base64url') };
    };
    const fresh = {
      hostId: 'hstudioaaaaa',
      account: 'user_alice',
      verifierHash,
      name: 'iPhone',
      issuedAt: new Date().toISOString(),
    };
    const unlinked = sign(fresh);
    expect(await account.verifyOffer(unlinked.body, unlinked.signature)).toEqual({ ok: false });
    await account.signIn();
    await settle(account);
    const good = sign(fresh);
    expect(await account.verifyOffer(good.body, good.signature)).toEqual({
      ok: true,
      verifierHash,
      name: 'iPhone',
    });
    for (const forged of [
      sign(fresh, 'other-key'),
      sign({ ...fresh, hostId: 'hotheraaaaaa' }),
      sign({ ...fresh, account: 'user_bob' }),
      sign({ ...fresh, issuedAt: new Date(Date.now() - 120_000).toISOString() }),
      sign({ ...fresh, verifierHash: 'short' }),
    ])
      expect(await account.verifyOffer(forged.body, forged.signature)).toEqual({ ok: false });
    expect(await account.verifyOffer(good.body, undefined)).toEqual({ ok: false });
    expect(await account.verifyOffer(`${good.body} `, good.signature)).toEqual({ ok: false });
    await account.close();
  });

  it('tells the relay the bound origin port when Connect picked another one', async () => {
    const { account, services } = setup(fakeServices({ pending: 0 }), 52000);
    await account.signIn();
    await settle(account);
    expect(
      services.calls.filter((call) => call.path.endsWith('/tunnel')).map((call) => call.body),
    ).toEqual([{ originPort: 41001 }, { originPort: 52000 }]);
    await account.close();
  });

  it('reports a refused account without enabling the tunnel', async () => {
    const { account, tunnel } = setup(fakeServices({ pending: 0, allowed: false }));
    await account.signIn();
    await settle(account);
    expect(account.status()).toMatchObject({ state: 'error', issue: 'account-not-allowed' });
    expect(tunnel.enabled).toEqual([]);
    await account.close();
  });
});

describe('Connect account lifecycle', () => {
  it('resumes from the stored session, relinks a Host the relay forgot, and signs out', async () => {
    const services = fakeServices({ pending: 0 });
    const first = setup(services);
    await first.account.signIn();
    await settle(first.account);
    await first.account.close();

    services.hosts.clear();
    const credentials = first.credentials;
    const tunnel = fakeConnect();
    const second = createConnectAccount({
      credentials: () => credentials.provider,
      connect: tunnel.connect,
      relay: RELAY,
      fetch: services.fetcher as typeof fetch,
      hostName: () => 'Studio',
      freePort: async () => 41001,
      sleep: async () => {},
    });
    await second.start();
    expect(second.status()).toMatchObject({ state: 'signed-in', hostId: 'hstudioaaaaa' });
    expect(tunnel.enabled).toHaveLength(1);
    expect(services.calls.filter((call) => call.path === `${RELAY}/v1/hosts`)).toHaveLength(2);

    expect(await second.signOut()).toEqual({ ok: true, status: { state: 'signed-out' } });
    expect(services.calls.at(-1)).toMatchObject({
      method: 'DELETE',
      path: `${RELAY}/v1/hosts/hstudioaaaaa`,
    });
    expect(tunnel.connect.status()).toEqual({ state: 'off' });
    expect(credentials.records.size).toBe(0);
    await second.close();
  });

  it('marks a revoked session expired and never trusts a relay that redirects sign-in', async () => {
    const { account, credentials } = setup(fakeServices({ pending: 0 }));
    await account.signIn();
    await settle(account);
    const [key, value] = [...credentials.records.entries()][0]!;
    credentials.records.set(key, {
      ...(value as object),
      payload: { ...(value as { payload: object }).payload, refreshToken: 'revoked' },
    });
    await account.start();
    expect(account.status()).toMatchObject({ state: 'error', issue: 'session-expired' });
    await account.close();

    const hostile = vi.fn(async () =>
      Response.json({
        clientId: CLIENT,
        deviceAuthorizationEndpoint: 'https://evil.test/device',
        tokenEndpoint: 'https://evil.test/token',
      }),
    );
    const other = createConnectAccount({
      credentials: () => memoryCredentials().provider,
      connect: fakeConnect().connect,
      relay: RELAY,
      fetch: hostile as typeof fetch,
    });
    expect(await other.signIn()).toEqual({ ok: false, code: 'relay-unavailable' });
    expect(hostile).toHaveBeenCalledTimes(1);
  });
});

describe('connect sign-in CLI', () => {
  it('prints the code and waits for the Host to finish signing in', async () => {
    const replies = [
      {
        state: 'signing-in',
        userCode: 'ABCD',
        verificationUri: 'https://auth.test/d',
        expiresAt: '2999-01-01T00:00:00Z',
      },
      { connect: { state: 'starting', account: { state: 'signing-in' } } },
      { connect: { state: 'connected', account: { state: 'signed-in', email: 'a@b.c' } } },
    ];
    const http = vi.fn(async () => ({
      bytes: new TextEncoder().encode(JSON.stringify(replies.shift())),
    }));
    const stderr = vi.fn();
    expect(
      await runConnectCommand(
        'connect-sign-in',
        [],
        { wait: true },
        { stderr },
        async () => ({ http }),
        async () => {},
      ),
    ).toEqual({ connect: { state: 'connected', account: { state: 'signed-in', email: 'a@b.c' } } });
    expect(http.mock.calls[0]).toEqual(['/api/botharness/devices/connect', { action: 'sign-in' }]);
    expect(stderr).toHaveBeenCalledWith('Open https://auth.test/d and confirm code ABCD\n');
    await expect(
      runConnectCommand('connect-status', [], { wait: true }, {}, async () => ({ http })),
    ).rejects.toMatchObject({ code: 'usage' });
  });
});
