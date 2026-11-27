import { describe, expect, it, vi } from 'vitest';
import { createConnectAccount } from '../src/devices/connect-account.js';
import { CONNECT_ZONES } from '@botharness/host-protocol/connect-zones';
import { runConnectCommand } from '../src/cli/cli-connect.js';
import {
  RELAY,
  CLIENT,
  RELAY_KEY,
  TOKEN,
  deferred,
  memoryCredentials,
  fakeConnect,
  fakeServices,
  settle,
  setup,
} from './connect-account-fixtures.js';

describe('Connect account sign-in', () => {
  it('notifies account observers when a second sign-in publishes a new device code', async () => {
    const services = fakeServices();
    const fetch = services.fetcher.getMockImplementation()!;
    const idle = deferred();
    let grants = 0;
    const changed = vi.fn();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const account = createConnectAccount({
      credentials: () => memoryCredentials().provider,
      connect: fakeConnect().connect,
      relay: RELAY,
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        if (!String(input).endsWith('/authorize/device')) return response;
        return Response.json({ ...(await response.json()), user_code: `CODE-${++grants}` });
      },
      sleep: () => idle.promise,
      onAccountChanged: changed,
    });
    try {
      await account.signIn();
      changed.mockClear();
      await account.signIn();
      expect(account.status()).toMatchObject({ state: 'signing-in', userCode: 'CODE-2' });
      expect(changed).toHaveBeenCalledTimes(1);
    } finally {
      await account.close();
      idle.resolve();
      clock.mockRestore();
    }
  });

  it('discards a device-authorization reply after sign-out', async () => {
    const services = fakeServices({ pending: 0 });
    const { account } = setup(services);
    const started = deferred();
    const release = deferred();
    const fetch = services.fetcher.getMockImplementation()!;
    services.fetcher.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/authorize/device')) {
        started.resolve();
        await release.promise;
      }
      return fetch(input, init);
    });
    const signingIn = account.signIn();
    try {
      await started.promise;
      expect(await account.signOut()).toMatchObject({ ok: true });
      release.resolve();
      expect(await signingIn).toMatchObject({ ok: false });
      expect(account.status()).toEqual({ state: 'signed-out' });
    } finally {
      release.resolve();
      await signingIn;
      await account.close();
    }
  });

  it('requires a device authorization expiry while allowing the default poll interval', async () => {
    const services = fakeServices({ pending: 0 });
    const { account } = setup(services);
    const fetch = services.fetcher.getMockImplementation()!;
    try {
      for (const expiresIn of [undefined, 300]) {
        services.fetcher.mockImplementation(async (input, init) => {
          const response = await fetch(input, init);
          if (!String(input).endsWith('/authorize/device')) return response;
          return Response.json({
            ...(await response.json()),
            interval: undefined,
            expires_in: expiresIn,
          });
        });
        if (expiresIn === undefined)
          expect(await account.signIn()).toEqual({ ok: false, code: 'relay-unavailable' });
        else expect(await account.signIn()).toMatchObject({ ok: true });
      }
    } finally {
      await account.close();
    }
  });

  it('clears the previous device code when its replacement fails', async () => {
    const services = fakeServices();
    const fetch = services.fetcher.getMockImplementation()!;
    const idle = deferred();
    const account = createConnectAccount({
      credentials: () => memoryCredentials().provider,
      connect: fakeConnect().connect,
      relay: RELAY,
      fetch: services.fetcher,
      sleep: () => idle.promise,
    });
    try {
      expect(await account.signIn()).toMatchObject({ ok: true });
      services.fetcher.mockImplementation(async (input, init) =>
        String(input).endsWith('/authorize/device')
          ? Response.json({}, { status: 503 })
          : fetch(input, init),
      );
      expect(await account.signIn()).toEqual({ ok: false, code: 'relay-unavailable' });
      expect(account.status()).toMatchObject({ state: 'error', issue: 'relay-unavailable' });
      expect(account.status()).not.toHaveProperty('userCode');
    } finally {
      await account.close();
      idle.resolve();
    }
  });

  it.each(['before polling', 'with a token request in flight'])(
    'keeps the incumbent usable when replacement authorization expires %s',
    async (phase) => {
      const services = fakeServices({ pending: 0 });
      const credentials = memoryCredentials();
      const tunnel = fakeConnect();
      const polled = deferred();
      const poll = deferred();
      const reply = deferred();
      const changed = vi.fn();
      const record = vi.fn();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
      let replacement = false;
      const account = createConnectAccount({
        credentials: () => credentials.provider,
        connect: tunnel.connect,
        relay: RELAY,
        fetch: async (input, init) => {
          if (replacement && String(input).endsWith('/authenticate')) {
            polled.resolve();
            await reply.promise;
          }
          return services.fetcher(input, init);
        },
        freePort: async () => 41001,
        sleep: async () => {
          if (replacement) await poll.promise;
        },
        record,
        onAccountChanged: changed,
      });
      try {
        await account.signIn();
        await settle(account);
        const incumbent = account.status();
        expect(incumbent.state).toBe('signed-in');
        const connected = tunnel.connect.status();
        expect(await account.accessToken()).toBe('access-1');

        replacement = true;
        await account.signIn();
        expect(account.status().state).toBe('signing-in');
        changed.mockClear();
        if (phase === 'with a token request in flight') {
          poll.resolve();
          await polled.promise;
        }
        clock.mockReturnValue(301_001);
        poll.resolve();
        reply.resolve();
        await settle(account);

        expect(account.status()).toEqual(incumbent);
        expect(tunnel.connect.status()).toEqual(connected);
        expect(await account.accessToken()).toBe('access-1');
        expect(changed).toHaveBeenCalledTimes(1);
        expect(record).toHaveBeenCalledWith('sign-in-expired');
      } finally {
        poll.resolve();
        reply.resolve();
        await account.close();
        clock.mockRestore();
      }
    },
  );

  it.each([
    ['access_denied', 'sign-in-failed'],
    ['invalid_grant', 'sign-in-failed'],
    ['expired_token', 'sign-in-expired'],
  ])('keeps the incumbent usable when replacement OAuth returns %s', async (error, phase) => {
    const options = { pending: 0, deviceError: '' };
    const record = vi.fn();
    const changed = vi.fn();
    const { account, tunnel } = setup(
      fakeServices(options),
      41001,
      60_000,
      undefined,
      record,
      changed,
    );
    try {
      await account.signIn();
      await settle(account);
      const incumbent = account.status();
      expect(incumbent.state).toBe('signed-in');
      const connected = tunnel.connect.status();
      expect(await account.accessToken()).toBe('access-1');

      changed.mockClear();
      options.deviceError = error;
      await account.signIn();
      await settle(account);

      expect(account.status()).toEqual(incumbent);
      expect(tunnel.connect.status()).toEqual(connected);
      expect(await account.accessToken()).toBe('access-1');
      expect(changed).toHaveBeenCalledTimes(2);
      expect(record).toHaveBeenCalledWith(phase, `error=${error}`);
    } finally {
      await account.close();
    }
  });

  it('restores the incumbent when a superseding authorization request fails', async () => {
    const services = fakeServices({ pending: 0 });
    const fetch = services.fetcher.getMockImplementation()!;
    const polled = deferred();
    const late = deferred();
    const changed = vi.fn();
    const record = vi.fn();
    const { account, tunnel } = setup(services, 41001, 60_000, undefined, record, changed);
    try {
      await account.signIn();
      await settle(account);
      const incumbent = account.status();
      expect(incumbent.state).toBe('signed-in');
      const connected = tunnel.connect.status();
      expect(await account.accessToken()).toBe('access-1');

      services.fetcher.mockImplementation(async (input, init) => {
        if (String(input).endsWith('/authenticate')) {
          polled.resolve();
          await late.promise;
        }
        return fetch(input, init);
      });
      await account.signIn();
      await polled.promise;
      expect(account.status().state).toBe('signing-in');
      changed.mockClear();

      services.fetcher.mockImplementation(async (input, init) =>
        String(input).endsWith('/authorize/device')
          ? Response.json({}, { status: 503 })
          : fetch(input, init),
      );
      expect(await account.signIn()).toEqual({ ok: false, code: 'relay-unavailable' });
      late.resolve();
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(account.status()).toEqual(incumbent);
      expect(tunnel.connect.status()).toEqual(connected);
      expect(await account.accessToken()).toBe('access-1');
      expect(changed).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledWith('sign-in-failed', 'error=relay-unavailable');
    } finally {
      late.resolve();
      await account.close();
    }
  });

  it('releases a pending device poll timer when the account closes', async () => {
    const services = fakeServices();
    const fetch = services.fetcher.getMockImplementation()!;
    const account = createConnectAccount({
      credentials: () => memoryCredentials().provider,
      connect: fakeConnect().connect,
      relay: RELAY,
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        if (!String(input).endsWith('/authorize/device')) return response;
        return Response.json({ ...(await response.json()), interval: 5 });
      },
    });
    const activeTimers = () =>
      process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length;
    const before = activeTimers();
    try {
      expect(await account.signIn()).toMatchObject({ ok: true });
      expect(activeTimers()).toBe(before + 1);
      await account.close();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(activeTimers()).toBe(before);
    } finally {
      await account.close();
    }
  });

  it('retries a device-token server error with an OAuth error code', async () => {
    const services = fakeServices({ pending: 0 });
    const { account } = setup(services);
    const fetch = services.fetcher.getMockImplementation()!;
    let tokenCalls = 0;
    services.fetcher.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/authenticate') && ++tokenCalls === 1)
        return Response.json({ error: 'server_error' }, { status: 503 });
      return fetch(input, init);
    });
    try {
      await account.signIn();
      await settle(account);
      expect(account.status()).toMatchObject({ state: 'signed-in' });
      expect(tokenCalls).toBe(3);
    } finally {
      await account.close();
    }
  });

  it('rejects a token returned after timeout abort before the wall-clock deadline', async () => {
    const services = fakeServices({ pending: 0 });
    const credentials = memoryCredentials();
    const controller = new AbortController();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const account = createConnectAccount({
      credentials: () => credentials.provider,
      connect: fakeConnect().connect,
      relay: RELAY,
      sleep: async () => {},
      fetch: async (input, init) => {
        if (String(input).endsWith('/authenticate')) {
          controller.abort();
          return Response.json({ access_token: 'late-access', refresh_token: 'late-refresh' });
        }
        return services.fetcher(input, init);
      },
    });
    try {
      await account.signIn();
      await vi.waitFor(() =>
        expect(account.status()).toMatchObject({ state: 'error', issue: 'sign-in-expired' }),
      );
      expect(Date.now()).toBe(1000);
      expect(credentials.records.size).toBe(0);
      expect(services.hosts.size).toBe(0);
    } finally {
      await account.close();
      timeout.mockRestore();
      now.mockRestore();
    }
  });

  it.each(['aborted', 'late-success'])(
    'expires an in-flight device-token request (%s)',
    async (mode) => {
      const services = fakeServices({ pending: 0 });
      const credentials = memoryCredentials();
      let aborted = false;
      let tokenCalls = 0;
      const account = createConnectAccount({
        credentials: () => credentials.provider,
        connect: fakeConnect().connect,
        relay: RELAY,
        fetch: async (input, init) => {
          if (String(input).endsWith('/authorize/device')) {
            const response = await services.fetcher(input, init);
            return Response.json({ ...(await response.json()), expires_in: 1, interval: 0.001 });
          }
          if (String(input).endsWith('/authenticate')) {
            tokenCalls += 1;
            if (!init?.signal) throw new Error('Device authorization must have a deadline');
            const signal = init.signal;
            return new Promise((resolve, reject) => {
              signal.addEventListener(
                'abort',
                () => {
                  aborted = true;
                  if (mode === 'late-success')
                    resolve(
                      Response.json({ access_token: 'late-access', refresh_token: 'late-refresh' }),
                    );
                  else
                    reject(
                      signal.reason instanceof Error
                        ? signal.reason
                        : new Error('aborted', { cause: signal.reason }),
                    );
                },
                { once: true },
              );
            });
          }
          return services.fetcher(input, init);
        },
      });
      try {
        await account.signIn();
        await vi.waitFor(
          () =>
            expect(account.status()).toMatchObject({ state: 'error', issue: 'sign-in-expired' }),
          { timeout: 3000, interval: 10 },
        );
        expect(aborted).toBe(true);
        expect(tokenCalls).toBe(1);
        expect(credentials.records.size).toBe(0);
        expect(services.hosts.size).toBe(0);
      } finally {
        await account.close();
      }
    },
  );

  it.each([
    { status: 500, error: 'access_denied', issue: 'sign-in-denied' },
    { status: 429, error: 'invalid_grant', issue: 'sign-in-denied' },
    { status: 503, error: 'expired_token', issue: 'sign-in-expired' },
  ])('does not retry an explicit OAuth $error even on HTTP $status', async (failure) => {
    const services = fakeServices({ pending: 0 });
    const waits: number[] = [];
    const account = createConnectAccount({
      credentials: () => memoryCredentials().provider,
      connect: fakeConnect().connect,
      relay: RELAY,
      fetch: async (input, init) =>
        String(input).endsWith('/authenticate')
          ? Response.json({ error: failure.error }, { status: failure.status })
          : services.fetcher(input, init),
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    try {
      await account.signIn();
      await settle(account);
      expect(account.status()).toMatchObject({ state: 'error', issue: failure.issue });
      expect(waits).toEqual([1000]);
    } finally {
      await account.close();
    }
  });

  it('backs off timeouts, preserves slow_down intervals and stops at the original expiry', async () => {
    const services = fakeServices({ pending: 0 });
    let now = 1_000_000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const waits: number[] = [];
    let calls = 0;
    const account = createConnectAccount({
      credentials: () => memoryCredentials().provider,
      connect: fakeConnect().connect,
      relay: RELAY,
      fetch: async (input, init) => {
        if (String(input).endsWith('/authorize/device')) {
          const response = await services.fetcher(input, init);
          return Response.json({ ...(await response.json()), expires_in: 14 });
        }
        if (String(input).endsWith('/authenticate')) {
          calls += 1;
          if (calls === 1) throw new DOMException('timeout', 'TimeoutError');
          if (calls === 2) return Response.json({ error: 'slow_down' }, { status: 400 });
          return Response.json({ error: 'authorization_pending' }, { status: 400 });
        }
        return services.fetcher(input, init);
      },
      sleep: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });
    try {
      await account.signIn();
      await settle(account);
      expect(account.status()).toMatchObject({ state: 'error', issue: 'sign-in-expired' });
      expect(waits).toEqual([1000, 2000, 7000, 4000]);
      expect(calls).toBe(3);
    } finally {
      await account.close();
      clock.mockRestore();
    }
  });

  it.each([408, 429, 500, 503])(
    'retries temporary HTTP %s during device authorization',
    async (httpStatus) => {
      const services = fakeServices({ pending: 0 });
      const credentials = memoryCredentials();
      const waits: number[] = [];
      let tokenCalls = 0;
      const account = createConnectAccount({
        credentials: () => credentials.provider,
        connect: fakeConnect().connect,
        relay: RELAY,
        fetch: async (input, init) => {
          if (
            String(init?.body).includes(
              encodeURIComponent('urn:ietf:params:oauth:grant-type:device_code'),
            ) &&
            tokenCalls++ === 0
          )
            return Response.json({}, { status: httpStatus });
          return services.fetcher(input, init);
        },
        sleep: async (ms) => {
          waits.push(ms);
        },
        freePort: async () => 41001,
      });
      try {
        await account.signIn();
        await settle(account);
        expect(account.status()).toMatchObject({ state: 'signed-in' });
        expect(waits).toEqual([1000, 2000]);
      } finally {
        await account.close();
      }
    },
  );

  it.each(['config', 'device-authorization', 'refresh-token'])(
    'identifies the failing service and operation: %s',
    async (operation) => {
      const services = fakeServices({ pending: 0 });
      const logs: string[] = [];
      const credentials = memoryCredentials();
      const account = createConnectAccount({
        credentials: () => credentials.provider,
        connect: fakeConnect().connect,
        relay: RELAY,
        fetch: async (input, init) => {
          const url = String(input);
          const body = String(init?.body ?? '');
          if (
            (operation === 'config' && url.endsWith('/v1/config')) ||
            (operation === 'device-authorization' && url.endsWith('/authorize/device')) ||
            (operation === 'refresh-token' && body.includes('grant_type=refresh_token'))
          )
            throw new DOMException('private-detail', 'TimeoutError');
          return services.fetcher(input, init);
        },
        sleep: async () => {},
        freePort: async () => 41001,
        record: (phase, detail) => logs.push(`${phase} ${detail ?? ''}`),
      });
      try {
        await account.signIn();
        await settle(account);
        expect(logs).toContain(
          `account-request-error service=${operation === 'config' ? 'relay' : 'identity'} operation=${operation} reason=transport transport=timeout`,
        );
        expect(logs.join('\n')).not.toContain('private-detail');
      } finally {
        await account.close();
      }
    },
  );

  it.each([
    { failure: 'dns', expected: 'reason=transport transport=ENOTFOUND' },
    { failure: 'timeout', expected: 'reason=transport transport=ETIMEDOUT' },
    { failure: 'unknown', expected: 'reason=transport transport=unknown' },
    { failure: '503', expected: 'reason=http httpStatus=503' },
    { failure: '429', expected: 'reason=http httpStatus=429' },
    { failure: 'invalid', expected: 'reason=invalid-response httpStatus=201' },
  ])('diagnoses post-login host registration failure: $failure', async ({ failure, expected }) => {
    const services = fakeServices({ pending: 0 });
    const logs: string[] = [];
    const credentials = memoryCredentials();
    const account = createConnectAccount({
      credentials: () => credentials.provider,
      connect: fakeConnect().connect,
      relay: RELAY,
      fetch: async (input, init) => {
        if (String(input) === `${RELAY}/v1/hosts` && init?.method === 'POST') {
          if (failure === '503' || failure === '429')
            return Response.json({ secret: 'private-response' }, { status: Number(failure) });
          if (failure === 'invalid')
            return Response.json({ secret: 'private-response' }, { status: 201 });
          throw new TypeError('private-url?token=private-token', {
            cause: Object.assign(new Error('private-host'), {
              code:
                failure === 'dns'
                  ? 'ENOTFOUND'
                  : failure === 'timeout'
                    ? 'ETIMEDOUT'
                    : 'private-code',
            }),
          });
        }
        return services.fetcher(input, init);
      },
      sleep: async () => {},
      freePort: async () => 41001,
      record: (phase, detail) => logs.push(`${phase} ${detail ?? ''}`),
    });
    try {
      await account.signIn();
      await settle(account);
      expect(account.status()).toMatchObject({ state: 'error', issue: 'relay-unavailable' });
      expect(logs).toContain(
        `account-request-error service=relay operation=register-host ${expected}`,
      );
      expect(logs.join('\n')).not.toMatch(/private-|access-0|refresh-0/u);
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
      zones: CONNECT_ZONES,
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

  it('reports a refused account without enabling the tunnel', async () => {
    const { account, tunnel } = setup(fakeServices({ pending: 0, allowed: false }));
    await account.signIn();
    await settle(account);
    expect(account.status()).toMatchObject({ state: 'error', issue: 'account-not-allowed' });
    expect(tunnel.enabled).toEqual([]);
    await account.close();
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
