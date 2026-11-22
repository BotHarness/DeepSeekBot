import { describe, expect, it, vi } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import type { ModelCatalogEntry } from '../src/models/catalog.js';
import { createOpenAssignmentRoutes } from '../src/models/open-assignments.js';
import { createModelPresetStore } from '../src/models/presets.js';
import { createModelRouteReadiness } from '../src/models/readiness.js';
import { requireBotModel } from '../src/team/models.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { permitted, teamModelFixture } from './team-model-fixture.js';

describe('Host Role provider grants', () => {
  it('unions provider and route grants and projects only complete allowed Routing Groups', async () => {
    const f = teamModelFixture();
    const exact = { provider: 'second', model: 'exact' };
    const outside = { provider: 'second', model: 'other' };
    const added = { provider: permitted.provider, model: 'added/later' };
    const entry = (route: { provider: string; model: string }): ModelCatalogEntry => ({
      ...route,
      providerName: route.provider,
      modelName: route.model,
      efforts: [],
    });
    f.catalog.list.mockResolvedValue([entry(permitted), entry(exact), entry(outside)]);
    f.team.roles.update(owner, 'member', {
      models: { kind: 'only', providers: [permitted.provider], routes: [] },
    });
    const supplement = f.team.roles.create(owner, 'Supplement', ['models.use'], {
      kind: 'only',
      providers: ['third', permitted.provider],
      routes: ['second/exact'],
    }).role;
    f.team.roles.set(owner, f.member.humanId, ['member', supplement.roleId]);
    expect(f.team.roles.modelsAllowed(f.member)).toEqual({
      all: false,
      engineAccounts: [],
      providers: ['provider', 'third'],
      routes: ['second/exact'],
    });
    const group = (name: string, other: typeof exact) =>
      f.deps.routingGroups.create({
        name,
        members: [
          { kind: 'model', ...permitted },
          { kind: 'model', ...other },
        ],
      });
    const usable = group('Usable', exact);
    group('Denied', outside);
    const allowanceReads = vi.spyOn(f.team.roles, 'modelsAllowed');
    const catalog = async () => {
      const result = await f.methods.modelCatalog({});
      if (!result.ok) throw new Error(result.error.code);
      expect(result.value.groups?.map(({ id }) => id)).toEqual([usable.id]);
      return result.value.models.map(({ provider, model }) => `${provider}/${model}`);
    };
    expect(await catalog()).toEqual(['provider/allowed', 'second/exact']);
    f.catalog.list.mockResolvedValue([
      entry(permitted),
      entry(exact),
      entry(outside),
      entry(added),
    ]);
    expect(await catalog()).toEqual(['provider/allowed', 'second/exact', 'provider/added/later']);
    expect(allowanceReads).toHaveBeenCalledTimes(2);
    expect(() => f.team.roles.requireModel(f.member, added)).not.toThrow();
    expect(() => f.team.roles.requireModel(f.member, outside)).toThrow(
      expect.objectContaining({ code: 'model-not-allowed' }),
    );
    expect(() =>
      f.team.roles.requireModel(f.member, { provider: 'provider-2', model: 'added/later' }),
    ).toThrow(expect.objectContaining({ code: 'model-not-allowed' }));
  });

  it('lets a delegated role manager grant exact routes from their provider but not widen an exact grant', () => {
    const f = teamModelFixture();
    const role = f.team.roles.create(owner, 'Managers', ['roles.manage', 'members.manage'], {
      kind: 'only',
      providers: ['provider'],
      routes: ['second/exact'],
    }).role;
    f.team.roles.set(owner, f.member.humanId, [role.roleId]);
    const exact = f.team.roles.create(f.member, 'Exact', [], {
      kind: 'only',
      routes: ['provider/one', 'second/exact'],
    }).role;
    const provider = f.team.roles.update(f.member, exact.roleId, {
      models: { kind: 'only', providers: ['provider'], routes: [] },
    }).role;
    expect(f.team.roles.validateAssignments(f.member, [provider.roleId])).toEqual([
      provider.roleId,
    ]);
    const widened = { kind: 'only' as const, providers: ['second'], routes: [] };
    const outside = f.team.roles.create(owner, 'Outside', [], widened).role;
    for (const attempt of [
      () => f.team.roles.create(f.member, 'Invalid provider grant', [], widened),
      () => f.team.roles.update(f.member, provider.roleId, { models: widened }),
      () => f.team.roles.validateAssignments(f.member, [outside.roleId]),
    ])
      expect(attempt).toThrow(
        expect.objectContaining({ code: 'model-not-allowed', details: { route: 'second/*' } }),
      );
  });

  it('checks provider grants for preset application, plan writes and both turn preparations', async () => {
    const f = teamModelFixture();
    const own = { provider: 'provider', model: 'new' };
    const outside = { provider: 'other', model: 'new' };
    const refusal = {
      code: 'model-not-allowed',
      details: { route: 'other/new' },
    };
    const optionOf = (route: typeof own) => ({
      ...route,
      allowedEfforts: [''],
      defaultEffort: '',
    });
    const planOf = (assignmentDefault: typeof own) => ({
      orchestrator: own,
      assignmentDefault,
      assignmentModels: [optionOf(assignmentDefault)],
      openAssignmentModels: true as const,
    });
    f.team.roles.update(owner, 'member', {
      permissions: ['models.use'],
      models: { kind: 'only', providers: ['provider'], routes: [] },
    });
    const modelPresets = createModelPresetStore({ database: f.db, rootDir: f.root });
    const methods = createBridgeMethods(f.member, { ...f.deps, modelPresets });
    const good = modelPresets.create({ name: 'Allowed', ...planOf(own) });
    const bad = modelPresets.create({ name: 'Outside', ...planOf(outside) });
    expect(await methods.modelPresetApply({ slug: 'ada', presetId: bad.id })).toMatchObject({
      ok: false,
      error: refusal,
    });
    expect(
      await methods.modelPlanSet({ slug: 'ada', expectedRevision: 0, ...planOf(outside) }),
    ).toMatchObject({ ok: false, error: refusal });
    expect(await methods.modelPresetApply({ slug: 'ada', presetId: good.id })).toMatchObject({
      ok: true,
    });
    expect(
      await methods.modelPlanAssignmentsSet({
        slug: 'ada',
        expectedRevision: 1,
        ...planOf(outside),
      }),
    ).toMatchObject({ ok: false, error: refusal });
    const requireAllowed = (slug: string, route: typeof own) =>
      requireBotModel(f.team, f.registry.get(slug), route);
    const readiness = createModelRouteReadiness(f.registry, f.catalog, requireAllowed);
    for (const role of ['orchestrator', 'assignment'] as const) {
      await expect(readiness.prepare('ada', role, own)).resolves.toBeUndefined();
      await expect(readiness.prepare('ada', role, outside)).rejects.toMatchObject(refusal);
    }
    const newlyAdded = { provider: own.provider, model: 'another/new' };
    f.catalog.list.mockResolvedValue(
      [own, newlyAdded, outside].map((route) => ({
        ...route,
        providerName: route.provider,
        modelName: route.model,
        efforts: [],
      })),
    );
    const choices = createOpenAssignmentRoutes({
      catalog: f.catalog,
      plan: (slug) => f.registry.get(slug)?.modelPlan,
      requireAllowed,
    });
    expect(await choices.list('ada')).toMatchObject([newlyAdded]);
    await expect(choices.require('ada', newlyAdded)).resolves.toBeUndefined();
    await expect(choices.require('ada', outside)).rejects.toMatchObject(refusal);
  });
});

it('migrates route-only Host Roles with identical route grants and leaves all grants intact', () => {
  const home = createTempRoot('role-model-providers-migration-');
  const migrations = BOT_HARNESS_SCHEMA_PLAN.migrations;
  const before = trackTestOwner(
    mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        migrations.slice(
          0,
          migrations.findIndex(({ id }) => id === 'role-model-providers'),
        ),
      ),
    }),
  );
  const models = { kind: 'only', routes: ['p/nested/model', 'p/another'] };
  attachOperationalModule(before, 'team').transaction((db) =>
    db
      .prepare("UPDATE host_roles SET models_json = ? WHERE role_id = 'member'")
      .run(JSON.stringify(models)),
  );
  before.close();
  const after = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  expect(after.mode).toBe('ready');
  const database = attachOperationalModule(after, 'team');
  expect(
    database.read((db) =>
      db.prepare('SELECT role_id, models_json FROM host_roles ORDER BY role_id').all(),
    ),
  ).toEqual([
    { role_id: 'admin', models_json: '{"kind":"all","engineAccounts":[]}' },
    {
      role_id: 'member',
      models_json: JSON.stringify({ ...models, providers: [], engineAccounts: [] }),
    },
  ]);
  expect(
    database.read((db) =>
      db.prepare("SELECT id FROM schema_migrations WHERE id = 'role-model-providers'").get(),
    ),
  ).toEqual({ id: 'role-model-providers' });
});
