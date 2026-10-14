import { afterEach, describe, expect, it } from 'vitest';

import { createHostClient, type HostClient, type HostSnapshot } from '../src/host/client';
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

function connect(host: FakeHost, token = host.token): HostClient {
  client = createHostClient({
    route: ROUTE,
    token,
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
  it('logs in with the launch token and renders the recorded Roster', async () => {
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
    expect(host.requests[0]).toBe(`GET ${ROUTE}/?token=${host.token}`);
  });

  it('shows a Host state change live, from the recorded Activity frames', async () => {
    const host = new FakeHost();
    const target = connect(host);
    await until(target, (s) => s.connection.status === 'connected');
    host.push('botharness/followActivity', thinking);
    await until(target, (s) => s.roster?.bots[0]?.state === 'thinking');
    host.push('botharness/followActivity', idle);
    await until(target, (s) => s.roster?.bots[0]?.state === 'idle');
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
    await until(target, () => host.requests.length === reads + 2);
  });

  it('shows unreachable while the Host is down and reconnects with its cookie after restart', async () => {
    const host = new FakeHost();
    const target = connect(host);
    await until(target, (s) => s.connection.status === 'connected');
    host.kill();
    const down = await until(target, (s) => s.connection.status === 'unreachable');
    expect(down.connection).toMatchObject({ route: ROUTE });
    expect(down.roster?.bots).toHaveLength(1);
    const logins = host.requests.filter((line) => line.startsWith('GET')).length;
    host.restart();
    await until(target, (s) => s.connection.status === 'connected');
    expect(host.requests.filter((line) => line.startsWith('GET'))).toHaveLength(logins);
  });

  it('logs in again when the session cookie stops verifying but the token is current', async () => {
    const host = new FakeHost();
    const target = connect(host);
    await until(target, (s) => s.connection.status === 'connected');
    host.kill();
    await until(target, (s) => s.connection.status === 'unreachable');
    host.resetSecret();
    host.up = true;
    await until(target, (s) => s.connection.status === 'connected');
  });

  it('asks to pair again when the token is refused', async () => {
    const host = new FakeHost();
    const target = connect(host, 'stale-token');
    const snapshot = await until(target, (s) => s.connection.status === 'refused');
    expect(snapshot.connection).toMatchObject({ reason: expect.stringMatching(/Pair again/) });
  });

  it('asks to pair again when the Host restarted with a new home and the old token', async () => {
    const host = new FakeHost();
    const target = connect(host);
    await until(target, (s) => s.connection.status === 'connected');
    host.kill();
    await until(target, (s) => s.connection.status === 'unreachable');
    host.resetSecret();
    host.restart();
    await until(target, (s) => s.connection.status === 'refused');
  });

  it('fails a generation when the Host refuses a stream, then keeps retrying', async () => {
    const host = new FakeHost();
    const carrier = host.carrier;
    let refuse = true;
    client = createHostClient({
      route: ROUTE,
      token: host.token,
      backoff: () => 5,
      timeoutMs: 200,
      carrier: {
        ...carrier,
        openSocket(url, events) {
          const socket = carrier.openSocket(url, events);
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

  it('never exposes the launch token in its published state', async () => {
    const host = new FakeHost();
    const target = connect(host, 'stale-token');
    const states: string[] = [];
    target.subscribe(() => states.push(JSON.stringify(target.getSnapshot())));
    await until(target, (s) => s.connection.status === 'refused');
    expect(states.join('\n')).not.toContain('stale-token');
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
    expect(checkRoute('https://studio.tailnet-example.ts.net/?token=x').ok).toBe(false);
  });
});
