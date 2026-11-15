import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { createTempRoot, createTestOwnership } from './helpers.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { TeamService } from '../src/team/service.js';
import { createTeamBridge } from '../src/team/bridge.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTestRosterStore } from './roster-fixture.js';
import { createBotStateTracker } from '../src/state/bot-state.js';

const closes: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});
const alice = humanContext('alice'),
  bob = humanContext('bob'),
  carol = humanContext('carol');
function fixture() {
  const root = createTempRoot('m7-visibility-');
  const registry = createTestRegistry({ rootDir: root });
  const database = registryDatabase(root);
  const db = attachOperationalModule(database, 'team');
  const channels = createSqliteChannelStore({ database: db, rootDir: join(root, 'channels') });
  const team = new TeamService(db, channels);
  db.transaction((db) => {
    db.prepare('UPDATE team_settings SET enabled=1').run();
    for (const h of [alice, bob, carol]) {
      db.prepare("INSERT INTO humans VALUES (?,?,'active',?)").run(
        h.humanId,
        h.humanId,
        '2026-11-15T00:00:00Z',
      );
      db.prepare("INSERT INTO human_roles VALUES (?,'member')").run(h.humanId);
    }
  });
  for (const [slug, human] of [
    ['alice-bot', alice],
    ['bob-bot', bob],
    ['owner-bot', owner],
  ] as const) {
    expect(registry.create({ slug, displayName: slug, ownerHumanId: human.humanId }).ok).toBe(true);
    channels.getOrCreateDm(human, slug, slug);
  }
  closes.push(() => database.close());
  const states = createBotStateTracker();
  const bridge = createBridgeMethodsForHumans({
    registry,
    channels,
    team,
    states,
    ownership: createTestOwnership(),
    roster: createTestRosterStore({ database }),
  });
  return { root, registry, database, db, channels, team, bridge, states };
}
const everyone = { kind: 'public', audience: { kind: 'everyone' } } as const;
function publicBot(f: ReturnType<typeof fixture>, slug = 'alice-bot') {
  f.team.bots.setVisibility(owner, slug, everyone);
}
function post(id: string, author: 'human' | 'bot' = 'human', slug = 'alice-bot') {
  return {
    id,
    at: '2026-11-15T00:00:00Z',
    author: author === 'human' ? { kind: 'human' as const } : { kind: 'bot' as const, slug },
    body: id,
  };
}

describe('M7 Bot principal and participant authority', () => {
  it('defaults private, requires createPublic for widening and returns metadata-only reachability', async () => {
    const f = fixture();
    const customRole = f.team.roles.create(owner, 'Audience role', []).role;
    const visibility = f.team.bots.view(alice, 'alice-bot');
    expect(visibility.visibility).toEqual({ kind: 'private' });
    expect(visibility.audienceDirectory.roles).toEqual(
      expect.arrayContaining([
        { roleId: 'admin', name: 'admin', builtin: 'admin' },
        { roleId: 'member', name: 'member', builtin: 'member' },
        { roleId: customRole.roleId, name: 'Audience role', builtin: null },
      ]),
    );
    expect(
      await createTeamBridge(alice, f.team).botVisibilitySet({
        slug: 'alice-bot',
        visibility: everyone,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'permission-required', details: { permission: 'bots.createPublic' } },
    });
    publicBot(f);
    expect(
      f.team.privateAccess
        .log(owner, {})
        .records.some((r) => r.action === 'botVisibilitySet' && r.objectId === 'alice-bot'),
    ).toBe(true);
    expect(f.team.bots.reachable(bob)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'alice-bot',
          visibility: 'public',
          principalDisplayName: 'alice',
        }),
      ]),
    );
    expect(f.team.bots.reachable(bob).find((b) => b.slug === 'alice-bot')).not.toHaveProperty(
      'body',
    );
    expect(f.team.bots.canReach(bob, 'owner-bot')).toBe(false);
    expect(await f.bridge(bob).channelDm({ slug: 'owner-bot' })).toMatchObject({ ok: false });
  });
  it('keeps exactly one DM per Human/Bot, excludes principal and retains read-only history after audience shrink', async () => {
    const f = fixture();
    publicBot(f);
    const dm = f.team.bots.dm(bob, 'alice-bot')!;
    expect(f.team.bots.dm(bob, 'alice-bot')!.id).toBe(dm.id);
    expect(f.team.bots.dm(carol, 'alice-bot')!.id).not.toBe(dm.id);
    await f.channels.appendMessage(bob, dm.id, post('bob-private'));
    for (const h of [alice, owner, carol]) {
      expect(f.team.channelAccess.canRead(h, dm.id)).toBe(false);
      expect(await f.bridge(h).channelMessages({ channelId: dm.id })).toMatchObject({ ok: false });
    }
    expect(f.team.bots.canRead('alice-bot', dm)).toBe(true);
    expect(
      await f
        .bridge(alice)
        .botToolRun({ slug: 'alice-bot', tool: 'channel_read', args: { channel_id: dm.id } }),
    ).toMatchObject({ ok: false, error: { code: 'bot-session-private' } });
    expect(await f.bridge(alice).botToolTrace({ slug: 'alice-bot' })).toMatchObject({
      ok: false,
      error: { code: 'bot-session-private' },
    });

    f.states.setSessionState(
      'alice-bot',
      'foreign-session',
      'working',
      {
        effect: 'executing',
        toolKind: 'execute',
        toolName: 'private-tool',
        publicDetail: 'participant-secret-tool-input',
        detailRefs: [],
        activeToolCount: 1,
        startedAt: 1,
      },
      'assignment',
      'participant-secret-title',
    );
    expect(f.bridge(alice).get({ slug: 'alice-bot' })).toMatchObject({
      ok: true,
      value: { bot: { sessions: {} } },
    });
    const snapshot = f.bridge(alice).activitySnapshot({});
    expect(snapshot).toMatchObject({
      ok: true,
      value: { bots: [expect.objectContaining({ slug: 'alice-bot', sessions: [] })] },
    });
    expect(JSON.stringify(snapshot)).not.toContain('participant-secret');
    expect(
      JSON.stringify(
        f.team.approvals.project(alice, {
          bots: [
            {
              slug: 'alice-bot',
              activity: { publicDetail: 'participant-secret-live-tool' },
              sessions: [{ title: 'participant-secret-live-title' }],
            },
          ],
        }),
      ),
    ).not.toContain('participant-secret');
    const beforeProjection = f.database.diagnostics().metrics.reads;
    const privateActivities = f.team.approvals.project(alice, {
      bots: Array.from({ length: 100 }, () => ({
        slug: 'alice-bot',
        sessions: [{ title: 'participant-secret' }],
      })),
    });
    expect(f.database.diagnostics().metrics.reads - beforeProjection).toBe(1);
    expect(JSON.stringify(privateActivities)).not.toContain('participant-secret');
    const preview = f.team.bots.setVisibility(alice, 'alice-bot', { kind: 'private' });
    expect(preview).toMatchObject({
      applied: false,
      preview: {
        dmsBecomingReadOnly: expect.arrayContaining([{ channelId: dm.id, humanId: 'bob' }]),
      },
    });
    expect(f.team.bots.canReach(bob, 'alice-bot')).toBe(true);
    expect(f.team.bots.setVisibility(alice, 'alice-bot', { kind: 'private' }, true).applied).toBe(
      true,
    );
    expect(f.team.channelAccess.canRead(bob, dm.id)).toBe(true);
    expect(f.team.bots.canRead('alice-bot', dm)).toBe(false);
    await expect(f.channels.appendMessage(bob, dm.id, post('blocked'))).rejects.toMatchObject({
      code: 'bot-dm-read-only',
    });
    await expect(
      f.channels.appendMessage(alice, dm.id, post('no-reply', 'bot')),
    ).rejects.toMatchObject({ code: 'bot-channel-access-denied' });
  });
  it.each(['audience-role', 'principal-deactivate'] as const)(
    'stops participant DM writes and Bot replies immediately after %s',
    async (change) => {
      const f = fixture();
      const audience = f.team.roles.create(owner, 'DM audience', []).role;
      f.team.roles.set(owner, bob.humanId, [audience.roleId]);
      f.team.bots.setVisibility(owner, 'alice-bot', {
        kind: 'public',
        audience: { kind: 'roles', roleIds: [audience.roleId] },
      });
      const dm = f.team.bots.dm(bob, 'alice-bot')!;
      await f.channels.appendMessage(bob, dm.id, post('before-revocation'));
      expect(f.team.bots.canRead('alice-bot', dm)).toBe(true);
      if (change === 'audience-role') f.team.roles.set(owner, bob.humanId, ['member']);
      else
        f.db.transaction((db) =>
          db.prepare("UPDATE humans SET status='deactivated' WHERE human_id='alice'").run(),
        );
      expect(f.team.channelAccess.canRead(bob, dm.id)).toBe(true);
      expect(f.team.bots.canRead('alice-bot', dm)).toBe(false);
      await expect(
        f.channels.appendMessage(bob, dm.id, post('after-revocation')),
      ).rejects.toMatchObject({ code: 'bot-dm-read-only' });
      await expect(
        f.channels.appendMessage(alice, dm.id, post('blocked-reply', 'bot')),
      ).rejects.toMatchObject({ code: 'bot-channel-access-denied' });
    },
  );
  it('keeps Human DM identity and privacy across a public Bot principal transfer', () => {
    const f = fixture();
    publicBot(f);
    const aliceDm = f.team.bots.dm(alice, 'alice-bot')!,
      bobDm = f.team.bots.dm(bob, 'alice-bot')!;
    f.db.transaction((db) =>
      db
        .prepare(
          "UPDATE persona_bots SET owner_human_id='bob',body=json_set(body,'$.ownerHumanId','bob') WHERE slug='alice-bot'",
        )
        .run(),
    );
    expect(f.team.bots.dm(bob, 'alice-bot')!.id).toBe(bobDm.id);
    expect(f.team.bots.dm(alice, 'alice-bot')!.id).toBe(aliceDm.id);
    expect(f.team.channelAccess.canRead(bob, aliceDm.id)).toBe(false);
    expect(f.team.channelAccess.canRead(alice, aliceDm.id)).toBe(true);
    expect(
      f.channels.list().filter((c) => c.botSlug === 'alice-bot' && c.dmHumanId === 'bob'),
    ).toHaveLength(1);
  });
  it.each(['role', 'deactivate', 'remove'] as const)(
    'rechecks group read/write immediately after principal %s',
    async (kind) => {
      const f = fixture();
      const channel = f.channels.createGroup(bob, { name: 'Group', members: ['alice-bot'] });
      f.team.channelAccess.addMember(bob, channel.id, 'alice');
      if (kind === 'role') {
        const role = f.team.roles.create(owner, 'Finance', []).role;
        f.team.roles.set(owner, 'alice', [role.roleId]);
        f.team.channelAccess.visibilitySet(bob, channel.id, {
          kind: 'roles',
          roleIds: [role.roleId],
        });
      }
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
  it('requires audience, proactive opt-in and respects each member opt-out', () => {
    const f = fixture();
    publicBot(f);
    expect(() => f.team.bots.requireProactive('alice-bot', 'bob')).toThrow('bot-proactive-denied');
    f.team.bots.switches(alice, 'alice-bot', { proactiveDms: true });
    expect(() => f.team.bots.requireProactive('alice-bot', 'bob')).not.toThrow();
    f.team.bots.optOut(bob, 'alice-bot', true);
    expect(() => f.team.bots.requireProactive('alice-bot', 'bob')).toThrow('bot-proactive-denied');
    f.team.bots.optOut(bob, 'alice-bot', false);
    expect(() => f.team.bots.requireProactive('alice-bot', 'bob')).not.toThrow();
  });
  it('uses participant authority for private→public Bot DMs and denies public→private initiation', () => {
    const f = fixture();
    publicBot(f);
    expect(() => f.team.bots.requireBotTarget('bob-bot', 'alice-bot')).not.toThrow();
    expect(() => f.team.bots.requireBotTarget('alice-bot', 'bob-bot')).toThrow(
      'bot-private-target-denied',
    );
    const channel = f.channels.getOrCreateBotDm(bob, 'bob-bot', 'alice-bot', 'DM')!;
    expect(f.team.bots.canRead('alice-bot', channel)).toBe(true);
    expect(f.team.bots.canRead('bob-bot', channel)).toBe(true);
    f.db.transaction((db) =>
      db.prepare("UPDATE humans SET status='deactivated' WHERE human_id='alice'").run(),
    );
    expect(f.team.bots.canRead('alice-bot', channel)).toBe(false);
    expect(f.team.bots.canRead('bob-bot', channel)).toBe(false);
  });
  it('never delegates M11 to a Bot, including Owner Bots', async () => {
    const f = fixture();
    for (const human of [owner, alice])
      for (const method of [
        'privateObjects',
        'privateContentOpen',
        'privateContentPage',
        'auditLog',
        'auditVerify',
      ] as const)
        expect(
          await createTeamBridge({ ...human, caller: 'bot' }, f.team)[method]({}),
        ).toMatchObject({ ok: false, error: { code: 'permission-required' } });
  });
  it('keeps hard grants unioned and advisory topics Deny-wins with explicit conflicting role pairs', async () => {
    const f = fixture();
    const allow = f.team.roles.create(owner, 'Finance', ['bots.createPrivate'], { kind: 'all' }, [
      { topic: 'money', text: 'Show balances', effect: 'allow' },
    ]).role;
    const deny = f.team.roles.create(owner, 'Intern', ['dm.humans'], { kind: 'all' }, [
      { topic: 'money', text: 'Do not show balances', effect: 'deny' },
    ]).role;
    f.team.roles.set(owner, 'bob', [allow.roleId, deny.roleId]);
    expect(f.team.roles.permissions(bob)).toEqual(
      expect.arrayContaining(['bots.createPrivate', 'dm.humans']),
    );
    expect(await createTeamBridge(owner, f.team).roleConflicts({ humanId: 'bob' })).toMatchObject({
      ok: true,
      value: [
        { topic: 'money', allowRole: { roleId: allow.roleId }, denyRole: { roleId: deny.roleId } },
      ],
    });
    expect(f.team.speakerPolicy.forHuman('bob', 'money').resolved).toMatchObject([
      { effect: 'deny', conflict: true },
    ]);
    const first = f.team.speakerPolicy.envelope('session', 'bob', 'hello');
    expect(first.text).toContain('[bob ·');
    expect(first.text).toContain('Show balances');
    first.commit();
    const writes = f.database.diagnostics().metrics.transactionsCommitted;
    first.commit();
    f.team.speakerPolicy.envelope('session', 'bob', 'repeat').commit();
    expect(f.database.diagnostics().metrics.transactionsCommitted).toBe(writes);
    expect(f.team.speakerPolicy.envelope('session', 'bob', 'again').text).not.toContain(
      'Show balances',
    );
    f.team.roles.update(owner, allow.roleId, {
      policy: [{ topic: 'money', text: 'New revision', effect: 'allow' }],
    });
    expect(f.team.speakerPolicy.envelope('session', 'bob', 'changed').text).toContain(
      '"revision":2',
    );
    expect(f.team.speakerPolicy.envelope('another-session', 'bob', 'new').text).toContain(
      'Do not show balances',
    );
  });
  it.each(['role', 'remove', 'deactivate'] as const)(
    'refuses a live turn before its next tool and send after %s',
    async (kind) => {
      let captured: OrchestratorAgentRun | undefined;
      let release!: () => void;
      const wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      const core = createCore({
        dshHome: createTempRoot('m7-live-'),
        agents: {
          async runOrchestrator(run) {
            captured = run;
            await wait;
          },
          async runAssignment() {},
          requestAssignment() {
            throw new Error('unexpected');
          },
          async close() {},
        },
      });
      closes.push(async () => {
        release();
        await core.runtime.close();
        core.operationalDatabase.close();
      });
      const db = attachOperationalModule(core.operationalDatabase, 'team');
      db.transaction((db) => {
        db.prepare("INSERT INTO humans VALUES ('alice','Alice','active','now')").run();
        db.prepare("INSERT INTO human_roles VALUES ('alice','member')").run();
        db.prepare('UPDATE team_settings SET enabled=1').run();
      });
      core.team.spaces.ensureAccount('alice');
      expect(
        core.registry.create({ slug: 'worker', displayName: 'Worker', ownerHumanId: 'alice' }).ok,
      ).toBe(true);
      const group = core.channels.createGroup(owner, { name: 'Restricted', members: ['worker'] });
      db.transaction((db) =>
        db
          .prepare(
            "INSERT INTO channel_human_members(channel_id,human_id,display_name,visible_from_revision,joined_at) VALUES (?,'alice','Alice',1,'now')",
          )
          .run(group.id),
      );
      const role = core.team.roles.create(owner, 'Finance', []).role;
      core.team.roles.set(owner, 'alice', [role.roleId]);
      core.team.channelAccess.visibilitySet(owner, group.id, {
        kind: 'roles',
        roleIds: [role.roleId],
      });
      await core.channels.appendMessage(owner, group.id, {
        ...post('start'),
        body: '@Worker start',
        mentions: [{ botSlug: 'worker', label: 'Worker', start: 0, end: 7 }],
      });
      core.runtime.admitGroupMessage(group.id, 'start');
      for (let i = 0; i < 200 && !captured; i++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      if (!captured) throw new Error('turn-not-started');
      expect(() => captured!.channels.read({ channelId: group.id })).not.toThrow();
      if (kind === 'role') core.team.roles.set(owner, 'alice', []);
      if (kind === 'remove')
        db.transaction((db) =>
          db
            .prepare(
              "UPDATE channel_human_members SET left_at='now' WHERE channel_id=? AND human_id='alice'",
            )
            .run(group.id),
        );
      if (kind === 'deactivate')
        db.transaction((db) =>
          db.prepare("UPDATE humans SET status='deactivated' WHERE human_id='alice'").run(),
        );
      expect(() => captured!.channels.read({ channelId: group.id })).toThrow();
      await expect(
        captured.channels.send({ channelId: group.id, body: 'forbidden' }),
      ).rejects.toThrow();
      expect(() => captured!.requireContent!()).toThrow();
      release();
      await core.runtime.whenIdle();
    },
  );
  it('delivers a public Bot reply only to its Human participant and scopes Activity to that participant', async () => {
    const inputs: string[] = [];
    const core = createCore({
      dshHome: createTempRoot('m7-participant-runtime-'),
      agents: {
        async runOrchestrator(run) {
          inputs.push(run.message);
          await run.channels.send({
            channelId: run.inboundChannelId!,
            body: 'participant-secret-answer',
          });
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
    const dm = core.team.bots.dm(bob, 'public-helper')!;
    await core.channels.appendMessage(bob, dm.id, post('participant-secret-request'));
    const admission = core.runtime.admitDmMessage(bob, {
      channelId: dm.id,
      messageId: 'participant-secret-request',
      body: 'participant-secret-request',
    });
    expect(admission.admitted).toBe(true);
    if (admission.admitted) await admission.settled;
    expect(inputs[0]).toContain('[bob · member]');
    expect(core.channels.readMessages(dm.id).map((m) => m.body)).toContain(
      'participant-secret-answer',
    );
    expect(core.channels.readMessages('dm-public-helper')).toEqual([]);
    expect(core.humanAttention.dmReplies(bob, 20).map((m) => m.channelId)).toContain(dm.id);
    for (const viewer of [alice, owner]) {
      expect(
        JSON.stringify(createBridgeMethodsForHumans(core)(viewer).botSessionIds({})),
      ).not.toContain('public-helper');
      expect(core.humanAttention.dmReplies(viewer, 20)).toEqual([]);
      expect(JSON.stringify(core.humanAttention.list(viewer, {}))).not.toContain(
        'participant-secret',
      );
    }
    core.team.roles.update(owner, 'member', {
      policy: [{ topic: 'answer', text: 'Updated policy', effect: 'deny' }],
    });
    await core.channels.appendMessage(bob, dm.id, post('revision-request'));
    const second = core.runtime.admitDmMessage(bob, {
      channelId: dm.id,
      messageId: 'revision-request',
      body: 'revision-request',
    });
    if (second.admitted) await second.settled;
    expect(inputs[1]).toContain('Updated policy');
    expect(inputs[1]).toContain('"revision":2');
    core.team.bots.switches(alice, 'public-helper', { speakerContext: false });
    await core.channels.appendMessage(bob, dm.id, post('no-context'));
    const third = core.runtime.admitDmMessage(bob, {
      channelId: dm.id,
      messageId: 'no-context',
      body: 'no-context',
    });
    if (third.admitted) await third.settled;
    expect(inputs[2]).not.toContain('[bob · member]');
  });
  it('runs private→public Bot messaging and a participant-authorized reply without tracing it into the public principal DM', async () => {
    let sent = false,
      replied = false;
    const errors: unknown[] = [];
    const core = createCore({
      dshHome: createTempRoot('m7-bot-peer-runtime-'),
      agents: {
        async runOrchestrator(run) {
          try {
            if (run.bot.slug === 'private-helper' && !sent) {
              sent = true;
              await run.channels.sendToBot({
                botSlug: 'public-helper',
                body: 'delegate-private-work',
              });
            } else if (run.bot.slug === 'public-helper' && !replied) {
              replied = true;
              expect(run.message).not.toContain('[bob ·');
              await run.channels.send({
                channelId: run.inboundChannelId!,
                body: 'peer-private-answer',
              });
            }
          } catch (e) {
            errors.push(e);
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
    for (const [slug, h] of [
      ['public-helper', alice],
      ['private-helper', bob],
    ] as const) {
      core.team.spaces.ensureAccount(h.humanId);
      expect(core.registry.create({ slug, displayName: slug, ownerHumanId: h.humanId }).ok).toBe(
        true,
      );
      core.channels.getOrCreateDm(h, slug);
    }
    core.team.bots.setVisibility(owner, 'public-helper', everyone);
    await core.channels.appendMessage(bob, 'dm-private-helper', post('delegate'));
    const admission = core.runtime.admitDmMessage(bob, {
      channelId: 'dm-private-helper',
      messageId: 'delegate',
      body: 'delegate',
    });
    if (admission.admitted) await admission.settled;
    await core.runtime.whenIdle();
    expect(errors).toEqual([]);
    expect(sent && replied).toBe(true);
    const peer = core.channels.list().find((c) => c.type === 'dm' && c.members.length === 2)!;
    expect(core.channels.readMessages(peer.id).map((m) => m.body)).toEqual([
      'peer-private-answer',
      'delegate-private-work',
    ]);
    expect(core.team.channelAccess.canRead(bob, peer.id)).toBe(true);
    expect(core.team.channelAccess.canRead(alice, peer.id)).toBe(false);
    expect(core.channels.readMessages('dm-public-helper')).toEqual([]);
  });
  it('keeps reachable discovery to one read and never decodes unrelated private Bot data', () => {
    const f = fixture();
    publicBot(f);
    f.db.transaction((db) => {
      for (let i = 0; i < 1000; i++)
        db.prepare('INSERT INTO persona_bots(slug,owner_human_id,body) VALUES (?,?,?)').run(
          'hidden-' + i,
          'alice',
          '{"secret":"not-metadata"}',
        );
    });
    const before = f.database.diagnostics().metrics.reads;
    expect(f.team.bots.reachable(bob).map((b) => b.slug)).toEqual(['alice-bot', 'bob-bot']);
    expect(f.database.diagnostics().metrics.reads - before).toBe(1);
  });
  it('preserves the documented private Owner/member reach upgrading the historical 153 boundary', () => {
    const root = createTempRoot('m7-upgrade-');
    const old = mountOperationalDatabase({
      dshHome: root,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation <= 153),
      ),
    });
    attachOperationalModule(old, 'fixture').transaction((db) => {
      db.prepare("INSERT INTO humans VALUES ('alice','alice','active','now')").run();
      for (const id of ['local-human', 'alice'])
        db.prepare('INSERT INTO persona_bots(slug,body,owner_human_id) VALUES (?,?,?)').run(
          id,
          JSON.stringify({ slug: id, displayName: id }),
          id,
        );
      for (const id of ['group-existing', 'group-revoked'])
        db.prepare(
          'INSERT INTO channel_records(channel_id,record_json,owner_human_id,visibility_json) VALUES (?,?,?,?)',
        ).run(
          id,
          JSON.stringify({
            id,
            type: 'group',
            name: id,
            members: ['local-human'],
            createdAt: '2026-11-15T00:00:00Z',
            updatedAt: '2026-11-15T00:00:00Z',
          }),
          'alice',
          JSON.stringify({ kind: 'roles', roleIds: ['member'] }),
        );
      db.prepare(
        "INSERT INTO channel_human_members(channel_id,human_id,display_name,visible_from_revision,joined_at,left_at) VALUES ('group-revoked','local-human','Human',1,'before','removed')",
      ).run();
    });
    old.close();
    const migrated = mountOperationalDatabase({
      dshHome: root,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    closes.push(() => migrated.close());
    const db = attachOperationalModule(migrated, 'test');
    expect(
      db.read((db) =>
        db.prepare('SELECT owner_human_id,visibility_json FROM persona_bots ORDER BY slug').all(),
      ),
    ).toEqual([
      { owner_human_id: 'alice', visibility_json: '{"kind":"private"}' },
      { owner_human_id: 'local-human', visibility_json: '{"kind":"private"}' },
    ]);
    expect(
      db.read((db) =>
        db
          .prepare(
            "SELECT channel_id,left_at FROM channel_human_members WHERE human_id='local-human' ORDER BY channel_id",
          )
          .all(),
      ),
    ).toEqual([
      { channel_id: 'group-existing', left_at: null },
      { channel_id: 'group-revoked', left_at: 'removed' },
    ]);
    expect(
      db.read((db) =>
        db.prepare('SELECT channel_id,human_id FROM channel_admins ORDER BY channel_id').all(),
      ),
    ).toEqual([{ channel_id: 'group-existing', human_id: 'local-human' }]);
    expect(
      db.read((db) =>
        db
          .prepare('SELECT id FROM schema_migrations WHERE generation=?')
          .get(BOT_HARNESS_SCHEMA_PLAN.generationOf('bot-visibility')),
      ),
    ).toEqual({ id: 'bot-visibility' });
  });
});
