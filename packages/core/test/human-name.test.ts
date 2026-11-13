import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

describe('local Human default names', () => {
  it('saves, changes and clears one durable name without changing Channel history or reads', async () => {
    const home = createTempRoot('botharness-human-name-');
    const core = createCore({ dshHome: home });
    const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, core);
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Launch',
      members: ['ada'],
    });
    const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    try {
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
        id: 'human-source',
        at: '2026-10-01T00:00:00Z',
        author: { kind: 'human' },
        body: 'Launch Friday',
      });
      await core.channels.markRead(OWNER_HUMAN_CONTEXT, group.id, 'human-source');
      const before = core.channels.message(group.id, 'human-source');
      const read = core.channels.readPosition(OWNER_HUMAN_CONTEXT, group.id);
      expect(methods.humanIdentity({})).toEqual({
        ok: true,
        value: { humanId: 'local-human', defaultDisplayName: null, displayName: 'Human' },
      });
      expect(methods.humanNameSet({ displayName: '小熊 🚀' })).toEqual({
        ok: true,
        value: { humanId: 'local-human', defaultDisplayName: '小熊 🚀', displayName: '小熊 🚀' },
      });
      for (const id of [group.id, dm.id])
        expect(core.channels.listHumanMembers(OWNER_HUMAN_CONTEXT, id)).toEqual([
          { humanId: 'local-human', displayName: '小熊 🚀' },
        ]);
      for (const response of [
        methods.channelCreate({ name: 'Second', members: ['ada'] }),
        methods.channelRename({ channelId: group.id, name: 'Renamed' }),
        methods.channelGroupAvatarSet({ channelId: group.id, avatar: null }),
      ])
        expect(response).toMatchObject({
          ok: true,
          value: {
            channel: { humanMembers: [{ humanId: 'local-human', displayName: '小熊 🚀' }] },
          },
        });
      expect(core.channels.message(group.id, 'human-source')).toEqual(before);
      expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, group.id)).toEqual(read);
      expect(core.channels.revision(group.id)).toBe(1);
      expect(methods.humanNameSet({ displayName: 'Professor' })).toMatchObject({
        ok: true,
        value: { displayName: 'Professor' },
      });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
    const resumed = createCore({ dshHome: home });
    try {
      const bridge = createBridgeMethods(OWNER_HUMAN_CONTEXT, resumed);
      expect(bridge.humanIdentity({})).toMatchObject({
        ok: true,
        value: { humanId: 'local-human', displayName: 'Professor' },
      });
      expect(bridge.humanNameSet({ displayName: null })).toMatchObject({
        ok: true,
        value: { defaultDisplayName: null, displayName: 'Human' },
      });
      expect(resumed.channels.listHumanMembers(OWNER_HUMAN_CONTEXT, group.id)).toEqual([
        { humanId: 'local-human', displayName: 'Human' },
      ]);
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });
  it('projects current typed actor names while preserving trusted spans and attention on rename', async () => {
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
          methods.humanNameSet({ displayName: '教授 🐻' });
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
});
