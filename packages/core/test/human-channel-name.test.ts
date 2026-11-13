import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

describe('Human Channel nicknames', () => {
  it('keeps explicit DM and Group names independent and restores inheritance durably', async () => {
    const home = createTempRoot('botharness-channel-name-');
    const core = createCore({ dshHome: home });
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Roleplay',
      members: ['ada'],
    });
    const other = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Inheriting',
      members: ['ada'],
    });
    try {
      const bridge = createBridgeMethods(OWNER_HUMAN_CONTEXT, core);
      bridge.humanNameSet({ displayName: 'Little Bear' });
      expect(bridge.channelHumanNameSet({ channelId: dm.id, nickname: 'Captain' })).toMatchObject({
        ok: true,
        value: {
          channel: {
            humanNickname: 'Captain',
            humanMembers: [{ humanId: 'local-human', displayName: 'Captain' }],
          },
        },
      });
      expect(
        bridge.channelHumanNameSet({ channelId: group.id, nickname: 'Little Bear' }),
      ).toMatchObject({ ok: true });
      bridge.humanNameSet({ displayName: 'Researcher' });
      expect(core.channels.listHumanMembers(OWNER_HUMAN_CONTEXT, group.id)[0]?.displayName).toBe(
        'Little Bear',
      );
      expect(core.channels.listHumanMembers(OWNER_HUMAN_CONTEXT, other.id)[0]?.displayName).toBe(
        'Researcher',
      );
      bridge.channelHumanNameSet({ channelId: group.id, nickname: 'Professor' });
      expect(core.channels.listHumanMembers(OWNER_HUMAN_CONTEXT, dm.id)[0]?.displayName).toBe(
        'Captain',
      );
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
    const resumed = createCore({ dshHome: home });
    try {
      const bridge = createBridgeMethods(OWNER_HUMAN_CONTEXT, resumed);
      expect(resumed.channels.listHumanMembers(OWNER_HUMAN_CONTEXT, dm.id)[0]?.displayName).toBe(
        'Captain',
      );
      expect(resumed.channels.listHumanMembers(OWNER_HUMAN_CONTEXT, group.id)[0]?.displayName).toBe(
        'Professor',
      );
      expect(bridge.channelHumanNameSet({ channelId: group.id, nickname: null })).toMatchObject({
        ok: true,
        value: {
          channel: {
            humanNickname: null,
            humanMembers: [{ humanId: 'local-human', displayName: 'Researcher' }],
          },
        },
      });
      expect(resumed.channels.listHumanMembers(OWNER_HUMAN_CONTEXT, dm.id)[0]?.displayName).toBe(
        'Captain',
      );
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });
  it('projects source Channel nicknames to Bot queries and keeps source, read and attention facts unchanged', async () => {
    let groupId = '';
    const failures: unknown[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        try {
          const original = core.channels.message(groupId, 'trusted')!;
          const personal = core.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'replies' });
          const unread = core.humanAttention.status(OWNER_HUMAN_CONTEXT);
          const read = core.channels.readPosition(OWNER_HUMAN_CONTEXT, groupId);
          const revision = core.channels.revision(groupId);
          methods.channelHumanNameSet({ channelId: groupId, nickname: '教授 🐻' });
          methods.channelHumanNameSet({ channelId: dm.id, nickname: 'Captain' });
          expect(
            run.channels.list({ channelId: dm.id }).channels[0]?.humanMembers[0]?.displayName,
          ).toBe('Captain');
          core.registry.update('ada', { displayName: '教授 🐻' });
          expect(run.channels.list({ channelId: groupId }).channels[0]?.humanMembers).toEqual([
            { humanId: 'local-human', displayName: '教授 🐻' },
          ]);
          const view = run.channels
            .query({ channelId: groupId })
            .messages.find((view) => view.message.id === 'trusted')!;
          expect(view.actorNames).toEqual({
            humans: { 'local-human': '教授 🐻' },
            bots: { ada: '教授 🐻' },
          });
          expect(
            JSON.parse(run.channels.readModel({ channelId: groupId })).messages.find(
              (view: { message: { id: string } }) => view.message.id === 'trusted',
            ).actorNames,
          ).toEqual(view.actorNames);
          const { humanReceipts: _receipts, ...source } = original;
          const { humanReceipts, ...current } = core.channels.message(groupId, 'trusted')!;
          expect(current).toEqual(source);
          expect(humanReceipts?.[0]?.displayName).toBe('教授 🐻');
          expect(core.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'replies' })).toEqual(
            personal,
          );
          expect(core.humanAttention.status(OWNER_HUMAN_CONTEXT)).toEqual(unread);
          expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, groupId)).toEqual(read);
          expect(core.channels.revision(groupId)).toBe(revision);
        } catch (error) {
          failures.push(error);
        }
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: createTempRoot('botharness-human-name-mentions-'), agents });
    const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, core);
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    groupId = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Names',
      members: ['ada'],
    }).id;
    const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    try {
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, groupId, {
        id: 'trusted',
        at: '2026-10-01T00:00:00Z',
        author: { kind: 'bot', slug: 'ada' },
        body: '@Ada @Human / plain @Human @Ada',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
        humanMentions: [{ humanId: 'local-human', label: 'Human', start: 5, end: 11 }],
        botCausation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 1 },
      });
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        id: 'start',
        at: '2026-10-01T00:01:00Z',
        author: { kind: 'human' },
        body: 'Inspect names',
      });
      core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dm.id,
        messageId: 'start',
        body: 'Inspect names',
      });
      await core.runtime.whenIdle();
      expect(failures).toEqual([]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it('refuses nicknames for Bot-to-Bot inspection, absent Channels and replacement Human identities', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-nickname-authority-') });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'lin', displayName: 'Lin' });
      const readonly = core.channels.getOrCreateBotDm(OWNER_HUMAN_CONTEXT, 'ada', 'lin', 'Bots')!;
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      const bridge = createBridgeMethods(OWNER_HUMAN_CONTEXT, core);
      for (const payload of [
        { channelId: readonly.id, nickname: 'Captain' },
        { channelId: 'absent', nickname: 'Captain' },
        { channelId: dm.id, nickname: 'Captain', humanId: 'someone-else' },
        { channelId: dm.id, nickname: 'a\nb' },
      ])
        expect(bridge.channelHumanNameSet(payload)).toMatchObject({ ok: false });
      expect(core.channels.listHumanMembers(OWNER_HUMAN_CONTEXT, readonly.id)).toEqual([]);
      expect(core.channels.humanNickname(OWNER_HUMAN_CONTEXT, readonly.id)).toBeUndefined();
      expect(core.channels.humanNickname(OWNER_HUMAN_CONTEXT, dm.id)).toBeNull();
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
