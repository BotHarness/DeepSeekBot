import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import {
  attachOperationalModule,
  type OperationalDatabaseModulePort,
} from '../src/database/owner.js';
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

describe('Bot Group self-leave', () => {
  it('relinquishes creator authority, revokes read/send, keeps peer access and history after restart', async () => {
    const home = createTempRoot('botharness-group-self-leave-');
    let groupId = '';
    const turns: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        turns.push(run.bot.slug);
        if (run.bot.slug === 'ada') {
          expect(run.channels.leaveGroup({ channelId: groupId })).toEqual({
            channelId: groupId,
            left: true,
          });
          expect(run.channels.leaveGroup({ channelId: groupId })).toEqual({
            channelId: groupId,
            left: false,
          });
          expect(run.channels.list({ channelId: groupId }).channels).toEqual([]);
          expect(() => run.channels.read({ channelId: groupId })).toThrow('not a member');
          await expect(
            run.channels.send({ channelId: groupId, body: 'No longer joined' }),
          ).rejects.toThrow('not a member');
          expect(() =>
            run.channels.renameGroup({ channelId: groupId, name: 'No longer owner' }),
          ).toThrow('owner');
          return;
        }
        expect(run.bot.slug).toBe('bea');
        if (!run.message.includes('Check the Group')) {
          expect(run.message).toContain('ADA left the Channel.');
          return;
        }
        expect(run.channels.list({ channelId: groupId }).channels).toHaveLength(1);
        expect(
          run.channels.read({ channelId: groupId }).map((item) => item.message.body),
        ).toContain('Before departure');
        await run.channels.send({ channelId: groupId, body: 'Bea remains joined' });
      }),
    });
    try {
      for (const slug of ['ada', 'bea'])
        core.registry.create({ slug, displayName: slug.toUpperCase() });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Colleagues',
        members: ['ada', 'bea'],
        ownerBotSlug: 'ada',
      });
      groupId = group.id;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, groupId, {
        id: 'before-leave',
        at: '2026-09-27T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Before departure',
      });
      for (const slug of ['ada', 'bea']) {
        const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, slug, slug.toUpperCase())!;
        const id = 'request-' + slug;
        await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
          id,
          at: '2026-09-27T00:01:00.000Z',
          author: { kind: 'human' },
          body: slug === 'ada' ? 'Leave the Group' : 'Check the Group',
        });
        core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
          channelId: dm.id,
          messageId: id,
          body: slug === 'ada' ? 'Leave the Group' : 'Check the Group',
        });
        await core.runtime.whenIdle();
      }
      expect(turns).toEqual(['ada', 'bea', 'bea']);
      expect(core.channels.get(groupId)).toMatchObject({ members: ['bea'] });
      expect(core.channels.get(groupId)?.ownerBotSlug).toBeUndefined();
      const departures = core.channels
        .readMessages(groupId)
        .filter((item) => item.memberDeparture !== undefined);
      expect(departures).toHaveLength(1);
      expect(departures[0]).toMatchObject({
        author: { kind: 'system' },
        body: 'ADA left the Channel.',
        memberDeparture: {
          memberKind: 'bot',
          memberId: 'ada',
          displayName: 'ADA',
          departureType: 'left',
        },
      });
      expect(
        core.channels
          .readMessages(groupId)
          .map((item) => item.body)
          .sort(),
      ).toEqual(['Before departure', 'ADA left the Channel.', 'Bea remains joined'].sort());
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
        registry: core.registry,
        states: core.states,
        channels: core.channels,
        ownership: core.ownership,
        roster: core.roster,
      });
      expect(methods.channelRename({ channelId: groupId, name: 'Human managed' })).toMatchObject({
        ok: true,
        value: { channel: { name: 'Human managed', members: ['bea'] } },
      });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }

    const reopened = createCore({ dshHome: home });
    try {
      expect(reopened.channels.get(groupId)).toMatchObject({
        name: 'Human managed',
        members: ['bea'],
      });
      expect(reopened.channels.get(groupId)?.ownerBotSlug).toBeUndefined();
      expect(reopened.channels.readMessages(groupId).map((item) => item.body)).toContain(
        'Before departure',
      );
      expect(
        reopened.channels
          .readMessages(groupId)
          .filter((item) => item.memberDeparture !== undefined),
      ).toHaveLength(1);
    } finally {
      await reopened.runtime.close();
      reopened.operationalDatabase.close();
    }
  });

  it('lets a non-owner leave without changing the Bot creator', async () => {
    let hiddenGroupId = '';
    const core = createCore({
      dshHome: createTempRoot('botharness-group-peer-leave-'),
      agents: adapter(async (run) => {
        expect(run.bot.slug).toBe('bea');
        const group = run.channels.list({ type: 'group' }).channels[0];
        expect(group).toBeDefined();
        expect(run.channels.leaveGroup({ channelId: group!.id })).toEqual({
          channelId: group!.id,
          left: true,
        });
        expect(run.channels.leaveGroup({ channelId: hiddenGroupId })).toEqual({
          channelId: hiddenGroupId,
          left: false,
        });
        expect(() => run.channels.leaveGroup({ channelId: 'missing-group' })).toThrow(
          'group_leave: channel-unavailable',
        );
        expect(() => run.channels.leaveGroup({ channelId: run.inboundChannelId! })).toThrow(
          'group_leave: group-required',
        );
      }),
    });
    try {
      for (const slug of ['ada', 'bea'])
        core.registry.create({ slug, displayName: slug.toUpperCase() });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Ada owns',
        members: ['ada', 'bea'],
        ownerBotSlug: 'ada',
      });
      hiddenGroupId = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Hidden',
        members: ['ada'],
      }).id;
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'bea', 'Bea')!;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        id: 'peer-leave',
        at: '2026-09-27T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Leave this Group',
      });
      core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dm.id,
        messageId: 'peer-leave',
        body: 'Leave this Group',
      });
      await core.runtime.whenIdle();
      expect(core.channels.get(group.id)).toMatchObject({
        members: ['ada'],
        ownerBotSlug: 'ada',
      });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('writes one system notice with an ordinary Inbox admission when Human removes a member', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-group-human-remove-notice-') });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Colleagues',
        members: ['ada', 'bea'],
      });
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
      expect(
        methods.channelGroupMemberRemove({ channelId: group.id, botSlug: 'bea' }),
      ).toMatchObject({
        ok: true,
        value: { channel: { members: ['ada'] } },
      });
      const notices = core.channels
        .readMessages(group.id)
        .filter((item) => item.memberDeparture !== undefined);
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        author: { kind: 'system' },
        body: 'Bea was removed from the Channel.',
        memberDeparture: {
          memberKind: 'bot',
          memberId: 'bea',
          displayName: 'Bea',
          departureType: 'removed',
        },
        channelRevision: 1,
      });
      const facts = attachOperationalModule(
        core.operationalDatabase,
        'member-departure-facts',
      ).read((db) => ({
        source: db
          .prepare(
            'SELECT source_kind, bot_slug, attempt_state FROM source_events WHERE channel_id = ? AND message_id = ?',
          )
          .get(group.id, notices[0]!.id),
        admissions: db
          .prepare(
            'SELECT COUNT(*) AS count FROM inbox_admissions WHERE source_event_id = (SELECT source_event_id FROM source_events WHERE channel_id = ? AND message_id = ?)',
          )
          .get(group.id, notices[0]!.id),
      }));
      expect(facts).toEqual({
        source: { source_kind: 'system-message', bot_slug: null, attempt_state: 'pending' },
        admissions: { count: 1 },
      });
      expect(methods.channelGroupMemberRemove({ channelId: group.id, botSlug: 'bea' }).ok).toBe(
        false,
      );
      expect(core.channels.readMessages(group.id)).toHaveLength(1);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('uses each remaining Bot attention preset for the same departure message', async () => {
    const turns: Array<{ botSlug: string; message: string }> = [];
    const core = createCore({
      dshHome: createTempRoot('botharness-group-departure-policy-'),
      agents: adapter(async (run) => {
        turns.push({ botSlug: run.bot.slug, message: run.message });
      }),
    });
    try {
      for (const slug of ['lee', 'eve', 'dia', 'men', 'sil'])
        core.registry.create({ slug, displayName: slug.toUpperCase() });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Policy Team',
        members: ['lee', 'eve', 'dia', 'men', 'sil'],
      });
      core.channels.setGroupWakePolicy(group.id, 'eve', {
        mode: 'all',
        count: 1,
        intervalSeconds: 1,
      });
      core.channels.setGroupWakePolicy(group.id, 'dia', {
        mode: 'digest',
        count: 2,
        intervalSeconds: 3600,
      });
      core.channels.setGroupWakePolicy(group.id, 'men', {
        mode: 'mentions',
        count: 2,
        intervalSeconds: 3600,
      });
      core.channels.setGroupWakePolicy(group.id, 'sil', {
        mode: 'silent',
        count: 2,
        intervalSeconds: 3600,
      });
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
      expect(methods.channelGroupMemberRemove({ channelId: group.id, botSlug: 'lee' }).ok).toBe(
        true,
      );
      const notice = core.channels.readMessages(group.id)[0]!;
      expect(notice.memberDeparture).toMatchObject({ memberId: 'lee', departureType: 'removed' });
      const rows = attachOperationalModule(core.operationalDatabase, 'departure-policy-facts').read(
        (db) =>
          db
            .prepare(
              `SELECT a.bot_slug, a.reason, a.wake_mode, a.wake_count
                 FROM inbox_admissions a
                 JOIN source_events e ON e.source_event_id = a.source_event_id
                WHERE e.channel_id = ? AND e.message_id = ?
                ORDER BY a.bot_slug`,
            )
            .all(group.id, notice.id),
      );
      expect(rows).toEqual([
        { bot_slug: 'dia', reason: 'group-ordinary', wake_mode: 'digest', wake_count: 2 },
        { bot_slug: 'eve', reason: 'group-ordinary', wake_mode: 'all', wake_count: 1 },
        { bot_slug: 'men', reason: 'group-ordinary', wake_mode: 'mentions', wake_count: null },
        { bot_slug: 'sil', reason: 'group-ordinary', wake_mode: 'silent', wake_count: null },
      ]);
      await core.runtime.whenIdle();
      expect(turns.map((turn) => turn.botSlug)).toEqual(['eve']);
      expect(turns[0]?.message).toContain('Channel system');
      expect(turns[0]?.message).toContain('LEE was removed from the Channel.');
      await core.channels.appendMessageOnce(OWNER_HUMAN_CONTEXT, group.id, {
        id: 'ordinary-after-leave',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Next topic',
      });
      core.runtime.admitGroupMessage(group.id, 'ordinary-after-leave');
      await core.runtime.whenIdle();
      expect(turns.filter((turn) => turn.botSlug === 'dia')).toHaveLength(1);
      expect(turns.find((turn) => turn.botSlug === 'dia')?.message).toContain(
        'LEE was removed from the Channel.',
      );
      expect(turns.filter((turn) => turn.botSlug === 'men' || turn.botSlug === 'sil')).toEqual([]);

      expect(core.channels.message(group.id, notice.id)?.deliveries).toEqual([
        { botSlug: 'dia', state: 'handled' },
        { botSlug: 'eve', state: 'handled' },
        { botSlug: 'men', state: 'pending' },
        { botSlug: 'sil', state: 'pending' },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('keeps a concurrent Group setting change when member removal begins', async () => {
    const home = createTempRoot('botharness-group-leave-current-record-');
    const core = createCore({ dshHome: home });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Colleagues',
        members: ['ada', 'bea'],
        ownerBotSlug: 'ada',
      });
      const port = attachOperationalModule(core.operationalDatabase, 'group-leave-current-record');
      let updateBeforeTransaction = false;
      const database: OperationalDatabaseModulePort = {
        module: port.module,
        read: (query) => port.read(query),
        transaction: (command, topics) => {
          if (updateBeforeTransaction) {
            updateBeforeTransaction = false;
            core.channels.setGroupWakePolicy(group.id, 'ada', {
              mode: 'silent',
              count: 2,
              intervalSeconds: 3600,
            });
          }
          return port.transaction(command, topics);
        },
      };
      const channels = createSqliteChannelStore({
        database,
        rootDir: join(home, 'channels'),
        databaseOwnerReady: true,
      });
      updateBeforeTransaction = true;

      channels.removeGroupMember(group.id, 'bea');

      expect(core.channels.get(group.id)).toMatchObject({
        members: ['ada'],
        wakePolicies: {
          ada: { mode: 'silent', count: 2, intervalSeconds: 3600, revision: 1 },
        },
      });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it('stops a pending direct Group mention when membership ends', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-group-leave-pending-') });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Pending',
        members: ['ada', 'bea'],
        ownerBotSlug: 'ada',
      });
      await core.channels.appendMessageOnce(OWNER_HUMAN_CONTEXT, group.id, {
        id: 'pending-mention',
        at: '2026-09-27T00:00:00.000Z',
        author: { kind: 'human' },
        body: '@Bea check this',
        mentions: [{ botSlug: 'bea', label: 'Bea', start: 0, end: 4 }],
      });
      const admissionState = (): { attempt_state: string; last_error: string | null } | undefined =>
        attachOperationalModule(core.operationalDatabase, 'group-leave-test').read((db) => {
          const row = db
            .prepare(
              "SELECT attempt_state, last_error FROM inbox_admissions WHERE bot_slug = 'bea' AND reason = 'group-mention'",
            )
            .get() as { attempt_state: string; last_error: string | null } | undefined;
          return row;
        });
      expect(admissionState()?.attempt_state).toBe('pending');
      core.channels.removeGroupMember(group.id, 'bea');
      expect(admissionState()).toEqual({
        attempt_state: 'handled',
        last_error: 'Group membership revoked',
      });
      expect(
        core.humanAttention
          .list(OWNER_HUMAN_CONTEXT, { category: 'action' })
          .items.filter((item) => item.kind === 'bot-message-needs-repair'),
      ).toEqual([]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('settles a former creator notice while keeping its join request available to Human', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-group-owner-leave-request-') });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const bea = core.registry.create({ slug: 'bea', displayName: 'Bea' });
      if (!bea.ok) throw new Error('Bot fixture failed');
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Joinable',
        members: ['ada'],
        ownerBotSlug: 'ada',
      });
      const ownerDm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      const requesterDm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'bea', 'Bea')!;
      const request = core.channels.requestGroupJoin({
        channelId: group.id,
        requesterBotSlug: 'bea',
        requesterBotCreatedAt: bea.record.createdAt,
        ownerDmChannelId: ownerDm.id,
      });
      const noticeState = (): string | undefined =>
        attachOperationalModule(core.operationalDatabase, 'group-leave-owner-notice').read((db) => {
          const row = db
            .prepare('SELECT attempt_state FROM inbox_admissions WHERE reason = ? AND bot_slug = ?')
            .get('group-join-request', 'ada') as { attempt_state: string } | undefined;
          return row?.attempt_state;
        });
      expect(noticeState()).toBe('pending');
      core.channels.removeGroupMember(group.id, 'ada');
      expect(noticeState()).toBe('handled');
      expect(core.channels.get(group.id)?.joinRequests?.[0]?.status).toBe('pending');
      expect(
        core.channels.decideGroupJoin({
          channelId: group.id,
          requestId: request.id,
          accept: true,
          decidedBy: 'human',
          requesterBotCreatedAt: bea.record.createdAt,
          requesterDmChannelId: requesterDm.id,
        }).channel.members,
      ).toEqual(['bea']);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('reports a failing Group turn to Human DM after the Bot leaves', async () => {
    let groupId = '';
    const core = createCore({
      dshHome: createTempRoot('botharness-group-leave-failure-'),
      agents: adapter(async (run) => {
        expect(run.channels.leaveGroup({ channelId: groupId }).left).toBe(true);
        throw new Error('deliberate Group turn failure');
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Failure route',
        members: ['ada'],
        ownerBotSlug: 'ada',
      });
      groupId = group.id;
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      await core.channels.appendMessageOnce(OWNER_HUMAN_CONTEXT, group.id, {
        id: 'human-1aabb095-e87a-4d52-a923-6a55e882ac40',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Ada please check',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      core.runtime.admitGroupMessage(group.id, 'human-1aabb095-e87a-4d52-a923-6a55e882ac40');
      await core.runtime.whenIdle();
      expect(core.channels.get(group.id)?.members).toEqual([]);
      const report = core.channels
        .readMessages(dm.id)
        .find((message) => message.sessionFailure !== undefined);
      expect(report?.sessionFailure?.detail).toBe('deliberate Group turn failure');
      expect(
        core.channels
          .readMessages(group.id)
          .some((message) => message.sessionFailure !== undefined),
      ).toBe(false);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it('retries a committed departure wake after a transient notification failure while Host stays live', async () => {
    const turns: string[] = [];
    const core = createCore({
      dshHome: createTempRoot('botharness-group-leave-wake-retry-'),
      agents: adapter(async (run) => {
        turns.push(run.bot.slug);
      }),
    });
    try {
      for (const slug of ['lee', 'eve'])
        core.registry.create({ slug, displayName: slug.toUpperCase() });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Wake retry',
        members: ['lee', 'eve'],
      });
      core.channels.setGroupWakePolicy(group.id, 'eve', {
        mode: 'all',
        count: 1,
        intervalSeconds: 1,
      });
      const admit = core.runtime.admitGroupMessage.bind(core.runtime);
      let attempts = 0;
      const spy = vi
        .spyOn(core.runtime, 'admitGroupMessage')
        .mockImplementation((channelId, messageId) => {
          attempts++;
          if (attempts <= 2) throw new Error('transient notification failure');
          admit(channelId, messageId);
        });

      core.channels.removeGroupMember(group.id, 'lee');
      const departure = core.channels
        .readMessages(group.id)
        .find((message) => message.memberDeparture !== undefined);
      expect(departure).toBeDefined();
      expect(core.channels.message(group.id, departure!.id)?.deliveries).toEqual([
        { botSlug: 'eve', state: 'pending' },
      ]);
      await vi.waitFor(() => expect(turns).toEqual(['eve']), { timeout: 2000 });
      await core.runtime.whenIdle();
      expect(spy).toHaveBeenCalledTimes(3);
      expect(core.channels.message(group.id, departure!.id)?.deliveries).toEqual([
        { botSlug: 'eve', state: 'handled' },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('wakes remaining Bot when live Channel publication fails after commit', async () => {
    const turns: string[] = [];
    const core = createCore({
      dshHome: createTempRoot('botharness-group-leave-live-failure-'),
      agents: adapter(async (run) => {
        turns.push(run.bot.slug);
      }),
    });
    try {
      for (const slug of ['lee', 'eve'])
        core.registry.create({ slug, displayName: slug.toUpperCase() });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Live failure',
        members: ['lee', 'eve'],
      });
      core.channels.setGroupWakePolicy(group.id, 'eve', {
        mode: 'all',
        count: 1,
        intervalSeconds: 1,
      });
      vi.spyOn(core.live, 'publishCommitted').mockImplementationOnce(() => {
        throw new Error('transient stream failure');
      });

      core.channels.removeGroupMember(group.id, 'lee');
      await core.runtime.whenIdle();

      expect(turns).toEqual(['eve']);
      const departure = core.channels
        .readMessages(group.id)
        .find((message) => message.memberDeparture !== undefined);
      expect(departure).toBeDefined();
      expect(core.channels.message(group.id, departure!.id)?.deliveries).toEqual([
        { botSlug: 'eve', state: 'handled' },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
