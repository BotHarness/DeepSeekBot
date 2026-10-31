import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { createConnectAccount } from '../src/devices/connect-account.js';
import type { ConnectStatus, DeviceConnect } from '../src/devices/connect.js';
import { runConnectCommand } from '../src/bots/cli-connect.js';

const RELAY = 'https://relay.test';
const CLIENT = 'client_01TEST';
const RELAY_KEY = 'relay-key-for-hstudioaaaaa';
const TOKEN = Buffer.from(JSON.stringify({ a: 'a', t: 't', s: 's' })).toString('base64');

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

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

function fakeServices(
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
    if (url.pathname === '/v1/hosts' && method === 'GET') {
      await options.onList?.();
      const listed = [...hosts]
        .filter((id) => owners.get(id) === (options.userId ?? 'user_alice'))
        .map((id) => ({ id }));
      if (options.forgetAfterList) hosts.clear();
      return Response.json(options.listBody ?? { hosts: listed }, {
        status: options.listStatus ?? 200,
      });
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
  return { fetcher, calls, hosts };
}

async function settle(account: { status(): { state: string } }) {
  for (let index = 0; index < 50 && account.status().state === 'signing-in'; index += 1)
    await new Promise((done) => setImmediate(done));
}

function setup(services = fakeServices(), port = 41001, watchMs = 60_000) {
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
  });
  return { account, credentials, tunnel, services };
}

describe('Connect account sign-in', () => {
  it('does not register another computer when signing in again on the same Host', async () => {
    const { account, services } = setup(fakeServices({ pending: 0 }));
    try {
      await account.signIn();
      await settle(account);
      await account.start();
      expect(account.status().state).toBe('signed-in');
      await account.signIn();
      await settle(account);
      await account.start();
      expect(account.status().state).toBe('signed-in');
      expect(
        services.calls.filter(
          (call) => call.path === `${RELAY}/v1/hosts` && call.method === 'POST',
        ),
      ).toHaveLength(1);
    } finally {
      await account.close();
    }
  });

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
      kind: 'session',
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

  it('reports an expired device code as an expired sign-in, not a denied one', async () => {
    for (const [deviceError, issue, phase] of [
      ['expired_token', 'sign-in-expired', 'sign-in-expired'],
      ['access_denied', 'sign-in-denied', 'sign-in-failed'],
    ] as const) {
      const phases: string[] = [];
      const services = fakeServices({ pending: 0, deviceError });
      const account = createConnectAccount({
        credentials: () => memoryCredentials().provider,
        connect: fakeConnect(41001).connect,
        relay: RELAY,
        fetch: services.fetcher as typeof fetch,
        hostName: () => 'Studio',
        freePort: async () => 41001,
        sleep: async () => {},
        record: (next) => void phases.push(next),
      });
      await account.signIn();
      await settle(account);
      expect(account.status()).toMatchObject({ state: 'error', issue });
      expect(phases).toContain(phase);
      expect(phases).not.toContain(
        phase === 'sign-in-expired' ? 'sign-in-failed' : 'sign-in-expired',
      );
      await account.close();
    }
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
  it('recovers the same registration after an expired session has been revoked locally', async () => {
    const options = { pending: 0, maxHosts: 1, refreshExpired: false };
    const services = fakeServices(options);
    const { account, credentials, tunnel } = setup(services);
    try {
      await account.signIn();
      await settle(account);
      options.refreshExpired = true;
      await account.start();
      expect(account.status()).toMatchObject({ state: 'error', issue: 'session-expired' });
      expect(tunnel.connect.status()).toEqual({ state: 'off' });
      for (const stored of credentials.records.values()) {
        expect(stored).not.toHaveProperty('payload.refreshToken');
        expect(stored).not.toHaveProperty('payload.relayKey');
      }
      options.refreshExpired = false;
      await account.close();
      const restored = createConnectAccount({
        credentials: () => credentials.provider,
        connect: tunnel.connect,
        relay: RELAY,
        fetch: services.fetcher,
        sleep: async () => {},
        freePort: async () => 41001,
      });
      try {
        await restored.start();
        expect(restored.status()).toEqual({ state: 'signed-out' });
        expect(await restored.accessToken()).toBeUndefined();
        await restored.signIn();
        await settle(restored);
        expect(restored.status()).toMatchObject({ state: 'signed-in', hostId: 'hstudioaaaaa' });
      } finally {
        await restored.close();
      }
      expect(
        services.calls.filter(
          (call) => call.method === 'POST' && call.path === `${RELAY}/v1/hosts`,
        ),
      ).toHaveLength(1);
    } finally {
      await account.close();
    }
  });

  it('removes even the registration reference on explicit sign-out after expiry', async () => {
    const options = { pending: 0, refreshExpired: false };
    const { account, credentials } = setup(fakeServices(options));
    try {
      await account.signIn();
      await settle(account);
      options.refreshExpired = true;
      await account.start();
      expect(account.status()).toMatchObject({ state: 'error', issue: 'session-expired' });
      await account.signOut();
      expect(account.status()).toEqual({ state: 'signed-out' });
      expect(credentials.records.size).toBe(0);
    } finally {
      await account.close();
    }
  });

  it('does not save a late re-login after the account owner closes', async () => {
    const options: NonNullable<Parameters<typeof fakeServices>[0]> = { pending: 0 };
    const services = fakeServices(options);
    const { account, credentials, tunnel } = setup(services);
    const checking = deferred();
    const proceed = deferred();
    try {
      await account.signIn();
      await settle(account);
      options.onList = async () => {
        checking.resolve();
        await proceed.promise;
      };
      await account.signIn();
      await checking.promise;
      const closing = account.close();
      proceed.resolve();
      await closing;
      expect([...credentials.records.values()]).toEqual([
        {
          kind: 'grant',
          payload: { kind: 'registration', relay: RELAY, clientId: CLIENT, hostId: 'hstudioaaaaa' },
        },
      ]);
      expect(tunnel.enabled).toHaveLength(1);
      expect(tunnel.connect.status()).toEqual({ state: 'off' });
    } finally {
      proceed.resolve();
      await account.close();
    }
  });

  it('retains the registration after a device authorization expires and a later attempt succeeds', async () => {
    const options = { pending: 0, deviceError: '' };
    const services = fakeServices(options);
    const { account, credentials } = setup(services);
    try {
      await account.signIn();
      await settle(account);
      const original = [...credentials.records.values()];
      options.deviceError = 'expired_token';
      await account.signIn();
      await settle(account);
      expect(account.status()).toMatchObject({ state: 'error', issue: 'sign-in-expired' });
      expect([...credentials.records.values()]).toEqual(original);
      options.deviceError = '';
      await account.signIn();
      await settle(account);
      expect(account.status()).toMatchObject({ state: 'signed-in', hostId: 'hstudioaaaaa' });
      expect(
        services.calls.filter(
          (call) => call.method === 'POST' && call.path === `${RELAY}/v1/hosts`,
        ),
      ).toHaveLength(1);
    } finally {
      await account.close();
    }
  });

  it('reuses the owned registration at full quota with the newly authorized token', async () => {
    const services = fakeServices({ pending: 0, maxHosts: 1 });
    const { account, tunnel } = setup(services);
    try {
      await account.signIn();
      await settle(account);
      const first = account.status();
      const before = services.calls.length;
      await account.signIn();
      await settle(account);
      expect(account.status()).toEqual(first);
      expect(services.hosts.size).toBe(1);
      expect(tunnel.enabled).toHaveLength(2);
      const calls = services.calls.slice(before);
      expect(calls.find((call) => call.path === `${RELAY}/v1/hosts`)).toMatchObject({
        method: 'GET',
        auth: 'Bearer access-0',
      });
      expect(
        calls.some((call) => call.method === 'POST' && call.path === `${RELAY}/v1/hosts`),
      ).toBe(false);
    } finally {
      await account.close();
    }
  });

  for (const sameEmail of [true, false])
    it(`does not reuse another account's Host or signer (${sameEmail ? 'same' : 'different'} email)`, async () => {
      const options = {
        pending: 0,
        userId: 'user_alice',
        email: 'alice@example.com',
        hostId: 'hstudioaaaaa',
      };
      const services = fakeServices(options);
      const { account, credentials, tunnel } = setup(services);
      try {
        await account.signIn();
        await settle(account);
        const before = services.calls.length;
        options.userId = 'user_bob';
        options.email = sameEmail ? 'alice@example.com' : 'bob@example.com';
        options.hostId = 'hstudiobbbbb';
        await account.signIn();
        await settle(account);
        expect(account.status()).toMatchObject({ state: 'signed-in', hostId: 'hstudiobbbbb' });
        expect(services.hosts.size).toBe(2);
        expect(
          services.calls.slice(before).some((call) => call.path.includes('/hstudioaaaaa')),
        ).toBe(false);
        expect([...credentials.records.values()]).toEqual([
          {
            kind: 'grant',
            payload: {
              kind: 'session',
              relay: RELAY,
              clientId: CLIENT,
              refreshToken: 'refresh-2',
              email: options.email,
              hostId: 'hstudiobbbbb',
              account: 'user_bob',
              relayKey: `${RELAY_KEY}-user_bob`,
            },
          },
        ]);
        expect(tunnel.enabled.at(-1)?.hostname).toBe('hstudiobbbbb.deepseekbot.dev');
        expect(services.calls.some((call) => call.method === 'DELETE')).toBe(false);
      } finally {
        await account.close();
      }
    });

  for (const forgetAfterList of [true, false])
    it(`registers again when the Host is deleted ${forgetAfterList ? 'after' : 'before'} ownership lookup`, async () => {
      const options = { pending: 0, forgetAfterList: false, hostId: 'hstudioaaaaa' };
      const services = fakeServices(options);
      const { account } = setup(services);
      try {
        await account.signIn();
        await settle(account);
        if (forgetAfterList) options.forgetAfterList = true;
        else services.hosts.clear();
        options.hostId = 'hstudiobbbbb';
        await account.signIn();
        await settle(account);
        expect(account.status()).toMatchObject({ state: 'signed-in', hostId: 'hstudiobbbbb' });
        expect(
          services.calls.filter(
            (call) => call.method === 'POST' && call.path === `${RELAY}/v1/hosts`,
          ),
        ).toHaveLength(2);
      } finally {
        await account.close();
      }
    });

  for (const payload of [
    { relay: RELAY, clientId: CLIENT, hostId: 'hstudioaaaaa' },
    { relay: 'https://old-relay.test', clientId: CLIENT, hostId: 'hstudioaaaaa' },
    { relay: RELAY, clientId: 'client_OLD', hostId: 'hstudioaaaaa' },
    { relay: RELAY, clientId: CLIENT },
  ])
    it(`recovers an expired legacy session without trusting old signing material (${JSON.stringify(payload)})`, async () => {
      const services = fakeServices({ pending: 0, maxHosts: 1, signer: false });
      const { account, credentials } = setup(services);
      try {
        await account.signIn();
        await settle(account);
        for (const key of credentials.records.keys())
          credentials.records.set(key, {
            kind: 'grant',
            payload: {
              ...payload,
              refreshToken: 'revoked',
              account: 'unverified',
              relayKey: 'stale',
            },
          });
        await account.signIn();
        await settle(account);
        const reusable =
          payload.relay === RELAY && payload.clientId === CLIENT && 'hostId' in payload;
        expect(account.status()).toMatchObject(
          reusable
            ? { state: 'signed-in', hostId: 'hstudioaaaaa' }
            : { state: 'error', issue: 'host-limit' },
        );
        for (const stored of credentials.records.values()) {
          expect(stored).not.toHaveProperty('payload.account');
          expect(stored).not.toHaveProperty('payload.relayKey');
        }
        expect(services.calls.some((call) => call.method === 'DELETE')).toBe(false);
        expect(
          services.calls.some(
            (call) =>
              typeof call.body === 'object' &&
              call.body !== null &&
              'refresh_token' in call.body &&
              call.body.refresh_token === 'revoked',
          ),
        ).toBe(false);
      } finally {
        await account.close();
      }
    });

  for (const failure of [
    { listStatus: 503, listBody: {} },
    { listStatus: 401, listBody: {} },
    { listStatus: 200, listBody: {} },
    { listStatus: 200, listBody: { hosts: [null] } },
  ])
    it(`does not create a registration when ownership cannot be verified (${JSON.stringify(failure)})`, async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const options: Parameters<typeof fakeServices>[0] = { pending: 0 };
      const services = fakeServices(options);
      const { account, credentials, tunnel } = setup(services);
      try {
        await account.signIn();
        await settle(account);
        Object.assign(options, failure, { userId: 'user_bob', hostId: 'hstudiobbbbb' });
        await account.signIn();
        await settle(account);
        expect(account.status()).toMatchObject({
          state: 'error',
          issue: failure.listStatus === 401 ? 'session-expired' : 'relay-unavailable',
        });
        expect(
          services.calls.filter(
            (call) => call.method === 'POST' && call.path === `${RELAY}/v1/hosts`,
          ),
        ).toHaveLength(1);
        expect(await account.accessToken()).toBeUndefined();
        expect(tunnel.connect.status()).toEqual({ state: 'off' });
        expect([...credentials.records.values()]).toEqual([
          {
            kind: 'grant',
            payload: {
              kind: 'registration',
              relay: RELAY,
              clientId: CLIENT,
              hostId: 'hstudioaaaaa',
            },
          },
        ]);
        const body = JSON.stringify({
          hostId: 'hstudioaaaaa',
          account: 'user_alice',
          verifierHash: Buffer.alloc(32, 3).toString('base64url'),
          issuedAt: new Date().toISOString(),
        });
        const signature = createHmac('sha256', RELAY_KEY).update(body).digest('base64url');
        expect(await account.verifyOffer(body, signature)).toEqual({ ok: false });
        delete options.listBody;
        options.listStatus = 200;
        const failedStatus = account.status();
        const count = services.calls.length;
        await vi.advanceTimersByTimeAsync(120_000);
        await account.start();
        expect(account.status()).toEqual(failedStatus);
        expect(services.calls).toHaveLength(count);
        await account.signIn();
        await settle(account);
        expect(account.status()).toMatchObject({ state: 'signed-in', hostId: 'hstudiobbbbb' });
        expect(services.calls.some((call) => call.method === 'DELETE')).toBe(false);
      } finally {
        await account.close();
        vi.useRealTimers();
      }
    });

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
    expect([...credentials.records.values()]).toEqual([
      {
        kind: 'grant',
        payload: { kind: 'registration', relay: RELAY, clientId: CLIENT, hostId: 'hstudioaaaaa' },
      },
    ]);
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

describe('Connect account deletion', () => {
  async function until(done: () => boolean) {
    for (let index = 0; index < 200 && !done(); index += 1)
      await new Promise((wait) => setTimeout(wait, 5));
  }

  for (const workos of [true, false])
    it(`stops the tunnel and drops the session once the relay answers 401 (refresh ${workos ? 'refused' : 'still works'})`, async () => {
      const options: { pending: number; deleted?: { workos: boolean } } = { pending: 0 };
      const services = fakeServices(options);
      const { account, credentials, tunnel } = setup(services, 41001, 10);
      await account.signIn();
      await settle(account);
      expect(account.status()).toMatchObject({ state: 'signed-in' });
      await until(() =>
        services.calls.some((call) => call.method === 'GET' && call.path === `${RELAY}/v1/hosts`),
      );
      expect(account.status()).toMatchObject({ state: 'signed-in' });

      services.hosts.clear();
      options.deleted = { workos };
      await until(() => account.status().state !== 'signed-in');
      expect(account.status()).toMatchObject({ state: 'error', issue: 'session-expired' });
      expect(tunnel.connect.status()).toEqual({ state: 'off' });
      expect([...credentials.records.values()]).toEqual([
        {
          kind: 'grant',
          payload: { kind: 'registration', relay: RELAY, clientId: CLIENT, hostId: 'hstudioaaaaa' },
        },
      ]);
      await account.close();
    });

  it('keeps a live account signed in and relinks a Host the relay forgot', async () => {
    const services = fakeServices({ pending: 0 });
    const { account, tunnel } = setup(services, 41001, 10);
    await account.signIn();
    await settle(account);
    services.hosts.clear();
    await until(() => tunnel.enabled.length > 1);
    expect(tunnel.enabled).toHaveLength(2);
    expect(account.status()).toMatchObject({ state: 'signed-in', hostId: 'hstudioaaaaa' });
    await account.close();
  });
});

it('exposes ActivityKit only through the signed-in owning Connect Host and clears capability on sign-out', async () => {
  const services = fakeServices({ pending: 0, activity: true });
  const { account } = setup(services);
  try {
    expect(await account.activity.capability()).toBeUndefined();
    await account.signIn();
    await settle(account);
    expect(await account.activity.capability()).toEqual({
      bundleIdentifier: 'app.deepseekbot.mobile',
      source: 'Studio',
    });
    expect(
      (
        await account.activity.call({
          operation: 'register',
          deviceId: 'approved-device',
          hostId: 'wrong-host',
          token: 'a'.repeat(64),
        })
      ).status,
    ).toBe(200);
    expect(services.calls.at(-1)).toMatchObject({
      path: `${RELAY}/v1/hosts/hstudioaaaaa/live-activity`,
      auth: expect.stringMatching(/^Bearer /),
    });
    await account.signOut();
    const count = services.calls.length;
    expect(await account.activity.capability()).toBeUndefined();
    expect(services.calls).toHaveLength(count);
  } finally {
    await account.close();
  }
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
    expect(stderr).toHaveBeenCalledWith(
      'Open https://auth.test/d and confirm code ABCD\n' +
        'To use a different account, open the link in a private window.\n',
    );
    expect(stderr).toHaveBeenLastCalledWith(
      'Signed in as a@b.c. Not you? Run deepseekbot connect-sign-out.\n',
    );
    await expect(
      runConnectCommand('connect-status', [], { wait: true }, {}, async () => ({ http })),
    ).rejects.toMatchObject({ code: 'usage' });
  });
});
