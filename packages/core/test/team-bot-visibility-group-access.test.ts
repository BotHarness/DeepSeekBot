import {
  alice,
  bob,
  closes,
  everyone,
  fixture,
  post,
  proactiveFixture,
  publicBot,
} from './team-bot-visibility-fixtures.js';
import { describe, expect, it } from 'vitest';
import { createTempRoot } from './helpers.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';

describe('M7 Bot principal and participant authority', () => {
  it('rechecks pending Group join eligibility before accepting without writing a decision', () => {
    const f = fixture();
    const group = f.channels.createGroup(alice, { name: 'Join', members: [] });
    const bot = f.registry.get('alice-bot')!;
    const dm = f.channels.getOrCreateDm(alice, bot.slug)!;
    const request = f.channels.requestGroupJoin({
      channelId: group.id,
      requesterBotSlug: bot.slug,
      requesterBotCreatedAt: bot.createdAt,
    });
    f.team.bots.switches(alice, bot.slug, { joinPrincipalChannels: false });
    const decide = (accept: boolean) =>
      f.channels.decideGroupJoin({
        channelId: group.id,
        requestId: request.id,
        accept,
        decidedBy: 'human',
        requesterBotCreatedAt: bot.createdAt,
        requesterDmChannelId: dm.id,
      });
    expect(() => decide(true)).toThrow('bot-principal-channel-denied');
    expect(f.channels.get(group.id)?.joinRequests?.[0]?.status).toBe('pending');
    expect(f.channels.get(group.id)?.members).toEqual([]);
    expect(decide(false).request.status).toBe('declined');
  });
  it('leaves adder provenance unchanged on a stale Channel invitation', () => {
    const { core, db } = proactiveFixture(true);
    const group = core.channels.createGroup(owner, { name: 'Stale invite', members: [] });
    const methods = createBridgeMethodsForHumans(core)(owner);
    const result = methods.channelGroupInvite({
      channelId: group.id,
      botSlug: 'helper',
      expectedChannel: '0'.repeat(64),
      operationKey: 'm7-stale-invite',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'stale-channel' } });
    expect(
      db.read((db) =>
        db.prepare('SELECT * FROM bot_channel_adders WHERE channel_id=?').all(group.id),
      ),
    ).toEqual([]);
    expect(methods.channelGroupInvite({ channelId: group.id, botSlug: 'helper' }).ok).toBe(true);
    expect(
      db.read((db) =>
        db.prepare('SELECT human_id FROM bot_channel_adders WHERE channel_id=?').all(group.id),
      ),
    ).toEqual([{ human_id: owner.humanId }]);
  });
  it.each(['role', 'deactivate', 'remove'] as const)(
    'rechecks group read/write immediately after principal %s',
    async (kind) => {
      const f = fixture();
      const channel = f.channels.createGroup(bob, { name: 'Group', members: ['alice-bot'] });
      if (kind === 'role') {
        const role = f.team.roles.create(owner, 'Finance', []).role;
        f.team.roles.set(owner, 'alice', [role.roleId]);
        f.team.channelAccess.visibilitySet(bob, channel.id, {
          kind: 'roles',
          roleIds: [role.roleId],
        });
      } else f.team.channelAccess.addMember(bob, channel.id, 'alice');
      expect(f.team.bots.canRead('alice-bot', channel)).toBe(true);
      await f.channels.appendMessage(alice, channel.id, post('before', 'bot'));
      if (kind === 'role') f.team.roles.set(owner, 'alice', []);
      if (kind === 'deactivate')
        f.db.transaction((db) =>
          db.prepare("UPDATE humans SET status='deactivated' WHERE human_id='alice'").run(),
        );
      if (kind === 'remove')
        f.db.transaction((db) =>
          db
            .prepare(
              "UPDATE channel_human_members SET left_at='now' WHERE channel_id=? AND human_id='alice'",
            )
            .run(channel.id),
        );
      expect(f.team.bots.canRead('alice-bot', channel)).toBe(false);
      await expect(
        f.channels.appendMessage(alice, channel.id, post('after', 'bot')),
      ).rejects.toMatchObject({ code: 'bot-channel-access-denied' });
    },
  );
  it('keeps reads but loses writes when the principal loses permission to post', async () => {
    const f = fixture();
    const manager = f.team.roles.create(owner, 'Channel manager', ['channels.manageAll']).role;
    f.team.roles.set(owner, alice.humanId, ['member', manager.roleId]);
    const group = f.channels.createGroup(owner, { name: 'Announcements', members: ['alice-bot'] });
    f.team.channelAccess.addMember(owner, group.id, alice.humanId);
    f.team.channelAccess.policySet(owner, group.id, {
      ...f.team.channelAccess.view(owner, group.id).policy,
      post: 'admins',
    });
    await f.channels.appendMessage(alice, group.id, post('authorized', 'bot'));
    f.team.roles.set(owner, alice.humanId, ['member']);
    expect(f.team.bots.canRead('alice-bot', group)).toBe(true);
    await expect(
      f.channels.appendMessage(alice, group.id, post('post-revoked', 'bot')),
    ).rejects.toMatchObject({ code: 'bot-channel-access-denied' });
  });
  it('reads principal groups without Bot membership, but cannot write there; switch disables reads and joins', async () => {
    const f = fixture(),
      channel = f.channels.createGroup(alice, { name: 'Read only', members: [] });
    expect(f.team.bots.canRead('alice-bot', channel)).toBe(true);
    expect(() => f.team.bots.requireChannel('alice-bot', channel, true)).toThrow(
      'bot-channel-access-denied',
    );
    f.team.bots.switches(alice, 'alice-bot', { joinPrincipalChannels: false });
    expect(f.team.bots.canRead('alice-bot', channel)).toBe(false);
    expect(() => f.team.bots.requireAdd(alice, 'alice-bot', channel.id)).toThrow(
      'bot-channel-join-disabled',
    );
    expect(() => f.team.bots.switches(owner, 'alice-bot', { speakerContext: false })).toThrow(
      'bot-principal-required',
    );
  });
  it('checks addBots, principal membership, audience, switch and shrink departure', () => {
    const f = fixture();
    publicBot(f);
    const channel = f.channels.createGroup(bob, { name: 'Shared', members: ['alice-bot'] });
    expect(() => f.team.bots.recordAdder(bob, 'alice-bot', channel.id)).toThrow(
      'bot-principal-channel-denied',
    );
    f.team.channelAccess.addMember(bob, channel.id, 'alice');
    f.team.bots.recordAdder(bob, 'alice-bot', channel.id);
    const preview = f.team.bots.setVisibility(alice, 'alice-bot', { kind: 'private' });
    expect(preview.preview.channelsLeaving).toEqual([{ channelId: channel.id }]);
    expect(f.channels.get(channel.id)!.members).toContain('alice-bot');
    f.team.bots.setVisibility(alice, 'alice-bot', { kind: 'private' }, true);
    expect(f.channels.get(channel.id)!.members).not.toContain('alice-bot');
  });
  it('accepts a selected #Group from a participant DM for a join request', async () => {
    const outcomes: string[] = [];
    const ownerRuns: string[] = [];
    let groupId = '';
    const core = createCore({
      dshHome: createTempRoot('m7-participant-group-join-'),
      agents: {
        async runOrchestrator(run) {
          if (run.bot.slug !== 'public-helper') {
            ownerRuns.push(run.message);
            return;
          }
          try {
            outcomes.push(run.channels.requestGroupJoin!({ channelId: groupId }).id);
          } catch (error) {
            outcomes.push(String(error));
          }
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('unexpected');
        },
        async close() {},
      },
    });
    closes.push(async () => {
      await core.runtime.close();
      core.operationalDatabase.close();
    });
    const db = attachOperationalModule(core.operationalDatabase, 'team');
    db.transaction((db) => {
      db.prepare('UPDATE team_settings SET enabled=1').run();
      for (const id of ['alice', 'bob']) {
        db.prepare("INSERT INTO humans VALUES (?,?,'active','now')").run(id, id);
        db.prepare("INSERT INTO human_roles VALUES (?,'member')").run(id);
      }
    });
    core.team.spaces.ensureAccount('alice');
    expect(
      core.registry.create({ slug: 'public-helper', displayName: 'Helper', ownerHumanId: 'alice' })
        .ok,
    ).toBe(true);
    core.channels.getOrCreateDm(alice, 'public-helper');
    core.team.bots.setVisibility(owner, 'public-helper', everyone);
    expect(core.registry.create({ slug: 'owl', displayName: 'Owl' }).ok).toBe(true);
    const group = core.channels.createGroup(owner, {
      name: 'Team',
      members: ['owl'],
      ownerBotSlug: 'owl',
    });
    groupId = group.id;
    core.team.setPublic(owner, group.id, true);
    const dm = core.team.bots.dm(bob, 'public-helper')!;
    const body = 'Please join #Team';
    await core.channels.appendMessage(bob, dm.id, {
      ...post('participant-group-ref'),
      body,
      channelRefs: [{ channelId: group.id, label: 'Team', start: 12, end: body.length }],
    });
    const admission = core.runtime.admitDmMessage(bob, {
      channelId: dm.id,
      messageId: 'participant-group-ref',
      body,
    });
    expect(admission.admitted).toBe(true);
    if (admission.admitted) await admission.settled;
    await core.runtime.whenIdle();
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatch(/^group-join-/u);
    expect(ownerRuns.filter((message) => message.includes('Group join request'))).toEqual([]);
    expect(core.channels.get(group.id)?.joinRequests).toContainEqual(
      expect.objectContaining({ id: outcomes[0], requesterBotSlug: 'public-helper' }),
    );
  });
});
