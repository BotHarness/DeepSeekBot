import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';
import { WindowCompanion } from '../../client/src/client/window-companion.js';
import { createCompanionFeed } from '../src/companions/feed.js';
import type { ChannelRecord } from '../src/channels/channel.js';
import { attachOperationalModule } from '../src/database/owner.js';

it.each([
  ['own-dm', true, true, ['own']],
  ['own-dm', true, false, ['own']],
  ['own-dm', false, true, []],
  ['own-dm', false, false, []],
  ['shared', true, true, ['own', 'shared']],
  ['shared', true, false, ['own']],
  ['shared', false, true, ['shared']],
  ['shared', false, false, []],
  ['all-bot', true, true, ['own', 'bots', 'shared', 'private']],
  ['all-bot', true, false, ['own', 'bots']],
  ['all-bot', false, true, ['shared', 'private']],
  ['all-bot', false, false, []],
] as const)(
  'intersects %s visibility with DM=%s and Group=%s before publishing canonical Bot text',
  async (visibility, dm, group, visible) => {
    const channels: Record<
      string,
      Pick<ChannelRecord, 'id' | 'name' | 'type' | 'botSlug' | 'members' | 'deletedAt'>
    > = {
      own: { id: 'own', name: 'Ada', type: 'dm', botSlug: 'ada', members: ['ada'] },
      bots: { id: 'bots', name: 'Ada and Grace', type: 'dm', members: ['ada', 'grace'] },
      shared: { id: 'shared', name: 'Design room', type: 'group', members: ['ada', 'grace'] },
      private: { id: 'private', name: 'Bot room', type: 'group', members: ['ada', 'grace'] },
      outsider: { id: 'outsider', name: 'Other Bots', type: 'group', members: ['grace'] },
      deleted: {
        id: 'deleted',
        name: 'Deleted room',
        type: 'group',
        members: ['ada'],
        deletedAt: FIXED_NOW().toISOString(),
      },
    };
    let activityChanged: () => void = () => {};
    const feed = createCompanionFeed({
      profileId: 'matrix',
      bot: (slug) =>
        ['ada', 'grace'].includes(slug) ? { slug, name: slug, paused: false } : undefined,
      activity: () => ({ generation: 'host', revision: 0, bots: [{ slug: 'ada', state: 'idle' }] }),
      onActivity: (changed) => {
        activityChanged = changed;
        return () => {};
      },
      observeOutput: (channelId, id) => {
        const channel = channels[channelId];
        return id === 'missing' || !channel
          ? undefined
          : {
              channel,
              message: {
                id,
                author: { kind: 'bot', slug: id === 'other-author' ? 'grace' : 'ada' },
                body: 'Canonical public reply',
              },
              humanParticipant: channelId === 'own' || channelId === 'shared',
              canRead: channelId !== 'private',
            };
      },
    });
    const reader = feed
      .open(
        new Request(
          `http://localhost/api/botharness/companion?botId=ada&dm=${dm ? 1 : 0}&group=${group ? 1 : 0}&visibility=${visibility}`,
        ),
      )
      .body!.getReader();
    const read = async () => new TextDecoder().decode((await reader.read()).value);
    try {
      await read();
      for (const [channelId, messageId] of [
        ...Object.keys(channels).map((id) => [id, 'reply']),
        ['own', 'other-author'],
        ['own', 'missing'],
      ]) {
        const next = read();
        feed.publish({
          version: 1,
          botId: 'ada',
          sessionId: 'ada',
          channelId: channelId!,
          messageId: messageId!,
          channelRevision: 1,
          at: FIXED_NOW().toISOString(),
          content: { body: 'Untrusted event content and private tool payload', format: 'text' },
          correlation: {},
        });
        activityChanged();
        const received = await next;
        if (visible.some((id) => id === channelId) && messageId === 'reply') {
          expect(received).toContain('Canonical public reply');
          expect(received).not.toContain('private tool payload');
          expect(await read()).toContain('companion/activity');
        } else expect(received).toContain('companion/activity');
      }
    } finally {
      await reader.cancel();
      feed.close();
    }
  },
);

it('plays newly committed shared Group replies only while the Human enables Group playback', async () => {
  const core = createCore({ dshHome: createTempRoot('companion-shared-group-') });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let events = new EventTarget();
  const companion = new WindowCompanion({
    context: async () =>
      core.companions.open(new Request('http://localhost/api/botharness/companion')).json(),
    source: (path) => {
      events = new EventTarget();
      const response = core.companions.open(new Request(`http://localhost${path}`));
      reader = response.body!.getReader();
      return {
        addEventListener: events.addEventListener.bind(events),
        close: () => {
          void reader?.cancel();
        },
      };
    },
  });
  const receive = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = await Promise.race([
      reader!.read(),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), 1000);
      }),
    ]);
    clearTimeout(timer);
    expect(next, 'the authenticated Host should publish the enabled Group reply').toBeDefined();
    const frame = /event: ([^\n]+)\ndata: ([^\n]+)/u.exec(new TextDecoder().decode(next?.value));
    if (!frame) throw new Error('Missing Companion frame');
    events.dispatchEvent(new MessageEvent(frame[1]!, { data: frame[2]! }));
  };
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.ownership.claim({
      sessionId: 'ada',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: FIXED_NOW().toISOString(),
    });
    const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Design room',
      members: ['ada'],
    });
    const commit = (id: string) =>
      core.channels.appendMessage(
        OWNER_HUMAN_CONTEXT,
        group.id,
        {
          id,
          at: FIXED_NOW().toISOString(),
          author: { kind: 'bot', slug: 'ada' },
          body: id,
        },
        { sessionId: 'ada' },
      );
    await companion.start();
    companion.select('ada');
    await receive();
    await commit('before-group-enabled');
    companion.configure({ group: true });
    await receive();
    expect(companion.getSnapshot().cards).toEqual([]);
    await commit('A new shared Group reply');
    await receive();
    expect(companion.getSnapshot().cards).toMatchObject([
      {
        body: 'A new shared Group reply',
        channelName: 'Design room',
        source: 'shared-group',
        canOpen: true,
      },
    ]);
    companion.configure({ group: false });
    expect(companion.getSnapshot().cards).toEqual([]);
    companion.dispose();
  } finally {
    companion.dispose();
    core.companions.close();
    await core.runtime.close();
    core.externalMessaging.close();
    core.live.close();
    core.operationalDatabase.close();
  }
});

it('observes only the selected Bot in a Group without the Human while preserving original timeline access', async () => {
  const core = createCore({ dshHome: createTempRoot('companion-private-group-') });
  const fixture = attachOperationalModule(core.operationalDatabase, 'companion-membership-fixture');
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let events = new EventTarget();
  const companion = new WindowCompanion({
    context: async () =>
      core.companions.open(new Request('http://localhost/api/botharness/companion')).json(),
    source: (path) => {
      events = new EventTarget();
      reader = core.companions.open(new Request(`http://localhost${path}`)).body!.getReader();
      return {
        addEventListener: events.addEventListener.bind(events),
        close: () => {
          void reader?.cancel();
        },
      };
    },
  });
  const receive = async () => {
    const frame = /event: ([^\n]+)\ndata: ([^\n]+)/u.exec(
      new TextDecoder().decode((await reader!.read()).value),
    );
    if (!frame) throw new Error('Missing Companion frame');
    events.dispatchEvent(new MessageEvent(frame[1]!, { data: frame[2]! }));
  };
  try {
    for (const slug of ['ada', 'grace']) {
      core.registry.create({ slug, displayName: slug });
      core.ownership.claim({
        sessionId: slug,
        botSlug: slug,
        rootRole: 'orchestrator',
        at: FIXED_NOW().toISOString(),
      });
    }
    const own = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Bot workroom',
      members: ['ada', 'grace'],
      ownerBotSlug: 'ada',
    });
    fixture.transaction(
      (db) =>
        db
          .prepare('UPDATE channel_human_members SET left_at = ? WHERE channel_id = ?')
          .run(FIXED_NOW().toISOString(), group.id),
      ['channel'],
    );
    const commit = (channelId: string, id: string, slug = 'ada') =>
      core.channels.appendMessage(
        OWNER_HUMAN_CONTEXT,
        channelId,
        { id, at: FIXED_NOW().toISOString(), author: { kind: 'bot', slug }, body: id },
        { sessionId: slug },
      );
    expect(core.channels.readHumanTimeline(OWNER_HUMAN_CONTEXT, group.id)).toBeUndefined();
    await companion.start();
    companion.select('ada');
    companion.configure({ group: true });
    await receive();
    await commit(group.id, 'hidden-in-shared');
    await commit(own.id, 'owned-sentinel');
    await receive();
    expect(companion.getSnapshot().cards.map((card) => card.messageId)).toEqual(['owned-sentinel']);
    companion.configure({ visibility: 'all-bot' });
    await receive();
    await commit(group.id, 'Selected Bot summary');
    await receive();
    expect(companion.getSnapshot().cards).toMatchObject([
      { messageId: 'owned-sentinel', source: 'own-dm' },
      {
        body: 'Selected Bot summary',
        source: 'bot-group',
        channelName: 'Bot workroom',
        canOpen: false,
      },
    ]);
    await commit(group.id, 'Other Bot reply', 'grace');
    await commit(own.id, 'next-owned-sentinel');
    await receive();
    expect(companion.getSnapshot().cards.map((card) => card.messageId)).toEqual([
      'owned-sentinel',
      'Selected Bot summary',
      'next-owned-sentinel',
    ]);
    expect(core.channels.readHumanTimeline(OWNER_HUMAN_CONTEXT, group.id)).toBeUndefined();
    expect(core.channels.listHumanMembers(OWNER_HUMAN_CONTEXT, group.id)).toEqual([]);
    expect(core.channels.get(group.id)?.members).toEqual(['ada', 'grace']);
    expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, own.id)).toBeUndefined();
  } finally {
    companion.dispose();
    core.companions.close();
    await core.runtime.close();
    core.externalMessaging.close();
    core.live.close();
    core.operationalDatabase.close();
  }
});

it('purges queued Group replies when the live subscriber narrows to its own DM', async () => {
  const feed = createCompanionFeed({
    profileId: 'scope',
    bot: (slug) => (slug === 'ada' ? { slug, name: 'Ada', paused: false } : undefined),
    activity: () => ({ generation: 'host', revision: 0, bots: [{ slug: 'ada', state: 'idle' }] }),
    onActivity: () => () => {},
    observeOutput: (id, messageId) => ({
      channel:
        id === 'group'
          ? { id, type: 'group', name: 'Design room', members: ['ada'] }
          : { id, type: 'dm', name: 'Ada', botSlug: 'ada', members: ['ada'] },
      message: { id: messageId, author: { kind: 'bot', slug: 'ada' }, body: messageId },
      humanParticipant: true,
      canRead: true,
    }),
  });
  const reader = feed
    .open(new Request('http://localhost/api/botharness/companion?subscribe=1'))
    .body!.getReader();
  const read = async () => new TextDecoder().decode((await reader.read()).value);
  try {
    const baseline = JSON.parse(/data: ([^\n]+)/u.exec(await read())![1]!);
    const update = (visibility: string) =>
      feed.update(
        new Request('http://localhost/api/botharness/companion', {
          method: 'POST',
          body: JSON.stringify({
            consumerId: baseline.consumerId,
            selections: [{ botId: 'ada', dm: true, group: true, visibility }],
          }),
        }),
      );
    const publish = (channelId: string, messageId: string) =>
      feed.publish({
        version: 1,
        botId: 'ada',
        sessionId: 'ada',
        channelId,
        messageId,
        channelRevision: 1,
        at: FIXED_NOW().toISOString(),
        content: { body: messageId, format: 'text' },
        correlation: {},
      });
    await update('shared');
    await read();
    publish('own', 'already-written');
    publish('group', 'queued-group');
    await update('own-dm');
    publish('own', 'future-own');
    expect(await read()).toContain('already-written');
    expect(await read()).toContain('companion/selection');
    expect(await read()).toContain('future-own');
  } finally {
    await reader.cancel();
    feed.close();
  }
});

it('keeps Bot-to-Bot DM outside shared scope and uses its canonical author and body in all-Bot scope', async () => {
  const core = createCore({ dshHome: createTempRoot('companion-bot-dm-scope-') });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let events = new EventTarget();
  const companion = new WindowCompanion({
    context: async () =>
      core.companions.open(new Request('http://localhost/api/botharness/companion')).json(),
    source: (path) => {
      events = new EventTarget();
      reader = core.companions.open(new Request(`http://localhost${path}`)).body!.getReader();
      return {
        addEventListener: events.addEventListener.bind(events),
        close: () => {
          void reader?.cancel();
        },
      };
    },
  });
  const receive = async () => {
    const frame = /event: ([^\n]+)\ndata: ([^\n]+)/u.exec(
      new TextDecoder().decode((await reader!.read()).value),
    );
    if (!frame) throw new Error('Missing Companion frame');
    events.dispatchEvent(new MessageEvent(frame[1]!, { data: frame[2]! }));
  };
  try {
    for (const [slug, displayName] of [
      ['ada', 'Ada'],
      ['grace', 'Grace'],
    ] as const) {
      core.registry.create({ slug, displayName });
      core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, slug, displayName);
      core.ownership.claim({
        sessionId: slug,
        botSlug: slug,
        rootRole: 'orchestrator',
        at: FIXED_NOW().toISOString(),
      });
    }
    const own = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const bots = core.channels.getOrCreateBotDm(
      OWNER_HUMAN_CONTEXT,
      'ada',
      'grace',
      'Ada and Grace',
    )!;
    const commit = (channelId: string, id: string, slug = 'ada') =>
      core.channels.appendMessage(
        OWNER_HUMAN_CONTEXT,
        channelId,
        {
          id,
          at: FIXED_NOW().toISOString(),
          author: { kind: 'bot', slug },
          body: id,
          ...(channelId === bots.id
            ? { botCausation: { rootSourceEventId: id, parentSourceEventId: id, hop: 1 } }
            : {}),
        },
        { sessionId: slug },
      );
    await companion.start();
    companion.select('ada');
    await receive();
    await commit(bots.id, 'shared-hidden');
    await commit(own.id, 'visible-own');
    await receive();
    expect(companion.getSnapshot().cards.map((card) => card.messageId)).toEqual(['visible-own']);
    companion.configure({ visibility: 'all-bot' });
    await receive();
    expect(companion.getSnapshot().cards.map((card) => card.messageId)).toEqual(['visible-own']);
    await commit(bots.id, 'Canonical Bot reply');
    await receive();
    expect(companion.getSnapshot().cards).toMatchObject([
      { messageId: 'visible-own', source: 'own-dm' },
      {
        body: 'Canonical Bot reply',
        source: 'bot-dm',
        participants: ['Ada', 'Grace'],
        canOpen: true,
      },
    ]);
    await commit(bots.id, 'other-author', 'grace');
    core.companions.publish({
      version: 1,
      botId: 'ada',
      sessionId: 'ada',
      channelId: bots.id,
      messageId: 'other-author',
      channelRevision: 2,
      at: FIXED_NOW().toISOString(),
      content: { body: 'Forged author and tool arguments', format: 'text' },
      correlation: {},
    });
    await commit(own.id, 'next-own');
    await receive();
    expect(companion.getSnapshot().cards.map((card) => card.body)).toEqual([
      'visible-own',
      'Canonical Bot reply',
      'next-own',
    ]);
    companion.configure({ dm: false });
    await receive();
    await commit(bots.id, 'disabled-dm');
    companion.configure({ dm: true, visibility: 'own-dm' });
    await receive();
    await commit(bots.id, 'own-scope-hidden');
    await commit(own.id, 'future-own');
    await receive();
    expect(companion.getSnapshot().cards.map((card) => card.messageId)).toEqual(['future-own']);
    expect(core.channels.listHumanMembers(OWNER_HUMAN_CONTEXT, bots.id)).toEqual([]);
    expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, own.id)).toBeUndefined();
  } finally {
    companion.dispose();
    core.companions.close();
    await core.runtime.close();
    core.externalMessaging.close();
    core.live.close();
    core.operationalDatabase.close();
  }
});
