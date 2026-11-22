import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createModelPresetStore } from '../src/models/presets.js';
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
  let route = permitted;
  const deps = {
    registry,
    channels,
    team,
    states: createBotStateTracker(),
    ownership: createTestOwnership(),
    roster: createTestRosterStore({ database: db }),
    modelPresets: createModelPresetStore({ database: db, rootDir }),
    routingGroups: createRoutingGroupStore({ database: db }),
    modelCatalog: {
      list: async () => [
        { ...permitted, modelName: 'Allowed', providerName: 'Provider', efforts: [] },
      ],
      validate: async () => {},
    },
    defaultModel: {
      currentSelection: () => route,
      saveSelection: vi.fn(async (selection: typeof permitted) => {
        route = selection;
      }),
    },
  };
  return { registry, team, member, deps, methods: createBridgeMethods(member, deps) };
}

describe('Shared model configuration', () => {
  const plan = { name: 'Daily', orchestrator: permitted, assignmentDefault: permitted };
  const group = {
    name: 'Daily routes',
    members: [{ kind: 'model', ...permitted }],
  } satisfies RoutingGroupInput;
  const defaultChoice = { expectedRevision: 0, route: permitted, globalDefault: true };

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
    expect(f.deps.defaultModel.saveSelection).not.toHaveBeenCalled();

    expect(await f.methods.modelCatalog({})).toMatchObject({
      ok: true,
      value: { default: permitted },
    });
    expect(f.methods.modelGroups({})).toMatchObject({
      ok: true,
      value: { groups: [routingGroup] },
    });
    const listBots = vi.spyOn(f.registry, 'list');
    expect(f.methods.modelPresets({})).toMatchObject({ ok: true, value: { presets: [preset] } });
    expect(listBots).not.toHaveBeenCalled();
    expect(f.methods.modelPresets({ includeUsage: true })).toMatchObject({
      ok: true,
      value: { presets: [preset], usage: [{ presetId: preset.id, count: 1, botNames: [] }] },
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
    expect(f.deps.defaultModel.saveSelection).toHaveBeenCalledExactlyOnceWith(permitted);
    const delegate = f.team.roles.create(f.member, 'Model configurator', ['models.configure']).role;
    f.team.roles.set(owner, f.member.humanId, [delegate.roleId]);

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
      value: { usage: [{ presetId: preset.id, count: 1, botNames: ['Ada'] }] },
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
