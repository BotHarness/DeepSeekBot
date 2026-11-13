import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
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

describe('Group wake policy authority and audit', () => {
  it('binds a Bot policy change to its trusted Orchestrator identity and joined Group', async () => {
    const home = createTempRoot('botharness-group-wake-actor-');
    let joinedGroupId = '';
    let otherGroupId = '';
    const observed: unknown[] = [];
    const core = createCore({
      dshHome: home,
      agents: {
        ...agents,
        async runOrchestrator(run) {
          expect(() => run.channels.readGroupWakePolicy(otherGroupId)).toThrow();
          expect(() =>
            run.channels.setGroupWakePolicy({
              channelId: otherGroupId,
              mode: 'mentions',
              count: 5,
              intervalSeconds: 30,
            }),
          ).toThrow();
          observed.push(run.channels.readGroupWakePolicy(joinedGroupId));
          observed.push(
            run.channels.setGroupWakePolicy({
              channelId: joinedGroupId,
              mode: 'mentions',
              count: 5,
              intervalSeconds: 30,
            }),
          );
        },
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      joinedGroupId = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Joined',
        members: ['ada'],
      }).id;
      otherGroupId = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Other',
        members: ['bea'],
      }).id;
      core.channels.setGroupWakePolicy(
        joinedGroupId,
        'ada',
        {
          mode: 'all',
          count: 5,
          intervalSeconds: 30,
        },
        { kind: 'human' },
      );
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, joinedGroupId, {
        id: 'wake-ada',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Please change your Group attention to mentions',
      });
      core.runtime.admitGroupMessage(joinedGroupId, 'wake-ada');
      await core.runtime.whenIdle();
      expect(observed).toMatchObject([
        { mode: 'all', revision: 1, lastActor: { kind: 'human' } },
        { mode: 'mentions', revision: 2, lastActor: { kind: 'bot', botSlug: 'ada' } },
      ]);
      expect(core.channels.get(joinedGroupId)?.wakePolicies?.['ada']).toMatchObject({
        mode: 'mentions',
        revision: 2,
      });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('shares Human and Bot revisions, preserves Admission snapshots, and survives restart', async () => {
    const home = createTempRoot('botharness-group-wake-tools-');
    const core = createCore({ dshHome: home, agents });
    let groupId = '';
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Team',
        members: ['ada'],
      });
      groupId = group.id;
      expect(core.channels.getGroupWakePolicy(group.id, 'ada')).toEqual({
        mode: 'digest',
        count: 5,
        intervalSeconds: 30,
        revision: 0,
        lastActor: null,
        changedAt: null,
      });
      const defaultValue = { mode: 'digest' as const, count: 5, intervalSeconds: 30 };
      core.channels.setGroupWakePolicy(group.id, 'ada', defaultValue, {
        kind: 'bot',
        botSlug: 'ada',
      });
      expect(core.channels.get(group.id)?.wakePolicies?.['ada']).toBeUndefined();

      const mentions = { ...defaultValue, mode: 'mentions' as const };
      core.channels.setGroupWakePolicy(group.id, 'ada', mentions, {
        kind: 'bot',
        botSlug: 'ada',
      });
      core.channels.setGroupWakePolicy(group.id, 'ada', mentions, {
        kind: 'bot',
        botSlug: 'ada',
      });
      expect(core.channels.getGroupWakePolicy(group.id, 'ada')).toMatchObject({
        mode: 'mentions',
        revision: 1,
        lastActor: { kind: 'bot', botSlug: 'ada' },
      });
      for (const invalid of [
        { ...mentions, count: 0 },
        { ...mentions, intervalSeconds: 3601 },
      ])
        expect(() =>
          core.channels.setGroupWakePolicy(group.id, 'ada', invalid, {
            kind: 'bot',
            botSlug: 'ada',
          }),
        ).toThrow('Invalid Group wake policy');
      expect(core.channels.getGroupWakePolicy(group.id, 'ada').revision).toBe(1);
      expect(() =>
        core.channels.setGroupWakePolicy(group.id, 'ada', defaultValue, {
          kind: 'bot',
          botSlug: 'bea',
        }),
      ).toThrow('own Group wake policy');
      expect(() => core.channels.getGroupWakePolicy(group.id, 'bea')).toThrow(
        'Group member not found',
      );

      const appendOrdinary = async (id: string) => {
        await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
          id,
          at: new Date().toISOString(),
          author: { kind: 'human' },
          body: id,
        });
        core.runtime.admitGroupMessage(group.id, id);
      };
      await appendOrdinary('before-human-edit');
      expect(
        createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core }).channelGroupWakeSet({
          channelId: group.id,
          botSlug: 'ada',
          mode: 'silent',
          count: 5,
          intervalSeconds: 30,
        }),
      ).toMatchObject({ ok: true });
      await appendOrdinary('after-human-edit');
      await core.runtime.whenIdle();
      expect(core.channels.getGroupWakePolicy(group.id, 'ada')).toMatchObject({
        mode: 'silent',
        revision: 2,
        lastActor: { kind: 'human' },
      });

      const database = attachOperationalModule(core.operationalDatabase, 'group-wake-tools');
      expect(
        database.read((db) =>
          db
            .prepare(`
              SELECT revision, actor_kind, actor_bot_slug, mode
                FROM group_wake_policy_audit
               WHERE channel_id = ? AND bot_slug = ? ORDER BY revision
            `)
            .all(group.id, 'ada'),
        ),
      ).toEqual([
        { revision: 1, actor_kind: 'bot', actor_bot_slug: 'ada', mode: 'mentions' },
        { revision: 2, actor_kind: 'human', actor_bot_slug: null, mode: 'silent' },
      ]);
      expect(
        database.read((db) =>
          db
            .prepare(`
              SELECT e.message_id, a.wake_mode, a.wake_policy_revision, a.attempt_state
                FROM inbox_admissions a
                JOIN source_events e ON e.source_event_id = a.source_event_id
               WHERE e.channel_id = ? AND a.bot_slug = ? ORDER BY e.message_id
            `)
            .all(group.id, 'ada'),
        ),
      ).toMatchObject([
        { message_id: 'after-human-edit', wake_mode: 'silent', wake_policy_revision: 2 },
        { message_id: 'before-human-edit', wake_mode: 'mentions', wake_policy_revision: 1 },
      ]);
      expect(() =>
        database.transaction(
          (db) =>
            db.prepare('DELETE FROM group_wake_policy_audit WHERE channel_id = ?').run(group.id),
          ['channel'],
        ),
      ).toThrow('Operational transaction');
      expect(
        database.read((db) =>
          db
            .prepare('SELECT COUNT(*) AS count FROM group_wake_policy_audit WHERE channel_id = ?')
            .get(group.id),
        ),
      ).toEqual({ count: 2 });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }

    const reopened = createCore({ dshHome: home, agents });
    try {
      expect(reopened.channels.getGroupWakePolicy(groupId, 'ada')).toMatchObject({
        mode: 'silent',
        revision: 2,
        lastActor: { kind: 'human' },
      });
      reopened.channels.removeGroupMember(groupId, 'ada');
      expect(() => reopened.channels.getGroupWakePolicy(groupId, 'ada')).toThrow(
        'Group member not found',
      );
      expect(() =>
        reopened.channels.setGroupWakePolicy(groupId, 'ada', {
          mode: 'all',
          count: 5,
          intervalSeconds: 30,
        }),
      ).toThrow('Group member not found');
    } finally {
      await reopened.runtime.close();
      reopened.operationalDatabase.close();
    }
  });
});
