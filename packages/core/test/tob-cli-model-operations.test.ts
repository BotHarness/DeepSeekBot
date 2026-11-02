import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPersonaBotRegistry } from '../src/bots/registry.js';
import { mountOperationalDatabase, type OperationalDatabaseOwner } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createModelPresetStore } from '../src/models/presets.js';
import {
  createTobModelOperations,
  type TobNativeSettings,
} from '../src/tob/cli-model-operations.js';
import { TobError } from '../src/tob/service.js';
import { createTempRoot } from './helpers.js';

const owners: OperationalDatabaseOwner[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.close();
});
const route = { provider: 'official', model: 'fast' };
const alternate = { provider: 'official', model: 'large', reasoningEffort: 'high' };
function fixture() {
  const root = createTempRoot('tob-cli-model-');
  const database = mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  owners.push(database);
  const registry = createPersonaBotRegistry({ rootDir: root, database });
  registry.create({ slug: 'one', displayName: 'One' });
  registry.create({ slug: 'two', displayName: 'Two' });
  const presets = createModelPresetStore({ rootDir: root, database });
  const rows = [
    {
      ns: 'botharness-client',
      revision: 0,
      value: {
        assignmentConcurrencyLimit: 8,
        developerMode: false,
        showBotSessions: true,
        showApprovalReviewSessions: false,
        privateField: 'never-return',
      } as Record<string, unknown>,
    },
    { ns: 'agent-default-model', revision: 0, value: { ...route } as Record<string, unknown> },
  ];
  const persist = (ns: string, patch: object, expected: number, replace: boolean) => {
    const current = rows.find((row) => row.ns === ns)!;
    if (current.revision !== expected)
      throw Object.assign(new Error('changed'), { code: 'SETTINGS_CONFLICT' });
    current.value = replace ? { ...patch } : { ...current.value, ...patch };
    current.revision++;
  };
  const native: TobNativeSettings = {
    describe: () => structuredClone(rows),
    update: vi.fn(async (ns, patch, expected) => persist(ns, patch, expected, false)),
    replace: vi.fn(async (ns, patch, expected) => persist(ns, patch, expected, true)),
  };
  const catalog = { list: vi.fn(async () => []), validate: vi.fn(async (_route: unknown) => {}) };
  const runtimeChanged = vi.fn();
  const prepare = createTobModelOperations({
    registry,
    presets,
    catalog,
    settings: () => native,
    runtimeChanged,
  });
  const run = async (command: string, args: object = {}, guard = () => {}) =>
    (await prepare(command, args))!.run(guard);
  return { registry, presets, rows, native, catalog, prepare, run, runtimeChanged };
}
const fullPlan = {
  orchestrator: alternate,
  assignmentDefault: route,
  assignmentModels: [{ ...route, allowedEfforts: [''], defaultEffort: '' }],
};

describe('Tob scoped model and runtime operations', () => {
  it('discovers only supported live settings and bounded Bot identity', async () => {
    const f = fixture();
    expect(await f.run('list')).toEqual({
      bots: [
        { slug: 'one', displayName: 'One' },
        { slug: 'two', displayName: 'Two' },
      ],
    });
    expect(JSON.stringify(await f.run('settings'))).not.toContain('privateField');
    expect(await f.run('model-catalog')).toEqual({
      models: [],
      default: route,
      defaultRevision: 0,
    });
    expect(await f.prepare('unhandled', {})).toBeUndefined();
    await expect(f.run('settings', { ns: 'credentials' })).rejects.toMatchObject({
      code: 'unsupported-setting',
    });
  });
  it('discovers models and configures an unset native default using its real revision', async () => {
    const f = fixture();
    f.rows[1]!.value = {};
    expect(await f.run('model-catalog')).toEqual({ models: [], defaultRevision: 0 });
    expect(await f.run('settings', { ns: 'agent-default-model' })).toMatchObject({
      revision: 0,
      value: {},
    });
    expect(await f.run('home-model-set', { route, expectedRevision: 0 })).toEqual({
      route,
      revision: 1,
    });
  });

  it('keeps Bot overrides while changing the native Host default with its revision', async () => {
    const f = fixture();
    await f.run('model-plan-set', { slug: 'one', expectedRevision: 0, ...fullPlan });
    const original = f.registry.get('one')!.modelPlan;
    const operation = (await f.prepare('home-model-set', {
      route: alternate,
      expectedRevision: 0,
    }))!;
    expect(operation.proposal).toMatchObject({
      target: 'agent-default-model',
      previousValue: route,
      patch: alternate,
      expectedRevision: 0,
    });
    expect(Object.isFrozen(operation.proposal!.patch)).toBe(true);
    expect(await operation.run(() => {})).toEqual({ route: alternate, revision: 1 });
    expect(f.registry.get('one')!.modelPlan).toEqual(original);
    expect(f.registry.get('two')!.modelPlan).toBeUndefined();
    await f.run('home-model-set', { route, expectedRevision: 1 });
    expect(f.rows[1]!.value).toEqual(route);
    expect(f.native.replace).toHaveBeenCalledTimes(2);
  });
  it('rejects stale native settings before review and after review without overwriting', async () => {
    const f = fixture();
    const args = {
      ns: 'botharness-client',
      patch: { assignmentConcurrencyLimit: 3 },
      previousValue: { assignmentConcurrencyLimit: 8 },
      expectedRevision: 0,
    };
    const operation = (await f.prepare('settings-set', args))!;
    f.rows[0]!.revision++;
    await expect(operation.run(() => {})).rejects.toMatchObject({ code: 'stale-setting' });
    await expect(f.prepare('settings-set', args)).rejects.toMatchObject({ code: 'stale-setting' });
    expect(f.native.update).not.toHaveBeenCalled();
  });
  it('updates all supported runtime preferences and rejects unsupported or malformed fields', async () => {
    const f = fixture();
    const patch = {
      assignmentConcurrencyLimit: 3,
      developerMode: true,
      showBotSessions: false,
      showApprovalReviewSessions: true,
    };
    const previousValue = {
      assignmentConcurrencyLimit: 8,
      developerMode: false,
      showBotSessions: true,
      showApprovalReviewSessions: false,
    };
    expect(
      await f.run('settings-set', {
        ns: 'botharness-client',
        patch,
        previousValue,
        expectedRevision: 0,
      }),
    ).toMatchObject({ revision: 1, value: patch });
    expect(f.runtimeChanged).toHaveBeenCalledWith(patch);
    for (const bad of [
      { assignmentConcurrencyLimit: 33 },
      { developerMode: 'true' },
      { privateField: true },
    ]) {
      await expect(
        f.prepare('settings-set', {
          ns: 'botharness-client',
          patch: bad,
          previousValue: {},
          expectedRevision: 1,
        }),
      ).rejects.toBeInstanceOf(TobError);
    }
  });
  it('preserves owner CAS and reports late cancellation as an uncertain outcome', async () => {
    const f = fixture();
    const args = { route: alternate, expectedRevision: 0 };
    const op = (await f.prepare('home-model-set', args))!;
    const guard = vi
      .fn()
      .mockImplementationOnce(() => {})
      .mockImplementation(() => {
        throw new TobError('agent-context-expired');
      });
    await expect(op.run(guard)).rejects.toMatchObject({ code: 'setting-outcome-uncertain' });
    expect(f.rows[1]!.value).toEqual(alternate);
    const conflict = fixture();
    vi.mocked(conflict.native.replace).mockRejectedValueOnce(
      Object.assign(new Error('stale'), { code: 'SETTINGS_CONFLICT' }),
    );
    await expect(conflict.run('home-model-set', args)).rejects.toMatchObject({
      code: 'stale-setting',
    });
  });
  it('revalidates model availability and authority after approval', async () => {
    const f = fixture();
    const op = (await f.prepare('model-plan-set', {
      slug: 'one',
      expectedRevision: 0,
      ...fullPlan,
    }))!;
    f.catalog.validate.mockRejectedValue(new Error('provider secret must not escape'));
    await expect(op.run(() => {})).rejects.toMatchObject({
      code: 'model-unavailable',
      message: 'model-unavailable',
    });
    expect(f.registry.get('one')!.modelPlan).toBeUndefined();
    f.catalog.validate.mockResolvedValue(undefined);
    await expect(
      op.run(() => {
        throw new TobError('agent-context-expired');
      }),
    ).rejects.toMatchObject({ code: 'agent-context-expired' });
    expect(f.registry.get('one')!.modelPlan).toBeUndefined();
  });
  it('keeps model reads pure, guards Bot revisions, and supports customize/inherit', async () => {
    const f = fixture();
    expect(await f.run('model-plan', { slug: 'one' })).toEqual({ revision: 0 });
    const op = (await f.prepare('model-plan-customize', {
      slug: 'one',
      orchestrator: alternate,
      expectedRevision: 0,
    }))!;
    await f.run('model-plan-set', { slug: 'one', expectedRevision: 0, ...fullPlan });
    await expect(op.run(() => {})).rejects.toMatchObject({ code: 'stale-setting' });
    await f.run('model-plan-customize', { slug: 'one', orchestrator: route, expectedRevision: 1 });
    expect(f.registry.get('one')!.modelPlan!.orchestrator).toEqual(route);
    await f.run('model-plan-inherit', { slug: 'one', expectedRevision: 2 });
    expect(await f.run('model-plan', { slug: 'one' })).toEqual({ revision: 3 });
  });
  it('creates and updates presets and refuses apply when either target changed', async () => {
    const f = fixture();
    await f.run('model-preset-create', { name: 'Fast', ...fullPlan });
    const preset = f.presets.list()[0]!;
    const args = {
      slug: 'one',
      presetId: preset.id,
      expectedRevision: 0,
      expectedPresetRevision: 1,
    };
    const op = (await f.prepare('model-preset-apply', args))!;
    await f.run('model-preset-update', {
      id: preset.id,
      expectedRevision: 1,
      name: 'New',
      ...fullPlan,
    });
    await expect(op.run(() => {})).rejects.toMatchObject({ code: 'stale-setting' });
    const current = (await f.prepare('model-preset-apply', {
      ...args,
      expectedPresetRevision: 2,
    }))!;
    await current.run(() => {});
    expect(f.registry.get('one')!.modelPlan!.sourcePresetName).toBe('New');
    await expect(
      f.prepare('model-preset-apply', { ...args, expectedPresetRevision: 2 }),
    ).rejects.toMatchObject({ code: 'stale-setting' });
  });
  it('validates Assignment effort choices and supports changing only Assignment models', async () => {
    const f = fixture();
    await f.run('model-plan-set', { slug: 'one', expectedRevision: 0, ...fullPlan });
    const patch = {
      assignmentDefault: alternate,
      assignmentModels: [
        {
          provider: alternate.provider,
          model: alternate.model,
          allowedEfforts: ['low', 'high'],
          defaultEffort: 'high',
        },
      ],
    };
    await f.run('model-plan-assignments-set', { slug: 'one', expectedRevision: 1, ...patch });
    expect(f.registry.get('one')!.modelPlan).toMatchObject({ orchestrator: alternate, ...patch });
    await expect(
      f.prepare('model-plan-assignments-set', {
        slug: 'one',
        expectedRevision: 2,
        ...patch,
        assignmentDefault: route,
      }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(
      f.prepare('home-model-set', { route: { ...route, apiKey: 'secret' }, expectedRevision: 0 }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
  });
});
