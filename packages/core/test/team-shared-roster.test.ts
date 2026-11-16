import { botAvatarUrl } from '../src/bots/avatar-http.js';
import { afterEach, expect, it } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createRosterStore } from '../src/roster/store.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { createTempRoot } from './helpers.js';
import { createFakeRosterDomain } from './roster-fixture.js';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=';
const alice = humanContext('alice'),
  bob = humanContext('bob'),
  manager = humanContext('manager');
const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    await core.runtime.close();
    core.schedules.close();
    core.externalMessaging.close();
    await core.roster.detach();
    core.operationalDatabase.close();
  }
});
async function fixture() {
  const core = createCore({
    dshHome: createTempRoot('m7-shared-roster-'),
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      requestAssignment() {
        throw new Error('unexpected');
      },
      async close() {},
    },
  });
  cores.push(core);
  const db = attachOperationalModule(core.operationalDatabase, 'shared-roster-test');
  db.transaction((sql) => {
    sql.prepare('UPDATE team_settings SET enabled=1').run();
    for (const human of [alice, bob, manager]) {
      sql
        .prepare("INSERT INTO humans VALUES (?,?,'active','now')")
        .run(human.humanId, human.humanId);
      sql.prepare("INSERT INTO human_roles VALUES (?,'member')").run(human.humanId);
    }
  });
  const role = core.team.roles.create(owner, 'Bot manager', ['bots.manageAll']).role;
  core.team.roles.set(owner, manager.humanId, ['member', role.roleId]);
  for (const [slug, human] of [
    ['public', alice],
    ['private', alice],
    ['mine', bob],
  ] as const) {
    core.spaces.ensureAccount(human.humanId);
    expect(
      core.registry.create({
        slug,
        displayName: slug,
        ownerHumanId: human.humanId,
        description: 'private description',
        workspaces: ['/private/workspace'],
      }).ok,
    ).toBe(true);
    core.channels.getOrCreateDm(human, slug);
  }
  core.registry.update('public', {
    avatar: PNG,
    roles: ['private-role-tag'],
  });
  core.registry.setPrimaryColor('public', { mode: 'custom', color: '#abcdef' });
  await core.roster.attach(createFakeRosterDomain().facility);
  const bridge = createBridgeMethodsForHumans(core);
  const ownBefore = bridge(bob).list({});
  core.team.bots.setVisibility(owner, 'public', { kind: 'public', audience: { kind: 'everyone' } });
  return { core, db, bridge, ownBefore };
}

it('lists reachable non-owned Bots with only public metadata for members, Owner and managers', async () => {
  const f = await fixture();
  for (const human of [bob, owner, manager]) {
    const result = f.bridge(human).list({});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('list refused');
    expect(result.value.bots.find((bot) => bot.slug === 'public')).toEqual({
      slug: 'public',
      displayName: 'public',
      avatar: botAvatarUrl('public', PNG),
      primaryColor: { mode: 'custom', color: '#abcdef' },
      paused: false,
      deleted: false,
      sharedBy: { humanId: 'alice', displayName: 'alice' },
      metadataOnly: true,
    });
    expect(result.value.bots.some((bot) => bot.slug === 'private')).toBe(false);
    expect(JSON.stringify(result.value.bots.find((bot) => bot.slug === 'public'))).not.toContain(
      '/private/workspace',
    );
    expect(JSON.stringify(f.bridge(human).list({ query: 'private-role-tag' }))).not.toContain(
      '"slug":"public"',
    );
  }
  const listed = f.bridge(bob).list({});
  if (!listed.ok || !f.ownBefore.ok) throw new Error('list refused');
  expect(listed.value.bots.filter((bot) => bot.slug === 'mine')).toEqual(f.ownBefore.value.bots);
  expect(listed.value.bots.find((bot) => bot.slug === 'mine')).not.toHaveProperty('sharedBy');
  const admin = f.bridge(owner).list({ administration: true });
  if (!admin.ok) throw new Error('administration refused');
  expect(admin.value.bots.filter((bot) => bot.slug === 'public')).toHaveLength(1);
  f.core.registry.setPaused('public', true);
  expect(f.bridge(bob).list({})).toMatchObject({
    ok: true,
    value: {
      bots: expect.arrayContaining([expect.objectContaining({ slug: 'public', paused: true })]),
    },
  });
});

it('retains audience-revoked Bots as read-only metadata only for their DM participant', async () => {
  const f = await fixture(),
    methods = f.bridge(bob);
  const dm = await methods.channelDm({ slug: 'public' });
  if (!dm.ok) throw new Error('DM refused');
  f.core.team.bots.setVisibility(
    alice,
    'public',
    { kind: 'public', audience: { kind: 'members', humanIds: [] } },
    true,
  );
  const list = methods.list({});
  if (!list.ok) throw new Error('list refused');
  expect(list.value.bots.find((bot) => bot.slug === 'public')).toEqual(
    expect.objectContaining({
      metadataOnly: true,
      readOnly: true,
      sharedBy: { humanId: 'alice', displayName: 'alice' },
    }),
  );
  expect(f.core.team.bots.reachable(bob).some((bot) => bot.slug === 'public')).toBe(false);
  const bystander = f.bridge(manager).list({});
  if (!bystander.ok) throw new Error('list refused');
  expect(bystander.value.bots.some((bot) => bot.slug === 'public')).toBe(false);
  expect(await methods.channels({})).toMatchObject({
    ok: true,
    value: {
      channels: expect.arrayContaining([
        expect.objectContaining({ id: dm.value.channel.id, readOnly: true }),
      ]),
    },
  });
  expect(await methods.channelMessages({ channelId: dm.value.channel.id })).toMatchObject({
    ok: true,
  });
  expect(
    await methods.channelSend({ channelId: dm.value.channel.id, body: 'refused' }),
  ).toMatchObject({ ok: false });
  expect(await methods.channelDm({ slug: 'public' })).toMatchObject({
    ok: true,
    value: { channel: { id: dm.value.channel.id, readOnly: true } },
  });
  expect(await f.bridge(manager).channelDm({ slug: 'public' })).toMatchObject({
    ok: false,
    error: { code: 'bot-not-found' },
  });
});

it('retains only participant metadata after returning private and drops it when that DM is removed', async () => {
  const f = await fixture(),
    methods = f.bridge(bob);
  const dm = await methods.channelDm({ slug: 'public' });
  if (!dm.ok) throw new Error('DM refused');
  f.core.team.bots.setVisibility(alice, 'public', { kind: 'private' }, true);
  const list = methods.list({});
  if (!list.ok) throw new Error('list refused');
  const entry = list.value.bots.find((bot) => bot.slug === 'public');
  expect(entry).toEqual({
    slug: 'public',
    displayName: 'public',
    avatar: botAvatarUrl('public', PNG),
    primaryColor: { mode: 'custom', color: '#abcdef' },
    paused: false,
    deleted: false,
    metadataOnly: true,
    sharedBy: { humanId: 'alice', displayName: 'alice' },
    readOnly: true,
  });
  expect(f.core.team.bots.reachable(bob).some((bot) => bot.slug === 'public')).toBe(false);
  const botCaller = f.bridge({ ...bob, caller: 'bot' }).list({});
  if (!botCaller.ok) throw new Error('list refused');
  expect(botCaller.value.bots.some((bot) => bot.slug === 'public')).toBe(false);
  expect(await methods.channelDm({ slug: 'public' })).toMatchObject({
    ok: true,
    value: { channel: { id: dm.value.channel.id, readOnly: true } },
  });
  for (const method of ['get', 'update', 'modelPlan', 'grants', 'sessions'] as const)
    expect(
      await Reflect.apply(methods[method], methods, [
        { slug: 'public', patch: { displayName: 'stolen' } },
      ]),
    ).toMatchObject({ ok: false });
  expect(await methods.channelCreate({ name: 'refused', members: ['public'] })).toMatchObject({
    ok: false,
  });
  f.db.transaction((sql) =>
    sql.prepare('DELETE FROM channel_records WHERE channel_id=?').run(dm.value.channel.id),
  );
  const removed = methods.list({});
  if (!removed.ok) throw new Error('list refused');
  expect(removed.value.bots.some((bot) => bot.slug === 'public')).toBe(false);
  expect(await methods.channelDm({ slug: 'public' })).toMatchObject({
    ok: false,
    error: { code: 'bot-not-found' },
  });
});

it('keeps participant history metadata when the principal is deactivated or the Bot is deleted', async () => {
  const f = await fixture(),
    methods = f.bridge(bob);
  const dm = await methods.channelDm({ slug: 'public' });
  if (!dm.ok) throw new Error('DM refused');
  f.db.transaction((sql) =>
    sql.prepare("UPDATE humans SET status='deactivated' WHERE human_id='alice'").run(),
  );
  expect(methods.list({})).toMatchObject({
    ok: true,
    value: {
      bots: expect.arrayContaining([
        expect.objectContaining({ slug: 'public', readOnly: true, metadataOnly: true }),
      ]),
    },
  });
  expect(await methods.channelDm({ slug: 'public' })).toMatchObject({
    ok: true,
    value: { channel: { id: dm.value.channel.id, readOnly: true } },
  });
  expect(
    await methods.channelSend({ channelId: dm.value.channel.id, body: 'refused' }),
  ).toMatchObject({ ok: false });
  f.db.transaction((sql) =>
    sql.prepare("UPDATE humans SET status='active' WHERE human_id='alice'").run(),
  );
  const preview = f.core.deletions.preview('public');
  await f.core.deletions.confirm('public', preview.token, false);
  expect(methods.list({})).toMatchObject({
    ok: true,
    value: {
      bots: expect.arrayContaining([
        expect.objectContaining({
          slug: 'public',
          readOnly: true,
          deleted: true,
          metadataOnly: true,
        }),
      ]),
    },
  });
  expect(await methods.channelMessages({ channelId: dm.value.channel.id })).toMatchObject({
    ok: true,
  });
});

it('rechecks audience roles, principal status and deletion on the next list', async () => {
  const f = await fixture();
  const role = f.core.team.roles.create(owner, 'Audience', []).role;
  f.core.team.roles.set(owner, 'bob', ['member', role.roleId]);
  f.core.team.bots.setVisibility(
    owner,
    'public',
    { kind: 'public', audience: { kind: 'roles', roleIds: [role.roleId] } },
    true,
  );
  const visible = () => {
    const result = f.bridge(bob).list({});
    if (!result.ok) throw new Error('list refused');
    return result.value.bots.some((bot) => bot.slug === 'public');
  };
  expect(visible()).toBe(true);
  f.core.team.roles.set(owner, 'bob', ['member']);
  expect(visible()).toBe(false);
  f.core.team.roles.set(owner, 'bob', ['member', role.roleId]);
  expect(visible()).toBe(true);
  f.db.transaction((sql) =>
    sql.prepare("UPDATE humans SET status='deactivated' WHERE human_id='alice'").run(),
  );
  expect(visible()).toBe(false);
  f.db.transaction((sql) =>
    sql.prepare("UPDATE humans SET status='active' WHERE human_id='alice'").run(),
  );
  expect(visible()).toBe(true);
  const preview = f.core.deletions.preview('public');
  await f.core.deletions.confirm('public', preview.token, false);
  expect(visible()).toBe(false);
});

it('matches canReach when Team mode is off even if a member status is still active', async () => {
  const f = await fixture();
  expect(f.core.registry.create({ slug: 'owner-public', displayName: 'Owner public' }).ok).toBe(
    true,
  );
  f.core.team.bots.setVisibility(owner, 'owner-public', {
    kind: 'public',
    audience: { kind: 'everyone' },
  });
  expect(f.core.team.bots.canReach(bob, 'owner-public')).toBe(true);
  f.db.transaction((sql) => sql.prepare('UPDATE team_settings SET enabled=0').run());
  expect(f.core.team.bots.canReach(bob, 'owner-public')).toBe(false);
  const result = f.bridge(bob).list({});
  if (!result.ok) throw new Error('list refused');
  expect(result.value.bots.some((bot) => bot.slug === 'owner-public')).toBe(false);
});

it('persists each Human arrangement independently and accepts shared slugs for pin, hide and sections', async () => {
  const f = await fixture(),
    methods = f.bridge(bob);
  expect(await methods.pinsSet({ pins: ['public'] })).toMatchObject({
    ok: true,
    value: { pins: ['public'] },
  });
  expect(await methods.hiddenSet({ hidden: ['public'] })).toMatchObject({
    ok: true,
    value: { hidden: ['public'] },
  });
  const section = await methods.sectionCreate({ name: 'Shared' });
  if (!section.ok) throw new Error('section refused');
  expect(
    await methods.channelAssign({ channelId: 'public', sectionId: section.value.section.id }),
  ).toMatchObject({ ok: true });
  expect(await methods.rosterBatch({ action: 'pin', channelIds: ['public'] })).toMatchObject({
    ok: true,
  });
  const state = methods.rosterGet({});
  expect(state).toMatchObject({
    ok: true,
    value: { pins: ['public'], sections: [{ name: 'Shared', channelIds: ['public'] }] },
  });
  expect(f.bridge(alice).rosterGet({})).toMatchObject({
    ok: true,
    value: { pins: [], sections: [] },
  });
  expect(f.bridge(owner).rosterGet({})).toMatchObject({
    ok: true,
    value: { pins: [], sections: [] },
  });
  const reopened = createRosterStore({ database: f.core.operationalDatabase });
  expect(createBridgeMethodsForHumans({ ...f.core, roster: reopened })(bob).rosterGet({})).toEqual(
    state,
  );
  expect(await methods.pinsSet({ pins: ['private'] })).toMatchObject({
    ok: false,
    error: { code: 'channel-not-found' },
  });
  await reopened.detach();
  await f.core.roster.detach();
  await f.core.roster.attach(createFakeRosterDomain().facility);
  expect(methods.rosterGet({})).toEqual(state);
});

it('opens, reads, sends and pages only the participant DM attention while refusing Bot management', async () => {
  const f = await fixture(),
    methods = f.bridge(bob);
  const opened = await methods.channelDm({ slug: 'public' });
  if (!opened.ok) throw new Error('DM refused');
  const channelId = opened.value.channel.id;
  expect(await methods.channelGet({ channelId })).toMatchObject({
    ok: true,
    value: { channel: { id: channelId } },
  });
  await f.core.channels.appendMessage(alice, 'dm-public', {
    id: 'principal-secret',
    at: '2026-11-15T00:00:00Z',
    author: { kind: 'human' },
    body: 'principal secret',
  });
  expect(await methods.channelSend({ channelId, body: 'participant message' })).toMatchObject({
    ok: true,
  });
  expect(await methods.channelMessages({ channelId })).toMatchObject({
    ok: true,
    value: { messages: [expect.objectContaining({ body: 'participant message' })] },
  });
  expect(await methods.channelTimeline({ channelId })).toMatchObject({ ok: true });
  expect(methods.botAttention({ slug: 'public', channelId: 'dm-public' })).toMatchObject({
    ok: true,
    value: {
      items: [
        expect.objectContaining({ sourceChannelId: channelId, summary: 'participant message' }),
      ],
    },
  });
  expect(JSON.stringify(methods.botAttention({ slug: 'public' }))).not.toContain(
    'principal secret',
  );
  expect(f.bridge(alice).channelMessages({ channelId })).toMatchObject({ ok: false });
  expect(f.bridge({ ...bob, caller: 'bot' }).botAttention({ slug: 'public' })).toMatchObject({
    ok: false,
    error: { code: 'bot-session-private' },
  });
  for (const [method, code] of [
    ['get', 'bot-not-found'],
    ['update', 'bot-not-found'],
    ['modelPlan', 'bot-not-found'],
    ['modelPlanSet', 'bot-not-found'],
    ['botSystemPrompt', 'bot-session-private'],
    ['botTurnInput', 'bot-session-private'],
    ['memorySnapshot', 'not-found'],
    ['grants', 'bot-not-found'],
    ['scheduleList', 'permission-required'],
    ['sessions', 'bot-session-private'],
    ['botVisibility', 'permission-required'],
    ['botSwitches', 'bot-principal-required'],
  ] as const) {
    const payload =
      method === 'memorySnapshot'
        ? { channelId }
        : method === 'update'
          ? { slug: 'public', patch: { displayName: 'stolen' } }
          : { slug: 'public' };
    const result = await Reflect.apply(methods[method], methods, [payload]);
    expect(result, method).toMatchObject({ ok: false, error: { code } });
  }
  expect(f.core.registry.get('public')?.displayName).toBe('public');
});

it('keeps discovery reads constant and never decodes unrelated private records', async () => {
  const f = await fixture();
  const count = () => {
    const before = f.core.operationalDatabase.diagnostics().metrics.reads;
    const result = f.bridge(bob).list({});
    expect(result.ok).toBe(true);
    return f.core.operationalDatabase.diagnostics().metrics.reads - before;
  };
  const before = count();
  f.db.transaction((sql) => {
    for (let i = 0; i < 100; i++) {
      sql
        .prepare(
          'INSERT INTO persona_bots(slug,owner_human_id,body,visibility_json) VALUES (?,?,?,?)',
        )
        .run(
          'shared-' + i,
          'alice',
          JSON.stringify({ displayName: 'Shared ' + i }),
          JSON.stringify({ kind: 'public', audience: { kind: 'everyone' } }),
        );
      sql
        .prepare('INSERT INTO persona_bots(slug,owner_human_id,body) VALUES (?,?,?)')
        .run('hidden-' + i, 'alice', '{"secret":"invalid-private-body"}');
    }
  });
  expect(count()).toBeLessThanOrEqual(before);
  const readBefore = f.core.operationalDatabase.diagnostics().metrics.reads;
  expect(f.core.team.bots.sharedRoster(bob)).toHaveLength(101);
  expect(f.core.operationalDatabase.diagnostics().metrics.reads - readBefore).toBe(1);
});

it('upgrades the prior schema without rewriting the legacy local-Human arrangement', async () => {
  const home = createTempRoot('m7-roster-upgrade-');
  const migration = BOT_HARNESS_SCHEMA_PLAN.migrations.find(
    (m) => m.id === 'human-roster-arrangements',
  );
  if (!migration) throw new Error('missing migration');
  const old = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation < migration.generation),
    ),
  });
  const legacy = createRosterStore({ database: old });
  await legacy.attach(createFakeRosterDomain().facility);
  await legacy.pinsSet(['retained']);
  await legacy.detach();
  old.close();
  const upgraded = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  try {
    const roster = createRosterStore({ database: upgraded });
    expect(roster.snapshot().pins).toEqual(['retained']);
    expect(roster.forHuman('someone').snapshot().pins).toEqual([]);
    await roster.detach();
  } finally {
    upgraded.close();
  }
});

it('allows reachable shared Bot attention filters while keeping results Human-scoped', async () => {
  const f = await fixture();
  const own = f.core.team.bots.dm(bob, 'public')!;
  const foreign = f.core.team.bots.dm(manager, 'public')!;
  for (const [dm, body] of [
    [own, 'bob-only'],
    [foreign, 'manager-only'],
  ] as const)
    await f.core.channels.appendMessage(owner, dm.id, {
      id: body,
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: 'public' },
      body,
    });
  const result = await f.bridge(bob).humanAttention({ botSlug: 'public', category: 'unread' });
  expect(result.ok).toBe(true);
  expect(JSON.stringify(result)).toContain('bob-only');
  expect(JSON.stringify(result)).not.toContain('manager-only');
  expect(await f.bridge(bob).humanAttention({ botSlug: 'private' })).toMatchObject({
    ok: false,
    error: { code: 'bot-not-found' },
  });
});

it('uses each Human roster mute in attention lists, status, notifications and item lookup', async () => {
  const f = await fixture();
  const dm = f.core.team.bots.dm(bob, 'public')!;
  await f.core.channels.appendMessage(owner, dm.id, {
    id: 'unread-muted',
    at: new Date().toISOString(),
    author: { kind: 'bot', slug: 'public' },
    body: 'unread',
  });
  const before = f.core.humanAttention
    .list(bob, { category: 'unread' })
    .items.find((item) => item.channelId === dm.id);
  expect(before).toBeDefined();
  await f.core.roster.forHuman(bob.humanId).mutedSet(dm.id, true);
  expect(
    f.core.humanAttention
      .list(bob, { category: 'unread' })
      .items.some((item) => item.channelId === dm.id),
  ).toBe(false);
  expect(f.core.humanAttention.status(bob, true).unreadCount).toBe(0);
  expect(f.core.humanAttention.item(bob, before!.id, before!.sourceEventId)).toBeUndefined();
  expect(await f.bridge(bob).humanAttention({ notifications: true })).toMatchObject({
    ok: true,
    value: { items: [] },
  });
  expect(f.core.roster.snapshot().muted).toEqual([]);
});

it('shows handled shared-DM questions only to the recorded participant', async () => {
  const f = await fixture();
  const dm = f.core.team.bots.dm(bob, 'public')!;
  await f.core.channels.appendMessage(owner, dm.id, {
    id: 'question',
    at: '2026-11-15T00:00:00Z',
    author: { kind: 'bot', slug: 'public' },
    body: 'Proceed?',
    userQuestionRequest: {
      sessionId: 'session',
      questions: [{ id: 'continue', question: 'Proceed?' }],
    },
  });
  await f.core.channels.appendMessage(bob, dm.id, {
    id: 'answer',
    at: '2026-11-15T00:01:00Z',
    author: { kind: 'human', humanId: bob.humanId },
    body: 'yes',
    replyTo: 'question',
    userQuestionResolution: {
      requestMessageId: 'question',
      state: 'answered',
      answers: [{ id: 'continue', selected: [], custom: 'yes' }],
    },
  });
  expect(f.core.humanAttention.list(bob, { category: 'handled' }).items).toContainEqual(
    expect.objectContaining({ messageId: 'question', category: 'handled', channelId: dm.id }),
  );
  for (const human of [alice, owner, manager])
    expect(f.core.humanAttention.list(human, { category: 'handled' }).items).toEqual([]);
});

it('keeps batch arrangement for a retained read-only DM without restoring Bot access', async () => {
  const f = await fixture(),
    methods = f.bridge(bob);
  const dm = f.core.team.bots.dm(bob, 'public')!;
  expect(await methods.rosterBatch({ action: 'pin', channelIds: ['public'] })).toMatchObject({
    ok: true,
  });
  f.core.team.bots.setVisibility(alice, 'public', { kind: 'private' }, true);
  expect(f.core.team.bots.canReach(bob, 'public')).toBe(false);
  expect(f.core.team.bots.dm(bob, 'public')).toMatchObject({ id: dm.id, readOnly: true });
  const unpinned = await methods.rosterBatch({ action: 'unpin', channelIds: ['public'] });
  expect(unpinned, JSON.stringify(unpinned)).toMatchObject({ ok: true });
  expect(methods.rosterGet({})).toMatchObject({ ok: true, value: { pins: [] } });
  expect(await methods.rosterBatch({ action: 'pin', channelIds: ['private'] })).toMatchObject({
    ok: false,
  });
  expect(f.core.team.bots.canReach(bob, 'public')).toBe(false);
  await expect(
    f.core.channels.appendMessage(bob, dm.id, {
      id: 'after-unpin',
      at: '2026-11-16T00:00:00Z',
      author: { kind: 'human' },
      body: 'still read-only',
    }),
  ).rejects.toMatchObject({ code: 'bot-dm-read-only' });
});
