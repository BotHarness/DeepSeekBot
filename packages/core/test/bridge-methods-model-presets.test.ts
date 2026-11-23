import { createTestRegistry } from './registry-fixture.js';
import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createModelPresetStore } from '../src/models/presets.js';
import type { ModelCatalog } from '../src/models/catalog.js';
import { createModelRouteReadiness } from '../src/models/readiness.js';
import { createTestOwnership } from './helpers.js';
import { roots, modelOwners, setup } from './support/bridge-methods.js';

afterEach(() => {
  for (const owner of modelOwners.splice(0)) owner.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bridge methods', () => {
  it('sets a Bot Model Plan directly without a preset and rejects stale revisions', async () => {
    const flash = {
      provider: 'deepseek',
      model: 'flash',
      reasoningEffort: 'high',
    };
    const pro = { provider: 'deepseek', model: 'pro' };
    const catalog: ModelCatalog = {
      list: async () => [],
      validate: async (route) => {
        if (route.provider !== 'deepseek' || !['flash', 'pro'].includes(route.model))
          throw new Error('Selected route is unavailable');
      },
    };
    const { root, registry, methods } = setup(
      [],
      ['ada'],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const assignmentModels = [
      {
        provider: 'deepseek',
        model: 'pro',
        allowedEfforts: [''],
        defaultEffort: '',
      },
    ];
    expect(
      await methods.modelPlanSet({
        slug: 'ada',
        expectedRevision: 0,
        orchestrator: flash,
        assignmentDefault: pro,
        assignmentModels,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        plan: {
          revision: 1,
          sourcePresetId: '',
          sourcePresetName: '',
          orchestrator: flash,
          assignmentDefault: pro,
          assignmentModels,
        },
      },
    });
    expect(
      await methods.modelPlanSet({
        slug: 'ada',
        expectedRevision: 0,
        orchestrator: pro,
        assignmentDefault: pro,
        assignmentModels,
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.modelPlanSet({
        slug: 'ada',
        expectedRevision: 1,
        orchestrator: { provider: 'other', model: 'x' },
        assignmentDefault: pro,
        assignmentModels,
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(createTestRegistry({ rootDir: root }).get('ada')?.modelPlan).toMatchObject({
      revision: 1,
      orchestrator: flash,
    });
  });

  it('preserves a template model set when an older editor omits the choices', async () => {
    const flash = {
      provider: 'deepseek',
      model: 'flash',
      reasoningEffort: 'low',
    };
    const pro = { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' };
    const choices = [
      {
        provider: 'deepseek',
        model: 'flash',
        allowedEfforts: ['low'],
        defaultEffort: 'low',
      },
      {
        provider: 'deepseek',
        model: 'pro',
        allowedEfforts: ['off'],
        defaultEffort: 'off',
      },
    ];
    const catalog: ModelCatalog = {
      list: async () => [],
      validate: async (route) => {
        if (
          route.provider !== 'deepseek' ||
          (route.model === 'flash' && route.reasoningEffort !== 'low') ||
          (route.model === 'pro' && route.reasoningEffort !== 'off') ||
          !['flash', 'pro'].includes(route.model)
        )
          throw new Error('Selected route is unavailable');
      },
    };
    const { methods } = setup(
      [],
      [],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    const created = await methods.modelPresetCreate({
      name: 'Choices',
      orchestrator: flash,
      assignmentDefault: pro,
      assignmentModels: choices,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.preset.id;
    expect(
      await methods.modelPresetUpdate({
        id,
        expectedRevision: 1,
        name: 'Renamed choices',
        orchestrator: flash,
        assignmentDefault: flash,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        preset: {
          revision: 2,
          assignmentDefault: flash,
          assignmentModels: choices,
        },
      },
    });
    expect(
      await methods.modelPresetUpdate({
        id,
        expectedRevision: 2,
        name: 'Invalid default',
        orchestrator: flash,
        assignmentDefault: { ...flash, reasoningEffort: 'high' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });

  it('validates routes and applies independent named Model Preset snapshots to two Bots', async () => {
    const valid = {
      provider: 'deepseek',
      model: 'deepseek-chat',
      reasoningEffort: 'high',
    };
    const catalog: ModelCatalog = {
      list: async () => [
        {
          provider: 'deepseek',
          providerName: 'DeepSeek',
          model: 'deepseek-chat',
          modelName: 'DeepSeek Chat',
          efforts: [{ id: 'high', name: 'High' }],
        },
      ],
      validate: async (route) => {
        if (
          route.provider !== valid.provider ||
          route.model !== valid.model ||
          route.reasoningEffort !== valid.reasoningEffort
        )
          throw new Error('Selected route is unavailable');
      },
    };
    const { registry, methods, modelPresets } = setup(
      [],
      ['ada', 'bea'],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.create({ slug: 'bea', displayName: 'Bea' });
    expect(
      await methods.modelPresetCreate({
        name: 'Invalid',
        orchestrator: { provider: 'missing', model: 'missing' },
        assignmentDefault: valid,
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(modelPresets.list()).toHaveLength(0);
    const created = await methods.modelPresetCreate({
      name: 'Deep thinking',
      orchestrator: valid,
      assignmentDefault: valid,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const first = await methods.modelPresetApply({
      slug: 'ada',
      presetId: created.value.preset.id,
    });
    const second = await methods.modelPresetApply({
      slug: 'bea',
      presetId: created.value.preset.id,
    });
    expect(first).toMatchObject({
      ok: true,
      value: { plan: { revision: 1, orchestrator: valid } },
    });
    expect(second).toMatchObject({
      ok: true,
      value: { plan: { revision: 1, orchestrator: valid } },
    });
    expect(registry.get('ada')?.modelPlan).not.toBe(registry.get('bea')?.modelPlan);
    expect(
      await methods.modelPresetApply({
        slug: 'ada',
        presetId: created.value.preset.id,
      }),
    ).toMatchObject({ ok: true, value: { plan: { revision: 2 } } });
    expect(registry.get('bea')?.modelPlan?.revision).toBe(1);
    expect(await methods.modelPlan({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: { plan: { revision: 2, sourcePresetName: 'Deep thinking' } },
    });
  });

  it('edits a template for future applications and keeps custom Bot snapshots independent across restart', async () => {
    const high = {
      provider: 'deepseek',
      model: 'deepseek-chat',
      reasoningEffort: 'high',
    };
    const low = {
      provider: 'deepseek',
      model: 'deepseek-chat',
      reasoningEffort: 'low',
    };
    const catalog: ModelCatalog = {
      list: async () => [],
      validate: async (route) => {
        if (
          route.provider !== high.provider ||
          route.model !== high.model ||
          !['high', 'low'].includes(route.reasoningEffort ?? '')
        )
          throw new Error('Selected route is unavailable');
      },
    };
    const { root, registry, methods, modelPresets, modelOwner } = setup(
      [],
      ['ada', 'bea'],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.create({ slug: 'bea', displayName: 'Bea' });
    const created = await methods.modelPresetCreate({
      name: 'High intelligence',
      orchestrator: high,
      assignmentDefault: high,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.preset.id;
    expect(await methods.modelPresetApply({ slug: 'ada', presetId: id })).toMatchObject({
      ok: true,
      value: { plan: { revision: 1, orchestrator: high } },
    });

    expect(
      await methods.modelPresetUpdate({
        id,
        expectedRevision: 1,
        name: 'Economy',
        orchestrator: low,
        assignmentDefault: low,
      }),
    ).toMatchObject({
      ok: true,
      value: { preset: { id, revision: 2, name: 'Economy' } },
    });
    expect(
      await methods.modelPresetUpdate({
        id,
        expectedRevision: 1,
        name: 'Stale edit',
        orchestrator: high,
        assignmentDefault: high,
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: 'invalid-input',
        message: expect.stringContaining('changed'),
      },
    });
    expect(modelPresets.get(id)).toMatchObject({
      revision: 2,
      name: 'Economy',
      orchestrator: low,
    });
    expect(registry.get('ada')?.modelPlan).toMatchObject({
      revision: 1,
      sourcePresetName: 'High intelligence',
      orchestrator: high,
    });
    expect(await methods.modelPresetApply({ slug: 'bea', presetId: id })).toMatchObject({
      ok: true,
      value: {
        plan: { revision: 1, sourcePresetName: 'Economy', orchestrator: low },
      },
    });
    expect(await methods.modelPlanCustomize({ slug: 'bea', orchestrator: high })).toMatchObject({
      ok: true,
      value: {
        plan: {
          revision: 2,
          sourcePresetId: '',
          sourcePresetName: '',
          orchestrator: high,
          assignmentDefault: low,
        },
      },
    });
    expect(modelPresets.get(id)).toMatchObject({
      revision: 2,
      orchestrator: low,
    });
    expect(registry.get('ada')?.modelPlan?.revision).toBe(1);
    expect(
      await methods.modelPlanCustomize({
        slug: 'ada',
        orchestrator: { ...high, model: 'missing' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(registry.get('ada')?.modelPlan?.revision).toBe(1);

    const reopened = createTestRegistry({ rootDir: root });
    expect(reopened.get('ada')?.modelPlan).toMatchObject({
      revision: 1,
      orchestrator: high,
    });
    expect(reopened.get('bea')?.modelPlan).toMatchObject({
      revision: 2,
      sourcePresetId: '',
      orchestrator: high,
    });
    expect(createModelPresetStore({ rootDir: root, database: modelOwner }).get(id)).toMatchObject({
      revision: 2,
      orchestrator: low,
    });
  });

  it('creates only an Orchestrator override, validates revisions, and keeps Assignment inheritance at readiness', async () => {
    const route = { provider: 'deepseek', model: 'flash' };
    const validate = vi.fn(async () => undefined);
    const catalog: ModelCatalog = { list: async () => [], validate };
    const { registry, methods } = setup(
      [],
      ['ada'],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const result = await methods.modelPlanCustomize({
      slug: 'ada',
      orchestrator: route,
      expectedRevision: 0,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { plan: { revision: 1, orchestrator: route } },
    });
    expect(registry.get('ada')?.modelPlan).not.toHaveProperty('assignmentDefault');
    expect(registry.get('ada')?.modelPlan).not.toHaveProperty('assignmentModels');
    expect(
      await methods.modelPlanCustomize({
        slug: 'ada',
        orchestrator: route,
        expectedRevision: 0,
      }),
    ).toMatchObject({ ok: false });
    const readiness = createModelRouteReadiness(registry, catalog);
    validate.mockClear();
    await readiness.prepare('ada', 'assignment');
    expect(validate).not.toHaveBeenCalled();
    await readiness.prepare('ada', 'orchestrator');
    expect(validate).toHaveBeenCalledWith(route);
  });
});
