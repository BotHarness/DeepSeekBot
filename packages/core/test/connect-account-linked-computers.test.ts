import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  RELAY,
  RELAY_KEY,
  deferred,
  fakeServices,
  settle,
  setup,
} from './connect-account-fixtures.js';

describe('linked account computers', () => {
  it.each(['hosts', 'relationship', 'activity'] as const)(
    'persists a consumed %s rotation after caller cancellation while retaining the owner queue',
    async (entry) => {
      const services = fakeServices({
        pending: 0,
        hostId: 'haaaaaaaaaaaa',
        offer: async () => Response.json({}, { status: 401 }),
      });
      const { account, credentials } = setup(services);
      const received = deferred();
      const release = deferred();
      const saving = deferred();
      const persist = deferred();
      let signal: AbortSignal | null | undefined;
      let exchanges = 0;
      let relayRequests = 0;
      const tokens: string[] = [];
      try {
        await account.signIn();
        await settle(account);
        const session = await account.relationshipSession();
        const modify = credentials.provider.modifyRecord;
        credentials.provider.modifyRecord = async (key, mutate) =>
          modify(key, async (current) => {
            const next = await mutate(current);
            if (JSON.stringify(next).includes('rotated-refresh')) {
              saving.resolve();
              await persist.promise;
            }
            return next;
          });
        const original = services.fetcher.getMockImplementation()!;
        services.fetcher.mockImplementation(async (input, init) => {
          if (String(input).startsWith(RELAY)) relayRequests++;
          if (String(init?.body).includes('grant_type=refresh_token')) {
            const token = new URLSearchParams(String(init?.body)).get('refresh_token')!;
            tokens.push(token);
            exchanges++;
            if (exchanges === 1) {
              signal = init?.signal;
              received.resolve();
              await release.promise;
              return Response.json({
                access_token: 'rotated-access',
                refresh_token: 'rotated-refresh',
              });
            }
            if (token !== 'rotated-refresh')
              return Response.json({ error: 'invalid_grant' }, { status: 400 });
            return Response.json({ access_token: 'next-access', refresh_token: 'next-refresh' });
          }
          if (entry === 'activity' && String(input).endsWith('/live-activity'))
            return Response.json({}, { status: 401 });
          return original(input, init);
        });
        const caller = new AbortController();
        const first =
          entry === 'hosts'
            ? account.connectedHosts(caller.signal)
            : entry === 'activity'
              ? account.activity.call({}, caller.signal)
              : session!
                  .offer(session!.registrationId, 'a'.repeat(43), caller.signal)
                  .catch(() => 'refused');
        await received.promise;
        caller.abort();
        expect(signal?.aborted).toBe(false);
        expect(await first).toEqual(
          entry === 'hosts'
            ? { ok: false, code: 'relay-unavailable' }
            : entry === 'activity'
              ? { status: 503, body: {} }
              : 'refused',
        );
        expect(signal?.aborted).toBe(false);
        const queued = new AbortController();
        const cancelled = account.connectedHosts(queued.signal);
        queued.abort();
        expect(await cancelled).toEqual({ ok: false, code: 'relay-unavailable' });
        const next = account.accessToken({ fresh: true });
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(exchanges).toBe(1);
        release.resolve();
        await saving.promise;
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(exchanges).toBe(1);
        persist.resolve();
        expect(await next).toBe('next-access');
        expect(tokens).toHaveLength(2);
        expect(tokens[1]).toBe('rotated-refresh');
        expect(relayRequests).toBe(entry === 'hosts' ? 0 : 1);
        expect(JSON.stringify([...credentials.records.values()])).toContain('next-refresh');
        expect(JSON.stringify([...credentials.records.values()])).not.toContain('rotated-refresh');
      } finally {
        release.resolve();
        persist.resolve();
        await account.close();
      }
    },
  );

  it.each([
    'sign-out',
    'close',
    'deadline',
    'late-success',
    'access-token-close',
    'account-change',
  ] as const)('cancels the serialized relationship token refresh on %s', async (mode) => {
    let expire = false;
    const serviceOptions = {
      pending: 0,
      hostId: 'haaaaaaaaaaaa',
      userId: 'user_alice',
      offer: async () => {
        expire = true;
        return Response.json({ error: { code: 'session-expired' } }, { status: 401 });
      },
    };
    const services = fakeServices(serviceOptions);
    const original = services.fetcher.getMockImplementation()!;
    const started = deferred();
    let release = () => {};
    let blocked = false;
    let refreshSignal: AbortSignal | null | undefined;
    services.fetcher.mockImplementation(async (input, init) => {
      if (expire && !blocked && String(init?.body).includes('grant_type=refresh_token')) {
        blocked = true;
        refreshSignal = init?.signal;
        return new Promise<Response>((resolve, reject) => {
          release = () =>
            resolve(Response.json({ access_token: 'late-access', refresh_token: 'late-refresh' }));
          refreshSignal?.addEventListener(
            'abort',
            () =>
              mode === 'late-success' || mode === 'account-change'
                ? release()
                : reject(
                    refreshSignal?.reason instanceof Error
                      ? refreshSignal.reason
                      : new Error('aborted', { cause: refreshSignal?.reason }),
                  ),
            { once: true },
          );
          started.resolve();
        });
      }
      return original(input, init);
    });
    const { account, credentials } = setup(services);
    const caller = new AbortController();
    const deadline = new AbortController();
    let timeout: ReturnType<typeof vi.spyOn> | undefined;
    let teardown: Promise<unknown> | undefined;
    try {
      await account.signIn();
      await settle(account);
      const session = await account.relationshipSession();
      expect(session).toBeDefined();
      const before = JSON.stringify([...credentials.records.values()]);
      if (mode === 'deadline')
        timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
      if (mode === 'access-token-close') expire = true;
      const work =
        mode === 'access-token-close'
          ? account
              .accessToken({ fresh: true })
              .then((token) => (token === undefined ? 'refused' : 'accepted'))
          : session!.offer(session!.registrationId, 'a'.repeat(43), caller.signal).then(
              () => 'accepted',
              () => 'refused',
            );
      await started.promise;
      if (mode === 'account-change') {
        serviceOptions.userId = 'user_bob';
        teardown = account.signIn().then(() => settle(account));
      } else if (mode === 'sign-out') teardown = account.signOut();
      else if (mode === 'close' || mode === 'late-success' || mode === 'access-token-close')
        teardown = account.close();
      else if (mode === 'deadline') deadline.abort();
      else caller.abort();
      await vi.waitFor(() => expect(refreshSignal?.aborted).toBe(true), { timeout: 500 });
      expect(await work).toBe('refused');
      await teardown;
      if (mode === 'sign-out') {
        expect(account.status().state).toBe('signed-out');
        expect(credentials.records.size).toBe(0);
      } else if (mode === 'account-change') {
        expect(JSON.stringify([...credentials.records.values()])).toContain('user_bob');
        expect(JSON.stringify([...credentials.records.values()])).not.toContain('late-refresh');
      } else expect(JSON.stringify([...credentials.records.values()])).toBe(before);
      expect(services.calls.filter((call) => call.path.endsWith('/offer'))).toHaveLength(
        mode === 'access-token-close' ? 0 : 1,
      );
    } finally {
      release();
      timeout?.mockRestore();
      await teardown;
      await account.close();
    }
  });

  it.each(['refresh', 'relay'])(
    'cancels a stalled health %s request and skips queued cancelled checks',
    async (stage) => {
      const services = fakeServices({ pending: 0 });
      const { account } = setup(services);
      try {
        await account.signIn();
        await settle(account);
        expect(account.status().state).toBe('signed-in');
        const original = services.fetcher.getMockImplementation();
        if (!original) throw new Error('missing-test-fetch');
        let started = () => {};
        const ready = new Promise<void>((resolve) => {
          started = resolve;
        });
        let blocked = 0;
        let release = () => {};
        services.fetcher.mockImplementation(async (input, init) => {
          const url = String(input);
          const selected =
            stage === 'refresh' ? url.includes('/authenticate') : url === `${RELAY}/v1/hosts`;
          if (!selected) return original(input, init);
          blocked++;
          started();
          return new Promise<Response>((resolve, reject) => {
            release = () =>
              resolve(
                Response.json({ access_token: 'health-access', refresh_token: 'health-refresh' }),
              );
            const signal = init?.signal;
            if (!signal) {
              reject(new Error('missing-cancellation'));
              return;
            }
            if (signal.aborted) reject(new Error('cancelled'));
            else
              signal.addEventListener('abort', () => reject(new Error('cancelled')), {
                once: true,
              });
          });
        });
        const running = new AbortController();
        const first = account.connectedHosts(running.signal);
        await ready;
        const queued = new AbortController();
        const second = account.connectedHosts(queued.signal);
        queued.abort();
        running.abort();
        expect(await first).toEqual({ ok: false, code: 'relay-unavailable' });
        expect(await second).toEqual({ ok: false, code: 'relay-unavailable' });
        expect(blocked).toBe(1);
        release();
        services.fetcher.mockImplementation(original);
        expect(await account.signOut()).toMatchObject({ ok: true });
      } finally {
        await account.close();
      }
    },
  );

  it.each(['account', 'registration', 'expired', 'route'] as const)(
    'refuses a %s mismatch in an authenticated relationship offer',
    async (mode) => {
      const registrationId = 'haaaaaaaaaaaa';
      const services = fakeServices({
        pending: 0,
        hostId: registrationId,
        offer: async (_path, body) => {
          const payload = JSON.stringify({
            hostId: mode === 'registration' ? 'hbbbbbbbbbbbb' : registrationId,
            account: mode === 'account' ? 'another-account' : 'user_alice',
            verifierHash: body?.['verifierHash'],
            issuedAt: new Date(
              mode === 'expired' ? Date.now() - 120_000 : Date.now(),
            ).toISOString(),
          });
          return Response.json({
            host: { id: 'remote-pairing-host', name: 'Remote' },
            encryption: { protocol: 'connect-noise-xk-v1', publicKey: 'ab'.repeat(32) },
            enrollment: {
              body: payload,
              signature: createHmac('sha256', RELAY_KEY).update(payload).digest('base64url'),
            },
            hostname: mode === 'route' ? 'untrusted.example' : `${registrationId}.deepseekbot.dev`,
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          });
        },
      });
      const events: { phase: string; detail: string | undefined }[] = [];
      const { account } = setup(services, 41001, 60_000, undefined, (phase, detail) =>
        events.push({ phase, detail }),
      );
      try {
        await account.signIn();
        await settle(account);
        const session = await account.relationshipSession();
        expect(session).toBeDefined();
        await expect(
          session?.offer(registrationId, 'a'.repeat(43), new AbortController().signal),
        ).rejects.toThrow();
        expect(services.calls.at(-1)?.auth).toMatch(/^Bearer /u);
        const failure = events.findLast((event) => event.phase === 'account-request-error');
        expect(failure?.detail).toContain(
          'service=relay operation=relationship-offer reason=invalid-response httpStatus=200',
        );
        expect(failure?.detail).not.toContain('another-account');
        expect(failure?.detail).not.toContain(RELAY_KEY);
        expect(failure?.detail).not.toContain('a'.repeat(43));
      } finally {
        await account.close();
      }
    },
  );
  it('invalidates an in-flight authenticated relationship offer immediately when sign-out starts', async () => {
    const gate = deferred();
    const entered = vi.fn();
    const registrationId = 'haaaaaaaaaaaa';
    const services = fakeServices({
      pending: 0,
      hostId: registrationId,
      offer: async (_path, body) => {
        entered();
        await gate.promise;
        const payload = JSON.stringify({
          hostId: registrationId,
          account: 'user_alice',
          verifierHash: body?.['verifierHash'],
          issuedAt: new Date().toISOString(),
        });
        return Response.json({
          host: { id: 'remote-pairing-host', name: 'Remote' },
          encryption: { protocol: 'connect-noise-xk-v1', publicKey: 'ab'.repeat(32) },
          enrollment: {
            body: payload,
            signature: createHmac('sha256', RELAY_KEY).update(payload).digest('base64url'),
          },
          hostname: `${registrationId}.deepseekbot.dev`,
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        });
      },
    });
    const { account } = setup(services);
    try {
      await account.signIn();
      await settle(account);
      const session = await account.relationshipSession();
      if (!session) throw new Error('missing test account session');
      const offered = session.offer(registrationId, 'a'.repeat(43), new AbortController().signal);
      await vi.waitFor(() => expect(entered).toHaveBeenCalled());
      const signOut = account.signOut();
      expect(session.current()).toBe(false);
      gate.resolve();
      await expect(offered).rejects.toThrow('session-expired');
      await signOut;
      expect(await account.relationshipSession()).toBeUndefined();
    } finally {
      gate.resolve();
      await account.close();
    }
  });
  it('refuses signed-out operations without any network calls', async () => {
    const { account, services } = setup();
    try {
      expect(await account.connectedHosts()).toEqual({ ok: false, code: 'signed-out' });
      expect(await account.revokeConnectedHost('hother')).toEqual({
        ok: false,
        code: 'signed-out',
      });
      expect(services.calls).toHaveLength(0);
    } finally {
      await account.close();
    }
  });

  it('sanitizes the on-demand list, derives current and refuses self before the network', async () => {
    const services = fakeServices({
      pending: 0,
      listBody: {
        hosts: [
          {
            id: 'hstudioaaaaa',
            name: 'Studio',
            hostname: 'studio.test',
            createdAt: '2026-01-01T00:00:00Z',
            connected: true,
            sessionKnown: true,
            botNetwork: { hostId: 'paired-host', publicKey: '11'.repeat(32) },
            account: 'private',
            session_id: 'private',
            relayKey: 'private',
          },
          {
            id: 'hother',
            name: 'Old',
            hostname: 'old.test',
            createdAt: '2026-01-01T00:00:00Z',
            refreshToken: 'private',
          },
        ],
      },
    });
    const { account } = setup(services);
    try {
      await account.signIn();
      await settle(account);
      const listed = await account.connectedHosts();
      expect(listed).toEqual({
        ok: true,
        hosts: [
          {
            id: 'hstudioaaaaa',
            name: 'Studio',
            hostname: 'studio.test',
            createdAt: '2026-01-01T00:00:00Z',
            connected: true,
            current: true,
            sessionKnown: true,
            botNetwork: { hostId: 'paired-host', publicKey: '11'.repeat(32) },
          },
          {
            id: 'hother',
            name: 'Old',
            hostname: 'old.test',
            createdAt: '2026-01-01T00:00:00Z',
            current: false,
            sessionKnown: false,
          },
        ],
      });
      expect(JSON.stringify(listed)).not.toMatch(
        /private|account|session_id|relayKey|refreshToken/u,
      );
      const before = services.calls.length;
      expect(await account.revokeConnectedHost('hstudioaaaaa')).toEqual({
        ok: false,
        code: 'current-host',
      });
      expect(services.calls).toHaveLength(before);
      expect(await account.revokeConnectedHost('hmissing')).toEqual({
        ok: false,
        code: 'host-not-found',
      });
    } finally {
      await account.close();
    }
  });

  it('retries a host-limit only after revoke leaves serial and returns the updated status', async () => {
    const services = fakeServices({ pending: 0, maxHosts: 1 });
    services.hosts.add('hother');
    services.owners.set('hother', 'user_alice');
    const { account } = setup(services);
    try {
      await account.signIn();
      await settle(account);
      expect(account.status().issue).toBe('host-limit');
      expect(await account.revokeConnectedHost('hother')).toMatchObject({
        ok: true,
        status: { state: 'signed-in', hostId: 'hstudioaaaaa' },
        sessionKnown: true,
        sessionRevoked: false,
      });
      expect(services.hosts.has('hother')).toBe(false);
      expect(services.hosts.has('hstudioaaaaa')).toBe(true);
    } finally {
      await account.close();
    }
  });

  it('keeps host-limit actionable if another Host takes the freed slot', async () => {
    const services = fakeServices({ pending: 0, maxHosts: 0 });
    services.hosts.add('hother');
    services.owners.set('hother', 'user_alice');
    const { account } = setup(services);
    try {
      await account.signIn();
      await settle(account);
      expect(await account.revokeConnectedHost('hother')).toMatchObject({
        ok: true,
        status: { state: 'error', issue: 'host-limit' },
      });
      expect(
        services.calls.filter(
          (call) => call.method === 'POST' && call.path === `${RELAY}/v1/hosts`,
        ),
      ).toHaveLength(2);
    } finally {
      await account.close();
    }
  });

  it('retires a tombstoned session instead of re-registering', async () => {
    const options = { pending: 0, sessionRevoked: false };
    const services = fakeServices(options);
    const { account, credentials, tunnel } = setup(services);
    try {
      await account.signIn();
      await settle(account);
      options.sessionRevoked = true;
      expect(await account.connectedHosts()).toEqual({ ok: false, code: 'session-revoked' });
      expect(account.status()).toMatchObject({ state: 'error', issue: 'session-revoked' });
      expect(tunnel.connect.status().state).toBe('off');
      expect(JSON.stringify([...credentials.records.values()])).not.toContain('refreshToken');
      expect(await account.revokeConnectedHost('hother')).toEqual({
        ok: false,
        code: 'signed-out',
      });
    } finally {
      await account.close();
    }
  });

  it('reports unavailable or malformed lists without leaking raw relay bodies', async () => {
    for (const options of [
      { listStatus: 503 },
      { listBody: { hosts: [{ id: 'hbad', private: 'secret' }] } },
    ]) {
      const { account } = setup(fakeServices({ pending: 0, ...options }));
      try {
        await account.signIn();
        await settle(account);
        expect(await account.connectedHosts()).toEqual({ ok: false, code: 'relay-unavailable' });
      } finally {
        await account.close();
      }
    }
  });
});
