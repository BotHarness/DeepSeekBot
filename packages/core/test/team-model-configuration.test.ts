import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import {
  createModelPresetStore,
  resolveBotModelPlan,
  selectAssignmentGroup,
  selectAssignmentRoute,
} from '../src/models/presets.js';
import { createRoutingGroupStore, type RoutingGroupInput } from '../src/models/routing-groups.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { TeamService } from '../src/team/service.js';
import { createTempRoot, createTestOwnership } from './helpers.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { createTestRosterStore } from './roster-fixture.js';

const permitted = { provider: 'provider', model: 'allowed' };

function fixture() {
  const rootDir = createTempRoot('team-model-configuration-');
  const registry = createTestRegistry({ rootDir });
  const db = registryDatabase(rootDir);
  const database = attachOperationalModule(db, 'team');
  const channels = createSqliteChannelStore({ database, rootDir: join(rootDir, 'channels') });
  const team = new TeamService(database, channels);
  const member = humanContext('model-config-member');
  database.transaction(
    (connection) => {
      connection
        .prepare("INSERT INTO humans VALUES (?, 'Member', 'active', '2026-11-20')")
        .run(member.humanId);
      connection.prepare('UPDATE team_settings SET enabled = 1').run();
    },
    ['team'],
  );
  registry.create({ slug: 'ada', displayName: 'Ada', ownerHumanId: member.humanId });
  registry.create({ slug: 'bob', displayName: 'Bob' });
  const modelPresets = createModelPresetStore({ database: db, rootDir });
  const pinned = modelPresets.migrateDefault({ main: permitted }).preset;
  const deps = {
    registry,
    channels,
    team,
    states: createBotStateTracker(),
    ownership: createTestOwnership(),
    roster: createTestRosterStore({ database: db }),
    modelPresets,
    routingGroups: createRoutingGroupStore({ database: db }),
    modelCatalog: {
      list: async () => [
        { ...permitted, modelName: 'Allowed', providerName: 'Provider', efforts: [] },
      ],
      validate: async () => {},
    },
  };
  return { registry, team, member, deps, pinned, methods: createBridgeMethods(member, deps) };
}

describe('Shared model configuration', () => {
  const plan = { name: 'Daily', orchestrator: permitted, assignmentDefault: permitted };
  const group = {
    name: 'Daily routes',
    members: [{ kind: 'model', ...permitted }],
  } satisfies RoutingGroupInput;
  const defaultChoice = { expectedRevision: 0, route: permitted, globalDefault: true };

  it('requires configure and model grants to replace sub; preserves the pinned preset and revision', async () => {
    const f = fixture();
    const denied = { provider: 'provider', model: 'denied' };
    const role = f.team.roles.create(owner, 'Restricted presets', ['models.use']).role;
    f.team.roles.set(owner, f.member.humanId, [role.roleId]);
    const group = f.deps.routingGroups.create({
      name: 'Fallback',
      members: [{ kind: 'model', ...denied }],
    });
    const routing = { kind: 'group', group: group.id };
    const sub = { choices: [routing], default: routing };
    const request = { id: f.pinned.id, expectedRevision: f.pinned.revision, sub };
    expect(f.methods.modelPresetSub({ id: f.pinned.id })).toMatchObject({
      ok: true,
      value: { sub: { choices: [], default: null } },
    });
    expect(await f.methods.modelPresetSubSet(request)).toMatchObject({
      ok: false,
      error: { code: 'permission-required' },
    });
    f.team.roles.update(owner, role.roleId, {
      permissions: ['models.use', 'models.configure'],
      models: { kind: 'only', routes: ['provider/allowed'] },
    });
    expect(await f.methods.modelPresetSubSet(request)).toMatchObject({
      ok: false,
      error: { code: 'model-not-allowed' },
    });
    const ownerMethods = createBridgeMethods(owner, f.deps);
    expect(await ownerMethods.modelPresetSubSet(request)).toMatchObject({
      ok: true,
      value: { id: 'default', revision: 2, sub },
    });
    expect(f.methods.modelPresetSub({ id: f.pinned.id })).toMatchObject({
      ok: false,
      error: { code: 'model-not-allowed' },
    });
    expect(await ownerMethods.modelPresetSubSet(request)).toMatchObject({
      ok: false,
      error: { code: 'stale-setting' },
    });
    expect(
      await ownerMethods.modelPresetSubSet({
        ...request,
        expectedRevision: 2,
        sub: { choices: [], default: null },
      }),
    ).toMatchObject({ ok: true, value: { revision: 3, sub: { choices: [], default: null } } });
  });

  it('gates all shared writes and leaves the shared reads and Bot preset application available', async () => {
    const f = fixture();
    const preset = f.deps.modelPresets.create(plan);
    const routingGroup = f.deps.routingGroups.create(group);
    f.registry.applyModelPreset('bob', preset);
    const use = f.team.roles.create(owner, 'Model use', ['models.use']).role;
    f.team.roles.set(owner, f.member.humanId, [use.roleId]);

    const refuse = {
      ok: false,
      error: { code: 'permission-required', details: { permission: 'models.configure' } },
    };
    expect(await f.methods.onboardingModel(defaultChoice)).toMatchObject(refuse);
    expect(await f.methods.modelGroupCreate(group)).toMatchObject(refuse);
    expect(
      await f.methods.modelGroupUpdate({ ...group, id: routingGroup.id, expectedRevision: 1 }),
    ).toMatchObject(refuse);
    expect(f.methods.modelGroupDelete({ id: routingGroup.id, expectedRevision: 1 })).toMatchObject(
      refuse,
    );
    expect(await f.methods.modelPresetCreate(plan)).toMatchObject(refuse);
    expect(
      await f.methods.modelPresetUpdate({ ...plan, id: preset.id, expectedRevision: 1 }),
    ).toMatchObject(refuse);
    expect(
      f.methods.modelPresetDelete({ id: preset.id, expectedRevision: 1, confirmed: true }),
    ).toMatchObject(refuse);
    expect(
      await f.methods.modelPresetUpdate({ ...plan, id: f.pinned.id, expectedRevision: 1 }),
    ).toMatchObject(refuse);
    expect(
      f.methods.modelPresetDelete({ id: f.pinned.id, expectedRevision: 1, confirmed: true }),
    ).toMatchObject(refuse);
    expect(f.deps.modelPresets.get(f.pinned.id)).toEqual(f.pinned);

    expect(await f.methods.modelCatalog({})).toMatchObject({
      ok: true,
      value: { default: permitted },
    });
    expect(f.methods.modelGroups({})).toMatchObject({
      ok: true,
      value: { groups: [routingGroup] },
    });
    const listBots = vi.spyOn(f.registry, 'list');
    expect(f.methods.modelPresets({})).toMatchObject({
      ok: true,
      value: { presets: [f.pinned, preset] },
    });
    expect(listBots).not.toHaveBeenCalled();
    expect(f.methods.modelPresets({ includeUsage: true })).toMatchObject({
      ok: true,
      value: {
        presets: [f.pinned, preset],
        usage: [
          { presetId: f.pinned.id, count: 1, botNames: ['Ada'] },
          { presetId: preset.id, count: 1, botNames: [] },
        ],
      },
    });
    expect(listBots).toHaveBeenCalledTimes(1);
    expect(await f.methods.modelPresetApply({ slug: 'ada', presetId: preset.id })).toMatchObject({
      ok: true,
    });
    expect(await f.methods.modelPresetApply({ slug: 'bob', presetId: preset.id })).toMatchObject({
      ok: false,
    });
  });

  it('allows the default Admin and an explicit configure-only grant to write', async () => {
    const f = fixture();
    f.team.roles.set(owner, f.member.humanId, ['admin']);
    expect(await f.methods.onboardingModel(defaultChoice)).toMatchObject({ ok: true });
    expect(f.deps.modelPresets.get(f.pinned.id)).toMatchObject({
      revision: 2,
      orchestrator: permitted,
      assignmentFollowsMain: true,
    });
    const delegate = f.team.roles.create(f.member, 'Model configurator', ['models.configure']).role;
    f.team.roles.set(owner, f.member.humanId, [delegate.roleId]);

    expect(
      await f.methods.modelPresetUpdate({
        ...plan,
        id: f.pinned.id,
        name: 'Renamed',
        expectedRevision: 2,
      }),
    ).toMatchObject({
      ok: true,
      value: { preset: { id: f.pinned.id, name: 'Renamed', revision: 3 } },
    });
    expect(
      f.methods.modelPresetDelete({ id: f.pinned.id, expectedRevision: 3, confirmed: true }),
    ).toMatchObject({
      ok: false,
      error: { code: 'default-preset-pinned' },
    });

    const createdGroup = await f.methods.modelGroupCreate(group);
    if (!createdGroup.ok) throw new Error(createdGroup.error.message);
    const id = createdGroup.value.group.id;
    expect(
      await f.methods.modelGroupUpdate({
        ...group,
        name: 'Revised routes',
        id,
        expectedRevision: 1,
      }),
    ).toMatchObject({ ok: true, value: { group: { revision: 2 } } });
    expect(f.methods.modelGroupDelete({ id, expectedRevision: 2 })).toMatchObject({ ok: true });

    const created = await f.methods.modelPresetCreate(plan);
    if (!created.ok) throw new Error(created.error.message);
    const preset = created.value.preset;
    expect(
      await f.methods.modelPresetUpdate({
        ...plan,
        name: 'Revised',
        id: preset.id,
        expectedRevision: 1,
      }),
    ).toMatchObject({ ok: true, value: { preset: { revision: 2 } } });
    f.registry.applyModelPreset('ada', preset);
    expect(f.methods.modelPresets({ includeUsage: true })).toMatchObject({
      value: {
        usage: [
          { presetId: f.pinned.id, count: 1, botNames: [] },
          { presetId: preset.id, count: 1, botNames: ['Ada'] },
        ],
      },
    });
    expect(f.methods.modelPresetDelete({ id: preset.id, expectedRevision: 2 })).toMatchObject({
      ok: false,
      error: { code: 'confirmation-required' },
    });
    expect(
      f.methods.modelPresetDelete({ id: preset.id, expectedRevision: 1, confirmed: true }),
    ).toMatchObject({ ok: false, error: { code: 'stale-setting' } });
    expect(
      f.methods.modelPresetDelete({ id: preset.id, expectedRevision: 2, confirmed: true }),
    ).toEqual({ ok: true, value: { id: preset.id } });
    expect(f.deps.modelPresets.get(preset.id)).toBeUndefined();
    expect(f.registry.get('ada')?.modelPlan).toMatchObject({
      sourcePresetId: preset.id,
      sourcePresetName: 'Daily',
    });
  });
});

const alternate = { provider: 'provider', model: 'alternate', reasoningEffort: 'high' };
const alternateSelection = {
  kind: 'model',
  provider: alternate.provider,
  model: alternate.model,
} as const;
const customSub = {
  choices: [
    { ...alternateSelection, allowedEfforts: ['high'], defaultEffort: 'high', note: 'Long tasks' },
  ],
  default: alternateSelection,
};
const followMain = { choices: [], default: null };

describe('Bot Model Plan sub choices', () => {
  it('derives legacy choices and replaces them with one revision and a runtime-readable projection', async () => {
    const f = fixture();
    const methods = createBridgeMethods(owner, f.deps);
    const legacy = f.registry.setModelPlan(
      'bob',
      {
        orchestrator: permitted,
        assignmentDefault: permitted,
        assignmentModels: [{ ...permitted, allowedEfforts: [''], defaultEffort: '' }],
        openAssignmentModels: true,
      },
      0,
    );
    expect(legacy.ok).toBe(true);
    expect(methods.modelPlanSub({ slug: 'bob' })).toMatchObject({
      ok: true,
      value: {
        slug: 'bob',
        revision: 1,
        legacyOpen: true,
        sub: { default: { kind: 'model', ...permitted } },
      },
    });
    const request = { slug: 'bob', expectedRevision: 1, sub: customSub };
    expect(await methods.modelPlanSubSet(request)).toEqual({
      ok: true,
      value: { slug: 'bob', revision: 2, sub: customSub },
    });
    const saved = f.registry.get('bob')?.modelPlan;
    expect(saved).toMatchObject({
      orchestrator: permitted,
      assignmentDefault: alternate,
      assignmentModels: [
        {
          provider: alternate.provider,
          model: alternate.model,
          allowedEfforts: ['high'],
          defaultEffort: 'high',
          note: 'Long tasks',
        },
      ],
      sub: customSub,
      revision: 2,
    });
    if (saved === undefined) throw new Error('Expected a saved Model Plan');
    expect(selectAssignmentRoute(saved)).toEqual(alternate);
    expect(saved.openAssignmentModels).toBeUndefined();
    await expect(methods.modelPlanSubSet(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid-input', message: expect.stringContaining('changed') },
    });
    await expect(
      methods.modelPlanSubSet({
        ...request,
        expectedRevision: 2,
        sub: { choices: customSub.choices, default: null },
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    await expect(
      createBridgeMethods({ ...owner, caller: 'bot' }, f.deps).modelPlanSubSet({
        ...request,
        expectedRevision: 2,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'permission-required' } });
    expect(f.registry.get('bob')?.modelPlan).toEqual(saved);
  });

  it('projects a selected group, then follows the current main route or group', async () => {
    const f = fixture();
    const methods = createBridgeMethods(owner, f.deps);
    const mainGroup = f.deps.routingGroups.create({
      name: 'Main',
      members: [{ kind: 'model', ...permitted }],
    });
    const subGroup = f.deps.routingGroups.create({
      name: 'Sub',
      members: [{ kind: 'model', ...alternate }],
    });
    const selection = { kind: 'group', group: subGroup.id } as const;
    const sub = { choices: [{ ...selection, note: 'Fallback' }], default: selection };
    expect(
      await methods.modelPlanSet({
        slug: 'bob',
        expectedRevision: 0,
        orchestratorGroupId: mainGroup.id,
        sub,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        plan: {
          revision: 1,
          sub,
          orchestratorGroupId: mainGroup.id,
          assignmentDefaultGroupId: subGroup.id,
          assignmentGroupOptions: [{ group: subGroup.id, note: 'Fallback' }],
        },
      },
    });
    const grouped = f.registry.get('bob')?.modelPlan;
    if (grouped === undefined) throw new Error('Expected a grouped Model Plan');
    expect(selectAssignmentGroup(grouped)).toBe(subGroup.id);
    expect(
      await methods.modelPlanSubSet({
        slug: 'bob',
        expectedRevision: 1,
        sub: followMain,
      }),
    ).toMatchObject({ ok: true, value: { revision: 2, sub: followMain } });
    const inherited = f.registry.get('bob')?.modelPlan;
    expect(inherited?.assignmentGroups).toEqual([mainGroup.id]);
    expect(inherited?.assignmentDefaultGroupId).toBe(mainGroup.id);
    expect(
      await methods.modelPlanCustomize({
        slug: 'bob',
        expectedRevision: 2,
        orchestrator: alternate,
      }),
    ).toMatchObject({ ok: true });
    const direct = f.registry.get('bob')?.modelPlan;
    if (direct === undefined) throw new Error('Expected a direct Model Plan');
    expect(selectAssignmentGroup(direct)).toBeUndefined();
    expect(selectAssignmentRoute(direct)).toEqual(alternate);
    const effective = resolveBotModelPlan({ modelPlan: direct }, () => undefined);
    if (effective === undefined) throw new Error('Expected an effective Model Plan');
    expect(selectAssignmentRoute(effective, alternate)).toEqual(alternate);
    expect(methods.modelPlanSub({ slug: 'bob' })).toMatchObject({ value: { sub: followMain } });
  });

  it('checks Bot ownership, model grants and engine grants for direct and grouped choices', async () => {
    const f = fixture();
    const role = f.team.roles.create(owner, 'Restricted Plan', [
      'models.use',
      'models.configure',
    ]).role;
    f.team.roles.set(owner, f.member.humanId, [role.roleId]);
    f.team.roles.update(owner, role.roleId, {
      models: { kind: 'only', routes: ['provider/allowed'] },
    });
    expect(
      await f.methods.modelPlanSet({
        slug: 'ada',
        orchestrator: permitted,
        sub: followMain,
        expectedRevision: 0,
      }),
    ).toMatchObject({ ok: true });
    expect(f.methods.modelPlanSub({ slug: 'bob' })).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
    expect(f.methods.modelPlanSub({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: { slug: 'ada', sub: followMain },
    });
    const routingGroup = f.deps.routingGroups.create({
      name: 'Denied',
      members: [{ kind: 'model', ...alternate }],
    });
    const group = { kind: 'group', group: routingGroup.id };
    const engine = { kind: 'engine', engine: 'codex', accountId: 'denied-account' };
    for (const sub of [
      customSub,
      { choices: [group], default: group },
      { choices: [engine], default: engine },
    ]) {
      await expect(
        f.methods.modelPlanSubSet({ slug: 'ada', expectedRevision: 1, sub }),
      ).resolves.toMatchObject({ ok: false, error: { code: 'model-not-allowed' } });
    }
    expect(f.registry.get('ada')?.modelPlan?.revision).toBe(1);
  });

  it('validates offered efforts before committing and serializes competing writes by revision', async () => {
    const f = fixture();
    const validate = vi.spyOn(f.deps.modelCatalog, 'validate');
    const methods = createBridgeMethods(owner, f.deps);
    expect(
      await methods.modelPlanSet({
        slug: 'bob',
        expectedRevision: 0,
        orchestrator: permitted,
        sub: followMain,
      }),
    ).toMatchObject({ ok: true });
    validate.mockRejectedValueOnce(new Error('Unknown effort'));
    const request = { slug: 'bob', expectedRevision: 1, sub: customSub };
    expect(await methods.modelPlanSubSet(request)).toMatchObject({ ok: false });
    expect(f.registry.get('bob')?.modelPlan?.revision).toBe(1);
    validate.mockClear();
    const outcomes = await Promise.all([
      methods.modelPlanSubSet(request),
      methods.modelPlanSubSet(request),
    ]);
    expect(outcomes.map(({ ok }) => ok).sort()).toEqual([false, true]);
    expect(validate).toHaveBeenCalledTimes(2);
    expect(f.registry.get('bob')?.modelPlan?.revision).toBe(2);
  });
});

describe('Atomic main and sub choices', () => {
  it('creates and updates presets with the new main and sub in one revision each', async () => {
    const f = fixture();
    const methods = createBridgeMethods(owner, f.deps);
    const fields = { name: 'Combined', orchestrator: permitted, sub: customSub };
    const created = await methods.modelPresetCreate(fields);
    expect(created).toMatchObject({
      ok: true,
      value: { preset: { ...fields, revision: 1, assignmentDefault: alternate } },
    });
    if (!created.ok) throw new Error('Expected a saved preset');
    const { id } = created.value.preset;
    const update = {
      id,
      name: 'Renamed',
      expectedRevision: 1,
      orchestrator: alternate,
      sub: followMain,
    };
    expect(await methods.modelPresetUpdate(update)).toMatchObject({
      ok: true,
      value: {
        preset: {
          name: 'Renamed',
          revision: 2,
          orchestrator: alternate,
          sub: followMain,
          assignmentDefault: alternate,
          assignmentFollowsMain: true,
        },
      },
    });
    expect(f.deps.modelPresets.get(id)?.assignmentModels).toBeUndefined();
    expect(await methods.modelPresetUpdate(update)).toMatchObject({
      ok: false,
      error: { code: 'stale-setting' },
    });
  });

  it('rejects mixed payloads on all combined writes and enforces team grants before any write', async () => {
    const f = fixture();
    const role = f.team.roles.create(owner, 'Restricted combination', [
      'models.use',
      'models.configure',
    ]).role;
    f.team.roles.set(owner, f.member.humanId, [role.roleId]);
    f.team.roles.update(owner, role.roleId, {
      models: { kind: 'only', routes: ['provider/allowed'] },
    });
    const preset = { name: 'Restricted', orchestrator: permitted, sub: customSub };
    const update = { ...preset, id: f.pinned.id, expectedRevision: f.pinned.revision };
    const plan = { slug: 'ada', orchestrator: permitted, sub: customSub, expectedRevision: 0 };
    const requests = [
      () => f.methods.modelPresetCreate(preset),
      () => f.methods.modelPresetUpdate(update),
      () => f.methods.modelPlanSet(plan),
    ];
    const legacy = { assignmentDefault: permitted };
    for (const result of await Promise.all([
      f.methods.modelPresetCreate({ ...preset, ...legacy }),
      f.methods.modelPresetUpdate({ ...update, ...legacy }),
      f.methods.modelPlanSet({ ...plan, ...legacy }),
    ]))
      expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    for (const request of requests)
      await expect(request()).resolves.toMatchObject({
        ok: false,
        error: { code: 'model-not-allowed' },
      });
    expect(f.deps.modelPresets.list()).toHaveLength(1);
    expect(f.deps.modelPresets.get(f.pinned.id)).toEqual(f.pinned);
    expect(f.registry.get('ada')?.modelPlan).toBeUndefined();
  });
});
