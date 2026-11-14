import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods, createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { createApprovalTemplateLibrary } from '../src/workspaces/approval-templates.js';
import { join } from 'node:path';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { TeamService } from '../src/team/service.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { MEMBER_BOT_METHODS } from '../src/team/member-methods.js';
import { privateBotRegistry } from '../src/team/bot-access.js';
import { privateBotCreations } from '../src/bots/creation.js';
import { createMemberTobOperations } from '../src/tob/member-operations.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';
import { createFakeRosterDomain, createTestRosterStore } from './roster-fixture.js';
import { ChannelUserQuestions } from '../src/channels/user-questions.js';

const alice = humanContext('alice');
const bob = humanContext('bob');
const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});

function fixture(
  run: (input: OrchestratorAgentRun) => Promise<void> = async () => {},
  autoAcceptGroupInvitations = () => true,
) {
  const core = createCore({
    dshHome: createTempRoot('team-private-bots-'),
    autoAcceptGroupInvitations,
    agents: {
      runOrchestrator: run,
      async runAssignment() {},
      requestAssignment() {
        throw new Error('unexpected-assignment');
      },
      async close() {},
    },
  });
  closes.push(async () => {
    await core.runtime.close();
    core.operationalDatabase.close();
  });
  const database = attachOperationalModule(core.operationalDatabase, 'team');
  database.transaction((db) => {
    for (const human of [alice, bob])
      db.prepare("INSERT INTO humans VALUES (?, ?, 'active', ?)").run(
        human.humanId,
        human.humanId,
        new Date().toISOString(),
      );
    for (const human of [alice, bob])
      db.prepare("INSERT INTO human_roles VALUES (?, 'member')").run(human.humanId);
    db.prepare('UPDATE team_settings SET enabled = 1').run();
  });
  const team = new TeamService(database, core.channels, {
    ensureTob: (human) => core.tob.ensure(human),
  });
  const roster = createTestRosterStore({ database: core.operationalDatabase });
  const methods = createBridgeMethodsForHumans({ ...core, team, roster });
  for (const human of [owner, alice, bob]) {
    const slug = human.humanId === owner.humanId ? 'owner-bot' : human.humanId + '-bot';
    expect(core.registry.create({ slug, displayName: slug, ownerHumanId: human.humanId }).ok).toBe(
      true,
    );
    core.channels.getOrCreateDm(human, slug, slug);
  }
  return { core, database, team, methods, roster };
}

describe('M2 private Bot boundaries', () => {
  it.each(['dm', 'group'] as const)(
    'masks shared questions and permits only an approver to answer in a %s',
    async (kind) => {
      const f = fixture();
      const group = f.core.channels.createGroup(bob, {
        name: 'Questions',
        members: ['bob-bot', 'alice-bot'],
      });
      const channelId = kind === 'group' ? group.id : 'dm-bob-bot';
      const service = new ChannelUserQuestions(f.core.channels, f.core.ownership);
      const answer = vi.spyOn(service, 'answer').mockResolvedValue(true);
      const methods = createBridgeMethodsForHumans({
        ...f.core,
        team: f.team,
        userQuestions: service,
      });
      for (const slug of ['bob-bot', 'alice-bot'])
        await f.core.channels.appendMessage(bob, kind === 'group' ? group.id : 'dm-' + slug, {
          id: 'question-' + slug,
          at: new Date().toISOString(),
          author: { kind: 'bot', slug },
          body: 'Pick one',
          userQuestionRequest: {
            sessionId: 'session-' + slug,
            questions: [{ id: 'pick', question: 'Pick', options: [{ label: 'Yes' }] }],
          },
        });
      for (const method of ['userQuestionStatus', 'userQuestionAnswer'] as const) {
        const input = {
          channelId,
          messageId: 'question-bob-bot',
          answer: { answers: [{ id: 'pick', selected: ['Yes'] }] },
        };
        expect(await methods(bob)[method](input)).toMatchObject({ ok: true });
        expect(
          await methods(bob)[method]({
            ...input,
            channelId: kind === 'group' ? group.id : 'dm-alice-bot',
            messageId: 'question-alice-bot',
          }),
        ).toMatchObject(
          kind === 'dm'
            ? { ok: false, error: { code: 'bot-not-found' } }
            : method === 'userQuestionStatus'
              ? { ok: true, value: { approval: { masked: true } } }
              : { ok: false, error: { code: 'approval-not-allowed' } },
        );
      }
      expect(answer).toHaveBeenCalledExactlyOnceWith(
        'bob-bot',
        'question-bob-bot',
        { answers: [{ id: 'pick', selected: ['Yes'] }] },
        bob,
      );
      service.close();
    },
  );

  it.each([
    'update',
    'setMemoryDir',
    'setAppearance',
    'setBanner',
    'setPrimaryColor',
    'setPaused',
    'setComputerAccess',
    'setBrowserAccess',
    'setBrowserProfile',
    'setApprovalTemplate',
    'setVoice',
    'setAsr',
    'setMarketplaceListing',
    'setPromptSettings',
    'setStandingLimits',
    'inheritModel',
    'applyModelPreset',
    'migrateLegacyModel',
    'customizeModelPlan',
    'setAssignmentModels',
    'setModelPlan',
  ] as const)('keeps scoped Registry %s writes inside the owning Human', (method) => {
    const f = fixture();
    const scoped = privateBotRegistry(f.core.registry, bob);
    const before = f.core.registry.retainedRecordBody('alice-bot');
    expect(Reflect.apply(scoped[method], scoped, ['alice-bot', {}])).toEqual({
      ok: false,
      reason: 'not-found',
    });
    expect(f.core.registry.retainedRecordBody('alice-bot')).toBe(before);
    expect(scoped.update('bob-bot', { displayName: 'Owned update' })).toMatchObject({ ok: true });
  });

  it('keeps scoped Registry removal and retained Memory reads private', () => {
    const f = fixture();
    const scoped = privateBotRegistry(f.core.registry, bob);
    expect(scoped.remove('alice-bot')).toBe(false);
    expect(scoped.memoryDirFor('alice-bot')).toBeUndefined();
    expect(scoped.retainedRecordBody('alice-bot')).toBeUndefined();
    expect(scoped.memoryDirFor('bob-bot')).toBeDefined();
  });

  it('clears deleted global preset and template references across private Bots without listing them', () => {
    const f = fixture();
    const methods = createBridgeMethods(owner, {
      ...f.core,
      team: f.team,
      approvalTemplates: createApprovalTemplateLibrary(
        join(f.core.registry.rootDir, '..', 'approval-templates'),
      ),
    });
    const created = methods.promptPresetCreate({
      name: 'Shared preset',
      parts: { triage: 'Review this.' },
    });
    if (!created.ok) throw new Error('preset-create-failed');
    const id = created.value.preset.id;
    const template = 'shared-policy';
    expect(
      methods.approvalTemplateCreate({ name: template, text: '# Shared\n\nReview first.\n' }),
    ).toMatchObject({ ok: true });
    for (const slug of ['owner-bot', 'alice-bot', 'bob-bot']) {
      f.core.registry.setPromptSettings(slug, { preset: id });
      f.core.registry.setApprovalTemplate(slug, template);
    }
    expect(methods.approvalTemplates({})).toMatchObject({
      ok: true,
      value: {
        templates: expect.arrayContaining([
          expect.objectContaining({ name: template, usedBy: ['owner-bot'] }),
        ]),
      },
    });
    expect(methods.promptPresetDelete({ id })).toMatchObject({
      ok: true,
      value: { clearedBots: ['owner-bot'] },
    });
    expect(methods.approvalTemplateDelete({ name: template })).toMatchObject({
      ok: true,
      value: { clearedBots: ['owner-bot'] },
    });
    for (const slug of ['owner-bot', 'alice-bot', 'bob-bot']) {
      expect(f.core.registry.get(slug)?.promptPreset).toBeUndefined();
      expect(f.core.registry.get(slug)?.approvalTemplate).toBeUndefined();
    }
  });

  it.each([false, true])(
    'resolves longer owned mention labels before private-prefix checks (selected=%s)',
    async (selected) => {
      const f = fixture();
      f.core.registry.update('bob-bot', { displayName: 'Research Assistant' });
      f.core.registry.update('alice-bot', { displayName: 'Research' });
      const group = f.core.channels.createGroup(bob, {
        name: 'Mention group',
        members: ['bob-bot', 'alice-bot'],
      });
      const result = await f.methods(bob).channelSend({
        channelId: group.id,
        body: '@Research Assistant help',
        ...(selected
          ? { mentions: [{ botSlug: 'bob-bot', label: 'Research Assistant', start: 0, end: 19 }] }
          : {}),
      });
      expect(result).toMatchObject({ ok: true });
      expect(
        await f.methods(bob).channelSend({ channelId: group.id, body: '@Research help' }),
      ).toMatchObject({ ok: false, error: { code: 'bot-not-found' } });
    },
  );

  it('hides handled Group requests when the requesting Bot owner leaves', async () => {
    const f = fixture();
    const group = f.core.channels.createGroup(bob, {
      name: 'Former membership secret',
      members: ['bob-bot'],
    });
    await f.core.channels.appendMessage(bob, group.id, {
      id: 'request',
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: 'bob-bot' },
      body: 'Handled secret',
      userQuestionRequest: {
        sessionId: 'handled-session',
        questions: [{ id: 'pick', question: 'Pick', options: [{ label: 'Yes' }] }],
      },
    });
    await f.core.channels.appendMessage(bob, group.id, {
      id: 'response',
      at: new Date().toISOString(),
      author: { kind: 'human', humanId: bob.humanId },
      body: 'Done',
      replyTo: 'request',
      userQuestionResolution: {
        requestMessageId: 'request',
        state: 'answered',
        answers: [{ id: 'pick', selected: ['Yes'] }],
      },
    });
    expect(f.core.humanAttention.list(bob, { category: 'handled' }).items).toHaveLength(1);
    f.database.transaction((db) =>
      db
        .prepare(
          'UPDATE channel_human_members SET left_at = ? WHERE channel_id = ? AND human_id = ?',
        )
        .run(new Date().toISOString(), group.id, bob.humanId),
    );
    expect(f.core.humanAttention.list(bob, { category: 'handled' }).items).toEqual([]);
  });

  it('retries a member-owned Bot with the authorized Human instead of the Owner', async () => {
    let runs = 0;
    const f = fixture(async () => {
      if (++runs === 1) throw new Error('transport');
    });
    await f.core.channels.appendMessage(bob, 'dm-bob-bot', {
      id: 'retry-member',
      at: new Date().toISOString(),
      author: { kind: 'human', humanId: bob.humanId },
      body: 'Retry me',
    });
    const admission = f.core.runtime.admitDmMessage(bob, {
      channelId: 'dm-bob-bot',
      messageId: 'retry-member',
      body: 'Retry me',
    });
    if (!admission.admitted) throw new Error('admission-failed');
    await admission.settled.catch(() => {});
    await f.core.runtime.whenIdle();
    await f.core.runtime.retryDmMessage!('dm-bob-bot', 'retry-member', bob);
    await f.core.runtime.whenIdle();
    expect(runs).toBe(2);
  });

  it.each(['create', 'createLookup'] as const)(
    'requires bots.create on every member %s invocation',
    (method) => {
      const f = fixture();
      const bridge = f.methods(bob);
      const reader = f.team.roles.create(owner, 'Reader', ['models.use']).role;
      f.team.roles.set(owner, bob.humanId, [reader.roleId]);
      const payload = { displayName: 'Permission guarded', operationKey: 'permission-guard-0001' };
      const denied = {
        ok: false,
        error: {
          code: 'permission-required',
          message: 'permission-required',
          details: { permission: 'bots.create' },
        },
      };
      expect(bridge[method](payload)).toEqual(denied);
      expect(f.core.registry.list('bob').map((bot) => bot.slug)).toEqual(['bob-bot']);
      const creator = f.team.roles.create(owner, 'Creator', ['bots.create']).role;
      f.team.roles.set(owner, bob.humanId, [reader.roleId, creator.roleId]);
      expect(bridge[method](payload)).toMatchObject({ ok: true });
      f.team.roles.set(owner, bob.humanId, [reader.roleId]);
      expect(bridge[method](payload)).toEqual(denied);
      expect(f.methods(owner)[method](payload)).toMatchObject({ ok: true });
    },
  );

  it('blocks cached Bot reads, sends, creation and runtime admission after suspension', async () => {
    const f = fixture();
    const bridge = f.methods(bob);
    expect(bridge.get({ slug: 'bob-bot' })).toMatchObject({ ok: true });
    await f.team.suspend(owner, bob.humanId);
    for (const method of ['create', 'createLookup'] as const)
      expect(
        bridge[method]({ displayName: 'Suspended', operationKey: 'suspended-create-0001' }),
      ).toMatchObject({
        ok: false,
        error: { code: 'permission-required', details: { permission: 'bots.create' } },
      });
    expect(bridge.get({ slug: 'bob-bot' })).toMatchObject({
      ok: false,
      error: { code: 'member-suspended' },
    });
    expect(
      await bridge.channelSend({ channelId: 'dm-bob-bot', body: 'Must not send' }),
    ).toMatchObject({ ok: false, error: { code: 'member-suspended' } });
    expect(
      f.core.runtime.admitDmMessage(bob, {
        channelId: 'dm-bob-bot',
        messageId: 'suspended-request',
        body: 'Must not run',
      }),
    ).toMatchObject({ admitted: false });
    expect(f.core.channels.readMessages('dm-bob-bot')).toEqual([]);
  });

  it('rechecks Tob creation permission after preparation and for recovered receipts', async () => {
    const f = fixture();
    const ops = createMemberTobOperations({
      bridge: f.methods(bob),
      registry: privateBotRegistry(f.core.registry, bob),
      creations: privateBotCreations(f.core.creations, bob),
      isProtectedBot: (slug) => f.core.tob.isTob(slug),
    });
    const args = { displayName: 'Tob managed', operationKey: 'tob-permission-0001' };
    const prepared = await ops('create', args);
    expect(prepared).toBeDefined();
    const reader = f.team.roles.create(owner, 'Reader', []).role;
    f.team.roles.set(owner, bob.humanId, [reader.roleId]);
    await expect(Promise.resolve().then(() => prepared!.run(() => {}))).rejects.toThrow(
      'permission-required',
    );
    f.team.roles.set(owner, bob.humanId, ['member']);
    await prepared!.run(() => {});
    const recovered = await ops('create', args);
    f.team.roles.set(owner, bob.humanId, [reader.roleId]);
    await expect(ops('create', args)).rejects.toThrow('permission-required');
    await expect(Promise.resolve().then(() => recovered!.run(() => {}))).rejects.toThrow(
      'permission-required',
    );
  });

  it('follows transferred Owner authority without transferring private Bot content', async () => {
    const f = fixture();
    await f.roster.attach(createFakeRosterDomain().facility);
    await f.roster.pinsSet(['dm-owner-bot']);
    const previous = f.methods(owner);
    const incoming = f.methods(bob);
    f.database.transaction((db) => {
      db.prepare('UPDATE team_settings SET owner_human_id = ?').run('bob');
      db.prepare('DELETE FROM human_roles WHERE human_id = ?').run('bob');
      db.prepare("INSERT INTO human_roles VALUES ('local-human', 'member')").run();
    });
    expect(incoming.create({ displayName: 'Owner with no roles' })).toMatchObject({ ok: true });
    expect(incoming.list({ administration: true })).toMatchObject({ ok: true });
    expect(incoming.rosterGet({})).toMatchObject({ ok: true, value: { pins: [] } });
    const home = await incoming.onboarding({});
    expect(home).toMatchObject({ ok: true, value: { tutorial: 'skipped' } });
    expect(JSON.stringify(home)).not.toContain('owner-bot');
    expect(previous.list({ administration: true })).toMatchObject({
      ok: false,
      error: { code: 'permission-required' },
    });
    expect(incoming.channelMessages({ channelId: 'dm-owner-bot' })).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
    await f.team.suspend(bob, owner.humanId);
    expect(
      f.core.runtime.admitDmMessage(owner, {
        channelId: 'dm-owner-bot',
        messageId: 'suspended-former-owner',
        body: 'Must not run',
      }),
    ).toMatchObject({ admitted: false });
  });

  it('projects a joined public Group without Owner management or third-party pending data', () => {
    let autoAccept = false;
    const f = fixture(undefined, () => autoAccept);
    const carol = humanContext('carol');
    f.database.transaction((db) => {
      db.prepare("INSERT INTO humans VALUES (?, ?, 'active', ?)").run(
        carol.humanId,
        'Carol',
        new Date().toISOString(),
      );
    });
    f.core.registry.create({ slug: 'carol-bot', displayName: 'Carol Bot', ownerHumanId: 'carol' });
    const group = f.core.channels.createGroup(owner, {
      name: 'Public working group',
      members: ['owner-bot', 'bob-bot'],
    });
    f.team.setPublic(owner, group.id, true);
    f.team.joinPublic(bob, group.id);
    f.core.channels.setGroupWakePolicy(group.id, 'owner-bot', {
      mode: 'digest',
      count: 17,
      intervalSeconds: 43,
    });
    const invited = f.core.registry.get('alice-bot')!;
    const invitation = f.core.channels.inviteGroupBot({
      channelId: group.id,
      inviterHuman: true,
      targetBotSlug: invited.slug,
      targetBotCreatedAt: invited.createdAt,
      targetDmChannelId: 'dm-alice-bot',
    });
    const requester = f.core.registry.get('carol-bot')!;
    const request = f.core.channels.requestGroupJoin({
      channelId: group.id,
      requesterBotSlug: requester.slug,
      requesterBotCreatedAt: requester.createdAt,
    });
    expect(invitation.status).toBe('pending');
    expect(request.status).toBe('pending');
    const administrative = f.methods(owner).channelGet({ channelId: group.id });
    expect(administrative).toMatchObject({
      ok: true,
      value: {
        channel: {
          members: ['owner-bot'],
          invitations: [invitation],
          joinRequests: [request],
        },
        invitationPolicy: { autoAccept: false },
        wakePolicies: expect.arrayContaining([
          expect.objectContaining({
            botSlug: 'owner-bot',
            policy: expect.objectContaining({ count: 17 }),
          }),
        ]),
      },
    });
    const visible = f.methods(bob).channelGet({ channelId: group.id });
    expect(visible).toMatchObject({
      ok: true,
      value: { channel: { id: group.id, name: group.name, members: ['bob-bot'] } },
    });
    if (!visible.ok) throw new Error('member-group-read-refused');
    expect(Object.keys(visible.value).sort()).toEqual([
      'admins',
      'channel',
      'policy',
      'policyRevision',
      'role',
      'visibility',
    ]);
    for (const key of ['invitations', 'joinRequests', 'wakePolicies', 'ownerBotSlug'])
      expect(visible.value.channel).not.toHaveProperty(key);
    for (const marker of [
      'owner-bot',
      'alice-bot',
      'carol-bot',
      invitation.id,
      request.id,
      'digest',
      '"humanId":"alice"',
      '"humanId":"carol"',
    ])
      expect(JSON.stringify(visible.value)).not.toContain(marker);
    expect(visible.value.channel).toHaveProperty(
      'humanMembers',
      expect.arrayContaining([expect.objectContaining({ humanId: 'bob' })]),
    );
    autoAccept = true;
    f.core.channels.setGroupWakePolicy(group.id, 'owner-bot', {
      mode: 'silent',
      count: 29,
      intervalSeconds: 71,
    });
    const after = f.methods(bob).channelGet({ channelId: group.id });
    if (!after.ok) throw new Error('member-group-read-refused');
    expect(Object.keys(after.value).sort()).toEqual([
      'admins',
      'channel',
      'policy',
      'policyRevision',
      'role',
      'visibility',
    ]);
    expect(after.value.channel.members).toEqual(['bob-bot']);
    expect(after.value).not.toHaveProperty('channelFingerprint');
    expect(
      f.methods(bob).channelSendStatus({ channelId: group.id, messageId: 'owner-private-request' }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(f.methods(alice).channelGet({ channelId: group.id })).toMatchObject({
      ok: true,
      value: { channel: { members: [] }, visibility: { kind: 'public' } },
    });
    expect(
      f
        .methods(alice)
        .channelSendStatus({ channelId: group.id, messageId: 'owner-private-request' }),
    ).toMatchObject({ ok: false, error: { code: 'channel-not-found' } });
    expect(f.core.channels.get(group.id)?.invitations).toContainEqual(invitation);
    expect(f.core.channels.get(group.id)?.joinRequests).toContainEqual(request);
  });

  it.each([
    ['tobHome', {}],
    ['onboarding', {}],
    ['create', { displayName: 'Bobs new Bot' }],
    ['createLookup', { operationKey: 'missing-operation-0001' }],
    ['modelCatalog', {}],
    ['modelPresets', {}],
    ['humanAttention', {}],
    ['humanAttentionStatus', { messageCounts: true }],
    ['humanAttentionDismiss', {}],
    ['humanAttentionDismissAll', {}],
    ['humanAttentionIgnore', {}],
    ['humanAttentionSnooze', { until: null }],
    ['humanAttentionRestore', {}],
    ['activitySnapshot', {}],
    ['botSessionIds', {}],
    ['channelGet', { channelId: 'dm-bob-bot' }],
    ['channelSendStatus', { channelId: 'dm-bob-bot', operationKey: 'missing-send-0001' }],
  ] as const)(
    'keeps newly allowed %s responses free of other Humans data',
    async (method, payload) => {
      const f = fixture();
      for (const human of [owner, alice]) {
        const slug = human === owner ? 'owner-bot' : 'alice-bot';
        await f.core.channels.appendMessage(human, 'dm-' + slug, {
          id: 'private-reply-' + slug,
          at: new Date().toISOString(),
          author: { kind: 'bot', slug },
          body: 'confidential-content-' + slug,
          grantRequest: true,
        });
      }
      const foreign = f.core.humanAttention.list(alice, { category: 'action' }).items[0]!;
      const input = {
        ...payload,
        ...(method.startsWith('humanAttention') &&
        !['humanAttention', 'humanAttentionStatus', 'humanAttentionDismissAll'].includes(method)
          ? {
              itemId: foreign.id,
              sourceKey: foreign.sourceEventId ?? '',
              sourceEventId: foreign.sourceEventId ?? 'missing-source',
            }
          : {}),
      };
      const bridge = f.methods(bob);
      const result: unknown = await Reflect.apply(bridge[method], bridge, [input]);
      const serialized = JSON.stringify(result);
      for (const marker of ['alice-bot', 'owner-bot', 'confidential-content', foreign.id])
        expect(serialized).not.toContain(marker);
      expect(f.core.humanAttention.list(alice, { category: 'action' }).items).toHaveLength(1);
      expect(f.core.humanAttention.list(owner, { category: 'action' }).items).toHaveLength(1);
    },
  );

  it('scopes newly allowed followActivity baseline and changes to the subscribing Human', async () => {
    const f = fixture();
    const abort = new AbortController();
    const frames = f.core.live.followActivity(bob, abort.signal)[Symbol.asyncIterator]();
    try {
      const baseline = await frames.next();
      expect(JSON.stringify(baseline.value)).toContain('bob-bot');
      expect(JSON.stringify(baseline.value)).not.toMatch(/alice-bot|owner-bot/);
      f.core.states.setApprovalCount('alice-bot', 7);
      f.core.states.setApprovalCount('bob-bot', 1);
      const changed = await frames.next();
      expect(changed.value).toMatchObject({ type: 'changed' });
      expect(JSON.stringify(changed.value)).toContain('bob-bot');
      expect(JSON.stringify(changed.value)).not.toMatch(/alice-bot|owner-bot/);
    } finally {
      abort.abort();
      await frames.return?.();
    }
  });

  it.each(MEMBER_BOT_METHODS)(
    'refuses %s against another member before reading or mutating it',
    async (method) => {
      const f = fixture();
      const payload =
        method === 'botStop'
          ? { botSlug: 'alice-bot' }
          : ['botAvatarSet', 'botBannerSet', 'botAppearanceSet', 'botPrimaryColorSet'].includes(
                method,
              )
            ? { channelId: 'dm-alice-bot' }
            : { slug: 'alice-bot' };
      const result = await f.methods(bob)[method](payload);
      expect(result).toEqual({
        ok: false,
        error: { code: 'bot-not-found', message: 'bot-not-found' },
      });
      expect(f.core.registry.get('alice-bot')?.displayName).toBe('alice-bot');
    },
  );

  it('scopes roster, DM, settings and session aggregates to the caller and keeps Owner administration out of content', async () => {
    const f = fixture();
    for (const human of [owner, alice, bob]) {
      const slug = human.humanId === owner.humanId ? 'owner-bot' : human.humanId + '-bot';
      const listed = f.methods(human).list({});
      expect(listed).toMatchObject({
        ok: true,
        value: { bots: [{ slug, ownerHumanId: human.humanId, owner: true }] },
      });
      if (!listed.ok) throw new Error('list-refused');
      expect(listed.value.bots).toHaveLength(1);
      const channels = await f.methods(human).channels({});
      expect(JSON.stringify(channels)).toContain('dm-' + slug);
      expect(JSON.stringify(channels)).not.toContain(human === alice ? 'bob-bot' : 'alice-bot');
      expect(f.methods(human).botSessionIds({})).toMatchObject({
        ok: true,
        value: { groups: [{ botSlug: slug }] },
      });
      expect(f.methods(human).activitySnapshot({})).toMatchObject({
        ok: true,
        value: { bots: [{ slug }] },
      });
    }
    const administrative = f.methods(owner).list({ administration: true });
    expect(administrative).toMatchObject({
      ok: true,
      value: {
        bots: expect.arrayContaining([
          expect.objectContaining({ slug: 'alice-bot', owner: false }),
        ]),
      },
    });
    expect(f.methods(bob).list({ administration: true })).toMatchObject({
      ok: false,
      error: { code: 'permission-required' },
    });
    expect(f.methods(owner).get({ slug: 'alice-bot' })).toMatchObject({
      ok: true,
      value: { bot: { owner: false } },
    });
    expect(f.methods(owner).channelMessages({ channelId: 'dm-alice-bot' })).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
    expect(
      f.methods(bob).update({ slug: 'bob-bot', patch: { displayName: 'Bobby' } }),
    ).toMatchObject({ ok: true });
    expect(f.methods(bob).get({ slug: 'bob-bot' })).toMatchObject({
      ok: true,
      value: { bot: { displayName: 'Bobby' } },
    });
  });

  it('filters private Bot DMs from cross-Channel search, activity and message counts', async () => {
    const f = fixture();
    await f.roster.attach(createFakeRosterDomain().facility);
    for (const [human, slug] of [
      [owner, 'owner-bot'],
      [alice, 'alice-bot'],
      [bob, 'bob-bot'],
    ] as const)
      await f.core.channels.appendMessage(human, 'dm-' + slug, {
        id: 'search-' + slug,
        at: '2026-11-14T00:00:00Z',
        author: { kind: 'bot', slug },
        body: 'private-search-needle',
      });
    for (const [human, slug] of [
      [owner, 'owner-bot'],
      [alice, 'alice-bot'],
      [bob, 'bob-bot'],
    ] as const) {
      expect(
        f.core.channels.searchAllHumanMessages?.(human, { text: 'private-search', limit: 20 }),
      ).toMatchObject({ hits: [{ channelId: 'dm-' + slug }] });
      const result = f.methods(human).messageSearch({ text: 'private-search', limit: 20 });
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      expect(result).toMatchObject({
        ok: true,
        value: { hits: [{ channelId: 'dm-' + slug }] },
      });
      expect([...(f.core.channels.latestBotActivity?.(human) ?? new Map()).keys()]).toEqual([slug]);
      expect(
        f.core.channels.humanMessageCounts?.(human, '2026-11-13T00:00:00Z', '2026-11-15T00:00:00Z'),
      ).toEqual([{ channelId: 'dm-' + slug, author: { kind: 'bot', slug }, count: 1 }]);
      expect(f.core.channels.latestHumanMessageId?.(human, 'dm-alice-bot')).toBe(
        human === alice ? 'search-alice-bot' : undefined,
      );
    }
  });

  it('requires both Bot ownership and the Channel addBots policy for member invitations', () => {
    const f = fixture();
    const group = f.core.channels.createGroup(owner, { name: 'Invitations', members: [] });
    f.team.channelAccess.addMember(owner, group.id, bob.humanId);
    const invite = (botSlug: string) =>
      f.methods(bob).channelGroupInvite({ channelId: group.id, botSlug });
    expect(invite('bob-bot')).toMatchObject({
      ok: false,
      error: { code: 'permission-required', details: { permission: 'addBots' } },
    });
    expect(invite('alice-bot')).toMatchObject({ ok: false, error: { code: 'bot-not-found' } });
    f.team.channelAccess.policySet(owner, group.id, {
      ...f.team.channelAccess.view(owner, group.id).policy,
      addBots: 'everyone',
    });
    expect(invite('alice-bot')).toMatchObject({ ok: false, error: { code: 'bot-not-found' } });
    expect(invite('bob-bot')).toMatchObject({ ok: true });
    expect(f.core.channels.get(group.id)?.members).toContain('bob-bot');
    expect(f.core.channels.get(group.id)?.members).not.toContain('alice-bot');
  });

  it('namespaces creation receipts, ignores supplied ownership and prepares only the member DM', () => {
    const f = fixture();
    const input = { operationKey: 'same-key-00001', displayName: 'Created', ownerHumanId: 'alice' };
    const a = f.methods(alice).create(input);
    const b = f.methods(bob).create(input);
    expect(a).toMatchObject({ ok: true, value: { bot: { ownerHumanId: 'alice' } } });
    expect(b).toMatchObject({ ok: true, value: { bot: { ownerHumanId: 'bob' } } });
    if (!a.ok || !b.ok) throw new Error('creation-refused');
    expect(a.value.bot.slug).not.toBe(b.value.bot.slug);
    expect(f.methods(bob).create(input)).toEqual(b);
    expect(f.methods(bob).createLookup(input)).toMatchObject({
      ok: true,
      value: { receipt: { botSlug: b.value.bot.slug, operationKey: input.operationKey } },
    });
    expect(f.team.belongs(bob, b.value.channelId!)).toBe(true);
    expect(f.team.belongs(alice, b.value.channelId!)).toBe(false);
  });

  it('refuses cross-member DM reads, sends, references, explicit mentions and group additions', async () => {
    const f = fixture();
    const shared = f.core.channels.createGroup(bob, {
      name: 'Shared',
      members: ['bob-bot', 'alice-bot'],
    });
    for (const method of ['channelDm', 'channelMessages', 'channelSend'] as const) {
      expect(
        await f
          .methods(bob)
          [method]({ slug: 'alice-bot', channelId: 'dm-alice-bot', body: 'private' }),
      ).toMatchObject({ ok: false, error: { code: 'bot-not-found' } });
    }
    expect(
      await f.methods(bob).channelSend({
        channelId: shared.id,
        body: 'Hello',
        mentions: [{ botSlug: 'alice-bot', label: 'Alice', start: 0, end: 5 }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'bot-not-found' } });
    expect(
      await f.methods(bob).channelCreate({ name: 'Private', members: ['alice-bot'] }),
    ).toMatchObject({ ok: false });
    expect(f.core.channels.readMessages('dm-alice-bot')).toEqual([]);
  });

  it('creates one private Tob per member concurrently and scopes member onboarding', async () => {
    const f = fixture();
    const [a, b, again] = await Promise.all([
      f.core.tob.ensure(alice),
      f.core.tob.ensure(bob),
      f.core.tob.ensure(bob),
    ]);
    expect(b).toEqual(again);
    expect(a.botSlug).not.toBe(b.botSlug);
    expect(f.core.tob.slug(bob)).toBe(b.botSlug);
    expect(f.core.registry.get(b.botSlug)?.ownerHumanId).toBe('bob');
    expect(await f.methods(bob).tobHome({})).toMatchObject({ ok: true, value: b });
    expect(await f.methods(bob).onboarding({})).toMatchObject({
      ok: true,
      value: { defaultBotSlug: b.botSlug, channelId: b.channelId },
    });
    expect(f.methods(alice).get({ slug: b.botSlug })).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
    const ops = createMemberTobOperations({
      bridge: f.methods(bob),
      registry: privateBotRegistry(f.core.registry, bob),
      creations: privateBotCreations(f.core.creations, bob),
      isProtectedBot: (slug) => f.core.tob.isTob(slug),
    });
    await expect(ops('show', { slug: 'alice-bot' })).rejects.toThrow('bot-not-found');
    for (const argv of [
      ['settings'],
      ['devices'],
      ['members', 'list'],
      ['im-apps'],
      ['data-reset-preview'],
      ['model-catalog'],
    ])
      await expect((await ops('cli', { argv }))!.run(() => {})).rejects.toThrow(
        'permission-required',
      );
    const listed = await (await ops('cli', { argv: ['list'] }))!.run(() => {});
    expect(JSON.stringify(listed)).toContain('bob-bot');
    expect(JSON.stringify(listed)).not.toContain('alice-bot');
  });

  it('isolates Activity items, unread counts and read/dismiss state in the durable projection', async () => {
    const f = fixture();
    for (const human of [owner, alice, bob]) {
      const slug = human === owner ? 'owner-bot' : human.humanId + '-bot';
      await f.core.channels.appendMessage(human, 'dm-' + slug, {
        id: 'reply-' + slug,
        at: new Date().toISOString(),
        author: { kind: 'bot', slug },
        body: 'secret-' + slug,
        grantRequest: true,
      });
    }
    for (const human of [owner, alice, bob]) {
      const slug = human === owner ? 'owner-bot' : human.humanId + '-bot';
      const items = f.core.humanAttention.list(human, { category: 'action' }).items;
      expect(items).toHaveLength(1);
      expect(items[0]?.botSlug).toBe(slug);
      expect(f.methods(human).humanAttentionStatus({ messageCounts: true })).toMatchObject({
        ok: true,
        value: { unreadCount: 1, hasAction: true },
      });
      expect(f.methods(human).channelUnreadCounts({})).toMatchObject({
        ok: true,
        value: { channels: [{ channelId: 'dm-' + slug, unreadCount: 1 }] },
      });
    }
    const action = f.core.humanAttention.list(bob, { category: 'action' }).items[0]!;
    expect(
      await f
        .methods(bob)
        .humanAttentionDismiss({ itemId: action.id, sourceKey: action.sourceEventId ?? '' }),
    ).toMatchObject({ ok: true });
    expect(f.core.humanAttention.list(bob, { category: 'action' }).items).toHaveLength(0);
    expect(f.core.humanAttention.list(alice, { category: 'action' }).items).toHaveLength(1);
  });

  it('attributes shared Group replies to the canonical Source Event Human before reading counts', async () => {
    const f = fixture();
    const group = f.core.channels.createGroup(owner, {
      name: 'Shared replies',
      members: ['owner-bot'],
    });
    f.team.setPublic(owner, group.id, true);
    f.team.joinPublic(bob, group.id);
    await f.core.channels.appendMessage(bob, group.id, {
      id: 'bob-group-request',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Bob asks',
    });
    await f.core.channels.appendMessage(owner, group.id, {
      id: 'reply-for-bob',
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: 'owner-bot' },
      body: 'Reply for Bob',
      replyTo: 'bob-group-request',
    });
    expect(f.core.humanAttention.list(bob, { category: 'replies' }).items).toMatchObject([
      { messageId: 'reply-for-bob' },
    ]);
    expect(f.core.humanAttention.list(owner, { category: 'replies' }).items).toEqual([]);
    expect(f.core.humanAttention.list(alice, { category: 'replies' }).items).toEqual([]);
    expect(f.core.humanAttention.status(bob, true).messageCounts).toMatchObject({ replies: 1 });
    await f.core.channels.markRead(bob, group.id, 'reply-for-bob');
    expect(f.core.humanAttention.status(bob).unreadCount).toBe(0);
    expect(f.core.humanAttention.status(owner).unreadCount).toBe(1);
  });

  it('runs the real member Bot tool path without exposing or messaging another member Bot', async () => {
    let core: ReturnType<typeof createCore>;
    const outcomes: unknown[] = [];
    const prompts: string[] = [];
    const f = fixture(async (run) => {
      if (run.bot.slug !== 'bob-bot') return;
      prompts.push(run.message);
      outcomes.push(await run.channels.contacts());
      try {
        await run.channels.sendToBot({ botSlug: 'alice-bot', body: 'Must not send' });
      } catch (error) {
        outcomes.push(error instanceof Error ? error.message : error);
      }
      try {
        await run.channels.contacts({ botId: 'alice-bot' });
      } catch (error) {
        outcomes.push(error instanceof Error ? error.message : error);
      }
      const group = run.channels.createGroup('Bobs group');
      try {
        run.channels.inviteGroup({ channelId: group.id, targetBotSlug: 'alice-bot' });
      } catch (error) {
        outcomes.push(error instanceof Error ? error.message : error);
      }
      expect(core.channels.readMessages('dm-alice-bot')).toEqual([]);
    });
    core = f.core;
    core.channels.setHumanDefaultName(owner, 'Confidential Owner Name');
    core.channels.setHumanDefaultName(bob, 'Bob Runtime');
    await core.channels.appendMessage(bob, 'dm-bob-bot', {
      id: 'trigger',
      at: new Date().toISOString(),
      author: { kind: 'human', humanId: 'bob' },
      body: 'inspect own colleagues',
    });
    core.runtime.admitDmMessage(bob, {
      channelId: 'dm-bob-bot',
      messageId: 'trigger',
      body: 'inspect own colleagues',
    });
    await core.runtime.whenIdle();
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('Bob Runtime');
    expect(prompts[0]).not.toContain('Confidential Owner Name');
    expect(outcomes).toEqual([
      { outputLimit: 12000, contacts: [] },
      'bot-not-found',
      'bot-not-found',
      'bot-not-found',
    ]);
  });
});
