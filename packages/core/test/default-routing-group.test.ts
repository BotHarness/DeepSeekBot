import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createAttachmentStore } from '../src/attachments/store.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createChannelStore } from '../src/channels/store.js';
import { mountOperationalDatabase, type OperationalDatabaseOwner } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createGroupFallback } from '../src/models/group-fallback.js';
import type { ModelRoute, PersonaBotModelPlan } from '../src/models/presets.js';
import { DEFAULT_MODEL_PRESET_ID, createModelPresetStore } from '../src/models/presets.js';
import { createRouteRests } from '../src/models/route-rest.js';
import { createRoutingGroupStore } from '../src/models/routing-groups.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTestOwnership } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { createTestRosterStore } from './roster-fixture.js';

const GO = { provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
const DEEPSEEK = { provider: 'deepseek', model: 'deepseek-v4.1-flash' };
const roots: string[] = [];
const owners: OperationalDatabaseOwner[] = [];

afterEach(() => {
  for (const owner of owners.splice(0)) owner.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function mount() {
  const root = mkdtempSync(join(tmpdir(), 'bh-default-group-'));
  roots.push(root);
  const database = mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  owners.push(database);
  return { root, database };
}

function setup(onValidate: (route: ModelRoute) => void = () => undefined) {
  const { root, database } = mount();
  const registry = createTestRegistry({ rootDir: root, database });
  const modelPresets = createModelPresetStore({ rootDir: root, database });
  modelPresets.migrateDefault({ main: DEEPSEEK });
  const pinned = () => modelPresets.get(DEFAULT_MODEL_PRESET_ID)!;
  const routingGroups = createRoutingGroupStore({
    database,
    references: (id) => (pinned().orchestratorGroupId === id ? ['Default Model Preset'] : []),
  });
  const attachments = createAttachmentStore({ rootDir: join(root, 'attachments') });
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    registry,
    modelPresets,
    routingGroups,
    modelCatalog: {
      list: async () =>
        [GO, DEEPSEEK].map((route) => ({
          ...route,
          providerName: route.provider,
          modelName: route.model,
          efforts:
            route === DEEPSEEK
              ? [
                  { id: 'high', name: 'High' },
                  { id: 'max', name: 'Max' },
                ]
              : [],
        })),
      validate: async (route) => {
        onValidate(route);
        if (route.provider === 'opencode-go') throw new Error('opencode-go is not configured');
      },
    },
    states: createBotStateTracker(),
    channels: createChannelStore({ rootDir: join(root, 'channels'), attachments }),
    attachments,
    ownership: createTestOwnership(),
    roster: createTestRosterStore(),
  });
  return { registry, routingGroups, methods, pinned, selection: () => pinned().orchestrator };
}

describe('The default model can be a Routing Group (#4500)', () => {
  it('preserves a separate Assignment route in a revisionless global main save', async () => {
    const { methods, pinned } = setup();
    const current = pinned();
    const sub = { ...DEEPSEEK, reasoningEffort: 'high' };
    expect(
      await methods.modelPresetUpdate({
        id: current.id,
        name: current.name,
        expectedRevision: current.revision,
        orchestrator: DEEPSEEK,
        assignmentDefault: sub,
        assignmentFollowsMain: false,
      }),
    ).toMatchObject({ ok: true });
    const main = { ...DEEPSEEK, reasoningEffort: 'max' };
    expect(
      await methods.onboardingModel({ expectedRevision: 0, globalDefault: true, route: main }),
    ).toMatchObject({ ok: true });
    expect(pinned()).toMatchObject({ orchestrator: main, assignmentDefault: sub });
    expect(pinned().assignmentFollowsMain).toBeUndefined();
  });

  it('sets the default to the group with its first usable member, and a model clears it', async () => {
    const { methods, selection } = setup();
    const created = await methods.modelGroupCreate({
      name: 'Main',
      members: [
        { kind: 'model', ...GO },
        { kind: 'model', ...DEEPSEEK },
      ],
    });
    if (!created.ok) throw new Error(created.error.message);
    const id = created.value.group.id;
    expect(
      await methods.onboardingModel({ expectedRevision: 0, globalDefault: true, groupId: id }),
    ).toEqual({ ok: true, value: { revision: 2, groupRevision: 2 } });
    expect(selection()).toEqual(DEEPSEEK);
    expect(await methods.modelCatalog({})).toMatchObject({
      ok: true,
      value: { default: DEEPSEEK, defaultGroupId: id },
    });
    expect(
      await methods.onboardingModel({
        expectedRevision: 0,
        globalDefault: true,
        groupId: id,
        route: DEEPSEEK,
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });

    expect(
      await methods.onboardingModel({ expectedRevision: 0, globalDefault: true, route: DEEPSEEK }),
    ).toEqual({ ok: true, value: { revision: 3, groupRevision: 3 } });
    const catalog = await methods.modelCatalog({});
    expect(catalog.ok ? catalog.value.defaultGroupId : 'unread').toBeUndefined();
  });
  it('protects the Routing Group used by Default and checks edits against the preset revision', async () => {
    const { methods, routingGroups, pinned } = setup();
    const group = routingGroups.create({ name: 'Main', members: [{ kind: 'model', ...DEEPSEEK }] });
    const input = { expectedRevision: 0, globalDefault: true, groupId: group.id };
    expect(
      await methods.onboardingModel({
        ...input,
        expectedDefaultGroupRevision: 0,
      }),
    ).toMatchObject({ ok: false, error: { code: 'stale-setting' } });
    expect(pinned().orchestratorGroupId).toBeUndefined();
    expect(
      await methods.onboardingModel({
        ...input,
        expectedDefaultGroupRevision: 1,
      }),
    ).toMatchObject({ ok: true, value: { revision: 2 } });
    expect(() => routingGroups.delete(group.id, group.revision)).toThrow('Default Model Preset');
    expect(pinned()).toMatchObject({ orchestratorGroupId: group.id, assignmentFollowsMain: true });
    expect(
      await methods.onboardingModel({
        expectedRevision: 0,
        globalDefault: true,
        expectedDefaultRevision: 2,
        route: DEEPSEEK,
      }),
    ).toMatchObject({ ok: true, value: { revision: 3 } });
    expect(routingGroups.delete(group.id, group.revision).id).toBe(group.id);
  });

  it('keeps one effort with the default group and runs a member at it only when the member reasons', async () => {
    const { methods, pinned, selection } = setup();
    const created = await methods.modelGroupCreate({
      name: 'Main',
      members: [
        { kind: 'model', ...GO },
        { kind: 'model', ...DEEPSEEK },
      ],
    });
    if (!created.ok) throw new Error(created.error.message);
    const id = created.value.group.id;
    expect(
      await methods.onboardingModel({
        expectedRevision: 0,
        globalDefault: true,
        groupId: id,
        groupEffort: 'low',
      }),
    ).toMatchObject({ ok: false, error: { message: expect.stringContaining('shared levels') } });
    expect(
      await methods.onboardingModel({
        expectedRevision: 0,
        globalDefault: true,
        route: DEEPSEEK,
        groupEffort: 'high',
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.onboardingModel({
        expectedRevision: 0,
        globalDefault: true,
        groupId: id,
        groupEffort: 'high',
      }),
    ).toEqual({ ok: true, value: { revision: 2, groupRevision: 2 } });
    expect(selection()).toEqual({ ...DEEPSEEK, reasoningEffort: 'high' });
    expect(await methods.modelCatalog({})).toMatchObject({
      ok: true,
      value: { defaultGroupId: id, defaultGroupEffort: 'high', defaultGroupRevision: 2 },
    });
    expect(
      await methods.onboardingModel({
        expectedRevision: 0,
        globalDefault: true,
        groupId: id,
        groupEffort: 'max',
      }),
    ).toEqual({ ok: true, value: { revision: 3, groupRevision: 3 } });
    expect(pinned()).toMatchObject({
      orchestratorGroupId: id,
      orchestratorGroupEffort: 'max',
      revision: 3,
    });
    expect(
      await methods.onboardingModel({ expectedRevision: 0, globalDefault: true, groupId: id }),
    ).toEqual({ ok: true, value: { revision: 4, groupRevision: 4 } });
    expect(pinned()).toMatchObject({ orchestratorGroupId: id, revision: 4 });
    expect(pinned().orchestratorGroupEffort).toBeUndefined();
    expect(selection()).toEqual(DEEPSEEK);
  });

  it('sets the default group from a Bot that then follows it', async () => {
    const { methods, registry } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const own = registry.setModelPlan(
      'ada',
      {
        orchestrator: DEEPSEEK,
        assignmentDefault: DEEPSEEK,
        assignmentModels: [{ ...DEEPSEEK, allowedEfforts: [''], defaultEffort: '' }],
      },
      0,
    );
    if (!own.ok) throw new Error('plan');
    const created = await methods.modelGroupCreate({
      name: 'Main',
      members: [
        { kind: 'model', ...GO },
        { kind: 'model', ...DEEPSEEK },
      ],
    });
    if (!created.ok) throw new Error(created.error.message);
    const id = created.value.group.id;
    expect(
      await methods.onboardingModel({
        slug: 'ada',
        expectedRevision: own.record.modelPlan!.revision,
        globalDefault: true,
        groupId: id,
      }),
    ).toMatchObject({ ok: true });
    expect(registry.get('ada')?.modelPlan).toBeUndefined();
    expect(await methods.modelCatalog({})).toMatchObject({
      ok: true,
      value: { defaultGroupId: id },
    });
  });
});

describe('Bots that inherit the default use its Routing Group', () => {
  const plan: PersonaBotModelPlan = {
    revision: 1,
    sourcePresetId: '',
    sourcePresetName: '',
    orchestrator: DEEPSEEK,
    appliedAt: '2026-11-18T00:00:00.000Z',
  };

  it('falls back inside the default group only for a Bot without its own plan', async () => {
    const rests = createRouteRests({ now: () => 1_000 });
    const fallback = createGroupFallback({
      plan: (slug) => (slug === 'own' ? plan : undefined),
      inheritedGroup: () => 'default',
      routes: () => [GO, DEEPSEEK],
      rests,
      requireAllowed: () => undefined,
      validate: async () => undefined,
    });
    rests.rest(GO, 10_000, 'quota');
    expect(await fallback.choose('inherits', 's1', rests.restingUntil(GO)!)).toMatchObject({
      kind: 'switch',
      to: DEEPSEEK,
    });
    expect(fallback.route('s1')).toEqual(DEEPSEEK);
    expect(await fallback.choose('own', 's2', rests.restingUntil(GO)!)).toBeUndefined();
  });

  it('runs an inheriting Bot at the default group effort', async () => {
    const rests = createRouteRests({ now: () => 1_000 });
    const fallback = createGroupFallback({
      plan: (slug) => (slug === 'own' ? plan : undefined),
      inheritedGroup: () => 'default',
      inheritedEffort: () => 'high',
      routes: () => [GO, DEEPSEEK],
      rests,
      requireAllowed: () => undefined,
      validate: async () => undefined,
      withEffort: async (route, effort) =>
        route === DEEPSEEK ? { ...route, reasoningEffort: effort! } : route,
    });
    rests.rest(GO, 10_000, 'quota');
    expect(await fallback.choose('inherits', 's1', rests.restingUntil(GO)!)).toMatchObject({
      kind: 'switch',
      to: { ...DEEPSEEK, reasoningEffort: 'high' },
    });
    expect(fallback.route('s1')).toEqual({ ...DEEPSEEK, reasoningEffort: 'high' });
    expect(fallback.inheritedEffort()).toBe('high');
  });
});
