import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAttachmentStore } from '../src/attachments/store.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createChannelStore } from '../src/channels/store.js';
import { mountOperationalDatabase, type OperationalDatabaseOwner } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { EngineRefusal } from '../src/engines/engine-session.js';
import type { BridgeMethodsDeps } from '../src/bridge/methods.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createModelPresetStore } from '../src/models/presets.js';
import { createRoutingGroupStore } from '../src/models/routing-groups.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTestOwnership } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { createTestRosterStore } from './roster-fixture.js';

const GO = { kind: 'model' as const, provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
const DEEPSEEK = { kind: 'model' as const, provider: 'deepseek', model: 'deepseek-v4.1-flash' };
const PRO = { kind: 'model' as const, provider: 'deepseek', model: 'deepseek-v4-pro' };
const ROUTE = { provider: 'deepseek', model: 'deepseek-v4.1-flash' };
const roots: string[] = [];
const owners: OperationalDatabaseOwner[] = [];

afterEach(() => {
  for (const owner of owners.splice(0)) owner.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setup(
  rests: { provider: string; model: string; until: string }[] = [],
  onValidate: () => void = () => undefined,
  subscriptionEngines?: BridgeMethodsDeps['subscriptionEngines'],
) {
  const root = mkdtempSync(join(tmpdir(), 'bh-preset-groups-'));
  roots.push(root);
  const database = mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  owners.push(database);
  const registry = createTestRegistry({ rootDir: root, database });
  const modelPresets = createModelPresetStore({ rootDir: root, database });
  const routingGroups = createRoutingGroupStore({ database, references: () => [] });
  const attachments = createAttachmentStore({ rootDir: join(root, 'attachments') });
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    registry,
    modelPresets,
    ...(subscriptionEngines === undefined ? {} : { subscriptionEngines }),
    routingGroups,
    modelCatalog: {
      list: async () =>
        [GO, DEEPSEEK, PRO].map(({ provider, model }) => ({
          provider,
          providerName: provider,
          model,
          modelName: model,
          efforts: [],
        })),
      validate: async (route) => {
        onValidate();
        if (route.provider === 'opencode-go') throw new Error('opencode-go is not configured');
      },
    },
    routeRests: { list: () => rests },
    states: createBotStateTracker(),
    channels: createChannelStore({ rootDir: join(root, 'channels'), attachments }),
    attachments,
    ownership: createTestOwnership(),
    roster: createTestRosterStore(),
  });
  registry.create({ slug: 'ada', displayName: 'Ada' });
  return { root, database, registry, routingGroups, methods };
}

async function group(methods: ReturnType<typeof setup>['methods'], name: string) {
  const created = await methods.modelGroupCreate({ name, members: [GO, DEEPSEEK] });
  if (!created.ok) throw new Error(created.error.message);
  return created.value.group.id;
}

describe('Model Presets with Routing Groups', () => {
  it('stores groups by id in every slot and copies them into the Bot plan on apply', async () => {
    const { root, database, registry, methods } = setup();
    const main = await group(methods, 'Main');
    const side = await group(methods, 'Side');
    const created = await methods.modelPresetCreate({
      name: 'Grouped',
      orchestratorGroupId: main,
      assignmentDefault: ROUTE,
      assignmentGroups: [side],
      assignmentDefaultGroupId: side,
    });
    expect(created).toMatchObject({
      ok: true,
      value: {
        preset: {
          orchestrator: ROUTE,
          orchestratorGroupId: main,
          assignmentGroups: [side],
          assignmentDefaultGroupId: side,
        },
      },
    });
    if (!created.ok) return;
    const id = created.value.preset.id;
    expect(createModelPresetStore({ rootDir: root, database }).get(id)).toMatchObject({
      orchestratorGroupId: main,
      assignmentGroups: [side],
    });

    expect(await methods.modelPresetApply({ slug: 'ada', presetId: id })).toMatchObject({
      ok: true,
      value: {
        plan: {
          sourcePresetId: id,
          orchestrator: ROUTE,
          orchestratorGroupId: main,
          assignmentGroups: [side],
          assignmentDefaultGroupId: side,
        },
      },
    });
    expect(registry.get('ada')?.modelPlan?.orchestratorGroupId).toBe(main);
  });

  it('refuses an old client save that would drop groups and lets a new client clear them', async () => {
    const { methods } = setup();
    const main = await group(methods, 'Main');
    const created = await methods.modelPresetCreate({
      name: 'Grouped',
      orchestratorGroupId: main,
      assignmentDefault: ROUTE,
    });
    if (!created.ok) throw new Error(created.error.message);
    const id = created.value.preset.id;

    expect(
      await methods.modelPresetUpdate({
        id,
        expectedRevision: 1,
        name: 'Renamed',
        orchestrator: ROUTE,
        assignmentDefault: ROUTE,
      }),
    ).toMatchObject({ ok: false, error: { code: 'client-update-required' } });
    expect(methods.modelPresets({})).toMatchObject({
      ok: true,
      value: { presets: [{ name: 'Grouped', revision: 1, orchestratorGroupId: main }] },
    });

    const cleared = await methods.modelPresetUpdate({
      id,
      expectedRevision: 1,
      name: 'Plain',
      orchestrator: ROUTE,
      assignmentDefault: ROUTE,
      orchestratorGroupId: null,
      assignmentGroups: [],
      assignmentDefaultGroupId: null,
    });
    expect(cleared).toMatchObject({ ok: true, value: { preset: { revision: 2, name: 'Plain' } } });
    if (!cleared.ok) return;
    expect(cleared.value.preset.orchestratorGroupId).toBeUndefined();
    expect(
      await methods.modelPresetUpdate({
        id,
        expectedRevision: 2,
        name: 'Plain again',
        orchestrator: ROUTE,
        assignmentDefault: ROUTE,
      }),
    ).toMatchObject({ ok: true, value: { preset: { revision: 3 } } });
  });

  it('refuses a plan or Preset whose Routing Group is deleted while it is saved', async () => {
    let target: string | undefined;
    const { methods, routingGroups } = setup([], () => {
      const group = target === undefined ? undefined : routingGroups.get(target);
      if (group !== undefined) routingGroups.delete(group.id, group.revision);
    });
    const assignmentModels = [{ ...ROUTE, allowedEfforts: [''], defaultEffort: '' }];
    for (const save of [
      (id: string) =>
        methods.modelPlanSet({
          slug: 'ada',
          expectedRevision: 0,
          orchestrator: ROUTE,
          assignmentDefault: ROUTE,
          assignmentModels,
          assignmentGroups: [id],
        }),
      (id: string) =>
        methods.modelPresetCreate({
          name: 'Grouped',
          orchestrator: ROUTE,
          assignmentDefault: ROUTE,
          assignmentModels,
          assignmentGroups: [id],
        }),
    ]) {
      target = await group(methods, 'Side');
      expect(await save(target)).toMatchObject({
        ok: false,
        error: { code: 'routing-group-not-found' },
      });
    }
  });

  it('saves a grouped Orchestrator on a member that is not resting (#4501)', async () => {
    const { methods } = setup([{ ...ROUTE, until: '2999-01-01T00:00:00.000Z' }]);
    const created = await methods.modelGroupCreate({ name: 'Main', members: [DEEPSEEK, PRO] });
    if (!created.ok) throw new Error(created.error.message);
    const saved = await methods.modelPlanSet({
      slug: 'ada',
      expectedRevision: 0,
      orchestratorGroupId: created.value.group.id,
      assignmentDefault: ROUTE,
      assignmentModels: [{ ...ROUTE, allowedEfforts: [''], defaultEffort: '' }],
    });
    expect(saved).toMatchObject({
      ok: true,
      value: { plan: { orchestrator: { provider: 'deepseek', model: 'deepseek-v4-pro' } } },
    });
  });

  it('sets a whole Bot plan with groups in every slot and clears them on a plain save (#4501)', async () => {
    const { registry, methods } = setup();
    const main = await group(methods, 'Main');
    const side = await group(methods, 'Side');
    const assignmentModels = [{ ...ROUTE, allowedEfforts: [''], defaultEffort: '' }];
    const grouped = await methods.modelPlanSet({
      slug: 'ada',
      expectedRevision: 0,
      orchestratorGroupId: main,
      assignmentDefault: ROUTE,
      assignmentModels,
      assignmentGroups: [side],
      assignmentDefaultGroupId: side,
      assignmentGroupOptions: [{ group: side, note: 'Quick checks' }],
    });
    expect(grouped).toMatchObject({
      ok: true,
      value: {
        plan: {
          orchestrator: ROUTE,
          orchestratorGroupId: main,
          assignmentGroups: [side],
          assignmentDefaultGroupId: side,
          assignmentGroupOptions: [{ group: side, note: 'Quick checks' }],
        },
      },
    });
    expect(
      await methods.modelPlanSet({
        slug: 'ada',
        expectedRevision: 1,
        orchestrator: ROUTE,
        orchestratorGroupId: main,
        assignmentDefault: ROUTE,
        assignmentModels,
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.modelPlanSet({
        slug: 'ada',
        expectedRevision: 1,
        orchestratorGroupId: 'missing',
        assignmentDefault: ROUTE,
        assignmentModels,
      }),
    ).toMatchObject({ ok: false, error: { code: 'routing-group-not-found' } });
    expect(
      await methods.modelPlanSet({
        slug: 'ada',
        expectedRevision: 1,
        orchestrator: ROUTE,
        assignmentDefault: ROUTE,
        assignmentModels,
      }),
    ).toMatchObject({ ok: true });
    expect(registry.get('ada')?.modelPlan).not.toHaveProperty('orchestratorGroupId');
    expect(registry.get('ada')?.modelPlan).not.toHaveProperty('assignmentGroups');
    expect(registry.get('ada')?.modelPlan).not.toHaveProperty('assignmentDefaultGroupId');
    expect(registry.get('ada')?.modelPlan).not.toHaveProperty('assignmentGroupOptions');
  });

  it('refuses unknown groups, a default outside the list, and a route beside a group', async () => {
    const { methods } = setup();
    const main = await group(methods, 'Main');
    expect(
      await methods.modelPresetCreate({
        name: 'Ghost',
        orchestratorGroupId: 'missing',
        assignmentDefault: ROUTE,
      }),
    ).toMatchObject({ ok: false, error: { code: 'routing-group-not-found' } });
    expect(
      await methods.modelPresetCreate({
        name: 'Outside',
        orchestrator: ROUTE,
        assignmentDefault: ROUTE,
        assignmentGroups: [main],
        assignmentDefaultGroupId: 'other',
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.modelPresetCreate({
        name: 'Both',
        orchestrator: ROUTE,
        orchestratorGroupId: main,
        assignmentDefault: ROUTE,
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });
});

describe('Model Presets with subscription models', () => {
  const orchestratorEngine = { engine: 'codex', model: 'gpt-6', effort: 'high' };
  const assignmentEngine = { engine: 'claude', model: 'opus', effort: 'medium' };

  it('round-trips each engine choice and applies it through the subscription owner', async () => {
    const validateChoice = vi.fn(async () => {});
    const use = vi.fn();
    const { methods, registry, root, database } = setup([], undefined, {
      validateChoice,
      use,
      fallsBack: () => false,
    });
    const created = await methods.modelPresetCreate({
      name: 'Subscriptions',
      orchestrator: ROUTE,
      assignmentDefault: ROUTE,
      orchestratorEngine,
      assignmentEngine,
    });
    if (!created.ok) throw new Error(created.error.message);
    const { id } = created.value.preset;
    expect(createModelPresetStore({ rootDir: root, database }).get(id)).toMatchObject({
      orchestratorEngine,
      assignmentEngine,
    });
    const result = await methods.modelPresetApply({ slug: 'ada', presetId: id });
    expect(result.ok).toBe(true);
    expect(registry.get('ada')?.modelPlan?.orchestrator).toEqual(ROUTE);
    expect(use.mock.calls).toEqual([
      ['ada', 'orchestrator', 'codex', { model: 'gpt-6', effort: 'high', fallback: false }],
      ['ada', 'assignment', 'claude', { model: 'opus', effort: 'medium' }],
    ]);
    expect(validateChoice).toHaveBeenCalledTimes(4);
    const updated = await methods.modelPresetUpdate({
      id,
      expectedRevision: 1,
      name: 'Renamed',
      orchestrator: ROUTE,
      assignmentDefault: ROUTE,
      assignmentEngine: null,
    });
    if (!updated.ok) throw new Error(updated.error.message);
    expect(updated.value.preset.orchestratorEngine).toEqual(orchestratorEngine);
    expect(updated.value.preset.assignmentEngine).toBeUndefined();
  });

  it('validates both choices before writing the Bot plan or either role', async () => {
    const validateChoice = vi.fn(async () => {});
    const use = vi.fn();
    const { methods, registry } = setup([], undefined, {
      validateChoice,
      use,
      fallsBack: () => false,
    });
    const created = await methods.modelPresetCreate({
      name: 'Subscriptions',
      orchestrator: ROUTE,
      assignmentDefault: ROUTE,
      orchestratorEngine,
      assignmentEngine,
    });
    if (!created.ok) throw new Error(created.error.message);
    validateChoice.mockRejectedValueOnce(
      new EngineRefusal('unknown-effort', 'Effort no longer offered'),
    );
    expect(
      await methods.modelPresetApply({ slug: 'ada', presetId: created.value.preset.id }),
    ).toMatchObject({
      ok: false,
      error: { code: 'unknown-effort' },
    });
    expect(registry.get('ada')?.modelPlan).toBeUndefined();
    expect(use).not.toHaveBeenCalled();
  });
});
