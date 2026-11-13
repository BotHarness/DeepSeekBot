import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it } from 'vitest';
import { createCompanionFeed, type CompanionFeed } from '../src/companions/feed.js';
import type { PersonaBotOutputCommitted } from '../src/channels/output.js';
import { createCore } from '../src/plugin.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';
import { WindowCompanion } from '../../client/src/client/window-companion.js';

const feeds: CompanionFeed[] = [];
afterEach(() => {
  for (const feed of feeds.splice(0)) feed.close();
});

it('delivers committed owned output and real Activity through the Host HTTP contract into the public Client', async () => {
  const core = createCore({ dshHome: createTempRoot('companion-owned-') });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const events = new EventTarget();
  const owner = new WindowCompanion({
    context: async () => {
      const response = core.companions.open(
        new Request('http://localhost/api/botharness/companion'),
      );
      return response.json();
    },
    source: (path) => {
      const response = core.companions.open(new Request(`http://localhost${path}`));
      expect(response.status).toBe(200);
      reader = response.body!.getReader();
      return {
        addEventListener: events.addEventListener.bind(events),
        close() {
          void reader?.cancel();
        },
      };
    },
  });
  const receive = async () => {
    const text = new TextDecoder().decode((await reader!.read()).value);
    const frame = /event: ([^\n]+)\ndata: ([^\n]+)/u.exec(text);
    if (!frame) throw new Error('Missing Host frame');
    events.dispatchEvent(new MessageEvent(frame[1]!, { data: frame[2]! }));
  };
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.ownership.claim({
      sessionId: 'owned',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: FIXED_NOW().toISOString(),
    });
    const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    await core.channels.appendMessage(
      OWNER_HUMAN_CONTEXT,
      dm.id,
      {
        id: 'old',
        at: FIXED_NOW().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: 'No replay',
      },
      { sessionId: 'owned' },
    );
    await owner.start();
    owner.select('ada');
    await receive();
    expect(owner.getSnapshot().cards).toHaveLength(0);
    core.states.setSessionState('ada', 'owned', 'thinking');
    await receive();
    expect(owner.getSnapshot().activity?.state).toBe('thinking');
    await core.channels.appendMessage(
      OWNER_HUMAN_CONTEXT,
      dm.id,
      {
        id: 'new',
        at: FIXED_NOW().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: 'Owned reply',
      },
      { sessionId: 'owned' },
    );
    await receive();
    owner.advance(1000);
    expect(owner.getSnapshot().cards).toMatchObject([
      { messageId: 'new', body: 'Owned reply', channelName: 'Ada', shown: 11 },
    ]);
  } finally {
    owner.dispose();
    core.companions.close();
    await core.runtime.close();
    core.externalMessaging.close();
    core.live.close();
    core.operationalDatabase.close();
  }
});

it('starts a future-only Host baseline, admits only owned Human DM output and releases Activity', async () => {
  const listeners = new Set<() => void>();
  const feed = createCompanionFeed({
    profileId: 'profile-a',
    bot: (slug) => (slug === 'ada' ? { slug, name: 'Ada', paused: false } : undefined),
    activity: () => ({
      generation: 'host-a',
      revision: 0,
      bots: [{ slug: 'ada', state: 'thinking' }],
    }),
    onActivity: (changed) => {
      listeners.add(changed);
      return () => {
        listeners.delete(changed);
      };
    },
    observeOutput: (id, messageId) =>
      id === 'human-dm'
        ? {
            channel: { id, type: 'dm', name: 'Ada', botSlug: 'ada', members: ['ada'] },
            message: { id: messageId, author: { kind: 'bot', slug: 'ada' }, body: messageId },
            humanParticipant: true,
            canRead: true,
          }
        : undefined,
  });
  feeds.push(feed);
  const output = (id: string, channelId = 'human-dm'): PersonaBotOutputCommitted => ({
    version: 1,
    botId: 'ada',
    sessionId: 'owned',
    channelId,
    messageId: id,
    channelRevision: 1,
    at: '2026-10-08T00:00:00Z',
    content: { body: id, format: 'text' },
    correlation: {},
  });
  feed.publish(output('before-selection'));
  const response = feed.open(new Request('http://localhost/api/botharness/companion?botId=ada'));
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();
  const read = async () => new TextDecoder().decode((await reader.read()).value);
  const baseline = await read();
  expect(baseline).toContain('event: companion/baseline');
  expect(baseline).toContain('"state":"thinking"');
  expect(baseline).not.toContain('before-selection');
  feed.publish(output('hidden', 'bot-dm'));
  feed.publish(output('new-reply'));
  expect(await read()).toContain('new-reply');
  expect(listeners.size).toBe(1);
  await reader.cancel();
  expect(listeners.size).toBe(0);
  feed.publish(output('while-closed'));
  const restarted = feed.open(new Request('http://localhost/api/botharness/companion?botId=ada'));
  const next = restarted.body!.getReader();
  expect(new TextDecoder().decode((await next.read()).value)).not.toContain('while-closed');
  await next.cancel();
});
