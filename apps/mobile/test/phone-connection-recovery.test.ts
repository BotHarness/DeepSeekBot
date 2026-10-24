import { afterEach, expect, it, vi } from 'vitest';
import { createHostClient, type HostClient, type HostSnapshot } from '../src/host/client';
import { FakeHost } from './fake-host';

const PRIMARY = 'https://studio.tailnet-example.ts.net';
const SECONDARY = 'https://studio.alternate.ts.net';
let client: HostClient | undefined;
afterEach(() => {
  client?.stop();
  vi.useRealTimers();
});

async function until(accept: (snapshot: HostSnapshot) => boolean) {
  for (let tries = 0; tries < 200; tries += 1) {
    const snapshot = client?.getSnapshot();
    if (snapshot && accept(snapshot)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Recovery timed out: ${JSON.stringify(client?.getSnapshot().connection)}`);
}

async function connect(host: FakeHost, routes = [PRIMARY]) {
  client = createHostClient({
    routes,
    credential: host.credential,
    carrier: host.carrier,
    backoff: () => 5,
    timeoutMs: 100,
  });
  client.start();
  await until((state) => state.connection.status === 'connected');
  return client;
}

it('detects silent loss on foreground and recovers the saved pairing after restoration', async () => {
  const host = new FakeHost();
  const target = await connect(host);
  const roster = target.getSnapshot().roster;
  host.up = false;
  target.retryNow('resume');
  const failed = await until((state) => state.connection.status === 'unreachable');
  expect(failed.roster).toEqual(roster);
  host.up = true;
  target.retryNow();
  await until((state) => state.connection.status === 'connected');
  expect(target.getSnapshot().roster).toEqual(roster);
  expect(host.revoked).toBe(false);
});

it('selects another saved route after a network switch and returns after it recovers', async () => {
  const host = new FakeHost();
  const target = await connect(host, [PRIMARY, SECONDARY]);
  host.unreachable.add(PRIMARY);
  target.retryNow('resume');
  const switched = await until(
    (state) => state.connection.status === 'connected' && state.connection.route === SECONDARY,
  );
  expect(switched.roster?.bots.length).toBeGreaterThan(0);
  host.unreachable.delete(PRIMARY);
  host.unreachable.add(SECONDARY);
  target.retryNow('resume');
  await until(
    (state) => state.connection.status === 'connected' && state.connection.route === PRIMARY,
  );
  expect(host.requests.some((request) => request.includes(SECONDARY))).toBe(true);
});

it('detects silent loss with a bounded health probe without a foreground event', async () => {
  vi.useFakeTimers();
  const host = new FakeHost();
  client = createHostClient({
    routes: [PRIMARY],
    credential: host.credential,
    carrier: host.carrier,
    backoff: () => 500,
    timeoutMs: 100,
  });
  client.start();
  await vi.advanceTimersByTimeAsync(1);
  expect(client.getSnapshot().connection.status).toBe('connected');
  const states: string[] = [];
  const target = client;
  client.subscribe(() => states.push(target.getSnapshot().connection.status));
  host.up = false;
  await vi.advanceTimersByTimeAsync(20_000);
  expect(states).toContain('unreachable');
  expect(['unreachable', 'reconnecting']).toContain(client.getSnapshot().connection.status);
  client.stop();
  const count = host.requests.length;
  await vi.advanceTimersByTimeAsync(40_000);
  expect(host.requests).toHaveLength(count);
});

it('retains explicit revoke refusal instead of retrying a credential forever', async () => {
  const host = new FakeHost();
  const target = await connect(host);
  host.revoked = true;
  target.retryNow('resume');
  const result = await until((state) => state.connection.status === 'refused');
  expect(result.connection).toMatchObject({ code: 'device-revoked' });
  const count = host.requests.length;
  target.retryNow();
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(host.requests).toHaveLength(count);
});

it('does not reconnect after stopping during a failed foreground probe', async () => {
  const host = new FakeHost();
  const target = await connect(host);
  host.up = false;
  target.retryNow('resume');
  target.stop();
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(target.getSnapshot().connection.status).toBe('stopped');
});
