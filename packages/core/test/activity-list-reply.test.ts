import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const agents: BotAgentAdapter = {
  async runOrchestrator() {},
  async runAssignment() {},
  requestAssignment() {
    throw new Error('No Assignment expected');
  },
  async close() {},
};

describe('Human Inbox Channel reply', () => {
  it('sends one canonical Human reply through the existing Channel path for Group and DM', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-inbox-reply-send-'), agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const channels = [
        core.channels.createGroup({ name: 'Team', members: ['ada'] }),
        core.channels.getOrCreateDm('ada', 'Ada')!,
      ];
      const methods = createBridgeMethods({ ...core });
      for (const [index, channel] of channels.entries()) {
        await core.channels.appendMessage(channel.id, {
          id: 'source',
          at: '2026-09-30T12:00:00.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'Review the launch plan.',
        });
        const payload = {
          channelId: channel.id,
          body: 'Launch Friday.',
          replyTo: 'source',
          messageId: 'human-00000000-0000-4000-8000-00000000000' + index,
        };
        const sent = await methods.channelSend(payload);
        expect(sent).toMatchObject({
          ok: true,
          value: {
            message: {
              id: payload.messageId,
              author: { kind: 'human' },
              body: payload.body,
              replyTo: 'source',
              replyToPreview: { body: 'Review the launch plan.' },
            },
          },
        });
        expect(await methods.channelSend(payload)).toMatchObject({
          ok: true,
          value: {
            message: {
              id: payload.messageId,
              author: { kind: 'human' },
              body: payload.body,
              replyTo: 'source',
            },
          },
        });
        expect(
          core.channels
            .readMessages(channel.id)
            .filter((item) => item.botChannelPost === undefined),
        ).toHaveLength(2);
        expect(core.channels.readPosition(channel.id)).toBeUndefined();
        expect(
          await methods.channelSend({ ...payload, messageId: undefined, replyTo: 'missing' }),
        ).toMatchObject({ ok: false });
        expect(
          core.channels
            .readMessages(channel.id)
            .filter((item) => item.botChannelPost === undefined),
        ).toHaveLength(2);
      }
      core.channels.deleteGroup(channels[0]!.id);
      expect(
        await methods.channelSend({ channelId: channels[0]!.id, body: 'Draft', replyTo: 'source' }),
      ).toMatchObject({ ok: false });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('honors the Human visibility boundary for concrete context and reply targets', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-inbox-reply-'), agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      for (const index of [1, 2, 3])
        await core.channels.appendMessage(group.id, {
          id: 'source-' + index,
          at: new Date(Date.UTC(2026, 8, 30, 12, 0, index)).toISOString(),
          author: { kind: 'bot', slug: 'ada' },
          body: 'Update ' + index,
        });
      const database = attachOperationalModule(core.operationalDatabase, 'channels');
      database.transaction((db) =>
        db
          .prepare(
            'UPDATE channel_human_members SET visible_from_revision = 2 WHERE channel_id = ?',
          )
          .run(group.id),
      );
      const methods = createBridgeMethods({ ...core });
      const context = methods.channelTimeline({
        channelId: group.id,
        direction: 'around',
        around: 'source-2',
      });
      expect(context.ok && context.value.page.entries.map((message) => message.id)).toEqual([
        'source-2',
        'source-3',
      ]);
      expect(
        methods.channelTimeline({ channelId: group.id, direction: 'around', around: 'source-1' }),
      ).toMatchObject({ ok: false });
      expect(
        await methods.channelSend({
          channelId: group.id,
          body: 'Hidden reply',
          replyTo: 'source-1',
        }),
      ).toMatchObject({ ok: false });
      expect(core.channels.revision(group.id)).toBe(3);
      database.transaction((db) =>
        db
          .prepare('UPDATE channel_human_members SET left_at = ? WHERE channel_id = ?')
          .run('2026-09-30T12:05:00.000Z', group.id),
      );
      expect(
        methods.channelTimeline({ channelId: group.id, direction: 'around', around: 'source-2' }),
      ).toMatchObject({ ok: false });
      expect(
        await methods.channelSend({
          channelId: group.id,
          body: 'Stale reply',
          replyTo: 'source-2',
        }),
      ).toMatchObject({ ok: false });
      expect(core.channels.revision(group.id)).toBe(3);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
