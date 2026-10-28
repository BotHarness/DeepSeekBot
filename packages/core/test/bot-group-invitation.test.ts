import { describe, expect, it } from 'vitest';

import { attachOperationalModule } from '../src/database/owner.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
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

describe('Bot Group invitation tracer', () => {
  it('lets Human set a bounded avatar and invite a Bot without granting early Group access', async () => {
    const home = createTempRoot('botharness-group-human-invite-');
    const core = createCore({ autoAcceptGroupInvitations: () => false, dshHome: home });
    try {
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      core.registry.create({ slug: 'cee', displayName: 'Cee' });
      const group = core.channels.createGroup({ name: 'Human team', members: [] });
      const methods = createBridgeMethods({
        registry: core.registry,
        states: core.states,
        channels: core.channels,
        ownership: core.ownership,
        roster: core.roster,
      });
      const avatar =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=';
      expect(methods.channelGroupAvatarSet({ channelId: group.id, avatar })).toMatchObject({
        ok: true,
        value: { channel: { avatar } },
      });
      expect(
        methods.channelGroupAvatarSet({
          channelId: group.id,
          avatar: 'data:image/svg+xml;base64,AAAA',
        }),
      ).toMatchObject({ ok: false });
      expect(methods.channelGroupInvite({ channelId: group.id, botSlug: 'bea' })).toMatchObject({
        ok: true,
        value: { channel: { invitations: [{ inviterHuman: true, status: 'pending' }] } },
      });
      expect(methods.channelGroupInvite({ channelId: group.id, botSlug: 'bea' })).toMatchObject({
        ok: true,
      });
      expect(core.channels.get(group.id)?.invitations).toHaveLength(1);
      expect(core.channels.get(group.id)?.members).toEqual([]);
      const invitation = core.channels.get(group.id)!.invitations![0]!;
      const admission = attachOperationalModule(
        core.operationalDatabase,
        'human-group-invite-test',
      ).read((db) =>
        db
          .prepare(
            "SELECT reason, attempt_state, source_policy_revision, source_policy_wake_mode FROM inbox_admissions WHERE reason = 'group-invite'",
          )
          .get(),
      );
      expect(admission).toEqual({
        reason: 'group-invite',
        attempt_state: 'pending',
        source_policy_revision: 1,
        source_policy_wake_mode: 'immediate',
      });
      expect(methods.channelGroupInvite({ channelId: group.id, botSlug: 'missing' })).toMatchObject(
        { ok: false },
      );
      expect(
        core.channels.respondToGroupInvite({
          invitationId: invitation.id,
          targetBotSlug: 'bea',
          targetBotCreatedAt: core.registry.get('bea')!.createdAt,
          accept: true,
        }).channel.members,
      ).toEqual(['bea']);
      expect(methods.channelGroupAvatarSet({ channelId: group.id, avatar: null })).toMatchObject({
        ok: true,
        value: { channel: { id: group.id } },
      });
      expect(core.channels.get(group.id)?.avatar).toBeUndefined();
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('creates a Group, admits each invitation through Inbox, accepts or declines, then exchanges in the Group', async () => {
    const home = createTempRoot('botharness-group-invite-');
    const runs: string[] = [];
    let groupId = '';
    let inviteBea = '';
    let inviteCee = '';
    let core: ReturnType<typeof createCore>;
    core = createCore({
      autoAcceptGroupInvitations: () => false,
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.bot.slug);
        if (run.bot.slug === 'ada') {
          const group = run.channels.createGroup('Joint work');
          groupId = group.id;
          expect(group.ownerBotSlug).toBe('ada');
          expect(group.members).toEqual(['ada']);
          await run.channels.send({ channelId: group.id, body: '准备讨论' });
          const bea = run.channels.inviteGroup({ channelId: group.id, targetBotSlug: 'bea' });
          const retry = run.channels.inviteGroup({ channelId: group.id, targetBotSlug: 'bea' });
          expect(retry.id).toBe(bea.id);
          inviteBea = bea.id;
          inviteCee = run.channels.inviteGroup({
            channelId: group.id,
            targetBotSlug: 'cee',
          }).id;
          return;
        }
        expect(run.message).toContain('Group invitation');
        expect(run.inboundChannelId).toBe('dm-' + run.bot.slug);
        expect(core.channels.get(groupId)?.members).not.toContain(run.bot.slug);
        expect(() => run.channels.read({ channelId: groupId })).toThrow('not a member');
        await expect(
          run.channels.send({ channelId: groupId, body: 'too early' }),
        ).rejects.toThrow();
        if (run.bot.slug === 'cee') {
          const result = run.channels.respondToGroupInvite({
            invitationId: inviteCee,
            accept: false,
          });
          expect(result.invitation.status).toBe('declined');
          return;
        }
        const accepted = run.channels.respondToGroupInvite({
          invitationId: inviteBea,
          accept: true,
        });
        expect(accepted.invitation.status).toBe('accepted');
        expect(
          run.channels.respondToGroupInvite({ invitationId: inviteBea, accept: true }).invitation
            .id,
        ).toBe(inviteBea);
        expect(() =>
          run.channels.inviteGroup({ channelId: groupId, targetBotSlug: 'cee' }),
        ).toThrow('owner');
        expect(
          run.channels.read({ channelId: groupId }).map((item) => item.message.body),
        ).toContain('准备讨论');
        await run.channels.send({ channelId: groupId, body: 'Bea 已加入' });
      }),
    });
    try {
      for (const slug of ['ada', 'bea', 'cee'])
        core.registry.create({ slug, displayName: slug.toUpperCase() });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'human-create',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: '创建协作群并邀请 Bea 与 Cee',
      });
      core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'human-create',
        body: '创建协作群并邀请 Bea 与 Cee',
      });
      await core.runtime.whenIdle();
      expect(runs.sort()).toEqual(['ada', 'bea', 'cee']);
      const group = core.channels.get(groupId)!;
      expect(group.members).toEqual(['ada', 'bea']);
      expect(group.invitations?.map((item) => item.status)).toEqual(['accepted', 'declined']);
      const groupMessages = core.channels.readMessages(groupId);
      expect(groupMessages.map((item) => item.body)).toContain('Bea 已加入');
      expect(groupMessages.find((item) => item.body === 'Bea 已加入')?.botCausation?.hop).toBe(2);
      const facts = attachOperationalModule(core.operationalDatabase, 'group-invite-test').read(
        (db) =>
          db
            .prepare(
              "SELECT a.bot_slug, a.reason, a.attempt_state FROM inbox_admissions a WHERE a.reason = 'group-invite' ORDER BY a.bot_slug",
            )
            .all(),
      );
      expect(facts).toEqual([
        { bot_slug: 'bea', reason: 'group-invite', attempt_state: 'handled' },
        { bot_slug: 'cee', reason: 'group-invite', attempt_state: 'handled' },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('allows only the Bot Group owner to change settings and remove another member', async () => {
    const home = createTempRoot('botharness-group-owner-');
    let groupId = '';
    const core = createCore({
      autoAcceptGroupInvitations: () => false,
      dshHome: home,
      agents: adapter(async (run) => {
        expect(run.bot.slug).toBe('ada');
        expect(run.channels.renameGroup({ channelId: groupId, name: 'Owner renamed' }).name).toBe(
          'Owner renamed',
        );
        expect(() =>
          run.channels.removeGroupMember({ channelId: groupId, botSlug: 'ada' }),
        ).toThrow('owner');
        expect(
          run.channels.removeGroupMember({ channelId: groupId, botSlug: 'bea' }).members,
        ).toEqual(['ada']);
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      groupId = core.channels.createGroup({
        name: 'Owner settings',
        members: ['ada', 'bea'],
        ownerBotSlug: 'ada',
      }).id;
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'human-manage',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Manage Group settings and membership',
      });
      core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'human-manage',
        body: 'Manage Group settings and membership',
      });
      await core.runtime.whenIdle();
      expect(core.channels.get(groupId)).toMatchObject({
        name: 'Owner renamed',
        members: ['ada'],
      });
      expect(
        core.channels.readMessages(groupId).filter((message) => message.memberDeparture),
      ).toMatchObject([
        {
          body: 'Bea was removed from the Channel.',
          memberDeparture: { memberId: 'bea', departureType: 'removed' },
        },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('lets Human cancel invitations, remove joined Bots, rename, and delete the Group', async () => {
    const home = createTempRoot('botharness-group-human-');
    const core = createCore({ autoAcceptGroupInvitations: () => false, dshHome: home });
    try {
      for (const slug of ['ada', 'bea', 'cee'])
        core.registry.create({ slug, displayName: slug.toUpperCase() });
      const group = core.channels.createGroup({
        name: 'Human control',
        members: ['ada'],
        ownerBotSlug: 'ada',
      });
      const beaDm = core.channels.getOrCreateDm('bea', 'Bea')!;
      const ceeDm = core.channels.getOrCreateDm('cee', 'Cee')!;
      const bea = core.channels.inviteGroupBot({
        channelId: group.id,
        inviterBotSlug: 'ada',
        targetBotSlug: 'bea',
        targetBotCreatedAt: core.registry.get('bea')!.createdAt,
        targetDmChannelId: beaDm.id,
      });
      const cee = core.channels.inviteGroupBot({
        channelId: group.id,
        inviterBotSlug: 'ada',
        targetBotSlug: 'cee',
        targetBotCreatedAt: core.registry.get('cee')!.createdAt,
        targetDmChannelId: ceeDm.id,
      });
      core.channels.respondToGroupInvite({
        invitationId: bea.id,
        targetBotSlug: 'bea',
        targetBotCreatedAt: core.registry.get('bea')!.createdAt,
        accept: true,
      });
      const methods = createBridgeMethods({
        registry: core.registry,
        states: core.states,
        channels: core.channels,

        ownership: core.ownership,
        roster: core.roster,
        contentPurge: core.contentPurge,
      });
      expect(
        methods.channelGroupInviteCancel({
          channelId: group.id,
          invitationId: cee.id,
        }),
      ).toMatchObject({
        ok: true,
        value: { channel: { invitations: [{ status: 'accepted' }, { status: 'cancelled' }] } },
      });
      expect(
        methods.channelGroupMemberRemove({
          channelId: group.id,
          botSlug: 'bea',
        }),
      ).toMatchObject({ ok: true, value: { channel: { members: ['ada'] } } });
      expect(
        methods.channelRename({ channelId: group.id, name: 'Renamed by Human' }),
      ).toMatchObject({ ok: true, value: { channel: { name: 'Renamed by Human' } } });
      const disbanded = methods.channelGroupDelete({ channelId: group.id });
      expect(disbanded).toEqual({
        ok: true,
        value: { deleted: true, messages: expect.any(Number) },
      });
      expect(disbanded.ok && disbanded.value.messages).toBeGreaterThan(0);
      expect(core.contentPurge.history()).toEqual([]);
      expect(core.channels.get(group.id)).toBeUndefined();
      expect(methods.channelMessages({ channelId: group.id })).toMatchObject({ ok: false });
      expect(core.channels.list().some((channel) => channel.id === group.id)).toBe(false);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('closes pending invite admissions when Human removes their inviter', async () => {
    const core = createCore({
      autoAcceptGroupInvitations: () => false,
      dshHome: createTempRoot('botharness-group-remove-inviter-'),
    });
    try {
      for (const slug of ['ada', 'bea', 'cee'])
        core.registry.create({ slug, displayName: slug.toUpperCase() });
      const group = core.channels.createGroup({
        name: 'Team',
        members: ['ada', 'bea'],
        ownerBotSlug: 'bea',
      });
      const ceeDm = core.channels.getOrCreateDm('cee', 'Cee')!;
      const invitation = core.channels.inviteGroupBot({
        channelId: group.id,
        inviterBotSlug: 'bea',
        targetBotSlug: 'cee',
        targetBotCreatedAt: core.registry.get('cee')!.createdAt,
        targetDmChannelId: ceeDm.id,
      });
      expect(core.channels.removeGroupMember(group.id, 'bea').invitations).toMatchObject([
        { id: invitation.id, status: 'cancelled' },
      ]);
      expect(
        attachOperationalModule(core.operationalDatabase, 'removed-inviter-test').read((db) =>
          db
            .prepare(
              "SELECT attempt_state FROM inbox_admissions WHERE reason = 'group-invite' AND source_event_id = (SELECT source_event_id FROM source_events WHERE message_id = ?)",
            )
            .get(invitation.id),
        ),
      ).toEqual({ attempt_state: 'handled' });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('recovers a pending invitation after restart and rejects archived or cancelled targets', async () => {
    const home = createTempRoot('botharness-group-invite-restart-');
    const first = createCore({ autoAcceptGroupInvitations: () => false, dshHome: home });
    for (const slug of ['ada', 'bea', 'cee'])
      first.registry.create({ slug, displayName: slug.toUpperCase() });
    const group = first.channels.createGroup({
      name: 'Recovery',
      members: ['ada'],
      ownerBotSlug: 'ada',
    });
    const beaDm = first.channels.getOrCreateDm('bea', 'Bea')!;
    const ceeDm = first.channels.getOrCreateDm('cee', 'Cee')!;
    const bea = first.channels.inviteGroupBot({
      channelId: group.id,
      inviterBotSlug: 'ada',
      targetBotSlug: 'bea',
      targetBotCreatedAt: first.registry.get('bea')!.createdAt,
      targetDmChannelId: beaDm.id,
    });
    const cee = first.channels.inviteGroupBot({
      channelId: group.id,
      inviterBotSlug: 'ada',
      targetBotSlug: 'cee',
      targetBotCreatedAt: first.registry.get('cee')!.createdAt,
      targetDmChannelId: ceeDm.id,
    });
    expect(() =>
      first.channels.respondToGroupInvite({
        invitationId: bea.id,
        targetBotSlug: 'bea',
        targetBotCreatedAt: '2026-09-26T00:00:00.000Z',
        accept: true,
      }),
    ).toThrow('unavailable');
    expect(first.channels.get(group.id)?.members).toEqual(['ada']);
    first.channels.cancelGroupInvite(group.id, cee.id);
    first.registry.setPaused('bea', true);
    await first.runtime.close();
    first.operationalDatabase.close();
    const runs: string[] = [];
    const resumed = createCore({
      autoAcceptGroupInvitations: () => false,
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.bot.slug);
        expect(run.bot.slug).toBe('bea');
      }),
    });
    try {
      await resumed.runtime.whenIdle();
      expect(runs).toEqual([]);
      expect(resumed.channels.get(group.id)?.members).toEqual(['ada']);
      expect(resumed.channels.get(group.id)?.invitations?.map((item) => item.status)).toEqual([
        'cancelled',
        'cancelled',
      ]);
      expect(bea.id).toMatch(/^group-invite-/u);
      resumed.registry.setPaused('bea', false);
      expect(() =>
        resumed.channels.respondToGroupInvite({
          invitationId: bea.id,
          targetBotSlug: 'bea',
          targetBotCreatedAt: resumed.registry.get('bea')!.createdAt,
          accept: true,
        }),
      ).toThrow('no longer pending');
      expect(
        attachOperationalModule(resumed.operationalDatabase, 'group-invite-test').read((db) =>
          db.prepare("SELECT attempt_state FROM inbox_admissions WHERE bot_slug = 'cee'").get(),
        ),
      ).toEqual({ attempt_state: 'handled' });
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });
});
