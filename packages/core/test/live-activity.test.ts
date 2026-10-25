import { describe, expect, it } from 'vitest';
import { createActivityDelivery } from '../src/live-activity/delivery.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import type { ChannelRequestProgress } from '../src/channels/store.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

function fixture() {
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: createTempRoot(), schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  let active = true;
  let at = Date.now();
  let failure = false;
  let stopFailed = false;
  let pause: (() => Promise<void>) | undefined;
  let configured = true;
  let progress: ChannelRequestProgress = {
    state: 'working',
    terminal: false,
    updatedAt: '2026-10-26T00:00:00Z',
  };
  const calls: Record<string, unknown>[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  const writes: unknown[] = [];
  const diagnostics: unknown[] = [];
  owner.subscribe((event) => {
    writes.push(event);
  });
  const makeDelivery = () =>
    createActivityDelivery({
      now: () => at,
      record: (phase, detail) => {
        diagnostics.push({ phase, ...detail });
      },
      database: attachOperationalModule(owner, 'live-activity'),
      provider: {
        async capability() {
          return configured
            ? { bundleIdentifier: 'app.deepseekbot.mobile', source: 'Computer' }
            : undefined;
        },
        async call(body, signal) {
          calls.push(body);
          signals.push(signal);
          if (body['operation'] === 'stop' && stopFailed) return { status: 503, body: {} };
          if (body['operation'] === 'update') {
            await pause?.();
            if (failure) return { status: 502, body: {} };
          }
          return {
            status: 200,
            body:
              body['operation'] === 'register'
                ? { handle: 'remote-handle', expiresAt: at + 60000 }
                : { accepted: true },
          };
        },
      },
      deviceActive: (id) => active && id === 'device-a',
      request: (channel, message) =>
        channel === 'dm-ada' && message === 'human-1'
          ? { sourceEventId: 'source-1', progress }
          : undefined,
    });
  const input = {
    clientActivityId: 'native-a',
    token: 'a'.repeat(64),
    bundleIdentifier: 'app.deepseekbot.mobile',
    channelId: 'dm-ada',
    messageId: 'human-1',
    locale: 'en',
    deviceId: 'spoofed',
  };
  return {
    delivery: makeDelivery(),
    restart: makeDelivery,
    failStop: (value: boolean) => {
      stopFailed = value;
    },
    fail: (value: boolean) => {
      failure = value;
    },
    advance: (ms: number) => {
      at += ms;
    },
    pause: (work: () => Promise<void>) => {
      pause = work;
    },
    calls,
    signals,
    writes,
    diagnostics,
    input,
    revoke: () => {
      active = false;
    },
    configure: (value: boolean) => {
      configured = value;
    },
    tickFact: () => {
      progress = { ...progress, updatedAt: '2026-10-26T00:01:00Z' };
    },
    change: (state: ChannelRequestProgress['state']) => {
      progress = { ...progress, state };
    },
    complete: () => {
      progress = { ...progress, state: 'completed', terminal: true };
    },
  };
}

describe('Host Live Activity delivery owner', () => {
  it('derives device identity from admission, keeps one request, ends on canonical completion without revival', async () => {
    const f = fixture();
    expect(
      (
        await f.delivery.handle({
          method: 'POST',
          deviceId: 'device-a',
          path: '/botharness-device/activity/register',
          body: f.input,
        })
      ).status,
    ).toBe(200);
    expect(f.calls[0]).toMatchObject({ operation: 'register', deviceId: 'device-a' });
    expect(f.calls[0]).not.toHaveProperty('channelId');
    await f.delivery.reconcile();
    f.complete();
    await f.delivery.reconcile();
    expect(f.calls.at(-1)).toMatchObject({
      operation: 'update',
      state: 'completed',
      terminal: true,
    });
    const count = f.calls.length;
    await f.delivery.reconcile();
    expect(f.calls).toHaveLength(count);
    expect(
      (
        await f.delivery.handle({
          method: 'POST',
          deviceId: 'device-a',
          path: '/botharness-device/activity/register',
          body: f.input,
        })
      ).status,
    ).toBe(409);
  });
  it('prepares canonical admission before native creation and sends changed states even with the same fact timestamp', async () => {
    const f = fixture();
    const prepared = await f.delivery.handle({
      method: 'POST',
      deviceId: 'device-a',
      path: '/botharness-device/activity/prepare',
      body: f.input,
    });
    expect(prepared).toMatchObject({
      status: 200,
      body: { source: 'Computer', progress: { state: 'working', terminal: false } },
    });
    expect(f.calls).toHaveLength(0);
    await f.delivery.handle({
      method: 'POST',
      deviceId: 'device-a',
      path: '/botharness-device/activity/register',
      body: f.input,
    });
    await f.delivery.reconcile();
    f.change('unknown');
    await f.delivery.reconcile();
    f.change('working');
    await f.delivery.reconcile();
    expect(f.calls.slice(1).map((call) => [call['state'], call['revision']])).toEqual([
      ['working', 1],
      ['unknown', 2],
      ['working', 3],
    ]);
    expect(new Set(f.calls.slice(1).map((call) => call['updatedAt'])).size).toBe(1);
  });
  it('retries an identical pending terminal revision across restart, coalesces slow sweeps, and retires only after acknowledgement', async () => {
    const f = fixture();
    await f.delivery.handle({
      method: 'POST',
      deviceId: 'device-a',
      path: '/botharness-device/activity/register',
      body: f.input,
    });
    await f.delivery.reconcile();
    f.complete();
    f.fail(true);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.pause(async () => {
      entered();
      await gate;
    });
    const pending = f.delivery.reconcile();
    await started;
    const sweeps = Array.from({ length: 20 }, () => f.delivery.reconcile());
    expect(sweeps.every((item) => item === pending)).toBe(true);
    release();
    await Promise.all(sweeps);
    expect(f.calls.filter((call) => call['terminal'] === true)).toHaveLength(1);
    const restarted = f.restart();
    await restarted.reconcile();
    expect(f.calls.filter((call) => call['terminal'] === true)).toHaveLength(1);
    f.advance(5_000);
    f.tickFact();
    f.fail(false);
    await restarted.reconcile();
    const terminal = f.calls.filter((call) => call['terminal'] === true);
    expect(terminal).toHaveLength(2);
    expect(terminal[1]).toEqual(terminal[0]);
    f.advance(5_000);
    await restarted.reconcile();
    expect(f.calls.filter((call) => call['terminal'] === true)).toHaveLength(2);
  });
  it('keeps failed stop as cleanup-only across restart and admits another display after acknowledgement', async () => {
    const f = fixture();
    const register = (clientActivityId: string) =>
      f.delivery.handle({
        method: 'POST',
        deviceId: 'device-a',
        path: '/botharness-device/activity/register',
        body: { ...f.input, clientActivityId },
      });
    await register('native-a');
    f.failStop(true);
    expect(
      (
        await f.delivery.handle({
          method: 'POST',
          deviceId: 'device-a',
          path: '/botharness-device/activity/stop',
          body: { clientActivityId: 'native-a' },
        })
      ).status,
    ).toBe(503);
    expect((await register('native-b')).status).toBe(409);
    const restarted = f.restart();
    f.advance(5_000);
    f.failStop(false);
    await restarted.reconcile();
    expect(f.calls.map((call) => call['operation'])).toEqual(['register', 'stop', 'stop']);
    expect((await register('native-b')).status).toBe(200);
    f.revoke();
    f.failStop(true);
    await f.delivery.revoke('device-a');
    f.advance(5_000);
    await restarted.reconcile();
    expect(f.calls.some((call) => call['operation'] === 'update')).toBe(false);
    f.advance(60_000);
    const count = f.calls.length;
    await restarted.reconcile();
    expect(f.calls).toHaveLength(count);
  });
  it('aborts provider I/O on owner disposal and never writes or dispatches after the pending call settles', async () => {
    const f = fixture();
    await f.delivery.handle({
      method: 'POST',
      deviceId: 'device-a',
      path: '/botharness-device/activity/register',
      body: f.input,
    });
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.pause(async () => {
      entered();
      await gate;
    });
    const pending = f.delivery.reconcile();
    await started;
    const writes = f.writes.length;
    const calls = f.calls.length;
    f.delivery.dispose();
    expect(f.signals.at(-1)?.aborted).toBe(true);
    release();
    await pending;
    await f.delivery.reconcile();
    await f.delivery.revoke('device-a');
    expect(
      (
        await f.delivery.handle({
          method: 'GET',
          deviceId: 'device-a',
          path: '/botharness-device/activity',
          body: {},
        })
      ).status,
    ).toBe(503);
    expect(f.writes).toHaveLength(writes);
    expect(f.calls).toHaveLength(calls);
    expect(f.diagnostics.at(-1)).toMatchObject({
      phase: 'disposed',
      initiator: 'lifecycle',
      code: 'owner-closed',
      durationMs: 0,
    });
    const diagnostic = JSON.stringify(f.diagnostics);
    expect(diagnostic).not.toContain(f.input.token);
    expect(diagnostic).not.toContain('remote-handle');
    expect(diagnostic).not.toContain('human-1');
  });
  it('refuses missing provider, unknown request and revoked devices; stop retires display only', async () => {
    const f = fixture();
    const register = (body = f.input) =>
      f.delivery.handle({
        method: 'POST',
        deviceId: 'device-a',
        path: '/botharness-device/activity/register',
        body,
      });
    f.configure(false);
    expect((await register()).status).toBe(503);
    expect(f.diagnostics.at(-1)).toMatchObject({
      initiator: 'device',
      code: 'activity-provider-unconfigured',
      durationMs: 0,
    });
    expect(f.calls).toHaveLength(0);
    f.configure(true);
    expect((await register({ ...f.input, messageId: 'different' })).status).toBe(404);
    await register();
    f.revoke();
    await f.delivery.reconcile();
    expect(f.calls.at(-1)).toMatchObject({
      operation: 'stop',
      handle: 'remote-handle',
      deviceId: 'device-a',
    });
    expect((await register()).status).toBe(401);
  });
});
