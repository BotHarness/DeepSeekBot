import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createHostClient,
  defaultBackoff,
  MAX_RECONNECT_DELAY_MS,
  type HostClient,
} from '@botharness/host-client/client';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';
import { createConnectionLifetime } from '../src/host/connection-lifetime';

import { LOOPBACK, ROUTE, latest, thinking, until } from './host-client-fixtures';

let client: HostClient | undefined;

afterEach(() => client?.stop());

function connect(
  host: FakeHost,
  credential = host.credential,
  routes = [ROUTE, LOOPBACK],
): HostClient {
  client = createHostClient({
    routes,
    credential,
    carrier: host.carrier,
    backoff: () => 5,
    timeoutMs: 200,
  });
  client.start();
  return client;
}

describe('Host client', () => {
  it('preserves a live call carrier and probes the same carrier after release', async () => {
    const host = new FakeHost();
    let sockets = 0;
    let closes = 0;
    client = createHostClient({
      routes: [ROUTE],
      credential: host.credential,
      carrier: {
        ...host.carrier,
        openSocket: (url, events, headers) => {
          sockets += 1;
          const socket = host.carrier.openSocket(url, events, headers);
          return {
            ...socket,
            close: () => {
              closes += 1;
              socket.close();
            },
          };
        },
      },
      backoff: () => 5,
      timeoutMs: 200,
    });
    const target = client;
    const lifetime = createConnectionLifetime(true);
    lifetime.add(target);
    const release = lifetime.retain(target);
    await until(target, (state) => state.connection.status === 'connected');
    for (let cycle = 0; cycle < 3; cycle += 1) {
      target.retryNow('resume', { preserveConnected: lifetime.retained(target) });
      await target.call('ping');
      expect(target.getSnapshot().connection.status).toBe('connected');
      expect(sockets).toBe(1);
      expect(closes).toBe(0);
    }
    release();
    target.retryNow('resume', { preserveConnected: lifetime.retained(target) });
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(target.getSnapshot().connection.status).toBe('connected');
    expect(sockets).toBe(1);
    expect(closes).toBe(0);
  });

  it('recovers a disconnected retained Host and still accepts credential refusal', async () => {
    const host = new FakeHost();
    const target = connect(host);
    await until(target, (state) => state.connection.status === 'connected');
    host.kill();
    await until(target, (state) => state.connection.status === 'unreachable');
    host.restart();
    target.retryNow('resume', { preserveConnected: true });
    await until(target, (state) => state.connection.status === 'connected');
    host.revoked = true;
    await expect(target.call('ping')).rejects.toThrow();
    expect(target.getSnapshot().connection.status).toBe('refused');
    const requests = host.requests.length;
    target.retryNow('resume', { preserveConnected: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(host.requests.length).toBe(requests);
  });

  it('keeps a Channel follower live across repeated foreground recovery', async () => {
    const host = new FakeHost();
    const channel = host.channel('resume-channel');
    const target = connect(host);
    await until(target, (s) => s.connection.status === 'connected');
    const received: unknown[] = [];
    const interrupted = vi.fn();
    const off = target.follow(
      'botharness/followChannel',
      { channelId: channel.id, limit: 20 },
      {
        item: (item) => received.push(item),
        interrupted,
        refused(error) {
          throw new Error(error.message);
        },
      },
    );
    await until(target, () => channel.followerCount === 1);
    for (let cycle = 0; cycle < 5; cycle += 1) {
      target.retryNow('resume');
      expect(target.getSnapshot().connection.status).toBe('connected');
      await until(target, (s) => s.connection.status === 'connected');
      expect(channel.followerCount).toBe(1);
      channel.append({ id: `resume-${cycle}`, body: `foreground ${cycle}` });
      expect(received).toContainEqual(
        expect.objectContaining({
          type: 'entry',
          entry: expect.objectContaining({
            message: expect.objectContaining({ id: `resume-${cycle}` }),
          }),
        }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(interrupted).not.toHaveBeenCalled();
    expect(channel.follows).toHaveLength(1);
    host.push('botharness/followRoster', latest[0]);
    expect(target.getSnapshot().roster?.bots[0]?.preview).toBe('mobile tracer probe');
    off();
    expect(channel.followerCount).toBe(0);
  });

  it('shows unreachable on a failed resume and recovers when the route returns', async () => {
    const host = new FakeHost();
    const target = connect(host, host.credential, [ROUTE]);
    await until(target, (s) => s.connection.status === 'connected');
    host.unreachable.add(ROUTE);
    host.kill();
    target.retryNow('resume');
    await until(target, (s) => s.connection.status === 'unreachable');
    host.unreachable.delete(ROUTE);
    host.restart();
    await until(target, (s) => s.connection.status === 'connected');
    host.push('botharness/followRoster', latest[0]);
    expect(target.getSnapshot().roster?.bots[0]?.preview).toBe('mobile tracer probe');
  });

  it('tries a newly learned address at once instead of waiting out the backoff', async () => {
    const host = new FakeHost();
    const moved = 'https://laptop.tailnet-example.ts.net';
    host.unreachable.add(ROUTE);
    client = createHostClient({
      routes: [ROUTE],
      credential: host.credential,
      carrier: host.carrier,
      backoff: () => 60_000,
      timeoutMs: 200,
    });
    client.start();
    const target = client;
    await until(target, (s) => s.connection.status === 'unreachable');
    target.updateRoutes?.([moved]);
    await until(target, (s) => s.connection.status === 'connected');
    expect(target.getSnapshot().connection.route).toBe(moved);
  });

  it('does not reopen a stopped client when its resume route probe completes late', async () => {
    const host = new FakeHost();
    let hold = false;
    let release!: () => void;
    let sockets = 0;
    client = createHostClient({
      routes: [ROUTE],
      credential: host.credential,
      timeoutMs: 200,
      carrier: {
        ...host.carrier,
        request: async (url, init) => {
          if (hold)
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          return host.carrier.request(url, init);
        },
        openSocket: (...args) => {
          sockets += 1;
          const [url, events, headers] = args;
          return host.carrier.openSocket(
            url,
            {
              ...events,
              message: (text) => {
                if (!hold) events.message(text);
              },
            },
            headers,
          );
        },
      },
    });
    client.start();
    await until(client, (s) => s.connection.status === 'connected');
    hold = true;
    client.retryNow('resume');
    await until(client, () => typeof release === 'function');
    client.stop();
    hold = false;
    release();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sockets).toBe(1);
    expect(client.getSnapshot().connection.status).toBe('stopped');
  });

  it('restores live updates on resume when the old socket silently stops delivering', async () => {
    const host = new FakeHost();
    let suspended = false;
    let sockets = 0;
    let closeOld = () => {};
    client = createHostClient({
      routes: [ROUTE],
      credential: host.credential,
      carrier: {
        ...host.carrier,
        openSocket(url, events, headers) {
          const first = ++sockets === 1;
          if (first) closeOld = () => events.closed('late old connection close');
          return host.carrier.openSocket(
            url,
            {
              ...events,
              message: (text) => {
                if (!first || !suspended) events.message(text);
              },
              closed: (reason) => {
                if (!first || !suspended) events.closed(reason);
              },
            },
            headers,
          );
        },
      },
      timeoutMs: 200,
      backoff: () => 5,
    });
    const target = client;
    target.start();
    await until(target, (s) => s.connection.status === 'connected');
    suspended = true;
    target.retryNow('resume');
    await until(target, (s) => {
      host.push('botharness/followRoster', latest[0]);
      return (
        s.connection.status === 'connected' && s.roster?.bots[0]?.preview === 'mobile tracer probe'
      );
    });
    expect(sockets).toBe(2);
    let liveEvents = 0;
    target.onLive(() => liveEvents++);
    closeOld();
    host.push('botharness/followRoster', latest[0]);
    expect(liveEvents).toBe(1);
    expect(target.getSnapshot().connection.status).toBe('connected');
  });

  it.each(['complete', 'timeout'] as const)(
    'defers dead-carrier recovery until an accepted write %ss without replaying it',
    async (outcome) => {
      const host = new FakeHost();
      let complete!: () => void;
      host.methods.set(
        'pending-write',
        () =>
          new Promise<void>((resolve) => {
            complete = resolve;
          }),
      );
      let suspended = false;
      let sockets = 0;
      let closes = 0;
      client = createHostClient({
        routes: [ROUTE],
        credential: host.credential,
        timeoutMs: 100,
        carrier: {
          ...host.carrier,
          close: () => {
            closes++;
          },
          openSocket: (url, events, headers) => {
            const first = ++sockets === 1;
            return host.carrier.openSocket(
              url,
              {
                ...events,
                message: (text) => {
                  if (!first || !suspended) events.message(text);
                },
              },
              headers,
            );
          },
          request: async (url, init) => {
            const response = host.carrier.request(url, init);
            if (!url.endsWith('/pending-write')) return response;
            return Promise.race([
              response,
              new Promise<never>((_, reject) => {
                init.signal.addEventListener('abort', () => reject(new Error('aborted')), {
                  once: true,
                });
              }),
            ]);
          },
        },
      });
      const target = client;
      target.start();
      await until(target, (s) => s.connection.status === 'connected');
      const pending = target.call('pending-write').then(
        () => 'complete',
        () => 'timeout',
      );
      await until(target, () => typeof complete === 'function');
      suspended = true;
      target.retryNow('resume');
      expect(closes).toBe(0);
      expect(sockets).toBe(1);
      if (outcome === 'complete') complete();
      expect(await pending).toBe(outcome);
      await until(target, (s) => s.connection.status === 'connected' && sockets === 2);
      expect(host.calls.filter((entry) => entry.method === 'pending-write')).toHaveLength(1);
    },
  );
  it('backs a failing Host off to half a minute so a returning Host is found quickly', () => {
    expect(defaultBackoff(1)).toBe(500);
    expect(defaultBackoff(6)).toBe(16_000);
    expect(defaultBackoff(7)).toBe(MAX_RECONNECT_DELAY_MS);
    expect(defaultBackoff(40)).toBe(MAX_RECONNECT_DELAY_MS);
    expect(MAX_RECONNECT_DELAY_MS).toBe(30_000);
  });

  it('stops calling a Host once it no longer accepts this phone', async () => {
    const host = new FakeHost();
    const target = connect(host);
    await until(target, (state) => state.connection.status === 'connected');
    host.revoke();
    await until(target, (state) => state.connection.status === 'refused');
    const before = host.requests.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(host.requests.length).toBe(before);
  });

  it('keeps backing off when connections keep dropping right after they open', async () => {
    const host = new FakeHost();
    const attempts: number[] = [];
    client = createHostClient({
      routes: [ROUTE],
      credential: host.credential,
      carrier: host.carrier,
      backoff: (attempt) => {
        attempts.push(attempt);
        return 5;
      },
      timeoutMs: 200,
    });
    client.start();
    const target = client;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await until(target, (state) => state.connection.status === 'connected');
      host.kill();
      await until(target, (state) => state.connection.status !== 'connected');
      host.restart();
    }
    await until(target, (state) => state.connection.status === 'connected');
    expect(attempts).toEqual([1, 2, 3]);
  });
  it.each(['lan-unreachable', 'channel-authentication-failed'])(
    'falls through an unavailable LAN route but stops on a Host key refusal: %s',
    async (reason) => {
      const host = new FakeHost();
      client = createHostClient({
        routes: ['http://192.168.1.20:4567', ROUTE],
        hostId: 'test-host',
        encryption: {
          protocol: 'connect-noise-xk-v1',
          hostKey: '11'.repeat(32),
          deviceKey: '22'.repeat(32),
        },
        credential: host.credential,
        carrier: {
          ...host.carrier,
          openSocket: (url, events, headers) => {
            if (!url.startsWith('ws://192.168.1.20:4567/'))
              return host.carrier.openSocket(url, events, headers);
            queueMicrotask(() => events.closed(reason));
            return { send: () => {}, close: () => {} };
          },
        },
        backoff: () => 5,
      });
      client.start();
      const state = await until(
        client,
        (snapshot) =>
          snapshot.connection.status ===
          (reason === 'lan-unreachable' ? 'connected' : 'unreachable'),
      );
      if (reason === 'lan-unreachable') expect(state.connection).toMatchObject({ route: ROUTE });
      else expect(host.requests).toEqual([]);
    },
  );
  it.each([
    ['a Host that rejects the handshake', 'channel-handshake-rejected', 'host-key-changed'],
    ['a Host whose key does not verify', 'channel-authentication-failed', 'host-key-changed'],
    ['a LAN Host that closes before answering', '', undefined],
    ['a LAN Host that drops the socket', 'socket error', undefined],
  ])(
    'marks a pairing for re-pairing only after repeated rejection by %s',
    async (_, reason, code) => {
      const host = new FakeHost();
      let attempts = 0;
      client = createHostClient({
        routes: ['http://192.168.1.20:4567'],
        hostId: 'test-host',
        encryption: {
          protocol: 'connect-noise-xk-v1',
          hostKey: '11'.repeat(32),
          deviceKey: '22'.repeat(32),
        },
        credential: host.credential,
        carrier: {
          ...host.carrier,
          openSocket: (_url, events) => {
            attempts += 1;
            queueMicrotask(() => {
              events.open();
              events.closed(reason);
            });
            return { send: () => {}, close: () => {} };
          },
        },
        backoff: () => 5,
      });
      client.start();
      if (code === undefined) {
        await until(client, () => attempts >= 6);
        expect(client.getSnapshot().connection.status).toBe('unreachable');
        return;
      }
      const state = await until(client, (snapshot) => snapshot.connection.status === 'refused');
      expect(state.connection).toMatchObject({ code });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(attempts).toBe(3);
    },
  );

  it('shows unreachable while the Host is down and reconnects with the same credential after restart', async () => {
    const host = new FakeHost();
    const target = connect(host);
    await until(target, (s) => s.connection.status === 'connected');
    host.kill();
    const down = await until(target, (s) => s.connection.status === 'unreachable');
    expect(down.connection).toMatchObject({ route: ROUTE });
    expect(down.roster?.bots).toHaveLength(1);
    host.restart();
    await until(target, (s) => s.connection.status === 'connected');
  });

  it('uses the first route that answers', async () => {
    const host = new FakeHost();
    host.unreachable.add(ROUTE);
    const target = connect(host);
    const snapshot = await until(target, (s) => s.connection.status === 'connected');
    expect(snapshot.connection.route).toBe(LOOPBACK);
  });

  it('fails a generation when the Host refuses a stream, then keeps retrying', async () => {
    const host = new FakeHost();
    const carrier = host.carrier;
    let refuse = true;
    client = createHostClient({
      routes: [ROUTE],
      credential: host.credential,
      backoff: () => 5,
      timeoutMs: 200,
      carrier: {
        ...carrier,
        openSocket(url, events, headers) {
          const socket = carrier.openSocket(url, events, headers);
          return {
            ...socket,
            send(text) {
              socket.send(
                refuse
                  ? text.replace('botharness/followActivity', 'botharness/doesNotExist')
                  : text,
              );
            },
          };
        },
      },
    });
    client.start();
    const failed = await until(client, (s) => s.connection.status === 'unreachable');
    expect(failed.connection).toMatchObject({
      reason: expect.stringContaining('gateway/invocation-unavailable'),
    });
    refuse = false;
    await until(client, (s) => s.connection.status === 'connected');
  });
});

it('reports telemetry ready only after the authenticated Roster reload, including manual retry', async () => {
  const host = new FakeHost();
  let holdChannels: (() => void) | undefined;
  let delay = new Promise<void>((resolve) => {
    holdChannels = resolve;
  });
  const updates: string[] = [];
  client = createHostClient({
    routes: [ROUTE],
    credential: host.credential,
    timeoutMs: 1000,
    carrier: {
      ...host.carrier,
      request: async (url, init) => {
        if (url.endsWith('/channels')) await delay;
        return host.carrier.request(url, init);
      },
    },
    telemetry: {
      begin: (trigger) => {
        updates.push(trigger);
      },
      update: (status) => {
        updates.push(status);
      },
      dispose() {},
    },
  });
  client.start();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(updates).toEqual(['connecting']);
  holdChannels?.();
  await until(client, (s) => s.connection.status === 'connected');
  expect(updates).toEqual(['connecting', 'connected']);
  delay = new Promise<void>((resolve) => {
    holdChannels = resolve;
  });
  client.retryNow();
  host.push('botharness/followActivity', thinking);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(updates).toEqual(['connecting', 'connected', 'manual_retry']);
  holdChannels?.();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(updates).toEqual(['connecting', 'connected', 'manual_retry', 'connected']);
});
