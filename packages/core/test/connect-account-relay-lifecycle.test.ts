import { describe, expect, it } from 'vitest';
import { RELAY, CLIENT, fakeServices, settle, setup } from './connect-account-fixtures.js';

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

  it('waits in the relay queue with its position and the pool, then connects when a slot frees', async () => {
    const pool = { capacity: 900, inUse: 900, free: 0, waiting: 3 };
    const options: Parameters<typeof fakeServices>[0] = {
      pending: 0,
      relayFull: { reason: 'pool-full', position: 3, retryAfter: 60, pool },
    };
    const services = fakeServices(options);
    let changes = 0;
    const { account, tunnel } = setup(services, 41001, 10, undefined, undefined, () => {
      changes += 1;
    });
    await account.signIn();
    await settle(account);
    await until(() => account.status().issue === 'relay-full');
    const waiting = account.status();
    expect(waiting).toMatchObject({
      state: 'error',
      issue: 'relay-full',
      recovery: 'automatic',
      wait: { reason: 'pool-full', position: 3, retryAfter: 60 },
      pool,
    });
    expect(Number.isNaN(Date.parse(waiting.wait?.since ?? ''))).toBe(false);
    expect(tunnel.enabled).toHaveLength(0);
    delete options.relayFull;
    options.pool = { capacity: 900, inUse: 899, free: 1, waiting: 2 };
    await until(() => account.status().state === 'signed-in');
    expect(tunnel.enabled).toHaveLength(1);
    expect(account.status()).not.toHaveProperty('wait');
    await until(() => account.status().pool?.inUse === 899);
    const beforePoolChange = changes;
    options.pool = {
      capacity: 900,
      inUse: 900,
      free: 0,
      waiting: 1,
      nextFreeAt: '2026-11-09T20:10:00.000Z',
      guaranteedMinutes: 30,
    };
    options.protectedUntil = '2026-11-09T20:25:00.000Z';
    await until(() => account.status().protectedUntil === '2026-11-09T20:25:00.000Z');
    expect(account.status().pool).toMatchObject({
      nextFreeAt: '2026-11-09T20:10:00.000Z',
      guaranteedMinutes: 30,
    });
    expect(changes).toBeGreaterThan(beforePoolChange);
    await account.close();
  });

  it('reports how long ago a paired device last used the tunnel on its account check', async () => {
    const services = fakeServices({ pending: 0 });
    const { account, tunnel } = setup(services, 41001, 10);
    let idle: number | undefined;
    tunnel.connect.idleSeconds = () => idle;
    await account.signIn();
    await settle(account);
    const listed = () =>
      services.calls.filter((call) => call.method === 'GET' && call.path === `${RELAY}/v1/hosts`);
    await until(() => listed().length > 0);
    expect(listed()[0]).not.toHaveProperty('search');
    idle = 42;
    const count = listed().length;
    await until(() => listed().length > count);
    expect(listed().at(-1)).toMatchObject({ search: '?host=hstudioaaaaa&idle=42' });
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
