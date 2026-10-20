import { afterEach, describe, expect, it } from 'vitest';

import { createHostClient, type HostClient, type HostSnapshot } from '../src/host/client';
import { parsePairingLink, redeemPairing } from '../src/host/pairing';
import { checkRoute } from '../src/host/route';
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
): Promise<HostSnapshot> {
  for (let tries = 0; tries < 200; tries += 1) {
    const snapshot = target.getSnapshot();
    if (accept(snapshot)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out; last state ${JSON.stringify(target.getSnapshot().connection)}`);
}

describe('Host client', () => {
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
    expect(host.requests.some((line) => line.startsWith('GET'))).toBe(false);
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
    const done = await until(target, (s) => s.roster?.bots[0]?.state === 'idle');
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
    await until(target, () => host.requests.length === reads + 3);
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

  it('reads the QR link and keeps only routes the app accepts', () => {
    expect(parsePairingLink(link(payload))).toEqual({
      ok: true,
      payload: {
        host: payload.host,
        offer: 'offer-1',
        routes: [ROUTE, LOOPBACK],
        expiresAt: payload.expiresAt,
      },
    });
    expect(parsePairingLink(link(payload, 'deepseekbot-dev')).ok).toBe(true);
    expect(parsePairingLink('https://example.com/?p=x')).toEqual({
      ok: false,
      code: 'link-invalid',
    });
    expect(parsePairingLink(link({ ...payload, expiresAt: '2000-01-01T00:00:00Z' }))).toEqual({
      ok: false,
      code: 'link-expired',
    });
    expect(parsePairingLink(link({ ...payload, routes: ['http://10.0.0.2:3000'] }))).toEqual({
      ok: false,
      code: 'no-route',
    });
  });

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
