import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';
import { WindowCompanions } from '../../client/src/client/window-companions.js';
import { createCompanionFeed } from '../src/companions/feed.js';

it.each(['header', 'query', 'header-priority'])(
  'bounds canonical recovery reads and sixty-second leases with %s resumption',
  async (resumption) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    let position = 0;
    let reads = 0;
    let generation = 'host';
    const activity = new Set<() => void>();
    const feed = createCompanionFeed({
      profileId: 'qa',
      bot: (slug) => ({ slug, name: slug, paused: false }),
      activity: () => ({ generation, revision: 0, bots: [] }),
      onActivity: (changed) => {
        activity.add(changed);
        return () => {
          activity.delete(changed);
        };
      },
      checkpoint: () => position,
      observeOutput: (channelId, id) => {
        reads++;
        return {
          position: Number(id),
          channel: { id: channelId, type: 'dm', botSlug: 'ada', name: 'Ada', members: ['ada'] },
          message: { id, author: { kind: 'bot', slug: 'ada' }, body: id },
          humanParticipant: true,
          canRead: true,
        };
      },
    });
    const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
    const open = (resume?: string) => {
      const reader = feed
        .open(
          new Request(
            `http://localhost/api/botharness/companion?subscribe=1${resume && resumption === 'query' ? `&resume=${encodeURIComponent(resume)}` : resumption === 'header-priority' ? '&resume=not-a-lease' : ''}`,
            {
              headers: resume && resumption !== 'query' ? { 'Last-Event-ID': resume } : {},
            },
          ),
        )
        .body!.getReader();
      readers.push(reader);
      return reader;
    };
    const read = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
      const text = new TextDecoder().decode((await reader.read()).value);
      const data = /data: ([^\n]+)/u.exec(text);
      if (!data) throw new Error('Missing data');
      return JSON.parse(data[1]!);
    };
    const select = (consumerId: string) =>
      feed.update(
        new Request('http://localhost/api/botharness/companion', {
          method: 'POST',
          body: JSON.stringify({
            consumerId,
            capacity: 3,
            revision: 1,
            selections: [
              {
                botId: 'ada',
                dm: true,
                epochs: { 'own-dm': 0, 'bot-dm': 0, 'shared-group': 0, 'bot-group': 0 },
              },
            ],
          }),
        }),
      );
    try {
      const first = open();
      const baseline = await read(first);
      await select(baseline.consumerId);
      await read(first);
      await first.cancel();
      expect(activity.size).toBe(0);
      for (position = 1; position <= 1000; position++)
        feed.publish({
          version: 1,
          botId: 'ada',
          sessionId: 'ada',
          channelId: 'dm',
          messageId: String(position),
          channelRevision: position,
          at: '2026-10-08T00:00:00Z',
          content: { body: 'notification is not text authority', format: 'text' },
          correlation: {},
        });
      const priorReads = reads;
      const resumed = open(baseline.consumerId);
      const reconnect = await read(resumed);
      expect(reconnect.recovered).toBe(true);
      await select(reconnect.consumerId);
      await read(resumed);
      const messages = [await read(resumed), await read(resumed), await read(resumed)];
      expect(messages.map((message) => message.body)).toEqual(['998', '999', '1000']);
      expect(reads - priorReads).toBeLessThanOrEqual(9);
      await resumed.cancel();
      await vi.advanceTimersByTimeAsync(60_000);
      const expired = open(reconnect.consumerId);
      const fresh = await read(expired);
      expect(fresh.recovered).toBe(false);
      expect(activity.size).toBe(1);
      await select(fresh.consumerId);
      await read(expired);
      await expired.cancel();
      generation = 'new-host';
      const restarted = open(fresh.consumerId);
      expect((await read(restarted)).recovered).toBe(false);
    } finally {
      for (const reader of readers) await reader.cancel();
      feed.close();
      expect(activity.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    }
  },
);

it('keeps reading progress and deduplicates recovery through the real feed into public Client owners', async () => {
  const core = createCore({ dshHome: createTempRoot('companion-recovery-client-') });
  const events = new EventTarget();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let lastId = '';
  let updates = 0;
  const connect = () => {
    reader = core.companions
      .open(
        new Request('http://localhost/api/botharness/companion?subscribe=1', {
          headers: lastId ? { 'Last-Event-ID': lastId } : {},
        }),
      )
      .body!.getReader();
  };
  const owner = new WindowCompanions({
    context: async () =>
      core.companions.open(new Request('http://localhost/api/botharness/companion')).json(),
    source: () => {
      connect();
      return {
        addEventListener: events.addEventListener.bind(events),
        close() {
          void reader?.cancel();
        },
      };
    },
    update: async (value) => {
      const response = await core.companions.update(
        new Request('http://localhost/api/botharness/companion', {
          method: 'POST',
          body: JSON.stringify(value),
        }),
      );
      if (!response.ok) throw new Error('Selection failed');
      updates++;
    },
  });
  const receive = async () => {
    const text = new TextDecoder().decode((await reader!.read()).value);
    const frame = /event: ([^\n]+)\ndata: ([^\n]+)/u.exec(text);
    if (!frame) throw new Error('Missing Host frame');
    lastId = /id: ([^\n]+)/u.exec(text)?.[1] ?? lastId;
    events.dispatchEvent(new MessageEvent(frame[1]!, { data: frame[2]!, lastEventId: lastId }));
  };
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.ownership.claim({
      sessionId: 'ada',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: FIXED_NOW().toISOString(),
    });
    const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const commit = (id: string) =>
      core.channels.appendMessage(
        OWNER_HUMAN_CONTEXT,
        dm.id,
        { id, at: FIXED_NOW().toISOString(), author: { kind: 'bot', slug: 'ada' }, body: id },
        { sessionId: 'ada' },
      );
    await owner.start();
    owner.select('ada');
    await vi.waitFor(() => expect(reader).toBeDefined());
    await receive();
    await vi.waitFor(() => expect(updates).toBe(1));
    await receive();
    await commit('reading-message');
    await receive();
    const child = owner.get('ada')!;
    child.advance(100);
    const shown = child.getSnapshot().cards[0]!.shown;
    child.reading(true);
    events.dispatchEvent(new Event('error'));
    await reader!.cancel();
    await commit('offline-message');
    connect();
    await receive();
    await vi.waitFor(() => expect(updates).toBe(2));
    await receive();
    await receive();
    await receive();
    expect(child.getSnapshot()).toMatchObject({
      reading: true,
      cards: [{ messageId: 'reading-message', shown }],
      pending: 1,
    });
    child.reading(false);
    expect(child.getSnapshot().cards.map((card) => card.messageId)).toEqual([
      'reading-message',
      'offline-message',
    ]);
    expect(child.getSnapshot().sync).toBe('live');
    child.reading(true);
    events.dispatchEvent(new Event('error'));
    await reader!.cancel();
    child.configure({ dm: false });
    await commit('disabled-period');
    child.configure({ dm: true });
    connect();
    await receive();
    await vi.waitFor(() => expect(updates).toBe(3));
    await receive();
    expect(child.getSnapshot()).toMatchObject({ reading: true, cards: [], pending: 0 });
    await commit('future-after-enable');
    await receive();
    expect(child.getSnapshot().pending).toBe(0);
    expect(child.getSnapshot().cards.map((card) => card.messageId)).toEqual([
      'future-after-enable',
    ]);
    child.reading(false);
    expect(child.getSnapshot().cards.map((card) => card.messageId)).toEqual([
      'future-after-enable',
    ]);
    expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, dm.id)).toBeUndefined();
  } finally {
    owner.dispose();
    await reader?.cancel();
    core.companions.close();
    await core.runtime.close();
    core.externalMessaging.close();
    core.live.close();
    core.operationalDatabase.close();
  }
});

it('recovers bounded canonical new output in the same Host without crossing the first selection baseline', async () => {
  const core = createCore({ dshHome: createTempRoot('companion-recovery-') });
  const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
  const read = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const text = new TextDecoder().decode((await reader.read()).value);
    const frame = /event: ([^\n]+)\ndata: ([^\n]+)/u.exec(text);
    if (!frame) throw new Error('Missing Host frame');
    return { name: frame[1], data: JSON.parse(frame[2]!) };
  };
  const open = (resume?: string) => {
    const response = core.companions.open(
      new Request('http://localhost/api/botharness/companion?subscribe=1', {
        headers: resume ? { 'Last-Event-ID': resume } : {},
      }),
    );
    const reader = response.body!.getReader();
    readers.push(reader);
    return reader;
  };
  const select = (consumerId: string, visibility = 'shared', revision = 1) =>
    core.companions.update(
      new Request('http://localhost/api/botharness/companion', {
        method: 'POST',
        body: JSON.stringify({
          consumerId,
          revision,
          capacity: 2,
          selections: [
            {
              botId: 'ada',
              dm: true,
              group: true,
              visibility,
              epochs: { 'own-dm': 0, 'bot-dm': 0, 'shared-group': 0, 'bot-group': 0 },
            },
          ],
        }),
      }),
    );
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.ownership.claim({
      sessionId: 'ada',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: FIXED_NOW().toISOString(),
    });
    const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Team',
      members: ['ada'],
    });
    const commit = (channelId: string, id: string) =>
      core.channels.appendMessage(
        OWNER_HUMAN_CONTEXT,
        channelId,
        {
          id,
          at: FIXED_NOW().toISOString(),
          author: { kind: 'bot', slug: 'ada' },
          body: id,
        },
        { sessionId: 'ada' },
      );
    await commit(dm.id, 'historical');
    const first = open();
    const baseline = await read(first);
    expect(baseline.name).toBe('companion/baseline');
    await select(baseline.data.consumerId);
    await read(first);
    core.companions.publish({
      version: 1,
      botId: 'ada',
      sessionId: 'ada',
      channelId: dm.id,
      messageId: 'historical',
      channelRevision: 1,
      at: FIXED_NOW().toISOString(),
      content: { body: 'late historical signal', format: 'text' },
      correlation: {},
    });
    await commit(dm.id, 'seen');
    expect((await read(first)).data.messageId).toBe('seen');
    await first.cancel();
    await commit(group.id, 'offline-group');
    await commit(dm.id, 'offline-dm');
    const resumed = open(baseline.data.consumerId);
    const reconnect = await read(resumed);
    expect(reconnect.data.recovered).toBe(true);
    await select(reconnect.data.consumerId);
    expect((await read(resumed)).name).toBe('companion/selection');
    const recovered = [await read(resumed), await read(resumed)];
    expect(recovered.map((frame) => frame.data.messageId)).toEqual(['offline-group', 'offline-dm']);
    expect(recovered.every((frame) => frame.data.body === frame.data.messageId)).toBe(true);
    await resumed.cancel();
    await commit(group.id, 'outside-narrowed-scope');
    await commit(dm.id, 'eligible-unplayed-dm');
    const narrowed = open(reconnect.data.consumerId);
    const narrowBaseline = await read(narrowed);
    await select(narrowBaseline.data.consumerId, 'own-dm');
    await read(narrowed);
    expect((await read(narrowed)).data.messageId).toBe('eligible-unplayed-dm');
    await select(narrowBaseline.data.consumerId, 'shared', 0);
    await commit(group.id, 'stale-update-must-not-restore-group');
    await commit(dm.id, 'fresh-dm');
    expect((await read(narrowed)).data.messageId).toBe('fresh-dm');
    expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, dm.id)).toBeUndefined();
  } finally {
    for (const reader of readers) await reader.cancel();
    core.companions.close();
    await core.runtime.close();
    core.externalMessaging.close();
    core.live.close();
    core.operationalDatabase.close();
  }
});

it('retains output throughout repeated reconnect handshakes before the latest selection acknowledgement', async () => {
  let position = 0;
  const feed = createCompanionFeed({
    profileId: 'qa',
    bot: (slug) => ({ slug, name: slug, paused: false }),
    activity: () => ({ generation: 'host', revision: 0, bots: [] }),
    onActivity: () => () => {},
    checkpoint: () => position,
    observeOutput: (channelId, id) => ({
      position: Number(id),
      channel: { id: channelId, type: 'dm', botSlug: 'ada', name: 'Ada', members: ['ada'] },
      message: { id, author: { kind: 'bot', slug: 'ada' }, body: id },
      humanParticipant: true,
      canRead: true,
    }),
  });
  const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
  const open = (resume?: string) => {
    const reader = feed
      .open(
        new Request('http://localhost/api/botharness/companion?subscribe=1', {
          headers: resume ? { 'Last-Event-ID': resume } : {},
        }),
      )
      .body!.getReader();
    readers.push(reader);
    return reader;
  };
  const read = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const text = new TextDecoder().decode((await reader.read()).value);
    return JSON.parse(/data: ([^\n]+)/u.exec(text)![1]!);
  };
  const select = (consumerId: string) =>
    feed.update(
      new Request('http://localhost/api/botharness/companion', {
        method: 'POST',
        body: JSON.stringify({
          consumerId,
          capacity: 3,
          revision: 1,
          selections: [
            {
              botId: 'ada',
              dm: true,
              epochs: { 'own-dm': 0, 'bot-dm': 0, 'shared-group': 0, 'bot-group': 0 },
            },
          ],
        }),
      }),
    );
  const publish = () => {
    position++;
    feed.publish({
      version: 1,
      botId: 'ada',
      sessionId: 'ada',
      channelId: 'dm',
      messageId: String(position),
      channelRevision: position,
      at: '2026-10-08T00:00:00Z',
      content: { body: 'signal', format: 'text' },
      correlation: {},
    });
  };
  try {
    const first = open();
    const baseline = await read(first);
    await select(baseline.consumerId);
    await read(first);
    await first.cancel();
    publish();
    const second = open(baseline.consumerId);
    const handshake = await read(second);
    publish();
    await second.cancel();
    const third = open(handshake.consumerId);
    const resumed = await read(third);
    expect(resumed.recovered).toBe(true);
    publish();
    await select(resumed.consumerId);
    await read(third);
    expect(
      [await read(third), await read(third), await read(third)].map((value) => value.body),
    ).toEqual(['1', '2', '3']);
  } finally {
    for (const reader of readers) await reader.cancel();
    feed.close();
  }
});

it('counts unique canonical references when retaining a slow consumer queue', async () => {
  const feed = createCompanionFeed({
    profileId: 'qa',
    bot: (slug) => ({ slug, name: slug, paused: false }),
    activity: () => ({ generation: 'host', revision: 0, bots: [] }),
    onActivity: () => () => {},
    observeOutput: (channelId, id) => ({
      channel: { id: channelId, type: 'dm', botSlug: 'ada', name: 'Ada', members: ['ada'] },
      message: { id, author: { kind: 'bot', slug: 'ada' }, body: id },
      humanParticipant: true,
      canRead: true,
    }),
  });
  const reader = feed
    .open(new Request('http://localhost/api/botharness/companion?subscribe=1'))
    .body!.getReader();
  const read = async () => {
    const text = new TextDecoder().decode((await reader.read()).value);
    return JSON.parse(/data: ([^\n]+)/u.exec(text)![1]!);
  };
  try {
    const baseline = await read();
    await feed.update(
      new Request('http://localhost/api/botharness/companion', {
        method: 'POST',
        body: JSON.stringify({
          consumerId: baseline.consumerId,
          capacity: 2,
          selections: [{ botId: 'ada', dm: true }],
        }),
      }),
    );
    await read();
    for (const messageId of ['1', '2', '3', '3', '3'])
      feed.publish({
        version: 1,
        botId: 'ada',
        sessionId: 'ada',
        channelId: 'dm',
        messageId,
        channelRevision: Number(messageId),
        at: '2026-10-08T00:00:00Z',
        content: { body: 'signal', format: 'text' },
        correlation: {},
      });
    expect([await read(), await read(), await read()].map((value) => value.body)).toEqual([
      '1',
      '2',
      '3',
    ]);
  } finally {
    await reader.cancel();
    feed.close();
  }
});
