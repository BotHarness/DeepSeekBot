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
