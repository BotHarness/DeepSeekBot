import { describe, expect, it } from 'vitest';

import { setup } from './support.js';

describe('Connect Live Activity delivery registrations', () => {
  it('requires configured delivery and binds handles to account, Host and admitted device', async () => {
    const sent: unknown[] = [];
    const f = await setup(undefined, {
      activitySender: {
        async capability() {
          return { bundleIdentifier: 'app.deepseekbot.mobile' };
        },
        async send(input) {
          sent.push(input);
          return 'sent';
        },
      },
    });
    const host = (
      await f.call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Computer' } })
    ).body.host.id;
    const path = `/v1/hosts/${host}/live-activity`;
    const input = {
      operation: 'register',
      deviceId: 'device-a',
      clientActivityId: 'native-a',
      token: 'a'.repeat(64),
      bundleIdentifier: 'app.deepseekbot.mobile',
    };
    expect((await f.call('POST', path, { as: 'user_bob', body: input })).status).toBe(404);
    const registered = await f.call('POST', path, { as: 'user_alice', body: input });
    expect(registered.status).toBe(200);
    expect(registered.body).not.toHaveProperty('token');
    const other = (
      await f.call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Second Computer' } })
    ).body.host.id;
    expect(
      (
        await f.call('POST', `/v1/hosts/${other}/live-activity`, {
          as: 'user_alice',
          body: { operation: 'stop', handle: registered.body.handle, deviceId: 'device-a' },
        })
      ).status,
    ).toBe(404);
    expect(
      (await f.call('POST', path, { as: 'user_alice', body: { ...input, token: 'b'.repeat(64) } }))
        .status,
    ).toBe(200);

    const update = {
      operation: 'update',
      handle: registered.body.handle,
      deviceId: 'device-a',
      revision: 1,
      state: 'completed',
      terminal: true,
      updatedAt: f.at(),
      locale: 'en',
    };
    expect(
      (await f.call('POST', path, { as: 'user_alice', body: { ...update, deviceId: 'device-b' } }))
        .status,
    ).toBe(404);
    expect((await f.call('POST', path, { as: 'user_alice', body: update })).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ token: 'b'.repeat(64), source: 'Computer' });
    expect(
      (
        await f.call('POST', path, {
          as: 'user_alice',
          body: { ...update, revision: 2, state: 'working', terminal: false },
        })
      ).status,
    ).toBe(409);
    expect((await f.call('POST', path, { as: 'user_alice', body: input })).status).toBe(409);
    expect(sent).toHaveLength(1);
  });

  it('retries pending terminal delivery after transient failure, rejects conflicting replay, and acknowledges a lost response idempotently', async () => {
    const sent: unknown[] = [];
    let unavailable = true;
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = await setup(undefined, {
      activitySender: {
        async capability() {
          return { bundleIdentifier: 'app.deepseekbot.mobile' };
        },
        async send(input) {
          sent.push(input);
          entered();
          await gate;
          return unavailable ? 'unavailable' : 'sent';
        },
      },
    });
    const host = (
      await f.call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Computer' } })
    ).body.host.id;
    const path = `/v1/hosts/${host}/live-activity`;
    const registered = await f.call('POST', path, {
      as: 'user_alice',
      body: {
        operation: 'register',
        deviceId: 'device-a',
        clientActivityId: 'native-a',
        token: 'a'.repeat(64),
        bundleIdentifier: 'app.deepseekbot.mobile',
      },
    });
    const update = {
      operation: 'update',
      handle: registered.body.handle,
      deviceId: 'device-a',
      revision: 1,
      state: 'completed',
      terminal: true,
      updatedAt: f.at(),
      locale: 'en',
    };
    const pending = f.call('POST', path, { as: 'user_alice', body: update });
    await started;
    expect((await f.call('POST', path, { as: 'user_alice', body: update })).status).toBe(503);
    release();
    expect((await pending).status).toBe(502);
    expect(
      (
        await f.call('POST', path, {
          as: 'user_alice',
          body: { ...update, revision: 2, terminal: false, state: 'working' },
        })
      ).status,
    ).toBe(409);
    expect((await f.call('POST', path, { as: 'user_alice', body: update })).status).toBe(503);
    f.advance(5_000);
    unavailable = false;
    expect((await f.call('POST', path, { as: 'user_alice', body: update })).status).toBe(200);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect((await f.call('POST', path, { as: 'user_alice', body: update })).status).toBe(200);
    expect(sent).toHaveLength(2);
    expect(
      (await f.call('POST', path, { as: 'user_alice', body: { ...update, state: 'unknown' } }))
        .status,
    ).toBe(409);
  });

  it('refuses unconfigured and expired registrations and drops invalid tokens', async () => {
    const unconfigured = await setup();
    const host = (
      await unconfigured.call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Computer' } })
    ).body.host.id;
    expect(
      (await unconfigured.call('GET', `/v1/hosts/${host}/live-activity`, { as: 'user_alice' }))
        .status,
    ).toBe(503);
    let deliveries = 0;
    const f = await setup(undefined, {
      activitySender: {
        async capability() {
          return { bundleIdentifier: 'app.deepseekbot.mobile' };
        },
        async send() {
          deliveries += 1;
          return 'invalid-token';
        },
      },
    });
    const id = (await f.call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Computer' } }))
      .body.host.id;
    const path = `/v1/hosts/${id}/live-activity`;
    const register = (clientActivityId: string) =>
      f.call('POST', path, {
        as: 'user_alice',
        body: {
          operation: 'register',
          deviceId: 'device-a',
          clientActivityId,
          token: 'b'.repeat(64),
          bundleIdentifier: 'app.deepseekbot.mobile',
        },
      });
    const registered = await register('first');
    const update = {
      operation: 'update',
      deviceId: 'device-a',
      handle: registered.body.handle,
      revision: 1,
      state: 'working',
      terminal: false,
      updatedAt: f.at(),
      locale: 'en',
    };
    expect((await f.call('POST', path, { as: 'user_alice', body: update })).body.error.code).toBe(
      'activity-token-invalid',
    );
    expect(
      (await f.call('POST', path, { as: 'user_alice', body: { ...update, revision: 2 } })).status,
    ).toBe(409);
    expect(deliveries).toBe(1);
    const expired = await register('second');
    f.advance(8 * 60 * 60 * 1000 + 1);
    expect(
      (
        await f.call('POST', path, {
          as: 'user_alice',
          body: { ...update, handle: expired.body.handle },
        })
      ).status,
    ).toBe(410);
  });
});
