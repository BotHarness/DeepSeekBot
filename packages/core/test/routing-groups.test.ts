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
import type { ModelCatalog } from '../src/models/catalog.js';
import { createModelPresetStore } from '../src/models/presets.js';
import { createRoutingGroupStore, RoutingGroupError } from '../src/models/routing-groups.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTestOwnership } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { createTestRosterStore } from './roster-fixture.js';

const GO = { kind: 'model' as const, provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
const DEEPSEEK = { kind: 'model' as const, provider: 'deepseek', model: 'deepseek-v4.1-flash' };
const roots: string[] = [];
const owners: OperationalDatabaseOwner[] = [];

function mount(root = mkdtempSync(join(tmpdir(), 'bh-routing-groups-'))) {
  if (!roots.includes(root)) roots.push(root);
  const database = mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  owners.push(database);
  return { root, database };
}

afterEach(() => {
  for (const owner of owners.splice(0)) owner.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function refusal(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof RoutingGroupError) return { code: error.code, message: error.message };
    throw error;
  }
  throw new Error('Expected a Routing Group refusal');
}

describe('Routing Group store', () => {
  it('keeps ordered members across a reopen and checks revisions and names', () => {
    const { root, database } = mount();
    const store = createRoutingGroupStore({ database });
    const created = store.create({ name: ' Flash ', members: [GO, DEEPSEEK] });
    expect(created).toMatchObject({ name: 'Flash', revision: 1, mode: 'order' });
    expect(refusal(() => store.create({ name: 'flash', members: [GO] }))).toMatchObject({
      code: 'name-conflict',
    });
    const updated = store.update(created.id, {
      expectedRevision: 1,
      name: 'Flash',
      members: [DEEPSEEK, GO],
    });
    expect(updated.revision).toBe(2);
    expect(
      refusal(() =>
        store.update(created.id, { expectedRevision: 1, name: 'Flash', members: [GO] }),
      ),
    ).toMatchObject({ code: 'stale-revision' });
    database.close();
    owners.splice(owners.indexOf(database), 1);
    const reopened = createRoutingGroupStore({ database: mount(root).database });
    expect(reopened.get(created.id)?.members).toEqual([DEEPSEEK, GO]);
    expect(reopened.routes(created.id)).toEqual([
      { provider: 'deepseek', model: 'deepseek-v4.1-flash' },
      { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
    ]);
  });

  it('expands nested groups in order without repeats and refuses cycles and empty groups', () => {
    const store = createRoutingGroupStore({ database: mount().database });
    const inner = store.create({ name: 'Inner', members: [DEEPSEEK] });
    const outer = store.create({
      name: 'Outer',
      members: [GO, { kind: 'group', id: inner.id }, DEEPSEEK],
    });
    expect(store.routes(outer.id)).toEqual([
      { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
      { provider: 'deepseek', model: 'deepseek-v4.1-flash' },
    ]);
    expect(
      refusal(() =>
        store.update(inner.id, {
          expectedRevision: 1,
          name: 'Inner',
          members: [{ kind: 'group', id: outer.id }],
        }),
      ),
    ).toMatchObject({ code: 'cycle', message: expect.stringContaining('Inner → Outer → Inner') });
    expect(refusal(() => store.create({ name: 'Empty', members: [] }))).toMatchObject({
      code: 'empty-group',
    });
    expect(
      refusal(() => store.create({ name: 'Ghost', members: [{ kind: 'group', id: 'missing' }] })),
    ).toMatchObject({ code: 'unknown-member' });
    expect(refusal(() => store.delete(inner.id, 1))).toMatchObject({
      code: 'in-use',
      message: expect.stringContaining('Routing Group Outer'),
    });
    expect(store.delete(outer.id, 1).name).toBe('Outer');
    expect(store.delete(inner.id, 1).name).toBe('Inner');
    expect(store.list()).toEqual([]);
  });
});

describe('Choosing a Routing Group as a Bot Orchestrator', () => {
  function setup(validate: ModelCatalog['validate']) {
    const { root, database } = mount();
    const registry = createTestRegistry({ rootDir: root, database });
    const routingGroups = createRoutingGroupStore({
      database,
      references: (groupId) =>
        registry
          .list()
          .filter((bot) => bot.modelPlan?.orchestratorGroupId === groupId)
          .map((bot) => `Bot ${bot.displayName}`),
    });
    const attachments = createAttachmentStore({ rootDir: join(root, 'attachments') });
    const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
      registry,
      modelPresets: createModelPresetStore({ rootDir: root, database }),
      routingGroups,
      modelCatalog: {
        list: async () =>
          [GO, DEEPSEEK].map(({ provider, model }) => ({
            provider,
            providerName: provider,
            model,
            modelName: model,
            efforts: [],
          })),
        validate,
      },
      states: createBotStateTracker(),
      channels: createChannelStore({ rootDir: join(root, 'channels'), attachments }),
      attachments,
      ownership: createTestOwnership(),
      roster: createTestRosterStore(),
    });
    registry.create({ slug: 'ada', displayName: 'Ada' });
    return { registry, methods };
  }

  it('runs on the first member the catalog accepts, records the group and refuses deleting it', async () => {
    const { registry, methods } = setup(async (route) => {
      if (route.provider === 'opencode-go') throw new Error('opencode-go is not configured');
    });
    const created = await methods.modelGroupCreate({ name: 'Flash', members: [GO, DEEPSEEK] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.group.id;
    expect(methods.modelGroups({})).toMatchObject({ ok: true, value: { groups: [{ id }] } });
    expect(methods.modelGroup({ id })).toMatchObject({
      ok: true,
      value: { routes: [{ provider: 'opencode-go' }, { provider: 'deepseek' }] },
    });

    expect(
      await methods.modelPlanCustomize({
        slug: 'ada',
        orchestratorGroupId: id,
        expectedRevision: 0,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        plan: {
          revision: 1,
          orchestratorGroupId: id,
          orchestrator: { provider: 'deepseek', model: 'deepseek-v4.1-flash' },
        },
      },
    });
    expect(methods.modelGroupDelete({ id, expectedRevision: 1 })).toMatchObject({
      ok: false,
      error: { code: 'routing-group-in-use', message: expect.stringContaining('Bot Ada') },
    });

    expect(
      await methods.modelPlanCustomize({
        slug: 'ada',
        orchestrator: { provider: 'deepseek', model: 'deepseek-v4.1-flash' },
        expectedRevision: 1,
      }),
    ).toMatchObject({ ok: true, value: { plan: { revision: 2 } } });
    expect(registry.get('ada')?.modelPlan?.orchestratorGroupId).toBeUndefined();
    expect(methods.modelGroupDelete({ id, expectedRevision: 1 })).toMatchObject({ ok: true });
  });

  it('refuses unknown models, a missing group and a group with no usable member', async () => {
    const { registry, methods } = setup(async () => {
      throw new Error('Provider has no API key');
    });
    expect(
      await methods.modelGroupCreate({ name: 'Ghost', members: [{ ...GO, model: 'missing' }] }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalid-input', message: expect.stringContaining('opencode-go/missing') },
    });
    const created = await methods.modelGroupCreate({ name: 'Flash', members: [GO, DEEPSEEK] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(
      await methods.modelPlanCustomize({
        slug: 'ada',
        orchestratorGroupId: created.value.group.id,
        expectedRevision: 0,
      }),
    ).toMatchObject({ ok: false, error: { message: expect.stringContaining('API key') } });
    expect(
      await methods.modelPlanCustomize({
        slug: 'ada',
        orchestratorGroupId: 'missing',
        expectedRevision: 0,
      }),
    ).toMatchObject({ ok: false, error: { code: 'routing-group-not-found' } });
    expect(registry.get('ada')?.modelPlan).toBeUndefined();
  });
});
