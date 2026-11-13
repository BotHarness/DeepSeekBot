import { afterEach, expect, it, vi } from 'vitest';
import { createHostClient, type HostClient, type HostClientOptions } from '../src/host/client';
import { parseSavedHost, serializeSavedHost } from '../src/host/hosts';
import { FakeHost } from './fake-host';

const A = 'https://first.example.ts.net';
const B = 'https://second.example.ts.net';
const clients: HostClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((client) => client.stop());
});
async function until(test: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (test()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw Error('connection did not settle');
}
function connect(host: FakeHost, extra: Partial<HostClientOptions> = {}) {
  const client = createHostClient({
    routes: [A, B],
    credential: host.credential,
    carrier: host.carrier,
    timeoutMs: 100,
    backoff: () => 10,
    ...extra,
  });
  clients.push(client);
  client.start();
  return client;
}
const connected = (client: HostClient, route: string) =>
  client.getSnapshot().connection.status === 'connected' &&
  client.getSnapshot().connection.route === route;

it('keeps a persisted manual failure visible, recovers only on automatic, and isolates another client', async () => {
  const host = new FakeHost();
  host.unreachable.add(A);
  let saved: string | undefined = A;
  const manual = connect(host, {
    routePreference: saved,
    onRoutePreferenceChanged: async (next) => {
      saved = next;
    },
  });
  const automatic = connect(host);
  await until(
    () => manual.getSnapshot().connection.status === 'unreachable' && connected(automatic, B),
  );
  expect(manual.getSnapshot().routePreference).toBe(A);
  expect(manual.getSnapshot().connection.route).toBe(A);
  expect(manual.getSnapshot().roster).toBeUndefined();
  await manual.setRoutePreference!(undefined);
  await until(() => connected(manual, B));
  expect(saved).toBeUndefined();
  expect(connected(automatic, B)).toBe(true);
  host.revoke();
  await until(() =>
    clients.every((client) => client.getSnapshot().connection.status === 'refused'),
  );
});

it('persists before switching and keeps the current selection after a failed save', async () => {
  const host = new FakeHost();
  const save = vi.fn(async () => {
    throw Error('storage unavailable');
  });
  const client = connect(host, { onRoutePreferenceChanged: save });
  await until(() => connected(client, A));
  await expect(client.setRoutePreference!(B)).rejects.toThrow('storage unavailable');
  expect(client.getSnapshot().routePreference).toBeUndefined();
  expect(connected(client, A)).toBe(true);
  expect(save).toHaveBeenCalledWith(B);
  await expect(client.setRoutePreference!('https://untrusted.example')).rejects.toThrow(
    'connection-route-unknown',
  );
  expect(save).toHaveBeenCalledTimes(1);
});

it.each(['complete', 'timeout'] as const)(
  'drains an accepted write before switching without replay when it %ss',
  async (outcome) => {
    const host = new FakeHost();
    let complete: (() => void) | undefined;
    host.methods.set(
      'pending-write',
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const client = connect(host, {
      carrier: {
        ...host.carrier,
        request: async (url, init) => {
          const reply = host.carrier.request(url, init);
          if (!url.endsWith('/pending-write')) return reply;
          return Promise.race([
            reply,
            new Promise<never>((_, reject) => {
              init.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true });
            }),
          ]);
        },
      },
    });
    await until(() => connected(client, A));
    const request = client.call('pending-write').then(
      () => 'complete',
      () => 'timeout',
    );
    await until(() => complete !== undefined);
    await client.setRoutePreference!(B);
    expect(connected(client, A)).toBe(true);
    expect(client.getSnapshot().routeChangePending).toBe(true);
    if (outcome === 'complete') complete!();
    expect(await request).toBe(outcome);
    await until(() => connected(client, B));
    expect(client.getSnapshot().routeChangePending).toBeUndefined();
    expect(host.calls.filter((call) => call.method === 'pending-write')).toHaveLength(1);
  },
);

it('does not fall back when a saved manual route is no longer eligible', async () => {
  const host = new FakeHost();
  const client = connect(host, { routes: [B], routePreference: A });
  await until(() => client.getSnapshot().connection.status === 'unreachable');
  expect(host.requests).toHaveLength(0);
  expect(client.getSnapshot().routePreference).toBe(A);
  await client.setRoutePreference!(undefined);
  await until(() => connected(client, B));
});

it('round-trips a client preference without changing the saved Host identity or routes', () => {
  const saved = {
    hostId: 'host',
    hostName: 'Studio',
    routes: [A, B],
    deviceId: 'device',
    credential: 'secret',
    routePreference: B,
  };
  expect(parseSavedHost(serializeSavedHost(saved))).toEqual(saved);
  expect(parseSavedHost({ ...saved, routePreference: false })).toBeUndefined();
});

it('waits for an accepted upload before selecting another route without sending it twice', async () => {
  const host = new FakeHost();
  let release: (() => void) | undefined;
  const client = connect(host, {
    carrier: {
      ...host.carrier,
      request: async (url, init) => {
        const response = await host.carrier.request(url, init);
        if (new URL(url).pathname.endsWith('/attachment/upload'))
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        return response;
      },
    },
  });
  await until(() => connected(client, A));
  const upload = client.upload('qa.txt', new Blob(['route check']));
  await until(() => release !== undefined);
  await client.setRoutePreference!(B);
  expect(connected(client, A)).toBe(true);
  expect(client.getSnapshot().routeChangePending).toBe(true);
  release!();
  await upload;
  await until(() => connected(client, B));
  expect(host.uploads).toHaveLength(1);
});

it('does not let an earlier connection probe overwrite a newly saved manual preference', async () => {
  const host = new FakeHost();
  let release: (() => void) | undefined;
  let held = false;
  const client = connect(host, {
    carrier: {
      ...host.carrier,
      request: async (url, init) => {
        if (!held && url.startsWith(A) && url.endsWith('/list')) {
          held = true;
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return host.carrier.request(url, init);
      },
    },
  });
  await until(() => release !== undefined);
  await client.setRoutePreference!(B);
  release!();
  await until(() => connected(client, B));
  expect(client.getSnapshot().routePreference).toBe(B);
});

it('returning to automatic never expands a private relay’s admitted route set', async () => {
  const host = new FakeHost();
  const origin = 'https://private.example';
  const attempts: string[] = [];
  const client = connect(host, {
    routes: [origin],
    routePreference: origin,
    encryption: {
      protocol: 'connect-noise-xk-v1',
      hostKey: '11'.repeat(32),
      deviceKey: '22'.repeat(32),
      privateRelay: { origin, token: '33'.repeat(32) },
    },
    carrier: {
      ...host.carrier,
      openSocket: (url) => {
        attempts.push(new URL(url.replace(/^ws/u, 'http')).origin);
        throw Error('offline');
      },
      request: async (url) => {
        attempts.push(new URL(url).origin);
        throw Error('offline');
      },
    },
  });
  await until(() => client.getSnapshot().connection.status === 'unreachable');
  await expect(client.setRoutePreference!(B)).rejects.toThrow('connection-route-unknown');
  await client.setRoutePreference!(undefined);
  await until(() => attempts.length > 1);
  expect([...new Set(attempts)]).toEqual([origin]);
});
