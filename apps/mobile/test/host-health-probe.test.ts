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

function start(host: FakeHost): HostClient {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const target = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: host.credential,
    carrier: host.carrier,
    backoff: () => 5,
    timeoutMs: 200,
  });
  client = target;
  target.start();
  return target;
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
  host.calls.length = 0;
  vi.advanceTimersByTime(20_000);
  await vi.waitFor(() => expect(probes(host)).toEqual(['ping', 'list']));
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
  host.calls.length = 0;
  vi.advanceTimersByTime(20_000);
  await vi.waitFor(() => expect(probes(host)).toEqual(['ping', 'list']));
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

it('records the computer version from ping and flags one below the supported minimum', async () => {
  const host = new FakeHost();
  host.methods.set('ping', () => ({ ok: true, version: '1.7.0' }));
  const target = start(host);
  await connected(target);
  vi.advanceTimersByTime(20_000);
  await vi.waitFor(() =>
    expect(target.getSnapshot().compatibility).toEqual({ hostVersion: '1.7.0' }),
  );
  host.methods.set('ping', () => ({ ok: true, version: '1.5.0' }));
  vi.advanceTimersByTime(20_000);
  await vi.waitFor(() =>
    expect(target.getSnapshot().compatibility).toEqual({ hostVersion: '1.5.0', update: 'host' }),
  );
  expect(target.getSnapshot().connection.status).toBe('connected');
});

it('sends the app version and shows when the computer needs a newer app', async () => {
  const host = new FakeHost();
  const target = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: host.credential,
    carrier: host.carrier,
    backoff: () => 5,
    timeoutMs: 200,
    appVersion: '1.7.0',
  });
  client = target;
  target.start();
  await connected(target);
  await target.call('ping');
  expect(host.lastHeaders?.['x-tobs-app-version']).toBe('1.7.0');
  host.appTooOld = true;
  await expect(target.call('ping')).rejects.toMatchObject({ code: 'app-update-required' });
  expect(target.getSnapshot().compatibility).toEqual({ update: 'app' });
  expect(target.getSnapshot().connection.status).toBe('connected');
});
