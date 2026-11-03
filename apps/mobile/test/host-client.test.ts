import { afterEach, describe, expect, it } from 'vitest';

import { createHostClient, type HostClient, type HostSnapshot } from '../src/host/client';
import { parsePairingLink, redeemPairing } from '../src/host/pairing';
import { checkRoute } from '../src/host/route';
import { SECRET_ROUTE_METHODS } from '../../../packages/core/src/bridge/secret-route';
import { FakeHost } from './fake-host';
import wire from './fixtures/host-wire.json';

const ROUTE = 'https://studio.tailnet-example.ts.net';
const recordedBot = wire.rpc.list.at(-1)!.body as {
  result: { value: { bots: Array<{ slug: string; displayName: string }> } };
};
const bot = recordedBot.result.value.bots[0]!;
const [thinking, , idle] = wire.mux.activity.slice(1);
const latest = wire.mux.roster.filter((frame) => frame.type === 'latest');

let client: HostClient | undefined;
afterEach(() => client?.stop());

const LOOPBACK = 'http://127.0.0.1:4100';

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

async function until(
  target: HostClient,
  accept: (snapshot: HostSnapshot) => boolean,
  limit = 200,
): Promise<HostSnapshot> {
  for (let tries = 0; tries < limit; tries += 1) {
    const snapshot = target.getSnapshot();
    if (accept(snapshot)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out; last state ${JSON.stringify(target.getSnapshot().connection)}`);
}

describe('Host client', () => {
  it('keeps a Channel follower live across repeated foreground recovery', async () => {
    const host = new FakeHost();
    const channel = host.channel('resume-channel');
    const target = connect(host);
    await until(target, (s) => s.connection.status === 'connected');
    const received: unknown[] = [];
    const off = target.follow(
      'botharness/followChannel',
      { channelId: channel.id, limit: 20 },
      {
        item: (item) => received.push(item),
        interrupted() {},
        refused(error) {
          throw new Error(error.message);
        },
      },
    );
    await until(target, () => channel.followerCount === 1);
    for (let cycle = 0; cycle < 5; cycle += 1) {
      target.retryNow('resume');
      expect(target.getSnapshot().connection.status).toBe('reconnecting');
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
    off();
    expect(channel.followerCount).toBe(0);
  });

  it('shows unreachable on a failed resume and recovers when the route returns', async () => {
    const host = new FakeHost();
    const target = connect(host, host.credential, [ROUTE]);
    await until(target, (s) => s.connection.status === 'connected');
    host.unreachable.add(ROUTE);
    target.retryNow('resume');
    await until(target, (s) => s.connection.status === 'unreachable');
    host.unreachable.delete(ROUTE);
    await until(target, (s) => s.connection.status === 'connected');
    host.push('botharness/followRoster', latest[0]);
    expect(target.getSnapshot().roster?.bots[0]?.preview).toBe('mobile tracer probe');
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
          return host.carrier.openSocket(...args);
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
    'defers foreground recovery until an accepted write %ss without replaying it',
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
          openSocket: (...args) => {
            sockets++;
            return host.carrier.openSocket(...args);
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
      target.retryNow('resume');
      expect(closes).toBe(0);
      expect(sockets).toBe(1);
      if (outcome === 'complete') complete();
      expect(await pending).toBe(outcome);
      await until(target, (s) => s.connection.status === 'connected' && sockets === 2);
      expect(host.calls.filter((entry) => entry.method === 'pending-write')).toHaveLength(1);
    },
  );

  it('preserves the Host-owned Tob marker for deletion menus', async () => {
    const host = new FakeHost();
    host.methods.set('list', () => ({
      bots: [
        {
          slug: 'steward-id',
          displayName: 'Renamed steward',
          tob: { defaultName: false, defaultAvatar: true },
          aggregateState: 'idle',
        },
      ],
    }));
    const snapshot = await until(connect(host), (state) => state.connection.status === 'connected');
    expect(snapshot.roster?.bots[0]).toMatchObject({ slug: 'steward-id', tob: true });
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
  it('reads Host global and scope sorting with the roster and keeps confirmed state after a failed refresh', async () => {
    const host = new FakeHost();
    let sorting = { sortMode: 'manual', sortModes: { pinned: 'updated', work: 'manual' } };
    host.methods.set('settings/describe', () => ({
      namespaces: [{ ns: 'botharness-client', value: sorting }],
    }));
    const target = connect(host);
    await until(target, (state) => state.connection.status === 'connected');
    expect(target.getSnapshot().roster?.sorting).toEqual(sorting);
    expect(host.calls.find((call) => call.method === 'settings/describe')?.args).toEqual({});
    host.failing.add('settings/describe');
    await expect(target.refresh()).rejects.toThrow();
    expect(target.getSnapshot().roster?.sorting).toEqual(sorting);
    host.failing.delete('settings/describe');
    sorting = { sortMode: 'updated', sortModes: { pinned: 'manual', work: 'updated' } };
    await until(target, (state) => state.connection.status === 'connected');
    await target.refresh();
    expect(target.getSnapshot().roster?.sorting).toEqual(sorting);
  });

  it('retains Bot DM metadata for activity links without listing it as a group', async () => {
    const host = new FakeHost();
    host.methods.set('channels', () => ({ channels: wire.activityJournal.channels }));
    const snapshot = await until(connect(host), (state) => state.connection.status === 'connected');
    expect(snapshot.roster?.activityChannels).toEqual(wire.activityJournal.channels);
    expect(snapshot.roster?.channels.map((channel) => channel.id)).toEqual(['group-research']);
  });
  it('calls the device gateway with its credential and renders the recorded Roster', async () => {
    const host = new FakeHost();
    const target = connect(host);
    expect(target.getSnapshot().connection.status).toBe('connecting');
    const snapshot = await until(target, (s) => s.connection.status === 'connected');
    expect(snapshot.roster?.bots).toEqual([
      expect.objectContaining({
        slug: bot.slug,
        displayName: bot.displayName,
        state: 'idle',
        paused: false,
        dmChannelId: `dm-${bot.slug}`,
        preview: expect.stringContaining('Session failed'),
      }),
    ]);
    expect(snapshot.roster?.bots[0]).toMatchObject({ avatarSeed: 2 });
    expect(snapshot.roster?.bots[0]?.avatarUrl).toBeUndefined();
    expect(host.requests[0]).toBe(`POST ${ROUTE}/botharness-device/api/botharness/list`);
    expect(host.requests.filter((line) => line.startsWith('GET'))).toEqual([
      `GET ${ROUTE}/botharness-device/api/computer/status`,
    ]);
  });

  it('shows a Host state change live, from the recorded Activity frames', async () => {
    const host = new FakeHost();
    const target = connect(host);
    await until(target, (s) => s.connection.status === 'connected');
    host.push('botharness/followActivity', thinking);
    const working = await until(target, (s) => s.roster?.bots[0]?.state === 'thinking');
    expect(working.roster?.bots[0]?.sessions).toEqual([
      expect.objectContaining({ role: 'orchestrator', state: 'thinking' }),
    ]);
    host.push('botharness/followActivity', idle);
    const done = await until(target, (s) => s.roster?.bots[0]?.state === 'idle', 600);
    expect(done.roster?.bots[0]?.sessions).toBeUndefined();
  });

  it('updates the DM preview from a roster latest frame without re-reading', async () => {
    const host = new FakeHost();
    const target = connect(host);
    await until(target, (s) => s.connection.status === 'connected');
    const reads = host.requests.length;
    host.push('botharness/followRoster', latest[0]);
    await until(target, (s) => s.roster?.bots[0]?.preview === 'mobile tracer probe');
    expect(host.requests.length).toBe(reads);
    host.push('botharness/followRoster', { type: 'changed' });
    await until(target, () => host.requests.length === reads + 5);
  });

  it('carries the recorded Channel sections and refreshes them when the roster changes', async () => {
    const host = new FakeHost();
    const target = connect(host);
    const snapshot = await until(target, (s) => s.connection.status === 'connected');
    const recordedSections = (
      wire.rpc.rosterGet.at(-1)!.body.result.value as { sections: Array<{ id: string }> }
    ).sections;
    const [work, later] = recordedSections;
    expect(snapshot.roster?.arrangement).toEqual({
      pins: [],
      hidden: ['group-lounge'],
      muted: [],
      sections: [
        {
          id: work!.id,
          name: 'Work',
          channelIds: ['group-design', expect.stringMatching(/^dm-/u)],
        },
        { id: later!.id, name: 'Later', channelIds: [] },
      ],
      sectionOrder: [work!.id, later!.id],
      topOrder: [
        { kind: 'channel', id: 'group-ops' },
        { kind: 'section', id: work!.id },
        { kind: 'section', id: later!.id },
      ],
    });

    host.methods.set('rosterGet', () => ({
      pins: [],
      hidden: [],
      muted: [],
      sectionOrder: ['s-1'],
      sections: [{ id: 's-1', name: 'Desk', channelIds: [] }],
      topOrder: undefined,
    }));
    host.push('botharness/followRoster', { type: 'changed' });
    const changed = await until(target, (s) => s.roster?.arrangement?.sections[0]?.name === 'Desk');
    expect(changed.roster?.arrangement?.topOrder).toBeUndefined();
  });

  it('still lists the Roster when an older Host refuses the sections read', async () => {
    const host = new FakeHost();
    host.answers.set('rosterGet', () => ({
      ok: false,
      error: { code: 'gateway/method-unknown', message: 'rosterGet is not a remote method' },
    }));
    const target = connect(host);
    const snapshot = await until(target, (s) => s.connection.status === 'connected');
    expect(snapshot.roster?.bots).toHaveLength(1);
    expect(snapshot.roster?.arrangement).toBeUndefined();
  });

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

  it('asks to pair again when the Host revokes this phone, closing its live stream', async () => {
    const host = new FakeHost();
    const target = connect(host);
    await until(target, (s) => s.connection.status === 'connected');
    host.revoke();
    const refused = await until(target, (s) => s.connection.status === 'refused');
    expect(refused.connection).toMatchObject({ code: 'device-revoked' });
    const attempts = host.requests.length;
    target.retryNow('resume');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(host.requests.length).toBe(attempts);
  });

  it('asks to pair again when the Host does not know this phone', async () => {
    const host = new FakeHost();
    const target = connect(host, 'device-9.unknown');
    const snapshot = await until(target, (s) => s.connection.status === 'refused');
    expect(snapshot.connection).toMatchObject({ code: 'device-unknown' });
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

  it('never exposes the device credential in its published state', async () => {
    const host = new FakeHost();
    const target = connect(host);
    const states: string[] = [];
    target.subscribe(() => states.push(JSON.stringify(target.getSnapshot())));
    await until(target, (s) => s.connection.status === 'connected');
    host.revoke();
    await until(target, (s) => s.connection.status === 'refused');
    expect(states.join('\n')).not.toContain('secret-1');
  });
});

describe('route check', () => {
  it('accepts tailnet HTTPS and loopback like the live CLI', () => {
    expect(checkRoute('https://studio.tailnet-example.ts.net/')).toEqual({
      ok: true,
      origin: 'https://studio.tailnet-example.ts.net',
    });
    expect(checkRoute('http://127.0.0.1:3080')).toEqual({
      ok: true,
      origin: 'http://127.0.0.1:3080',
    });
    expect(checkRoute('http://studio.tailnet-example.ts.net').ok).toBe(false);
    expect(checkRoute('https://example.com').ok).toBe(false);
    expect(checkRoute('https://studio.deepseekbot.dev')).toEqual({
      ok: true,
      origin: 'https://studio.deepseekbot.dev',
    });
    expect(checkRoute('http://studio.deepseekbot.dev').ok).toBe(false);
    expect(checkRoute('https://a.studio.deepseekbot.dev').ok).toBe(false);
    expect(checkRoute('https://studio.deepseekbot.dev:8443').ok).toBe(false);
    expect(checkRoute('https://studio.tailnet-example.ts.net/?token=x').ok).toBe(false);
  });
});

function link(payload: Record<string, unknown>, scheme = 'deepseekbot'): string {
  return `${scheme}://pair?p=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

describe('pairing', () => {
  const payload = {
    v: 1,
    host: { id: 'host-1', name: 'studio' },
    offer: 'offer-1',
    routes: [ROUTE, 'http://evil.example', LOOPBACK],
    expiresAt: '2099-01-01T00:00:00.000Z',
  };

  it.each(['deepseekbot', 'deepseekbot-dev'])(
    'reads %s QR/paste links with the same payload and refusal boundaries',
    (scheme) => {
      expect(parsePairingLink(link(payload, scheme))).toEqual({
        ok: true,
        payload: {
          host: payload.host,
          offer: 'offer-1',
          routes: [ROUTE, LOOPBACK],
          expiresAt: payload.expiresAt,
        },
      });
      const encryption = { protocol: 'connect-noise-xk-v1', publicKey: 'a'.repeat(64) };
      expect(parsePairingLink(link({ ...payload, encryption }, scheme))).toMatchObject({
        ok: true,
        payload: { encryption },
      });
      expect(parsePairingLink(`${scheme}://pair?p=not-json`)).toEqual({
        ok: false,
        code: 'link-invalid',
      });
      expect(parsePairingLink('https://example.com/?p=x')).toEqual({
        ok: false,
        code: 'link-invalid',
      });
      expect(
        parsePairingLink(link({ ...payload, expiresAt: '2000-01-01T00:00:00Z' }, scheme)),
      ).toEqual({
        ok: false,
        code: 'link-expired',
      });
      expect(
        parsePairingLink(link({ ...payload, routes: ['http://8.8.8.8:3000'] }, scheme)),
      ).toEqual({
        ok: false,
        code: 'no-route',
      });
    },
  );

  it('redeems the offer once through the first route that answers', async () => {
    const host = new FakeHost();
    host.unreachable.add(ROUTE);
    const parsed = parsePairingLink(link(payload));
    if (!parsed.ok) throw new Error('link rejected');
    const paired = await redeemPairing({
      payload: parsed.payload,
      deviceName: 'iPhone',
      carrier: host.carrier,
    });
    expect(paired).toEqual({
      ok: true,
      host: {
        hostId: 'host-1',
        hostName: 'studio',
        routes: [LOOPBACK, ROUTE],
        deviceId: 'device-1',
        credential: host.credential,
      },
    });
    expect(
      await redeemPairing({ payload: parsed.payload, deviceName: 'iPhone', carrier: host.carrier }),
    ).toEqual({ ok: false, code: 'offer-invalid' });
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

describe('Connect secret preflight', () => {
  it.each(SECRET_ROUTE_METHODS)(
    'refuses %s before serializing or sending a request',
    async (endpoint) => {
      const host = new FakeHost();
      client = createHostClient({
        routes: ['https://safety.deepseekbot.dev'],
        credential: host.credential,
        carrier: host.carrier,
      });
      const args = {
        toJSON() {
          throw new Error('must not serialize secret');
        },
      };
      await expect(client.call(endpoint, args)).rejects.toMatchObject({
        code: 'secret-route-refused',
      });
      expect(host.requests).toEqual([]);
    },
  );
  it.each([ROUTE, LOOPBACK])('preserves secret submission on %s', async (route) => {
    const host = new FakeHost();
    host.methods.set('privateInputSubmit', () => ({ accepted: true }));
    client = createHostClient({
      routes: [route],
      credential: host.credential,
      carrier: host.carrier,
    });
    await expect(
      client.call('privateInputSubmit', { values: { key: 'synthetic-only' } }),
    ).resolves.toEqual({ accepted: true });
    expect(host.requests).toHaveLength(1);
  });
});
