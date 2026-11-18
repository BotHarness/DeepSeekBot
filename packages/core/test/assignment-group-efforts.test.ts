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
import { groupEfforts, groupMemberRoute } from '../src/models/catalog.js';
import { createModelPresetStore, isPersonaBotModelPlan } from '../src/models/presets.js';
import { createRoutingGroupStore } from '../src/models/routing-groups.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTestOwnership } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { createTestRosterStore } from './roster-fixture.js';

const GO = { kind: 'model' as const, provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
const DEEPSEEK = { kind: 'model' as const, provider: 'deepseek', model: 'deepseek-v4-pro' };
const ROUTE = { provider: 'deepseek', model: 'deepseek-v4-pro' };
const efforts = (...ids: string[]) => ids.map((id) => ({ id, name: id }));
const CATALOG = [
  { ...GO, providerName: 'Go', modelName: 'Flash', efforts: efforts('low', 'high') },
  { ...DEEPSEEK, providerName: 'DeepSeek', modelName: 'Pro', efforts: efforts('high', 'max') },
];
const roots: string[] = [];
const owners: OperationalDatabaseOwner[] = [];

afterEach(() => {
  for (const owner of owners.splice(0)) owner.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'bh-group-efforts-'));
  roots.push(root);
  const database = mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  owners.push(database);
  const registry = createTestRegistry({ rootDir: root, database });
  const attachments = createAttachmentStore({ rootDir: join(root, 'attachments') });
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    registry,
    modelPresets: createModelPresetStore({ rootDir: root, database }),
    routingGroups: createRoutingGroupStore({ database, references: () => [] }),
    modelCatalog: { list: async () => CATALOG, validate: async () => undefined },
    states: createBotStateTracker(),
    channels: createChannelStore({ rootDir: join(root, 'channels'), attachments }),
    attachments,
    ownership: createTestOwnership(),
    roster: createTestRosterStore(),
  });
  registry.create({ slug: 'ada', displayName: 'Ada' });
  return { registry, methods };
}

async function group(methods: ReturnType<typeof setup>['methods'], name: string) {
  const created = await methods.modelGroupCreate({ name, members: [GO, DEEPSEEK] });
  if (!created.ok) throw new Error(created.error.message);
  return created.value.group.id;
}

describe('Effort range for Routing Groups (#4502)', () => {
  it('offers the levels every reasoning member supports', () => {
    const plain = { provider: 'plain', model: 'chat' };
    const catalog = [...CATALOG, { ...plain, providerName: 'P', modelName: 'Chat', efforts: [] }];
    expect(groupEfforts([GO, DEEPSEEK], catalog)).toEqual(['high']);
    expect(groupEfforts([DEEPSEEK], catalog)).toEqual(['high', 'max']);
    expect(groupEfforts([GO, { provider: 'gone', model: 'x' }], catalog)).toEqual(['low', 'high']);
    expect(groupEfforts([plain, DEEPSEEK], catalog)).toEqual(['high', 'max']);
    expect(groupEfforts([plain], catalog)).toEqual([]);
    expect(groupEfforts([], catalog)).toEqual([]);
  });

  it('gives the group effort only to members that support it and keeps a member override', () => {
    const plain = { provider: 'plain', model: 'chat' };
    const catalog = [...CATALOG, { ...plain, providerName: 'P', modelName: 'Chat', efforts: [] }];
    expect(groupMemberRoute(ROUTE, 'max', catalog)).toEqual({ ...ROUTE, reasoningEffort: 'max' });
    expect(groupMemberRoute(plain, 'max', catalog)).toEqual(plain);
    expect(groupMemberRoute({ ...ROUTE, reasoningEffort: 'high' }, 'max', catalog)).toEqual({
      ...ROUTE,
      reasoningEffort: 'high',
    });
    expect(groupMemberRoute(ROUTE, undefined, catalog)).toEqual(ROUTE);
  });

  it('keeps a Preset group range on update and apply, and refuses a level outside it', async () => {
    const { registry, methods } = setup();
    const side = await group(methods, 'Side');
    const base = { name: 'Grouped', orchestrator: ROUTE, assignmentDefault: ROUTE };
    expect(
      await methods.modelPresetCreate({
        ...base,
        assignmentGroups: [side],
        assignmentGroupOptions: [
          { group: side, allowedEfforts: ['high', 'max'], defaultEffort: 'high' },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: 'invalid-input',
        message:
          'Routing Group Side: effort max is not supported by every reasoning member; shared levels: high',
      },
    });
    expect(
      await methods.modelPresetCreate({
        ...base,
        assignmentGroupOptions: [{ group: side, allowedEfforts: ['high'], defaultEffort: 'high' }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    const option = { group: side, allowedEfforts: ['high'], defaultEffort: 'high', note: 'Cheap' };
    const created = await methods.modelPresetCreate({
      ...base,
      assignmentGroups: [side],
      assignmentGroupOptions: [option],
    });
    if (!created.ok) throw new Error(created.error.message);
    expect(created.value.preset.assignmentGroupOptions).toEqual([option]);

    const renamed = await methods.modelPresetUpdate({
      ...base,
      id: created.value.preset.id,
      expectedRevision: 1,
      name: 'Renamed',
      assignmentGroups: [side],
    });
    if (!renamed.ok) throw new Error(renamed.error.message);
    expect(renamed.value.preset.assignmentGroupOptions).toEqual([option]);

    const applied = await methods.modelPresetApply({
      slug: 'ada',
      presetId: created.value.preset.id,
      expectedRevision: 0,
      expectedPresetRevision: 2,
    });
    expect(applied).toMatchObject({
      ok: true,
      value: { plan: { assignmentGroupOptions: [option] } },
    });
    expect(isPersonaBotModelPlan(registry.get('ada')?.modelPlan)).toBe(true);

    const cleared = await methods.modelPresetUpdate({
      ...base,
      id: created.value.preset.id,
      expectedRevision: 2,
      assignmentGroups: [side],
      assignmentGroupOptions: null,
    });
    if (!cleared.ok) throw new Error(cleared.error.message);
    expect(cleared.value.preset.assignmentGroupOptions).toBeUndefined();
  });

  it('sets and checks a group range on a Bot plan', async () => {
    const { registry, methods } = setup();
    const side = await group(methods, 'Side');
    const preset = await methods.modelPresetCreate({
      name: 'Plain',
      orchestrator: ROUTE,
      assignmentDefault: ROUTE,
      assignmentGroups: [side],
    });
    if (!preset.ok) throw new Error(preset.error.message);
    const applied = await methods.modelPresetApply({
      slug: 'ada',
      presetId: preset.value.preset.id,
      expectedRevision: 0,
      expectedPresetRevision: 1,
    });
    if (!applied.ok) throw new Error(applied.error.message);
    const models = [{ ...ROUTE, allowedEfforts: [''], defaultEffort: '' }];
    const set = (revision: number, allowedEfforts: string[]) =>
      methods.modelPlanAssignmentsSet({
        slug: 'ada',
        expectedRevision: revision,
        assignmentDefault: ROUTE,
        assignmentModels: models,
        assignmentGroupOptions: [{ group: side, allowedEfforts, defaultEffort: allowedEfforts[0] }],
      });
    expect(await set(applied.value.plan.revision, ['low'])).toMatchObject({
      ok: false,
      error: {
        message: expect.stringContaining('effort low is not supported by every reasoning member'),
      },
    });
    expect(await set(applied.value.plan.revision, ['high'])).toMatchObject({
      ok: true,
      value: {
        plan: {
          assignmentGroups: [side],
          assignmentGroupOptions: [
            { group: side, allowedEfforts: ['high'], defaultEffort: 'high' },
          ],
        },
      },
    });
    expect(registry.get('ada')?.modelPlan?.assignmentGroupOptions).toHaveLength(1);
  });

  it('stores one effort for an Orchestrator Routing Group on Presets and Bot plans', async () => {
    const { registry, methods } = setup();
    const main = await group(methods, 'Main');
    const base = { name: 'Grouped', assignmentDefault: ROUTE, orchestratorGroupId: main };
    expect(
      await methods.modelPresetCreate({ ...base, orchestratorGroupEffort: 'max' }),
    ).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('effort max is not supported') },
    });
    const created = await methods.modelPresetCreate({ ...base, orchestratorGroupEffort: 'high' });
    if (!created.ok) throw new Error(created.error.message);
    expect(created.value.preset).toMatchObject({
      orchestratorGroupId: main,
      orchestratorGroupEffort: 'high',
    });
    const applied = await methods.modelPresetApply({
      slug: 'ada',
      presetId: created.value.preset.id,
      expectedRevision: 0,
      expectedPresetRevision: 1,
    });
    if (!applied.ok) throw new Error(applied.error.message);
    expect(applied.value.plan).toMatchObject({ orchestratorGroupEffort: 'high' });
    expect(isPersonaBotModelPlan(registry.get('ada')?.modelPlan)).toBe(true);
    const customized = await methods.modelPlanCustomize({
      slug: 'ada',
      orchestratorGroupId: main,
      expectedRevision: applied.value.plan.revision,
    });
    if (!customized.ok) throw new Error(customized.error.message);
    expect(customized.value.plan.orchestratorGroupEffort).toBeUndefined();
    const again = await methods.modelPlanCustomize({
      slug: 'ada',
      orchestratorGroupId: main,
      orchestratorGroupEffort: 'high',
      expectedRevision: customized.value.plan.revision,
    });
    if (!again.ok) throw new Error(again.error.message);
    expect(again.value.plan.orchestratorGroupEffort).toBe('high');
  });
});
