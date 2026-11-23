import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createTestRosterStore } from './roster-fixture.js';
import { createTestRegistry } from './registry-fixture.js';
import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { type ModelRoute } from '../src/models/presets.js';
import type { ModelCatalog } from '../src/models/catalog.js';
import { routingGroupEngineOptions } from '../src/models/routing-group-engine-options.js';
import { createModelRouteReadiness } from '../src/models/readiness.js';
import { createTestOwnership } from './helpers.js';
import { roots, modelOwners, setup } from './support/bridge-methods.js';

it('reads engine status and models only for the opted-in Routing Group catalog', async () => {
  const { registry, states, channels } = setup();
  const status = vi.fn(async () =>
    (
      [
        {
          engine: 'codex',
          displayName: 'Codex',
          installed: true,
          available: true,
          login: 'chatgpt',
        },
        {
          engine: 'claude',
          displayName: 'Claude Code',
          installed: true,
          available: false,
          reason: 'signed-out',
          login: 'signed-out',
        },
      ] as const
    ).map((engine) => ({ ...engine })),
  );
  const models = vi.fn(async (_engine: 'codex' | 'claude') => [
    { id: 'gpt-5.4', name: 'GPT-5.4', efforts: [] },
  ]);
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    registry,
    states,
    channels,
    roster: createTestRosterStore(),
    ownership: createTestOwnership(),
    modelCatalog: { list: async () => [], validate: async () => undefined },
    routingGroupEngineOptions: () => routingGroupEngineOptions({ status, models }),
  });
  await expect(methods.modelCatalog({})).resolves.toEqual({ ok: true, value: { models: [] } });
  expect(status).not.toHaveBeenCalled();
  await expect(methods.modelCatalog({ includeRoutingGroupEngines: true })).resolves.toEqual({
    ok: true,
    value: {
      models: [],
      routingGroupEngines: [
        {
          engine: 'codex',
          available: true,
          models: [{ id: 'gpt-5.4', name: 'GPT-5.4', efforts: [] }],
        },
        { engine: 'claude', available: false, reason: 'signed-out' },
      ],
    },
  });
  expect(status).toHaveBeenCalledOnce();
  expect(models.mock.calls.map(([engine]) => engine)).toEqual(['codex']);
});

afterEach(() => {
  for (const owner of modelOwners.splice(0)) owner.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bridge methods', () => {
  it('returns the inheritance marker from the same Bot snapshot as the revision', async () => {
    const route = { provider: 'selected-provider', model: 'working' };
    const { registry, methods, modelPresets } = setup(
      [],
      ['ada'],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      undefined,
      undefined,
      { list: async () => [], validate: async () => undefined },
    );
    modelPresets.migrateDefault({ main: route });
    const preset = modelPresets.create({
      name: 'Local preset',
      orchestrator: route,
      assignmentDefault: route,
    });
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const pending = methods.modelPlan({ slug: 'ada' });
    const saved = registry.applyModelPreset('ada', preset);
    expect(saved.ok).toBe(true);

    const result = await pending;
    expect(result).toMatchObject({ ok: true, value: { revision: 1 } });
    if (result.ok) expect(result.value.inheritedPresetId).toBeUndefined();
  });

  it('validates an inherited Default Assignment route while keeping the Orchestrator available', async () => {
    const main = { provider: 'selected-provider', model: 'working' };
    const sub = { provider: 'selected-provider', model: 'missing' };
    const { registry, modelPresets } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    modelPresets.migrateDefault({ main, sub });
    const validate = vi.fn(async (route: ModelRoute) => {
      if (route.model === 'missing') throw new Error('Assignment model is unavailable');
    });
    const readiness = createModelRouteReadiness(
      registry,
      { list: async () => [], validate, defaultRoute: () => main },
      undefined,
      () => modelPresets.get('default')?.assignmentDefault,
    );
    await expect(readiness.prepare('ada', 'orchestrator')).resolves.toBeUndefined();
    expect(validate).not.toHaveBeenCalled();
    await expect(readiness.prepare('ada', 'assignment')).rejects.toThrow(
      /selected-provider\/missing.*Assignment model is unavailable.*select an available Model Preset/,
    );
    expect(validate).toHaveBeenCalledExactlyOnceWith(sub);
  });

  it('shows Assignment-default failure in Profile while the Orchestrator route still works', async () => {
    const working = { provider: 'selected-provider', model: 'working' };
    const missing = { provider: 'selected-provider', model: 'missing' };
    const catalog: ModelCatalog = {
      list: async () => [],
      validate: async (route) => {
        if (route.model === 'missing') throw new Error('Assignment model is unavailable');
      },
    };
    const { registry, methods, modelPresets } = setup(
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
    registry.applyModelPreset(
      'ada',
      modelPresets.create({
        name: 'Broken Assignment default',
        orchestrator: working,
        assignmentDefault: missing,
      }),
    );
    expect(await methods.modelPlan({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: {
        plan: { orchestrator: working, assignmentDefault: missing },
        repair: {
          code: 'route-unavailable',
          message: expect.stringContaining('Assignment model is unavailable'),
        },
      },
    });
    const readiness = createModelRouteReadiness(registry, catalog);
    await expect(readiness.prepare('ada', 'orchestrator')).resolves.toBeUndefined();
    await expect(readiness.prepare('ada', 'assignment', missing)).rejects.toThrow(
      'select an available Model Preset',
    );
    const preset = modelPresets.create({
      name: 'Repaired',
      orchestrator: working,
      assignmentDefault: working,
    });
    await methods.modelPresetApply({ slug: 'ada', presetId: preset.id });
    const repaired = await methods.modelPlan({ slug: 'ada' });
    if (!repaired.ok) throw new Error('Profile repair query failed');
    expect(repaired.value.repair).toBeUndefined();
    await expect(readiness.prepare('ada', 'assignment')).resolves.toBeUndefined();
  });

  it('migrates an unambiguous legacy model through the public Profile query and preserves its Agent preset', async () => {
    const catalog: ModelCatalog = {
      list: async () => [
        {
          provider: 'only-provider',
          providerName: 'Only',
          model: 'legacy',
          modelName: 'Legacy',
          efforts: [],
        },
      ],
      validate: async () => undefined,
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
    registry.create({
      slug: 'ada',
      displayName: 'Ada',
      model: 'legacy',
      preset: 'standard',
    });
    expect(await methods.modelPlan({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: {
        plan: {
          revision: 1,
          orchestrator: { provider: 'only-provider', model: 'legacy' },
          assignmentDefault: { provider: 'only-provider', model: 'legacy' },
        },
      },
    });
    const reopened = createTestRegistry({ rootDir: root }).get('ada');
    expect(reopened?.preset).toBe('standard');
    expect(reopened?.model).toBeUndefined();
    expect(reopened?.modelPlan?.revision).toBe(1);
    expect(await methods.modelPlan({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: { plan: { revision: 1 } },
    });
  });

  it.each([
    ['legacy-ambiguous', ['one', 'two']],
    ['legacy-missing', []],
  ] as const)('keeps unresolved legacy models repairable: %s', async (code, providers) => {
    const catalog: ModelCatalog = {
      list: async () =>
        providers.map((provider) => ({
          provider,
          providerName: provider,
          model: 'legacy',
          modelName: 'Legacy',
          efforts: [],
        })),
      validate: async () => {
        throw new Error('A guessed provider must not be validated');
      },
    };
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
    registry.create({
      slug: 'ada',
      displayName: 'Ada',
      model: 'legacy',
      preset: 'standard',
    });
    expect(await methods.modelPlan({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: { repair: { code, legacyModel: 'legacy' } },
    });
    expect(registry.get('ada')?.model).toBe('legacy');
    expect(registry.get('ada')?.modelPlan).toBeUndefined();
    await expect(
      createModelRouteReadiness(registry, catalog).prepare('ada', 'orchestrator'),
    ).rejects.toThrow('select a Model Preset');
  });

  it('keeps an unavailable selected route until Human applies a working preset', async () => {
    const catalog: ModelCatalog = {
      list: async () => [],
      validate: async (route) => {
        if (route.model === 'missing') throw new Error('Credential is unavailable');
      },
    };
    const { registry, methods, modelPresets } = setup(
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
    const missing = { provider: 'selected-provider', model: 'missing' };
    registry.applyModelPreset(
      'ada',
      modelPresets.create({
        name: 'Unavailable',
        orchestrator: missing,
        assignmentDefault: missing,
      }),
    );
    expect(await methods.modelPlan({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: {
        plan: { orchestrator: missing },
        repair: { code: 'route-unavailable' },
      },
    });
    await expect(
      createModelRouteReadiness(registry, catalog).prepare('ada', 'orchestrator'),
    ).rejects.toThrow('Credential is unavailable');
    const working = { provider: 'selected-provider', model: 'working' };
    const preset = modelPresets.create({
      name: 'Repaired',
      orchestrator: working,
      assignmentDefault: working,
    });
    expect(await methods.modelPresetApply({ slug: 'ada', presetId: preset.id })).toMatchObject({
      ok: true,
      value: { plan: { revision: 2, orchestrator: working } },
    });
    expect(await methods.modelPlan({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: { plan: { orchestrator: working } },
    });
    expect((await methods.modelPlan({ slug: 'ada' })).ok).toBe(true);
    await expect(
      createModelRouteReadiness(registry, catalog).prepare('ada', 'orchestrator'),
    ).resolves.toBeUndefined();
  });

  it('saves a Bot-specific Assignment model set and rejects stale or unsupported choices', async () => {
    const flash = {
      provider: 'deepseek',
      model: 'flash',
      reasoningEffort: 'high',
    };
    const pro = { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' };
    const catalog: ModelCatalog = {
      list: async () => [],
      validate: async (route) => {
        const allowed =
          route.model === 'flash' ? ['high', 'low'] : route.model === 'pro' ? ['off'] : [];
        if (route.provider !== 'deepseek' || !allowed.includes(route.reasoningEffort ?? ''))
          throw new Error('Selected route is unavailable');
      },
    };
    const { root, registry, methods, modelPresets } = setup(
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
    const preset = modelPresets.create({
      name: 'High',
      orchestrator: flash,
      assignmentDefault: pro,
    });
    expect(await methods.modelPresetApply({ slug: 'ada', presetId: preset.id })).toMatchObject({
      ok: true,
      value: { plan: { revision: 1 } },
    });
    const assignmentModels = [
      {
        provider: 'deepseek',
        model: 'flash',
        allowedEfforts: ['high', 'low'],
        defaultEffort: 'low',
      },
      {
        provider: 'deepseek',
        model: 'pro',
        allowedEfforts: ['off'],
        defaultEffort: 'off',
      },
    ];
    expect(
      await methods.modelPlanAssignmentsSet({
        slug: 'ada',
        expectedRevision: 1,
        assignmentDefault: pro,
        assignmentModels,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        plan: {
          revision: 2,
          sourcePresetId: '',
          assignmentDefault: pro,
          assignmentModels,
        },
      },
    });
    expect(
      await methods.modelPlanAssignmentsSet({
        slug: 'ada',
        expectedRevision: 1,
        assignmentDefault: flash,
        assignmentModels,
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.modelPlanAssignmentsSet({
        slug: 'ada',
        expectedRevision: 2,
        assignmentDefault: pro,
        assignmentModels: [
          {
            provider: 'deepseek',
            model: 'flash',
            allowedEfforts: ['ultra'],
            defaultEffort: 'ultra',
          },
        ],
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(createTestRegistry({ rootDir: root }).get('ada')?.modelPlan).toMatchObject({
      revision: 2,
      assignmentModels,
    });
    expect(
      await methods.modelPlanAssignmentsSet({
        slug: 'ada',
        expectedRevision: 2,
        assignmentDefault: pro,
        assignmentModels,
        openAssignmentModels: 'yes',
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.modelPlanAssignmentsSet({
        slug: 'ada',
        expectedRevision: 2,
        assignmentDefault: pro,
        assignmentModels,
        openAssignmentModels: true,
      }),
    ).toMatchObject({ ok: true, value: { plan: { revision: 3, openAssignmentModels: true } } });
    expect(
      await methods.modelPlanAssignmentsSet({
        slug: 'ada',
        expectedRevision: 3,
        assignmentDefault: pro,
        assignmentModels,
      }),
    ).toMatchObject({ ok: true, value: { plan: { revision: 4, openAssignmentModels: true } } });
    expect(createTestRegistry({ rootDir: root }).get('ada')?.modelPlan).toMatchObject({
      revision: 4,
      openAssignmentModels: true,
    });
    const closed = await methods.modelPlanAssignmentsSet({
      slug: 'ada',
      expectedRevision: 4,
      assignmentDefault: pro,
      assignmentModels,
      openAssignmentModels: false,
    });
    expect(closed.ok && closed.value.plan).not.toHaveProperty('openAssignmentModels');
    expect(createTestRegistry({ rootDir: root }).get('ada')?.modelPlan).not.toHaveProperty(
      'openAssignmentModels',
    );
  });

  it('checks an IM caller fence after model validation and before changing the saved plan', async () => {
    let authorized = true;
    const catalog: ModelCatalog = {
      list: async () => [],
      validate: async () => {
        authorized = false;
      },
    };
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
    const result = await methods.modelPlanCustomize(
      {
        slug: 'ada',
        orchestrator: { provider: 'deepseek', model: 'flash' },
        expectedRevision: 0,
      },
      () => {
        if (!authorized) throw new Error('Pairing revoked');
      },
    );
    expect(result).toMatchObject({ ok: false });
    expect(registry.get('ada')?.modelPlan).toBeUndefined();
  });

  it('rejects stale customization when a preset is applied during model validation', async () => {
    const high = {
      provider: 'deepseek',
      model: 'flash',
      reasoningEffort: 'high',
    };
    const low = {
      provider: 'deepseek',
      model: 'flash',
      reasoningEffort: 'low',
    };
    let pauseValidation = false;
    let signalValidation: () => void = () => undefined;
    let releaseValidation: () => void = () => undefined;
    const validationStarted = new Promise<void>((resolve) => {
      signalValidation = resolve;
    });
    const validationGate = new Promise<void>((resolve) => {
      releaseValidation = resolve;
    });
    const catalog: ModelCatalog = {
      list: async () => [],
      validate: async () => {
        if (!pauseValidation) return;
        pauseValidation = false;
        signalValidation();
        await validationGate;
      },
    };
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
    const original = await methods.modelPresetCreate({
      name: 'Original',
      orchestrator: high,
      assignmentDefault: high,
    });
    const replacement = await methods.modelPresetCreate({
      name: 'Replacement',
      orchestrator: low,
      assignmentDefault: low,
    });
    if (!original.ok || !replacement.ok) throw new Error('Could not prepare model presets');
    await methods.modelPresetApply({
      slug: 'ada',
      presetId: original.value.preset.id,
    });

    pauseValidation = true;
    const customization = methods.modelPlanCustomize({
      slug: 'ada',
      orchestrator: high,
    });
    await validationStarted;
    expect(
      await methods.modelPresetApply({
        slug: 'ada',
        presetId: replacement.value.preset.id,
      }),
    ).toMatchObject({
      ok: true,
      value: { plan: { revision: 2, orchestrator: low } },
    });
    releaseValidation();
    expect(await customization).toMatchObject({
      ok: false,
      error: {
        code: 'invalid-input',
        message: expect.stringContaining('changed'),
      },
    });
    expect(registry.get('ada')?.modelPlan).toMatchObject({
      revision: 2,
      sourcePresetId: replacement.value.preset.id,
      orchestrator: low,
    });
  });
});
