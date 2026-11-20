import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createConnectAccount } from '../src/devices/connect-account.js';
import { CONNECT_ZONES } from '@botharness/host-protocol/connect-zones';
import {
  RELAY,
  CLIENT,
  RELAY_KEY,
  deferred,
  memoryCredentials,
  fakeConnect,
  fakeServices,
  settle,
  setup,
} from './connect-account-fixtures.js';

describe('Connect account sign-in', () => {
  it.each(['register-host', 'tunnel'])(
    'automatically recovers a post-login %s failure without another sign-in',
    async (operation) => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const services = fakeServices({ pending: 0 });
      const credentials = memoryCredentials();
      let failed = false;
      const account = createConnectAccount({
        credentials: () => credentials.provider,
        connect: fakeConnect().connect,
        relay: RELAY,
        fetch: async (input, init) => {
          const target =
            operation === 'register-host'
              ? `${RELAY}/v1/hosts`
              : `${RELAY}/v1/hosts/hstudioaaaaa/tunnel`;
          if (String(input) === target && init?.method === 'POST' && !failed) {
            failed = true;
            return Response.json({}, { status: 503 });
          }
          return services.fetcher(input, init);
        },
        sleep: async () => {},
        freePort: async () => 41001,
      });
      try {
        await account.signIn();
        await settle(account);
        expect(account.status()).toMatchObject({
          state: 'error',
          issue: 'relay-unavailable',
          recovery: 'automatic',
        });
        await vi.advanceTimersByTimeAsync(60_000);
        expect(account.status()).toMatchObject({ state: 'signed-in', hostId: 'hstudioaaaaa' });
        expect(services.hosts.size).toBe(1);
        expect(
          services.calls.filter((call) => call.path.endsWith('/authorize/device')),
        ).toHaveLength(1);
      } finally {
        await account.close();
        vi.useRealTimers();
      }
    },
  );

  it('keeps a local tunnel refusal distinct from a relay request failure', async () => {
    const services = fakeServices({ pending: 0 });
    const credentials = memoryCredentials();
    const logs: string[] = [];
    const account = createConnectAccount({
      credentials: () => credentials.provider,
      connect: {
        ...fakeConnect().connect,
        enable: async () => ({ ok: false, code: 'connect-hostname-invalid' }),
      },
      relay: RELAY,
      fetch: services.fetcher,
      sleep: async () => {},
      freePort: async () => 41001,
      record: (phase, detail) => logs.push(`${phase} ${detail ?? ''}`),
    });
    try {
      await account.signIn();
      await settle(account);
      expect(account.status()).toMatchObject({ state: 'error', issue: 'relay-unavailable' });
      expect(logs).toContain(
        'account-connect-error operation=enable-tunnel refusal=connect-hostname-invalid',
      );
      expect(logs.join('\n')).not.toContain('account-request-error');
    } finally {
      await account.close();
    }
  });

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

  it('tells the relay the bound origin port when Connect picked another one', async () => {
    const { account, services } = setup(fakeServices({ pending: 0 }), 52000);
    await account.signIn();
    await settle(account);
    expect(
      services.calls.filter((call) => call.path.endsWith('/tunnel')).map((call) => call.body),
    ).toEqual([
      { originPort: 41001, zones: CONNECT_ZONES },
      { originPort: 52000, zones: CONNECT_ZONES },
    ]);
    await account.close();
  });
});

describe('Connect account lifecycle', () => {
  it('publishes account status after browser authorization settles and does not repeat a healthy sync', async () => {
    const states: string[] = [];
    const test = setup(fakeServices({ pending: 0 }), 41001, 60_000, undefined, undefined, () => {
      states.push(test.account.status().state);
    });
    try {
      await test.account.signIn();
      await settle(test.account);
      expect(states).toEqual(['signing-in', 'signed-in']);
      await test.account.start();
      expect(states).toEqual(['signing-in', 'signed-in']);
      await test.account.signOut();
      expect(states).toEqual(['signing-in', 'signed-in', 'signed-out']);
    } finally {
      await test.account.close();
    }
  });

  it('announces readiness only after sign-in, without repeating it on a healthy account sync', async () => {
    const states: string[] = [];
    const test = setup(fakeServices({ pending: 0 }), 41001, 60000, () => {
      states.push(test.account.status().state);
    });
    try {
      await test.account.signIn();
      await settle(test.account);
      expect(states).toEqual(['signed-in']);
      await test.account.start();
      await test.account.start();
      expect(states).toEqual(['signed-in']);
      await test.account.signOut();
      await test.account.signIn();
      await settle(test.account);
      expect(states).toEqual(['signed-in', 'signed-in']);
    } finally {
      await test.account.close();
    }
  });

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
          recovery: 'sign-in',
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
