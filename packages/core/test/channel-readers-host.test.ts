import { describe, expect, it } from 'vitest';

import {
  loadChannelChangeCursor,
  loadUnreadCounts,
  markAllChannelsRead,
  markChannelRead,
  reactToMessage,
  readChannelChanges,
  readChannelJournal,
  readChannelTimeline,
  searchMessages,
  wireMessage,
  type ChannelHost,
} from '@botharness/host-client/channel-messages';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';
import { createFakeRosterDomain } from './roster-fixture.js';

async function fixture() {
  const core = createCore({ dshHome: createTempRoot('botharness-channel-readers-') });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
    id: 'bot-one',
    at: '2026-11-18T00:00:05.000Z',
    author: { kind: 'bot', slug: 'ada' },
    body: 'The launch checklist lives in docs/launch.md',
  });
  await core.roster.attach(createFakeRosterDomain().facility);
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core }) as unknown as Record<
    string,
    (args: unknown) => unknown
  >;
  const channels = core.channels;
  const human = OWNER_HUMAN_CONTEXT;
  const streamed: Record<string, (args: Record<string, unknown>) => unknown> = {
    channelJournalPage: (args) =>
      channels.readHumanJournalPage(human, args['channelId'] as string, {
        through: args['through'] as number,
      }),
    channelChanges: (args) =>
      channels.readHumanChanges!(human, args['channelId'] as string, {
        sinceSeq: args['sinceSeq'] as number,
        epoch: args['epoch'] as string,
      }),
    channelChangeCursor: () => channels.changeCursor!(),
  };
  const host: ChannelHost = {
    call: async (method, args) => {
      const read = streamed[method];
      if (read !== undefined) return read(args);
      const result = (await methods[method]!(args)) as
        | { ok: true; value: unknown }
        | { ok: false; error: { message: string } };
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    },
  };
  const close = async () => {
    await core.runtime.close();
    core.operationalDatabase.close();
  };
  return { dm, host, close };
}

describe('shared channel readers against the real Host methods', () => {
  it('accept every answer the Host gives', async () => {
    const { dm, host, close } = await fixture();
    try {
      const timeline = await readChannelTimeline(host, dm.id, {}, wireMessage);
      expect(timeline.page.entries.map((entry) => entry.id)).toEqual(['bot-one']);
      const journal = await readChannelJournal(
        host,
        dm.id,
        { through: timeline.revision },
        wireMessage,
      );
      expect(journal.entries.map((entry) => entry.message.id)).toEqual(['bot-one']);
      const cursor = await loadChannelChangeCursor(host);
      expect((await readChannelChanges(host, dm.id, cursor, wireMessage)).cursor.epoch).toBe(
        cursor.epoch,
      );
      expect(
        await reactToMessage(host, {
          channelId: dm.id,
          messageId: 'bot-one',
          emoji: '👍',
          active: true,
        }),
      ).toEqual([{ emoji: '👍', actors: [{ kind: 'human', id: 'local-human' }] }]);
      expect(await loadUnreadCounts(host)).toEqual([{ channelId: dm.id, unreadCount: 1 }]);
      await markChannelRead(host, dm.id, 'bot-one');
      expect(await loadUnreadCounts(host)).toEqual([]);
      expect((await markAllChannelsRead(host)).channels).toBe(0);
      const found = await searchMessages(host, { text: 'checklist', limit: 8 }, wireMessage);
      expect(found.hits.map((hit) => hit.message.id)).toEqual(['bot-one']);
    } finally {
      await close();
    }
  });
});
