import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function adapter(run: (input: OrchestratorAgentRun) => Promise<void>): BotAgentAdapter {
  return {
    runOrchestrator: run,
    async runAssignment() {},
    requestAssignment() {
      throw new Error('Unexpected Assignment');
    },
    async close() {},
  };
}

function bridge(core: ReturnType<typeof createCore>) {
  return createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    registry: core.registry,
    states: core.states,
    channels: core.channels,
    ownership: core.ownership,
    roster: core.roster,
    runtime: core.runtime,
  });
}

async function close(core: ReturnType<typeof createCore>) {
  await core.runtime.close();
  core.operationalDatabase.close();
}

function admission(core: ReturnType<typeof createCore>, invitationId: string) {
  return attachOperationalModule(core.operationalDatabase, 'group-auto-accept-test').read((db) =>
    db
      .prepare(`SELECT a.attempt_state, a.handled_at, a.observed_at, a.wake_count
      FROM inbox_admissions a JOIN source_events e USING(source_event_id)
      WHERE a.reason = 'group-invite' AND e.message_id = ?`)
      .get(invitationId),
  );
}

describe('Group invitation auto-accept', () => {
  it('joins on Human invite, retains a resolved unobserved decision and never wakes, including restart', async () => {
    const home = createTempRoot('botharness-auto-accept-');
    const runs: string[] = [];
    let core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.bot.slug);
      }),
    });
    try {
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Auto team',
        members: [],
      });
      const methods = bridge(core);
      const invite = () => methods.channelGroupInvite({ channelId: group.id, botSlug: 'bea' });
      expect(invite()).toMatchObject({ ok: true, value: { channel: { members: ['bea'] } } });
      expect(invite()).toMatchObject({ ok: true });
      const invitation = core.channels.get(group.id)!.invitations![0]!;
      expect(core.channels.get(group.id)!.invitations).toHaveLength(1);
      expect(invitation).toMatchObject({ status: 'accepted', respondedBy: 'profile-policy' });
      expect(admission(core, invitation.id)).toMatchObject({
        attempt_state: 'handled',
        observed_at: null,
        wake_count: null,
      });
      expect(admission(core, invitation.id)).toHaveProperty('handled_at', invitation.respondedAt);
      await core.runtime.whenIdle();
      expect(runs).toEqual([]);
      await close(core);
      core = createCore({
        dshHome: home,
        agents: adapter(async (run) => {
          runs.push(run.bot.slug);
        }),
      });
      await core.runtime.whenIdle();
      expect(core.channels.get(group.id)?.members).toEqual(['bea']);
      expect(core.channels.get(group.id)?.invitations?.[0]).toEqual(invitation);
      expect(runs).toEqual([]);
    } finally {
      await close(core);
    }
  });

  it('accepts a Bot creator invitation without running the invited Bot', async () => {
    const home = createTempRoot('botharness-auto-bot-invite-');
    const runs: string[] = [];
    let groupId = '';
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.bot.slug);
        expect(run.bot.slug).toBe('ada');
        const group = run.channels.createGroup('Bot team');
        groupId = group.id;
        const invited = run.channels.inviteGroup({ channelId: group.id, targetBotSlug: 'bea' });
        expect(invited.status).toBe('accepted');
        expect(run.channels.inviteGroup({ channelId: group.id, targetBotSlug: 'bea' }).id).toBe(
          invited.id,
        );
      }),
    });
    try {
      for (const slug of ['ada', 'bea']) core.registry.create({ slug, displayName: slug });
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        id: 'invite-peer',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Invite Bea',
      });
      core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dm.id,
        messageId: 'invite-peer',
        body: 'Invite Bea',
      });
      await core.runtime.whenIdle();
      expect(runs).toEqual(['ada']);
      expect(core.channels.get(groupId)?.members).toEqual(['ada', 'bea']);
    } finally {
      await close(core);
    }
  });

  it('reads live policy for new invitations and preserves explicit opt-out', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-live-invite-policy-') });
    let enabled = false;
    const release = core.configureGroupInvitations(() => enabled);
    try {
      for (const slug of ['bea', 'cee']) core.registry.create({ slug, displayName: slug });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Live policy',
        members: [],
      });
      expect(
        bridge(core).channelGroupInvite({ channelId: group.id, botSlug: 'bea' }),
      ).toMatchObject({
        ok: true,
        value: { channel: { members: [], invitations: [{ status: 'pending' }] } },
      });
      enabled = true;
      expect(
        bridge(core).channelGroupInvite({ channelId: group.id, botSlug: 'cee' }),
      ).toMatchObject({ ok: true, value: { channel: { members: ['cee'] } } });
      expect(core.channels.get(group.id)?.invitations?.map((item) => item.status)).toEqual([
        'pending',
        'accepted',
      ]);
      expect(
        bridge(core).channelGroupInvite({ channelId: group.id, botSlug: 'missing' }),
      ).toMatchObject({ ok: false });
    } finally {
      release();
      await close(core);
    }
  });

  it('reuses the latest accepted invitation after leaving and rejoining', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-rejoin-invite-') });
    try {
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const bot = core.registry.get('bea')!;
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'bea', 'Bea')!;
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Rejoin', members: [] });
      const invite = () =>
        core.channels.inviteGroupBot({
          channelId: group.id,
          inviterHuman: true,
          targetBotSlug: 'bea',
          targetBotCreatedAt: bot.createdAt,
          targetDmChannelId: dm.id,
        });
      const first = invite();
      core.channels.removeGroupMember(group.id, 'bea', 'left');
      const second = invite();
      expect(second.id).not.toBe(first.id);
      expect(invite().id).toBe(second.id);
      expect(core.channels.get(group.id)?.invitations).toHaveLength(2);
    } finally {
      await close(core);
    }
  });

  it.each([false, true])(
    'disposes registrations independently with identical callback = %s',
    async (sameCallback) => {
      const core = createCore({
        dshHome: createTempRoot('botharness-policy-disposal-'),
        autoAcceptGroupInvitations: () => true,
      });
      const firstPolicy = () => false;
      const first = core.configureGroupInvitations(firstPolicy);
      const second = core.configureGroupInvitations(sameCallback ? firstPolicy : () => false);
      try {
        for (const slug of ['bea', 'cee']) core.registry.create({ slug, displayName: slug });
        const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
          name: 'Disposal',
          members: [],
        });
        first();
        expect(
          bridge(core).channelGroupInvite({ channelId: group.id, botSlug: 'bea' }),
        ).toMatchObject({
          ok: true,
          value: { channel: { members: [], invitations: [{ status: 'pending' }] } },
        });
        second();
        expect(
          bridge(core).channelGroupInvite({ channelId: group.id, botSlug: 'cee' }),
        ).toMatchObject({
          ok: true,
          value: { channel: { members: ['cee'] } },
        });
      } finally {
        first();
        second();
        await close(core);
      }
    },
  );

  it('settles a decline before any turn, so redelivery and restart cannot wake it', async () => {
    const home = createTempRoot('botharness-declined-invite-');
    const runs: string[] = [];
    let core = createCore({
      dshHome: home,
      autoAcceptGroupInvitations: () => false,
      agents: adapter(async (run) => {
        runs.push(run.bot.slug);
      }),
    });
    try {
      const bot = core.registry.create({ slug: 'bea', displayName: 'Bea' });
      expect(bot.ok).toBe(true);
      const record = core.registry.get('bea')!;
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'bea', 'Bea')!;
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Decline',
        members: [],
      });
      const invite = core.channels.inviteGroupBot({
        channelId: group.id,
        inviterHuman: true,
        targetBotSlug: 'bea',
        targetBotCreatedAt: record.createdAt,
        targetDmChannelId: dm.id,
      });
      core.channels.respondToGroupInvite({
        invitationId: invite.id,
        targetBotSlug: 'bea',
        targetBotCreatedAt: record.createdAt,
        accept: false,
      });
      core.runtime.admitGroupInvitation(dm.id, invite.id);
      await core.runtime.whenIdle();
      expect(runs).toEqual([]);
      expect(admission(core, invite.id)).toMatchObject({
        attempt_state: 'handled',
        observed_at: null,
      });
      attachOperationalModule(core.operationalDatabase, 'legacy-invite-fixture').transaction((db) =>
        db
          .prepare(
            "UPDATE inbox_admissions SET attempt_state = 'pending', handled_at = NULL WHERE reason = 'group-invite'",
          )
          .run(),
      );
      await close(core);
      core = createCore({
        dshHome: home,
        autoAcceptGroupInvitations: () => false,
        agents: adapter(async (run) => {
          runs.push(run.bot.slug);
        }),
      });
      await core.runtime.whenIdle();
      expect(core.channels.get(group.id)?.invitations?.[0]?.status).toBe('declined');
      expect(admission(core, invite.id)).toMatchObject({
        attempt_state: 'handled',
        observed_at: null,
      });
      expect(runs).toEqual([]);
    } finally {
      await close(core);
    }
  });

  it('rolls membership and decision back when admission persistence fails', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-invite-atomic-') });
    try {
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Atomic', members: [] });
      const db = attachOperationalModule(core.operationalDatabase, 'invite-fault');
      db.transaction((raw) =>
        raw.exec(`CREATE TRIGGER reject_invite BEFORE INSERT ON inbox_admissions
        WHEN NEW.reason = 'group-invite' BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;`),
      );
      expect(
        bridge(core).channelGroupInvite({ channelId: group.id, botSlug: 'bea' }),
      ).toMatchObject({ ok: false });
      expect(core.channels.get(group.id)?.members).toEqual([]);
      expect(core.channels.get(group.id)?.invitations ?? []).toEqual([]);
      expect(
        db.read((raw) =>
          raw
            .prepare(
              "SELECT COUNT(*) AS n FROM source_events WHERE message_id LIKE 'group-invite-%'",
            )
            .get(),
        ),
      ).toEqual({ n: 0 });
    } finally {
      await close(core);
    }
  });
});
