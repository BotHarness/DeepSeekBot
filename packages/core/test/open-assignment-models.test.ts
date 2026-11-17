import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountOperationalDatabase, type OperationalDatabaseOwner } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import type { ModelCatalogEntry } from '../src/models/catalog.js';
import { createOpenAssignmentRoutes } from '../src/models/open-assignments.js';
import {
  createModelPresetStore,
  isPersonaBotModelPlan,
  selectAssignmentRoute,
  type PersonaBotModelPlan,
} from '../src/models/presets.js';
import { resolveSubagentRoute } from '../src/models/subagent-route.js';

const homes: string[] = [];
const owners: OperationalDatabaseOwner[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.close();
  for (const root of homes.splice(0)) rmSync(root, { recursive: true, force: true });
});

const flash = { provider: 'deepseek', model: 'deepseek-flash' };
const pro = { provider: 'deepseek', model: 'deepseek-pro', reasoningEffort: 'high' };
const plan = (open: boolean): PersonaBotModelPlan => ({
  revision: 3,
  sourcePresetId: '',
  sourcePresetName: '',
  orchestrator: pro,
  assignmentDefault: flash,
  ...(open ? { openAssignmentModels: true as const } : {}),
  appliedAt: '2026-11-17T00:00:00Z',
});

function entry(
  provider: string,
  model: string,
  credential?: ModelCatalogEntry['credential'],
): ModelCatalogEntry {
  return {
    provider,
    providerName: provider.toUpperCase(),
    model,
    modelName: `${model} name`,
    efforts: [{ id: 'high', name: 'High' }],
    defaultEffort: 'high',
    ...(credential === undefined ? {} : { credential }),
  };
}

describe('Open Assignment Models', () => {
  it('keeps the listed set unless the plan is open', () => {
    expect(() => selectAssignmentRoute(plan(false), pro)).toThrow(
      'Assignment model deepseek/deepseek-pro is not allowed',
    );
    expect(selectAssignmentRoute(plan(true), pro)).toEqual(pro);
    expect(selectAssignmentRoute(plan(true), { ...flash, reasoningEffort: '' })).toEqual(flash);
    expect(selectAssignmentRoute(plan(true))).toEqual(flash);
    expect(
      resolveSubagentRoute(
        plan(true),
        { provider: 'deepseek', model: 'deepseek-flash' },
        { provider: pro.provider, model: pro.model, reasoning_effort: pro.reasoningEffort },
      ).route,
    ).toEqual(pro);
  });

  it('rejects an open plan without an Assignment default and any non-true flag', () => {
    expect(isPersonaBotModelPlan(plan(true))).toBe(true);
    const { assignmentDefault: _default, ...withoutDefault } = plan(true);
    expect(isPersonaBotModelPlan(withoutDefault)).toBe(false);
    expect(isPersonaBotModelPlan({ ...plan(false), openAssignmentModels: false })).toBe(false);
  });

  it('stores the option on presets, defaults existing presets to the listed set and clears it', () => {
    const root = mkdtempSync(join(tmpdir(), 'bh-open-assignments-'));
    homes.push(root);
    const database = mountOperationalDatabase({
      dshHome: root,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    owners.push(database);
    const store = createModelPresetStore({ rootDir: root, database });
    const listed = store.create({ name: 'Listed', orchestrator: pro, assignmentDefault: flash });
    expect(listed.openAssignmentModels).toBeUndefined();
    const open = store.create({
      name: 'Open',
      orchestrator: pro,
      assignmentDefault: flash,
      openAssignmentModels: true,
    });
    expect(store.get(open.id)?.openAssignmentModels).toBe(true);
    const renamed = store.update(open.id, {
      expectedRevision: 1,
      name: 'Open renamed',
      orchestrator: pro,
      assignmentDefault: flash,
    });
    expect(renamed?.openAssignmentModels).toBe(true);
    const closed = store.update(open.id, {
      expectedRevision: 2,
      name: 'Open renamed',
      orchestrator: pro,
      assignmentDefault: flash,
      openAssignmentModels: false,
    });
    expect(closed).not.toHaveProperty('openAssignmentModels');
    expect(store.get(open.id)).not.toHaveProperty('openAssignmentModels');
  });

  it('lists only owner-allowed, credential-ready models with catalog names when open', async () => {
    let current = plan(true);
    const validate = vi.fn(async () => {});
    const routes = createOpenAssignmentRoutes({
      catalog: {
        list: async () => [
          entry('deepseek', 'deepseek-flash'),
          entry('deepseek', 'deepseek-pro'),
          entry('other', 'blocked'),
          entry('spent', 'no-key', 'missing'),
        ],
        validate,
      },
      plan: () => current,
      requireAllowed: (_slug, route) => {
        if (route.provider === 'other') throw new Error('model-not-allowed');
      },
    });
    expect(await routes.list('bot')).toEqual([
      {
        provider: 'deepseek',
        providerName: 'DEEPSEEK',
        model: 'deepseek-flash',
        modelName: 'deepseek-flash name',
        efforts: ['high'],
        defaultEffort: 'high',
      },
      {
        provider: 'deepseek',
        providerName: 'DEEPSEEK',
        model: 'deepseek-pro',
        modelName: 'deepseek-pro name',
        efforts: ['high'],
        defaultEffort: 'high',
      },
    ]);
    await routes.require('bot', pro);
    expect(validate).toHaveBeenCalledWith(pro);
    await expect(routes.require('bot', { provider: 'other', model: 'blocked' })).rejects.toThrow(
      'model-not-allowed',
    );
    validate.mockClear();
    await routes.require('bot', flash);
    expect(validate).not.toHaveBeenCalled();
    current = plan(false);
    expect(await routes.list('bot')).toEqual([]);
    await routes.require('bot', { provider: 'other', model: 'blocked' });
  });
});
