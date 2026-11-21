import {
  fakeCloudflared,
  memoryCredentials,
  resolveBinary,
  tunnels,
} from './private-tunnel-fixtures.js';
import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { createPrivateTunnel } from '../src/devices/private-tunnel.js';
import type { TunnelProcess } from '../src/devices/connect.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { createDevicesHttp } from '../src/devices/http.js';
import { detectPhoneRoutes } from '../src/devices/routes.js';

it('binds conditional stop to the committed configuration revision, including queued replacements', async () => {
  const credentials = memoryCredentials();
  const owner = createPrivateTunnel({ credentials: () => credentials, port: () => 1 });
  tunnels.push(owner);
  await owner.add({ mode: 'ingress', origin: 'https://before.example.com' });
  const before = owner.statuses()[0]!;
  expect(before.revision).toEqual(expect.any(String));
  let release!: () => void;
  let entered!: () => void;
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = credentials.modifyRecord;
  credentials.modifyRecord = async (key, mutate) => {
    entered();
    await barrier;
    return original(key, mutate);
  };
  const replacement = owner.replace('custom', {
    mode: 'ingress',
    origin: 'https://after.example.com',
  });
  await writing;
  expect(owner.statuses()[0]).toMatchObject({ origin: before.origin, revision: before.revision });
  const stop = owner.stop('custom', before.revision);
  release();
  await replacement;
  const after = owner.statuses()[0]!;
  expect(after.revision).not.toBe(before.revision);
  expect(after.origin).toBe('https://after.example.com');
  expect(await stop).toEqual({ ok: false, code: 'private-route-changed' });
  expect(owner.statuses()[0]?.enabled).toBe(true);
  expect(await owner.stop('custom', after.revision)).toMatchObject({
    ok: true,
    expectedRevision: after.revision,
    status: { state: 'off' },
  });
});

it('keeps revisions on idempotent add and failed replacement, but invalidates them on restart', async () => {
  const credentials = memoryCredentials();
  const options = { credentials: () => credentials, port: () => 1 };
  const owner = createPrivateTunnel(options);
  tunnels.push(owner);
  const input = { mode: 'ingress' as const, origin: 'https://stable.example.com' };
  await owner.add(input);
  const revision = owner.statuses()[0]!.revision;
  expect(revision).toEqual(expect.any(String));
  await owner.add(input);
  expect(owner.statuses()[0]!.revision).toBe(revision);
  const original = credentials.modifyRecord;
  credentials.modifyRecord = async () => {
    throw new Error('storage unavailable');
  };
  expect(
    await owner.replace('custom', { ...input, origin: 'https://other.example.com' }),
  ).toMatchObject({ ok: false });
  expect(owner.statuses()[0]).toMatchObject({ origin: input.origin, revision });
  credentials.modifyRecord = original;
  await owner.close();
  const restarted = createPrivateTunnel(options);
  tunnels.push(restarted);
  await restarted.restore();
  expect(await restarted.stop('custom', revision)).toEqual({
    ok: false,
    code: 'private-route-changed',
  });
});

it('uses the same serialized CAS for real HTTP and does not downgrade malformed revisions', async () => {
  const credentials = memoryCredentials();
  const owner = createPrivateTunnel({ credentials: () => credentials, port: () => 1 });
  tunnels.push(owner);
  await owner.add({ mode: 'ingress', origin: 'https://private.example.com' });
  const revision = owner.statuses()[0]!.revision;
  const database = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('conditional-private-stop-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(database, 'device-pairing'),
    hostName: 'Conditional route',
  });
  const http = createDevicesHttp({
    pairing,
    privateTunnel: owner,
    routes: () => detectPhoneRoutes({ port: 4100, run: async () => '' }),
  });
  const post = (expectedRevision: unknown) =>
    http(
      new Request('http://localhost/api/botharness/devices/private-tunnel', {
        method: 'POST',
        body: JSON.stringify({
          action: 'stop',
          routeId: 'custom',
          confirm: true,
          expectedRevision,
        }),
      }),
    );
  for (const invalid of ['', null, 42, {}, 'x'.repeat(201)]) {
    expect((await post(invalid)).status).toBe(400);
    expect(owner.statuses()[0]?.enabled).toBe(true);
  }
  expect((await post('stale-revision')).status).toBe(409);
  expect(owner.statuses()[0]?.enabled).toBe(true);
  const response = await post(revision);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    ok: true,
    routeId: 'custom',
    expectedRevision: revision,
    status: { state: 'off' },
  });
  expect(owner.statuses()[0]).toMatchObject({ revision, enabled: false, state: 'off' });
});

it('changes configuration identity even when a replacement only rotates the Named Tunnel token', async () => {
  const credentials = memoryCredentials();
  const cloudflared = fakeCloudflared();
  const owner = createPrivateTunnel({
    credentials: () => credentials,
    port: () => 1,
    resolveBinary,
    spawn: cloudflared.spawn,
    fetch: (async () => {
      throw new Error('offline');
    }) as typeof fetch,
  });
  tunnels.push(owner);
  const token = (secret: string) =>
    Buffer.from(JSON.stringify({ a: 'account', t: 'tunnel', s: secret })).toString('base64');
  await owner.add({ mode: 'named', hostname: 'bot.example.com', token: token('before') });
  const before = owner.statuses()[0]!.revision;
  await owner.replace('custom', {
    mode: 'named',
    hostname: 'bot.example.com',
    token: token('after'),
  });
  expect(owner.statuses()[0]!.revision).not.toBe(before);
  expect(await owner.stop('custom', before)).toEqual({ ok: false, code: 'private-route-changed' });
  expect(owner.statuses()[0]?.enabled).toBe(true);
});

it('checks conditional identity inside the final credential write even when a runtime update extends the queue', async () => {
  const credentials = memoryCredentials();
  const cloudflared = fakeCloudflared();
  const owner = createPrivateTunnel({
    credentials: () => credentials,
    port: () => 1,
    resolveBinary,
    spawn: cloudflared.spawn,
    fetch: (async () => {
      throw new Error('offline');
    }) as typeof fetch,
  });
  tunnels.push(owner);
  await owner.add({ mode: 'quick' });
  await vi.waitFor(() =>
    expect(owner.statuses()[0]?.origin).toBe('https://quick-1.trycloudflare.com'),
  );
  const before = owner.statuses()[0]!.revision;
  let release!: () => void;
  let entered!: () => void;
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = credentials.modifyRecord;
  const commits: string[] = [];
  let first = true;
  credentials.modifyRecord = async (key, mutate) => {
    if (first) {
      first = false;
      entered();
      await barrier;
    }
    return original(key, async (current) => {
      const next = await mutate(current);
      commits.push(JSON.stringify(next));
      return next;
    });
  };
  const address = (index: number, hostname: string) => {
    const child = cloudflared.runs[index]!.child as EventEmitter & TunnelProcess;
    child.stderr?.emit('data', `INF | https://${hostname}.trycloudflare.com |\n`);
  };
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    cloudflared.runs[0]!.child.emit('exit', 1);
    await vi.advanceTimersByTimeAsync(10_000);
    address(1, 'quick-1');
    await writing;
    const stopping = owner.stop('quick', before);
    for (let step = 0; step < 5; step++) await Promise.resolve();
    cloudflared.runs[1]!.child.emit('exit', 1);
    await vi.advanceTimersByTimeAsync(20_000);
    address(2, 'manual-b');
    cloudflared.runs[2]!.child.emit('exit', 1);
    await vi.advanceTimersByTimeAsync(40_000);
    address(3, 'quick-1');
    expect(owner.statuses()[0]).toMatchObject({
      origin: 'https://quick-1.trycloudflare.com',
      revision: before,
    });
    release();
    expect(await stopping).toEqual({ ok: false, code: 'private-route-changed' });
    expect(commits.some((record) => record.includes('manual-b.trycloudflare.com'))).toBe(true);
    expect(commits.some((record) => record.includes('"enabled":false'))).toBe(false);
    expect(owner.statuses()[0]?.enabled).toBe(true);
  } finally {
    release();
    await owner.close();
    vi.useRealTimers();
  }
});

it('does not let an old runtime queued address write renew or overwrite a replacement configuration', async () => {
  const credentials = memoryCredentials();
  const cloudflared = fakeCloudflared();
  const owner = createPrivateTunnel({
    credentials: () => credentials,
    port: () => 1,
    resolveBinary,
    spawn: cloudflared.spawn,
    fetch: (async () => {
      throw new Error('offline');
    }) as typeof fetch,
  });
  tunnels.push(owner);
  await owner.add({ mode: 'quick' });
  await vi.waitFor(() =>
    expect(owner.statuses()[0]?.origin).toBe('https://quick-1.trycloudflare.com'),
  );
  let release!: () => void;
  let entered!: () => void;
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = credentials.modifyRecord;
  let first = true;
  credentials.modifyRecord = async (key, mutate) => {
    if (first) {
      first = false;
      entered();
      await barrier;
    }
    return original(key, mutate);
  };
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    const replacement = owner.replace('quick', { mode: 'quick' });
    await writing;
    cloudflared.runs[0]!.child.emit('exit', 1);
    await vi.advanceTimersByTimeAsync(10_010);
    expect(cloudflared.runs).toHaveLength(2);
    release();
    await replacement;
    const committed = owner.statuses()[0]!;
    expect(committed.origin).toBe('https://quick-1.trycloudflare.com');
    await vi.advanceTimersByTimeAsync(0);
    expect(owner.statuses()[0]!.revision).toBe(committed.revision);
    await vi.advanceTimersByTimeAsync(10);
    expect(owner.statuses()[0]?.origin).toBe('https://quick-3.trycloudflare.com');
    expect(owner.statuses()[0]!.revision).not.toBe(committed.revision);
  } finally {
    release();
    await owner.close();
    vi.useRealTimers();
  }
});

it.each([false, true])(
  'binds Quick automatic restart address changes atomically (persistence fails: %s)',
  async (fails) => {
    const credentials = memoryCredentials();
    const cloudflared = fakeCloudflared();
    const owner = createPrivateTunnel({
      credentials: () => credentials,
      port: () => 1,
      resolveBinary,
      spawn: cloudflared.spawn,
      fetch: (async () => {
        throw new Error('offline');
      }) as typeof fetch,
    });
    tunnels.push(owner);
    await owner.add({ mode: 'quick' });
    await vi.waitFor(() =>
      expect(owner.statuses()[0]?.origin).toBe('https://quick-1.trycloudflare.com'),
    );
    const before = owner.statuses()[0]!;
    let release!: () => void;
    let entered!: () => void;
    const writing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = credentials.modifyRecord;
    credentials.modifyRecord = async (key, mutate) => {
      entered();
      await barrier;
      if (fails) throw new Error('storage offline');
      return original(key, mutate);
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      cloudflared.runs[0]!.child.emit('exit', 1);
      await vi.advanceTimersByTimeAsync(10_010);
      await writing;
      expect(cloudflared.runs).toHaveLength(2);
      expect(owner.statuses()[0]).toMatchObject({
        origin: before.origin,
        revision: before.revision,
      });
      const stopping = owner.stop('quick', before.revision);
      release();
      expect(await stopping).toEqual({ ok: false, code: 'private-route-changed' });
      const after = owner.statuses()[0]!;
      expect(after.enabled).toBe(true);
      if (fails) expect(after).toMatchObject({ origin: before.origin, revision: before.revision });
      else {
        expect(after.origin).toBe('https://quick-2.trycloudflare.com');
        expect(after.revision).not.toBe(before.revision);
      }
    } finally {
      release();
      await owner.close();
      vi.useRealTimers();
    }
  },
);
