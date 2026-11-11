import { afterEach, expect, it, vi } from 'vitest';

import { createHostClient, type HostClient } from '../src/host/client';
import { FakeHost } from './fake-host';

let client: HostClient | undefined;
afterEach(() => {
  client?.stop();
  vi.useRealTimers();
});

async function connected(target: HostClient): Promise<void> {
  for (let tries = 0; tries < 600; tries += 1) {
    if (target.getSnapshot().connection.status === 'connected') return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('timed out');
}

function start(host: FakeHost, appVersion?: string): HostClient {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const target = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: host.credential,
    carrier: host.carrier,
    backoff: () => 5,
    timeoutMs: 200,
    ...(appVersion === undefined ? {} : { appVersion }),
  });
  client = target;
  target.start();
  return target;
}

function pendingVersion() {
  let resolve: (value: unknown) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<unknown>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const probes = (host: FakeHost) =>
  host.calls.map((call) => call.method).filter((method) => method === 'ping' || method === 'list');

it('checks Host health with ping instead of reading the Bot list', async () => {
  const host = new FakeHost();
  const target = start(host);
  await connected(target);
  host.calls.length = 0;
  vi.advanceTimersByTime(20_000);
  await vi.waitFor(() => expect(probes(host)).toEqual(['ping']));
});

it('falls back to the Bot list on a Host without ping', async () => {
  const host = new FakeHost();
  host.methods.set('ping', () => {
    throw Object.assign(new Error('unknown'), { code: 'gateway/method-not-found' });
  });
  const target = start(host);
  await connected(target);
  expect(target.getSnapshot().compatibility).toEqual({ update: 'host' });
  host.calls.length = 0;
  vi.advanceTimersByTime(20_000);
  await vi.waitFor(() => expect(probes(host)).toEqual(['list']));
  host.calls.length = 0;
  vi.advanceTimersByTime(20_000);
  await vi.waitFor(() => expect(probes(host)).toEqual(['list']));
  expect(target.getSnapshot().connection.status).toBe('connected');
});

it('falls back to the Bot list when an older Host answers ping with 404', async () => {
  const host = new FakeHost();
  host.absent.add('ping');
  const target = start(host);
  await connected(target);
  expect(target.getSnapshot().compatibility).toEqual({ update: 'host' });
  host.calls.length = 0;
  vi.advanceTimersByTime(20_000);
  await vi.waitFor(() => expect(probes(host)).toEqual(['list']));
  host.calls.length = 0;
  vi.advanceTimersByTime(20_000);
  await vi.waitFor(() => expect(probes(host)).toEqual(['list']));
  expect(target.getSnapshot().connection.status).toBe('connected');
});

it('still reports the Host offline when the Bot list is missing too', async () => {
  const host = new FakeHost();
  const target = start(host);
  await connected(target);
  host.absent.add('ping');
  host.absent.add('list');
  vi.advanceTimersByTime(20_000);
  await vi.waitFor(() => expect(target.getSnapshot().connection.status).not.toBe('connected'));
});

it('tells the Human to update the computer when it lacks a method', async () => {
  const host = new FakeHost();
  host.absent.add('sessionStop');
  const target = start(host);
  await connected(target);
  await expect(target.call('sessionStop', { botSlug: 'ada', activityId: 's1' })).rejects.toThrow(
    "This computer's Tobs does not support botharness/sessionStop yet. Update Tobs on the computer.",
  );
  expect(target.getSnapshot().connection.status).toBe('connected');
});

it('knows the computer version as soon as it connects and flags one below the minimum', async () => {
  const host = new FakeHost();
  host.methods.set('ping', () => ({ ok: true, version: '1.7.0' }));
  const target = start(host);
  await connected(target);
  expect(target.getSnapshot().compatibility).toEqual({ hostVersion: '1.7.0' });
  host.methods.set('ping', () => ({ ok: true, version: '1.5.0' }));
  vi.advanceTimersByTime(20_000);
  await vi.waitFor(() =>
    expect(target.getSnapshot().compatibility).toEqual({ hostVersion: '1.5.0', update: 'host' }),
  );
  expect(target.getSnapshot().connection.status).toBe('connected');
});

it('sends the app version and suggests an app update without blocking calls', async () => {
  const host = new FakeHost();
  host.methods.set('ping', () => ({ ok: true, version: '1.9.0', minAppVersion: '1.8.0' }));
  const target = start(host, '1.7.0');
  await connected(target);
  expect(target.getSnapshot().compatibility).toEqual({ hostVersion: '1.9.0', update: 'app' });
  expect(host.lastHeaders?.['x-tobs-app-version']).toBe('1.7.0');
  await expect(target.call('list')).resolves.toBeDefined();
  expect(target.getSnapshot().connection.status).toBe('connected');
});

it('stays connected to an older computer without the roster arrangement or list changes', async () => {
  const host = new FakeHost();
  host.absent.add('rosterGet');
  host.absent.add('channelListChanges');
  const target = start(host);
  await connected(target);
  await target.refresh();
  expect(target.getSnapshot().connection.status).toBe('connected');
  expect(target.getSnapshot().roster).toBeDefined();
});

it('suggests an app update when ping has no Host version', async () => {
  const host = new FakeHost();
  host.methods.set('ping', () => ({ ok: true, minAppVersion: '1.8.0' }));
  const target = start(host, '1.7.0');
  await connected(target);
  vi.advanceTimersByTime(20_000);
  await vi.waitFor(() => expect(target.getSnapshot().compatibility).toEqual({ update: 'app' }));
});

it('clears the update suggestion after the computer is updated and reconnects', async () => {
  const host = new FakeHost();
  host.absent.add('ping');
  const target = start(host);
  await connected(target);
  expect(target.getSnapshot().compatibility).toEqual({ update: 'host' });
  host.absent.delete('ping');
  host.methods.set('ping', () => ({ ok: true, version: '1.7.0' }));
  host.kill();
  await vi.waitFor(() => expect(target.getSnapshot().connection.status).not.toBe('connected'));
  host.restart();
  await connected(target);
  expect(target.getSnapshot().compatibility).toEqual({ hostVersion: '1.7.0' });
});

it('connects and loads chats while the optional version read is still pending', async () => {
  const host = new FakeHost();
  const version = pendingVersion();
  host.methods.set('ping', () => version.promise);
  const target = start(host);
  try {
    await connected(target);
    expect(target.getSnapshot().roster).toBeDefined();
    expect(target.getSnapshot().compatibility).toBeUndefined();
    expect(probes(host).filter((method) => method === 'ping')).toHaveLength(1);
    version.resolve({ version: '1.7.0' });
    await vi.waitFor(() =>
      expect(target.getSnapshot().compatibility).toEqual({ hostVersion: '1.7.0' }),
    );
  } finally {
    version.resolve({ version: '1.7.0' });
  }
});

it('retries application refusals without calling the computer outdated', async () => {
  const host = new FakeHost();
  host.methods.set('ping', () => {
    throw Object.assign(new Error('try again'), { code: 'temporarily-unavailable' });
  });
  const target = start(host);
  await connected(target);
  expect(target.getSnapshot().compatibility).toBeUndefined();
  host.methods.set('ping', () => ({ version: '1.7.0' }));
  host.calls.length = 0;
  vi.advanceTimersByTime(20_000);
  await vi.waitFor(() =>
    expect(target.getSnapshot().compatibility).toEqual({ hostVersion: '1.7.0' }),
  );
  expect(probes(host)).toEqual(['ping']);
});

it.each(['success', 'missing'] as const)(
  'ignores stale %s compatibility after reconnecting',
  async (outcome) => {
    const host = new FakeHost();
    const oldVersion = pendingVersion();
    host.methods.set('ping', () => oldVersion.promise);
    const target = start(host);
    try {
      await connected(target);
      host.methods.set('ping', () => ({ version: '1.7.0' }));
      host.kill();
      await vi.waitFor(() => expect(target.getSnapshot().connection.status).not.toBe('connected'));
      host.restart();
      await connected(target);
      await vi.waitFor(() =>
        expect(target.getSnapshot().compatibility).toEqual({ hostVersion: '1.7.0' }),
      );
      if (outcome === 'success') oldVersion.resolve({ version: '1.0.0' });
      else
        oldVersion.reject(
          Object.assign(new Error('missing'), { code: 'gateway/method-not-found' }),
        );
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(target.getSnapshot().compatibility).toEqual({ hostVersion: '1.7.0' });
      host.calls.length = 0;
      vi.advanceTimersByTime(20_000);
      await vi.waitFor(() => expect(probes(host)).toEqual(['ping']));
    } finally {
      oldVersion.resolve({ version: '1.7.0' });
    }
  },
);
