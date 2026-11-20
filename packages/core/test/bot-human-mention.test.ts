import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it } from 'vitest';

import { LOCAL_HUMAN_ID } from '../src/channels/channel.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function adapter(onRun: (run: OrchestratorAgentRun) => Promise<void>): BotAgentAdapter {
  return {
    runOrchestrator: onRun,
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

describe('trusted Bot mentions of the local Human', () => {
  it('rejects names, stale identities and absent members; text alone stays ordinary across restart and rename', async () => {
    const home = createTempRoot('botharness-human-mention-boundary-');
    let groupId = '';
    const failures: string[] = [];
    const validationErrors: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        for (const invalid of ['local-human', { humanId: 'local-human' }, null, [12]]) {
          try {
            await Reflect.apply(run.channels.send, undefined, [
              { channelId: groupId, body: 'Invalid target', mentionHumanIds: invalid },
            ]);
            validationErrors.push('invalid input accepted');
          } catch (error) {
            validationErrors.push(String(error));
          }
        }
        for (const humanId of ['Human', 'local-human-old', 'everyone']) {
          try {
            await run.channels.send({
              channelId: groupId,
              body: 'Invalid',
              mentionHumanIds: [humanId],
            });
          } catch (error) {
            failures.push(String(error));
          }
        }
        try {
          await run.channels.send({ body: 'Not a Group', mentionHumanIds: [LOCAL_HUMAN_ID] });
        } catch (error) {
          failures.push(String(error));
        }
        await run.channels.send({
          channelId: groupId,
          body: '@Human ordinary text',
          deliveryKey: 'plain-text',
        });
        await run.channels.send({
          channelId: groupId,
          body: 'Trusted request',
          mentionHumanIds: [LOCAL_HUMAN_ID],
          deliveryKey: 'trusted',
        });
      }),
    });
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Launch',
      members: ['ada'],
    });
    groupId = group.id;
    const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    try {
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        id: 'start',
        at: '2026-09-30T01:00:00Z',
        author: { kind: 'human' },
        body: 'Test targets',
      });
      core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dm.id,
        messageId: 'start',
        body: 'Test targets',
      });
      await core.runtime.whenIdle();
      expect(failures).toHaveLength(4);
      expect(validationErrors).toHaveLength(4);
      for (const error of validationErrors)
        expect(error).toContain('Human mentions require at most 20 valid Human IDs');
      const personal = core.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'replies' }).items;
      expect(personal).toHaveLength(1);
      expect(personal[0]?.summary).toBe('@Human Trusted request');
      expect(
        core.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'unread' }).items,
      ).toMatchObject([{ unreadCount: 1, summary: '@Human ordinary text' }]);
      expect(core.humanAttention.status(OWNER_HUMAN_CONTEXT).unreadCount).toBe(2);
      core.channels.setHumanDefaultName(OWNER_HUMAN_CONTEXT, 'Launch lead');
      expect(core.channels.listHumanMembers(OWNER_HUMAN_CONTEXT, groupId)).toEqual([
        { humanId: LOCAL_HUMAN_ID, displayName: 'Launch lead' },
      ]);
      await core.runtime.close();
      core.operationalDatabase.close();
      const resumed = createCore({ dshHome: home });
      try {
        expect(
          resumed.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'replies' }).items,
        ).toEqual(personal);
        expect(resumed.channels.message(groupId, personal[0]!.messageId!)?.humanMentions).toEqual([
          { humanId: LOCAL_HUMAN_ID, label: 'Human', start: 0, end: 6 },
        ]);
        const fixture = attachOperationalModule(
          resumed.operationalDatabase,
          'human-mention-test-fixture',
        );
        fixture.transaction(
          (db) =>
            db
              .prepare(
                'UPDATE channel_human_members SET left_at = ? WHERE channel_id = ? AND human_id = ?',
              )
              .run('2026-10-01T00:00:00Z', groupId, LOCAL_HUMAN_ID),
          ['channel'],
        );
        expect(resumed.channels.listHumanMembers(OWNER_HUMAN_CONTEXT, groupId)).toEqual([]);
        expect(
          resumed.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'replies' }).items,
        ).toEqual([]);
        await expect(
          resumed.channels.appendMessageOnce(OWNER_HUMAN_CONTEXT, groupId, {
            id: 'absent-target',
            at: '2026-10-01T00:00:00Z',
            author: { kind: 'bot', slug: 'ada' },
            body: '@Human Invalid',
            humanMentions: [{ humanId: LOCAL_HUMAN_ID, label: 'Human', start: 0, end: 6 }],
            botCausation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 1 },
          }),
        ).rejects.toThrow();
        expect(resumed.channels.hasMessage(groupId, 'absent-target')).toBe(false);
      } finally {
        await resumed.runtime.close();
        resumed.operationalDatabase.close();
      }
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it('discovers a Human target and commits one personal mention while waking Bot recipients once', async () => {
    let groupId = '';
    let sentId = '';
    const recipients: string[] = [];
    const core = createCore({
      dshHome: createTempRoot('botharness-human-mention-'),
      agents: adapter(async (run) => {
        if (run.bot.slug !== 'ada') {
          recipients.push(run.bot.slug);
          return;
        }
        const discovered = run.channels.list({ channelId: groupId }).channels[0]!;
        expect(discovered.humanMembers).toEqual([
          { humanId: LOCAL_HUMAN_ID, displayName: 'Human' },
        ]);
        const input = {
          channelId: groupId,
          body: 'Please confirm the launch window',
          mentionHumanIds: [LOCAL_HUMAN_ID, LOCAL_HUMAN_ID],
          mentionBotIds: ['bea', 'cee'],
          replyTo: 'human-question',
          deliveryKey: 'trusted-human-call',
        };
        const sent = await run.channels.send(input);
        sentId = sent.id;
        expect((await run.channels.send(input)).id).toBe(sentId);
      }),
    });
    try {
      for (const slug of ['ada', 'bea', 'cee']) core.registry.create({ slug, displayName: slug });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Launch',
        members: ['ada', 'bea', 'cee'],
      });
      groupId = group.id;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, groupId, {
        id: 'human-question',
        at: '2026-09-30T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Is the launch ready?',
      });
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'ada')!;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        id: 'start',
        at: '2026-09-30T00:01:00.000Z',
        author: { kind: 'human' },
        body: 'Ask us in Launch',
      });
      core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dm.id,
        messageId: 'start',
        body: 'Ask us in Launch',
      });
      await core.runtime.whenIdle();
      expect(core.channels.message(groupId, sentId)).toMatchObject({
        body: '@bea @cee @Human Please confirm the launch window',
        humanMentions: [{ humanId: LOCAL_HUMAN_ID, label: 'Human', start: 10, end: 16 }],
      });
      expect(recipients.sort()).toEqual(['bea', 'cee']);
      expect(
        core.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'replies' }).items,
      ).toMatchObject([
        { kind: 'channel-mention', messageId: sentId, channelId: groupId, isUnread: true },
      ]);
      expect(core.humanAttention.status(OWNER_HUMAN_CONTEXT)).toEqual({
        unreadCount: 1,
        hasAction: false,
      });
      expect(core.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'unread' }).items).toEqual(
        [],
      );
      await core.channels.markRead(OWNER_HUMAN_CONTEXT, groupId, sentId);
      expect(
        core.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'replies' }).items,
      ).toMatchObject([{ messageId: sentId, isUnread: false }]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
