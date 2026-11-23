import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHostClient, type HostClient } from '@botharness/host-client/client';
import { openLocalStore, type LocalStore } from '@botharness/host-client/local-store';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';
import { nodeSqlConnection } from './node-sql-connection';
import wire from '../../../packages/host-client/test/fixtures/host-wire.json';

import { LOOPBACK, ROUTE, idle, latest, thinking, until } from './host-client-fixtures';

const recordedBot = wire.rpc.list.at(-1)!.body as {
  result: { value: { bots: Array<{ slug: string; displayName: string }> } };
};

const bot = recordedBot.result.value.bots[0]!;

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
  it('shares native purge notifications only with subscribers of the owning Host', async () => {
    const host = new FakeHost();
    const otherHost = new FakeHost();
    const legacy = vi.fn();
    client = createHostClient({
      routes: [ROUTE],
      credential: host.credential,
      carrier: host.carrier,
      onPurged: legacy,
    });
    const other = createHostClient({
      routes: [ROUTE],
      credential: otherHost.credential,
      carrier: otherHost.carrier,
    });
    const received = vi.fn();
    const unrelated = vi.fn();
    const unsubscribe = client.onPurged!(received);
    const unsubscribeOther = other.onPurged!(unrelated);
    try {
      client.start();
      other.start();
      await until(client, (state) => state.connection.status === 'connected');
      await until(other, (state) => state.connection.status === 'connected');
      expect(received).toHaveBeenCalled();
      received.mockClear();
      unrelated.mockClear();
      legacy.mockClear();
      const placements = [{ channelId: 'shared-id', messageId: 'message-1' }];
      expect(host.push('botharness/followRoster', { type: 'purged', placements })).toBe(true);
      expect(received).toHaveBeenCalledExactlyOnceWith(placements);
      expect(legacy).toHaveBeenCalledExactlyOnceWith(placements);
      expect(unrelated).not.toHaveBeenCalled();
      unsubscribe();
      host.push('botharness/followRoster', { type: 'purged', placements });
      expect(received).toHaveBeenCalledOnce();
      expect(legacy).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
      unsubscribeOther();
      other.stop();
    }
  });

  it('acknowledges the first loaded Feed once and keeps ordinary refreshes free of acknowledgement traffic', async () => {
    const host = new FakeHost();
    const target = connect(host);
    await until(target, (state) => state.feedRead === 'acknowledged');
    expect(target.getSnapshot().roster?.bots.length).toBeGreaterThan(0);
    const acknowledgements = () =>
      host.requests.filter((request) => request.endsWith('/feed-read'));
    expect(acknowledgements()).toHaveLength(1);
    await target.refresh();
    await target.refresh();
    expect(acknowledgements()).toHaveLength(1);
  });

  it('does not start a Feed acknowledgement after a stopped client finishes an old read', async () => {
    const host = new FakeHost();
    let release = () => {};
    let reading = false;
    let lists = 0;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    client = createHostClient({
      routes: [ROUTE],
      credential: host.credential,
      timeoutMs: 500,
      carrier: {
        ...host.carrier,
        request: async (url, init) => {
          const response = await host.carrier.request(url, init);
          if (url.endsWith('/botharness/list') && ++lists === 2) {
            reading = true;
            await held;
          }
          return response;
        },
      },
    });
    client.start();
    await until(client, () => reading);
    client.stop();
    release();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(host.requests.some((request) => request.endsWith('/feed-read'))).toBe(false);
  });

  it('does not acknowledge when the Host Feed cannot load', async () => {
    const host = new FakeHost();
    host.failing.add('list');
    const target = connect(host);
    await until(
      target,
      (state) =>
        state.connection.status === 'reconnecting' || state.connection.status === 'unreachable',
    );
    expect(host.requests.some((request) => request.endsWith('/feed-read'))).toBe(false);
    expect(target.getSnapshot().feedRead).toBeUndefined();
  });

  it('keeps a readable Feed usable when an older Host does not support acknowledgement', async () => {
    const host = new FakeHost();
    client = createHostClient({
      routes: [ROUTE],
      credential: host.credential,
      timeoutMs: 200,
      carrier: {
        ...host.carrier,
        request: async (url, init) =>
          url.endsWith('/feed-read')
            ? { status: 404, text: async () => '{}', bytes: async () => new Uint8Array() }
            : host.carrier.request(url, init),
      },
    });
    client.start();
    await until(
      client,
      (state) => state.connection.status === 'connected' && state.feedRead === 'unsupported',
    );
    expect(client.getSnapshot().roster?.bots.length).toBeGreaterThan(0);
  });

  it('reuses the roster and sorting it just read when reconnecting, and reads them fresh on refresh', async () => {
    const host = new FakeHost();
    const target = connect(host);
    const count = (method: string) => host.calls.filter((call) => call.method === method).length;
    await until(target, (state) => state.connection.status === 'connected');
    host.kill();
    await until(target, (state) => state.connection.status !== 'connected');
    host.restart();
    await until(target, (state) => state.connection.status === 'connected');
    expect(count('settings/describe')).toBe(1);
    expect(count('rosterGet')).toBe(1);
    await target.refresh();
    expect(count('settings/describe')).toBe(2);
    expect(count('rosterGet')).toBe(2);
  });

  it('reads the roster and sorting fresh when a roster change arrives during a reconnect reload', async () => {
    const host = new FakeHost();
    const target = connect(host);
    const count = (method: string) => host.calls.filter((call) => call.method === method).length;
    await until(target, (state) => state.connection.status === 'connected');
    let armed = false;
    host.methods.set('list', () => {
      if (armed && host.push('botharness/followRoster', { type: 'changed' })) armed = false;
      return recordedBot.result.value;
    });
    host.kill();
    await until(target, (state) => state.connection.status !== 'connected');
    armed = true;
    host.restart();
    await until(target, (state) => state.connection.status === 'connected');
    await until(target, () => count('settings/describe') >= 2);
    expect(count('rosterGet')).toBeGreaterThanOrEqual(2);
  });

  it('reads the roster and sorting fresh when the Human retries after a disconnect', async () => {
    const host = new FakeHost();
    client = createHostClient({
      routes: [ROUTE],
      credential: host.credential,
      carrier: host.carrier,
      backoff: () => 60_000,
      timeoutMs: 200,
    });
    client.start();
    const target = client;
    const count = (method: string) => host.calls.filter((call) => call.method === method).length;
    await until(target, (state) => state.connection.status === 'connected');
    host.kill();
    await until(target, (state) => state.connection.status !== 'connected');
    host.restart();
    target.retryNow('manual_retry');
    await until(target, (state) => state.connection.status === 'connected');
    expect(count('rosterGet')).toBe(2);
    expect(count('settings/describe')).toBe(2);
  });

  it('stays connected with the Host default sorting when the Host refuses settings to a member', async () => {
    const host = new FakeHost();
    host.methods.set('settings/describe', () => {
      throw Object.assign(new Error('remote access: settings/describe: access denied'), {
        code: 'remote-access/denied',
      });
    });
    const target = connect(host);
    await until(target, (state) => state.connection.status === 'connected');
    expect(target.getSnapshot().roster?.sorting).toBeUndefined();
  });

  it('does not reuse a roster arrangement whose last read failed', async () => {
    const host = new FakeHost();
    const target = connect(host);
    const count = (method: string) => host.calls.filter((call) => call.method === method).length;
    await until(target, (state) => state.connection.status === 'connected');
    host.failing.add('rosterGet');
    await expect(target.refresh()).rejects.toThrow();
    host.failing.delete('rosterGet');
    host.kill();
    await until(target, (state) => state.connection.status !== 'connected');
    host.restart();
    await until(target, (state) => state.connection.status === 'connected');
    expect(count('rosterGet')).toBeGreaterThanOrEqual(3);
  });

  it('does not download the settings again on every failed reconnect', async () => {
    const host = new FakeHost();
    const target = connect(host);
    const count = (method: string) => host.calls.filter((call) => call.method === method).length;
    await until(target, (state) => state.connection.status === 'connected');
    host.failing.add('channels');
    host.kill();
    await until(target, (state) => state.connection.status !== 'connected');
    host.restart();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(count('channels')).toBeGreaterThan(2);
    expect(count('settings/describe')).toBe(1);
  });

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
  it('lists a DM between two people apart from the groups, named for the other person', async () => {
    const host = new FakeHost();
    const people = {
      id: 'dm-humans-ab',
      type: 'dm',
      name: 'Bob',
      members: [],
      humanParticipants: ['human-alice', 'human-bob'],
      latestMessage: {
        id: 'm1',
        body: 'hi',
        at: '2026-11-17T08:00:00.000Z',
        author: { kind: 'human', id: 'human-bob' },
      },
    };
    host.methods.set('channels', () => ({ channels: [...wire.activityJournal.channels, people] }));
    const snapshot = await until(connect(host), (state) => state.connection.status === 'connected');
    expect(snapshot.roster?.channels.map((channel) => channel.id)).toEqual(['group-research']);
    expect(snapshot.roster?.people).toEqual([
      expect.objectContaining({
        id: 'dm-humans-ab',
        name: 'Bob',
        preview: 'hi',
        previewAt: '2026-11-17T08:00:00.000Z',
      }),
    ]);
  });
  it('keeps the channel list in the local store and later asks only for what changed (C3)', async () => {
    const store: LocalStore = await openLocalStore(nodeSqlConnection());
    const host = new FakeHost();
    const channels = wire.activityJournal.channels;
    host.methods.set('channels', () => ({ channels }));
    host.methods.set('channelChangeCursor', () => ({ epoch: 'e', seq: 5 }));
    host.methods.set('channelListChanges', () => ({
      channels: [{ ...channels.find((item) => item.id === 'group-research')!, name: 'Renamed' }],
      removed: [],
      cursor: { epoch: 'e', seq: 7 },
    }));
    const localStore = () => Promise.resolve(store);
    const first = createHostClient({
      routes: [ROUTE],
      credential: host.credential,
      carrier: host.carrier,
      backoff: () => 5,
      timeoutMs: 200,
      localStore,
    });
    first.start();
    await until(first, (state) => state.connection.status === 'connected');
    first.stop();
    expect(host.calls.map((call) => call.method)).toContain('channels');
    await vi.waitFor(async () =>
      expect(await store.get('select record from list_bots')).toBeDefined(),
    );
    host.calls.length = 0;
    host.up = false;
    client = createHostClient({
      routes: [ROUTE],
      credential: host.credential,
      carrier: host.carrier,
      backoff: () => 5,
      timeoutMs: 200,
      localStore,
    });
    client.start();
    const painted = await until(client, (state) => state.roster !== undefined, 50);
    expect(painted.connection.status).not.toBe('connected');
    expect(painted.roster?.channels.map((channel) => channel.id)).toEqual(['group-research']);
    expect(painted.roster?.bots.length).toBeGreaterThan(0);
    host.up = true;
    const synced = await until(
      client,
      (state) => state.roster?.channels.some((channel) => channel.name === 'Renamed') === true,
    );
    expect(synced.roster?.channels.map((channel) => channel.id)).toEqual(['group-research']);
    expect(host.calls.map((call) => call.method)).not.toContain('channels');
    expect(host.calls.find((call) => call.method === 'channelListChanges')?.args).toEqual({
      sinceSeq: 5,
      epoch: 'e',
    });
    client.stop();
    await store.close();
  });

  it('still lists channels from the Host when the local store fails', async () => {
    const store = await openLocalStore(nodeSqlConnection());
    await store.close();
    const host = new FakeHost();
    host.methods.set('channels', () => ({ channels: wire.activityJournal.channels }));
    host.methods.set('channelChangeCursor', () => ({ epoch: 'e', seq: 5 }));
    client = createHostClient({
      routes: [ROUTE],
      credential: host.credential,
      carrier: host.carrier,
      backoff: () => 5,
      timeoutMs: 200,
      localStore: () => Promise.resolve(store),
    });
    client.start();
    const snapshot = await until(client, (state) => state.connection.status === 'connected');
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
});
