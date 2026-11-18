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
import { createModelPresetStore } from '../src/models/presets.js';
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

function setup(onSave: (route: ModelRoute) => void = () => undefined) {
  const { root, database } = mount();
  const registry = createTestRegistry({ rootDir: root, database });
  const routingGroups = createRoutingGroupStore({ database, references: () => [] });
  const attachments = createAttachmentStore({ rootDir: join(root, 'attachments') });
  let selection: ModelRoute = { ...DEEPSEEK };
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    registry,
    modelPresets: createModelPresetStore({ rootDir: root, database }),
    routingGroups,
    defaultModel: {
      currentSelection: () => selection,
      saveSelection: async (route: ModelRoute) => {
        await Promise.resolve();
        onSave(route);
        selection = { ...route };
      },
    },
    modelCatalog: {
      list: async () =>
        [GO, DEEPSEEK].map((route) => ({
          ...route,
          providerName: route.provider,
          modelName: route.model,
          efforts: [],
        })),
      validate: async (route) => {
        if (route.provider === 'opencode-go') throw new Error('opencode-go is not configured');
      },
    },
    states: createBotStateTracker(),
    channels: createChannelStore({ rootDir: join(root, 'channels'), attachments }),
    attachments,
    ownership: createTestOwnership(),
    roster: createTestRosterStore(),
  });
  return { root, database, registry, routingGroups, methods, selection: () => selection };
}

describe('The default model can be a Routing Group (#4500)', () => {
  it('keeps the default group with a revision and refuses stale, unknown and deleting it', () => {
    const { root, database } = mount();
    const store = createRoutingGroupStore({ database });
    expect(store.defaultGroup()).toEqual({ revision: 0 });
    const group = store.create({ name: 'Main', members: [{ kind: 'model', ...GO }] });
    expect(store.setDefaultGroup(group.id, 0)).toEqual({ groupId: group.id, revision: 1 });
    expect(createRoutingGroupStore({ database }).defaultGroup()).toEqual({
      groupId: group.id,
      revision: 1,
    });
    expect(() => store.setDefaultGroup(undefined, 0)).toThrow('changed');
    expect(() => store.setDefaultGroup('missing', 1)).toThrow('does not exist');
    expect(() => store.delete(group.id, 1)).toThrow('the default model');
    expect(store.setDefaultGroup(undefined, 1)).toEqual({ revision: 2 });
    expect(store.delete(group.id, 1).id).toBe(group.id);
    expect(root).toBeTruthy();
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
    ).toEqual({ ok: true, value: { revision: 0, groupRevision: 1 } });
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
    ).toEqual({ ok: true, value: { revision: 0, groupRevision: 2 } });
    const catalog = await methods.modelCatalog({});
    expect(catalog.ok ? catalog.value.defaultGroupId : 'unread').toBeUndefined();
  });
  it('refuses a stale default group revision and keeps the group while the default is saved', async () => {
    let during: unknown;
    let fail = false;
    const { methods, routingGroups, selection } = setup(() => {
      const group = routingGroups.list()[0]!;
      if (fail) throw new Error('native settings refused');
      try {
        routingGroups.delete(group.id, group.revision);
      } catch (error) {
        during = error;
      }
    });
    const created = await methods.modelGroupCreate({
      name: 'Main',
      members: [{ kind: 'model', ...DEEPSEEK }],
    });
    if (!created.ok) throw new Error(created.error.message);
    const id = created.value.group.id;
    expect(
      await methods.onboardingModel({
        expectedRevision: 0,
        expectedDefaultGroupRevision: 3,
        globalDefault: true,
        groupId: id,
      }),
    ).toMatchObject({ ok: false, error: { code: 'routing-group-stale-revision' } });
    expect(routingGroups.defaultGroup()).toEqual({ revision: 0 });
    expect(
      await methods.onboardingModel({
        expectedRevision: 0,
        expectedDefaultGroupRevision: 0,
        globalDefault: true,
        groupId: id,
      }),
    ).toEqual({ ok: true, value: { revision: 0, groupRevision: 1 } });
    expect(String(during)).toContain('the default model');
    expect(routingGroups.get(id)).toBeDefined();
    expect(await methods.modelCatalog({})).toMatchObject({
      ok: true,
      value: { defaultGroupId: id, defaultGroupRevision: 1 },
    });
    fail = true;
    expect(
      await methods.onboardingModel({
        expectedRevision: 0,
        expectedDefaultGroupRevision: 1,
        globalDefault: true,
        route: { ...DEEPSEEK, reasoningEffort: 'high' },
      }),
    ).toMatchObject({ ok: false });
    expect(routingGroups.defaultGroup().groupId).toBe(id);
    const other = await methods.modelGroupCreate({
      name: 'Other',
      members: [{ kind: 'model', ...DEEPSEEK }],
    });
    if (!other.ok) throw new Error(other.error.message);
    expect(
      await methods.onboardingModel({
        expectedRevision: 0,
        globalDefault: true,
        groupId: other.value.group.id,
      }),
    ).toMatchObject({ ok: false });
    expect(routingGroups.defaultGroup().groupId).toBe(id);
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
});
