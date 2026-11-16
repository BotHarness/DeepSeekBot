import { afterEach, describe, expect, it, vi } from 'vitest';
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
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';

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
function proactiveFixture(teamEnabled: boolean) {
  const root = createTempRoot('m7-proactive-');
  const core = createCore({
    dshHome: root,
    agents: createDshBotAgentAdapter({
      agents: new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => {} }),
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => join(root, 'memory'),
    }),
  });
  closes.push(async () => {
    await core.runtime.close();
    core.operationalDatabase.close();
  });
  const db = attachOperationalModule(core.operationalDatabase, 'team');
  db.transaction((db) => {
    db.prepare('UPDATE team_settings SET enabled=?').run(Number(teamEnabled));
    db.prepare("INSERT INTO humans VALUES ('bob','Bob','active','now')").run();
    db.prepare("INSERT INTO human_roles VALUES ('bob','member')").run();
  });
  core.team.spaces.ensureAccount('bob');
  expect(core.registry.create({ slug: 'helper', displayName: 'Helper' }).ok).toBe(true);
  const dm = core.channels.getOrCreateDm(owner, 'helper')!;
  return { core, db, dm };
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
  it('binds authenticated direct tools to the caller DM and releases the transient origin', async () => {
    const root = createTempRoot('m7-direct-approval-origin-');
    let core: ReturnType<typeof createCore>;
    let sessionId: string | undefined;
    let observedOrigin: string | undefined;
    core = createCore({
      dshHome: root,
      agents: createDshBotAgentAdapter({
        agents: new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => {} }),
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        orchestratorCwd: () => join(root, 'memory'),
        onAgentSetup: (_ctx, agent) => {
          sessionId = agent.session.id;
          observedOrigin = core.runtime.askChannel?.(sessionId);
        },
      }),
    });
    closes.push(async () => {
      await core.runtime.close();
      core.operationalDatabase.close();
    });
    const db = attachOperationalModule(core.operationalDatabase, 'direct-approval-origin-test');
    db.transaction((sql) => {
      sql.prepare('UPDATE team_settings SET enabled=1').run();
      sql.prepare("INSERT INTO humans VALUES ('alice','Alice','active','now')").run();
      sql.prepare("INSERT INTO human_roles VALUES ('alice','member')").run();
    });
    core.spaces.ensureAccount(alice.humanId);
    expect(
      core.registry.create({ slug: 'helper', displayName: 'Helper', ownerHumanId: alice.humanId })
        .ok,
    ).toBe(true);
    const dm = core.channels.getOrCreateDm(alice, 'helper', 'Helper')!;
    const result = await createBridgeMethodsForHumans(core)(alice).botToolRun({
      slug: 'helper',
      tool: 'bot_send_message',
      args: { body: 'No target, no delivery.' },
      humanId: owner.humanId,
    });
    expect(result.ok).toBe(false);
    expect(observedOrigin).toBe(dm.id);
    expect(sessionId).toBeDefined();
    expect(core.runtime.askChannel?.(sessionId!)).toBeUndefined();
    expect(core.channels.readMessages(dm.id)).toEqual([]);
  });

  it('preserves omitted switches and performs no write for a slug-only bridge read', async () => {
    const f = fixture();
    f.team.bots.switches(alice, 'alice-bot', {
      proactiveDms: true,
      joinPrincipalChannels: false,
      speakerContext: false,
    });
    const methods = createTeamBridge(alice, f.team);
    expect(await methods.botSwitches({ slug: 'alice-bot', speakerContext: true })).toMatchObject({
      ok: true,
      value: {
        switches: { proactiveDms: true, joinPrincipalChannels: false, speakerContext: true },
      },
    });
    const writes = vi.spyOn(f.db, 'transaction');
    expect(await methods.botSwitches({ slug: 'alice-bot' })).toMatchObject({
      ok: true,
      value: {
        switches: { proactiveDms: true, joinPrincipalChannels: false, speakerContext: true },
      },
    });
    expect(writes).not.toHaveBeenCalled();
  });
  it.each([{ operationKey: '' }, { expectedChannel: '' }, { operationKey: 'unsupported' }])(
    'does not persist invitation provenance after rejected input %j',
    (input) => {
      const f = fixture();
      const group = f.channels.createGroup(alice, { name: 'Invite', members: [] });
      const result = f
        .bridge(alice)
        .channelGroupInvite({ channelId: group.id, botSlug: 'alice-bot', ...input });
      expect(result.ok).toBe(false);
      expect(
        f.db.read((db) =>
          db.prepare('SELECT * FROM bot_channel_adders WHERE channel_id=?').all(group.id),
        ),
      ).toEqual([]);
      expect(f.channels.get(group.id)?.invitations ?? []).toEqual([]);
    },
  );
  it('keeps Bot DM authorization tied to the recorded participant after either Bot transfers', () => {
    const f = fixture();
    publicBot(f);
    const channel = f.channels.getOrCreateBotDm(bob, 'bob-bot', 'alice-bot', 'DM')!;
    f.db.transaction((db) =>
      db
        .prepare(
          "UPDATE persona_bots SET owner_human_id='carol',body=json_set(body,'$.ownerHumanId','carol') WHERE slug='bob-bot'",
        )
        .run(),
    );
    expect(f.team.bots.canRead('bob-bot', channel)).toBe(false);
    expect(f.team.bots.canRead('alice-bot', channel)).toBe(true);
    f.team.bots.setVisibility(
      owner,
      'alice-bot',
      { kind: 'public', audience: { kind: 'members', humanIds: ['carol'] } },
      true,
    );
    expect(f.team.bots.canRead('alice-bot', channel)).toBe(false);
    expect(f.team.bots.canRead('bob-bot', channel)).toBe(false);
  });
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
  it('does not exempt direct sends merely because the participant DM has historical placements', async () => {
    const { core, db } = proactiveFixture(true);
    core.team.bots.setVisibility(owner, 'helper', everyone);
    const dm = core.team.bots.dm(bob, 'helper')!;
    await core.channels.appendMessage(bob, dm.id, post('past-turn'));
    const admission = core.runtime.admitDmMessage(bob, {
      channelId: dm.id,
      messageId: 'past-turn',
      body: 'past-turn',
    });
    if (!admission.admitted) throw new Error('not-admitted');
    await admission.settled;
    const source = db.read((db) =>
      db
        .prepare(
          'SELECT source_event_id FROM channel_placements WHERE channel_id=? AND message_id=?',
        )
        .get(dm.id, 'past-turn'),
    );
    const send = () =>
      core.runtime.runDirectBotTool!(
        'helper',
        'bot_send_message',
        { channel_id: dm.id, body: 'unsolicited' },
        new AbortController().signal,
      );
    await expect(send()).rejects.toMatchObject({ code: 'bot-proactive-denied' });
    await expect(
      core.runtime.runDirectBotTool!(
        'helper',
        'bot_send_message',
        { source_event_id: source?.['source_event_id'], body: 'explicit reply' },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ result: { status: 'committed' } });
    core.team.bots.switches(owner, 'helper', { proactiveDms: true });
    core.team.bots.optOut(bob, 'helper', true);
    await expect(send()).rejects.toMatchObject({ code: 'bot-proactive-denied' });
  });
  it('reattaches speaker policy after refused steering and commits only accepted delivery', async () => {
    let release = () => {};
    let started = () => {};
    const active = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const steered: string[] = [];
    const core = createCore({
      dshHome: createTempRoot('m7-steer-policy-'),
      agents: {
        async runOrchestrator() {
          started();
          await active;
        },
        steerOrchestrator(_slug, text) {
          steered.push(text);
          return steered.length > 1;
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
    core.registry.create({ slug: 'worker', displayName: 'Worker' });
    const dm = core.channels.getOrCreateDm(owner, 'worker')!;
    const group = core.channels.createGroup(owner, { name: 'Steer policy', members: ['worker'] });
    await core.channels.appendMessage(owner, dm.id, post('start'));
    const admission = core.runtime.admitDmMessage(owner, {
      channelId: dm.id,
      messageId: 'start',
      body: 'start',
    });
    if (!admission.admitted) throw new Error('not-admitted');
    await ready;
    core.team.roles.update(owner, 'member', {
      policy: [{ topic: 'steer', effect: 'deny', text: 'Retry policy' }],
    });
    const db = attachOperationalModule(core.operationalDatabase, 'steer-policy-test');
    db.transaction((db) =>
      db.prepare("INSERT OR IGNORE INTO human_roles VALUES ('local-human','member')").run(),
    );
    const attached = () =>
      db.read((db) =>
        db.prepare("SELECT revision FROM session_speaker_policies WHERE role_id='member'").all(),
      );
    for (const id of ['refused', 'accepted']) {
      await core.channels.appendMessage(owner, group.id, {
        ...post(id),
        body: '@Worker check',
        mentions: [{ botSlug: 'worker', label: 'Worker', start: 0, end: 7 }],
      });
      core.runtime.admitGroupMessage(group.id, id);
      if (id === 'refused') expect(attached()).toEqual([]);
    }
    expect(steered).toHaveLength(2);
    for (const text of steered) expect(text).toContain('Retry policy');
    expect(attached()).toEqual([{ revision: 2 }]);
    release();
    await admission.settled;
    await core.runtime.whenIdle();
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
  it.each(['existing live', 'recreated'] as const)(
    'resolves the %s participant DM instead of a deleted DM',
    (kind) => {
      const f = fixture();
      const dm = f.channels.getOrCreateDm(alice, 'alice-bot')!;
      f.db.transaction((db) => {
        if (kind === 'existing live') {
          const deleted = { ...dm, id: 'dm-000-deleted', dmHumanId: 'alice', deletedAt: 'now' };
          db.prepare(
            'INSERT INTO channel_records(channel_id,record_json,owner_human_id) VALUES (?,?,?)',
          ).run(deleted.id, JSON.stringify(deleted), 'alice');
        } else {
          db.prepare(
            "UPDATE channel_records SET record_json=json_set(record_json,'$.deletedAt','now') WHERE channel_id=?",
          ).run(dm.id);
        }
      });
      const resolved = f.channels.getOrCreateDm(alice, 'alice-bot', dm.name)!;
      expect(resolved.id).toBe(dm.id);
      expect(resolved.deletedAt).toBeUndefined();
      expect(f.channels.get(resolved.id)).toEqual(resolved);
    },
  );

  it('refuses DM mentions of Bots the speaking Human cannot reach', async () => {
    const f = fixture();
    publicBot(f);
    const dm = f.team.bots.dm(bob, 'alice-bot')!;
    const mention = (slug: string) =>
      f.bridge(bob).channelSend({
        channelId: dm.id,
        body: `@${slug} hello`,
        mentions: [{ botSlug: slug, label: slug, start: 0, end: slug.length + 1 }],
      });
    expect(f.team.bots.canReach(bob, 'owner-bot')).toBe(false);
    expect(await mention('owner-bot')).toMatchObject({ ok: false });
    expect((await f.bridge(bob).channelMessages({ channelId: dm.id })) as unknown).toMatchObject({
      ok: true,
      value: { messages: [] },
    });
    expect(await mention('bob-bot')).toMatchObject({ ok: true });
  });
  it('offers a reachable shared Bot as the Skill viewer in a participant DM only while reachable', async () => {
    const f = fixture();
    publicBot(f);
    const dm = f.team.bots.dm(bob, 'alice-bot')!;
    const list = vi.fn(async (bots: readonly string[]) => bots.map((name) => ({ name })));
    const bridge = createBridgeMethodsForHumans({
      registry: f.registry,
      channels: f.channels,
      team: f.team,
      states: f.states,
      ownership: createTestOwnership(),
      roster: createTestRosterStore({ database: f.database }),
      skills: { list } as never,
    });
    expect(await bridge(bob).channelSkillCatalog({ channelId: dm.id })).toMatchObject({ ok: true });
    expect(list).toHaveBeenLastCalledWith(['alice-bot']);
    f.team.bots.setVisibility(owner, 'alice-bot', { kind: 'private' }, true);
    await bridge(bob).channelSkillCatalog({ channelId: dm.id });
    expect(list).toHaveBeenLastCalledWith([]);
  });
  it('refuses reactions in a participant DM once its Bot is no longer reachable', async () => {
    const f = fixture();
    publicBot(f);
    const dm = f.team.bots.dm(bob, 'alice-bot')!;
    await f.channels.appendMessage(bob, dm.id, post('bob-reaction'));
    const react = () =>
      f.bridge(bob).channelReact({ channelId: dm.id, messageId: 'bob-reaction', emoji: '👍' });
    expect(await react()).toMatchObject({ ok: true });
    f.team.bots.setVisibility(owner, 'alice-bot', { kind: 'private' }, true);
    expect(await react()).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });
  it('never reuses another Human/Bot pair when a Bot slug matches a participant DM id', () => {
    const f = fixture();
    publicBot(f);
    const participant = f.team.bots.dm(bob, 'alice-bot')!;
    expect(participant.id).toMatch(/^dm-member-/);
    const collidingSlug = participant.id.slice('dm-'.length);
    expect(
      f.registry.create({ slug: collidingSlug, displayName: 'Collider', ownerHumanId: 'bob' }).ok,
    ).toBe(true);
    const own = f.channels.getOrCreateDm(bob, collidingSlug, 'Collider')!;
    expect(own.id).not.toBe(participant.id);
    expect(own).toMatchObject({ type: 'dm', botSlug: collidingSlug });
    expect(f.channels.get(participant.id)).toMatchObject({
      botSlug: 'alice-bot',
      dmHumanId: 'bob',
    });
    expect(f.channels.getOrCreateDm(bob, collidingSlug, 'Collider')!.id).toBe(own.id);
    expect(f.team.bots.dm(bob, 'alice-bot')!.id).toBe(participant.id);
    expect(f.team.bots.dm(bob, collidingSlug)!.id).toBe(own.id);
  });
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
      if (kind === 'role') {
        const role = f.team.roles.create(owner, 'Finance', []).role;
        f.team.roles.set(owner, 'alice', [role.roleId]);
        f.team.channelAccess.visibilitySet(bob, channel.id, {
          kind: 'roles',
          roleIds: [role.roleId],
        });
        f.team.channelAccess.join(alice, channel.id);
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
  describe.each([true, false])('principal proactive DMs (Team mode %s)', (teamEnabled) => {
    it.each(['channel_id', 'human_id'] as const)(
      'sends through %s with the switch off despite a principal opt-out',
      async (destination) => {
        const { core, dm } = proactiveFixture(teamEnabled);
        core.team.bots.optOut(owner, 'helper', true);
        expect(core.team.bots.view(owner, 'helper').switches.proactiveDms).toBe(false);
        const sent = await core.runtime.runDirectBotTool!(
          'helper',
          'bot_send_message',
          { [destination]: destination === 'channel_id' ? dm.id : owner.humanId, body: 'Reminder' },
          new AbortController().signal,
        );
        expect(sent.result).toMatchObject({ channelId: dm.id, status: 'committed' });
        expect(core.channels.readMessages(dm.id)).toContainEqual(
          expect.objectContaining({ body: 'Reminder', author: { kind: 'bot', slug: 'helper' } }),
        );
      },
    );
  });
  it.each(['channel_id', 'human_id'] as const)(
    'keeps audience, switch and member opt-out checks for proactive %s sends',
    async (destination) => {
      const { core } = proactiveFixture(true);
      core.team.bots.setVisibility(owner, 'helper', everyone);
      const dm = core.team.bots.dm(bob, 'helper')!;
      const send = () =>
        core.runtime.runDirectBotTool!(
          'helper',
          'bot_send_message',
          { [destination]: destination === 'channel_id' ? dm.id : bob.humanId, body: 'Report' },
          new AbortController().signal,
        );
      await expect(send()).rejects.toMatchObject({ code: 'bot-proactive-denied' });
      core.team.bots.switches(owner, 'helper', { proactiveDms: true });
      core.team.bots.optOut(bob, 'helper', true);
      await expect(send()).rejects.toMatchObject({ code: 'bot-proactive-denied' });
      core.team.bots.optOut(bob, 'helper', false);
      await expect(send()).resolves.toMatchObject({ result: { status: 'committed' } });
      core.team.bots.setVisibility(
        owner,
        'helper',
        {
          kind: 'public',
          audience: { kind: 'members', humanIds: [owner.humanId] },
        },
        true,
      );
      expect(() => core.team.bots.requireProactive('helper', bob.humanId)).toThrow(
        'bot-proactive-denied',
      );
    },
  );
  it('exempts the current principal immediately after transfer, while the former principal is audience', async () => {
    const { core, db, dm: formerPrincipalDm } = proactiveFixture(true);
    core.team.bots.setVisibility(owner, 'helper', everyone);
    const currentPrincipalDm = core.team.bots.dm(bob, 'helper')!;
    core.team.bots.optOut(bob, 'helper', true);
    db.transaction((db) =>
      db
        .prepare(
          "UPDATE persona_bots SET owner_human_id='bob',body=json_set(body,'$.ownerHumanId','bob') WHERE slug='helper'",
        )
        .run(),
    );
    const send = (channelId: string) =>
      core.runtime.runDirectBotTool!(
        'helper',
        'bot_send_message',
        { channel_id: channelId, body: 'Transferred report' },
        new AbortController().signal,
      );
    await expect(send(currentPrincipalDm.id)).resolves.toMatchObject({
      result: { status: 'committed' },
    });
    await expect(
      core.runtime.runDirectBotTool!(
        'helper',
        'bot_send_message',
        { human_id: bob.humanId, body: 'Transferred reminder' },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ result: { channelId: currentPrincipalDm.id, status: 'committed' } });
    await expect(send(formerPrincipalDm.id)).rejects.toMatchObject({
      code: 'bot-proactive-denied',
    });
    core.team.bots.switches(bob, 'helper', { proactiveDms: true });
    core.team.bots.optOut(owner, 'helper', true);
    await expect(send(formerPrincipalDm.id)).rejects.toMatchObject({
      code: 'bot-proactive-denied',
    });
    core.team.bots.optOut(owner, 'helper', false);
    await expect(send(formerPrincipalDm.id)).resolves.toMatchObject({
      result: { status: 'committed' },
    });
    expect(core.registry.setPaused('helper', true).ok).toBe(true);
    expect(() => core.team.bots.requireProactive('helper', bob.humanId)).toThrow(
      'bot-principal-inactive',
    );
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
      const role = core.team.roles.create(owner, 'Finance', []).role;
      core.team.roles.set(owner, 'alice', [role.roleId]);
      core.team.channelAccess.visibilitySet(owner, group.id, {
        kind: 'roles',
        roleIds: [role.roleId],
      });
      core.team.channelAccess.join(alice, group.id);
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
    core.team.joinPublic(alice, group.id);
    core.team.joinPublic(bob, group.id);
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
