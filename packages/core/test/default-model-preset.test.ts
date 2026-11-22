import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  OperationalDatabaseError,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import {
  createModelPresetStore,
  DEFAULT_MODEL_PRESET_ID,
  presetSubFromLegacy,
  defaultPresetPlan,
  defaultPresetRoute,
  resolveBotModelPlan,
  type ModelPreset,
} from '../src/models/presets.js';
import { createRoutingGroupStore } from '../src/models/routing-groups.js';
import { agentOptions } from '../src/runtime/dsh-bot-agent-adapter-shared.js';

const homes: Array<{ root: string; close(): void }> = [];
const main = { provider: 'opencode-go', model: 'deepseek-v4-pro', reasoningEffort: 'high' };
const sub = { provider: 'opencode-go', model: 'deepseek-v4-flash', reasoningEffort: 'low' };

it.each(['model-preset-sub-choices', 'model-preset-sub-engine-choices'])(
  'backfills each legacy sub field combination from before %s without changing revisions',
  (migration) => {
    const root = mkdtempSync(join(tmpdir(), 'bh-preset-sub-upgrade-'));
    const prior = mountOperationalDatabase({
      dshHome: root,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.slice(
          0,
          BOT_HARNESS_SCHEMA_PLAN.migrations.findIndex(({ id }) => id === migration),
        ),
      ),
    });
    const flash = {
      provider: sub.provider,
      model: sub.model,
      allowedEfforts: ['low', 'high'],
      defaultEffort: 'low',
      note: 'Quick tasks',
    };
    const pro = {
      provider: main.provider,
      model: main.model,
      allowedEfforts: ['high'],
      defaultEffort: 'high',
    };
    const modelDefault = { kind: 'model', provider: sub.provider, model: sub.model };
    const groupDefault = { kind: 'group', group: 'backup' };
    const fallback = {
      group: 'backup',
      allowedEfforts: ['low'],
      defaultEffort: 'low',
      note: 'Fallback',
    };
    const engineDefault = {
      kind: 'engine',
      engine: 'codex' as const,
      accountId: 'codex-work',
      model: 'gpt-test',
    };
    const { kind: _kind, ...engine } = { ...engineDefault, effort: 'high' };
    const engineChoice = { ...engineDefault, effort: 'high' };
    const routeChoice = { ...modelDefault, allowedEfforts: ['low'], defaultEffort: 'low' };
    const fixtures: Array<{ id: string; fields: Partial<ModelPreset>; expected: unknown }> = [
      {
        id: 'default',
        fields: {
          assignmentFollowsMain: true,
          assignmentEngine: engine,
          orchestratorGroupId: 'backup',
        },
        expected: { choices: [engineChoice], default: engineDefault },
      },
      {
        id: 'follows-main',
        fields: {
          assignmentFollowsMain: true,
          orchestratorGroupId: 'backup',
          orchestratorGroupEffort: 'high',
        },
        expected: { choices: [], default: null },
      },
      {
        id: 'route',
        fields: {},
        expected: {
          choices: [{ ...modelDefault, allowedEfforts: ['low'], defaultEffort: 'low' }],
          default: modelDefault,
        },
      },
      {
        id: 'listed',
        fields: { assignmentModels: [flash, pro] },
        expected: {
          choices: [
            { kind: 'model', ...flash },
            { kind: 'model', ...pro },
          ],
          default: modelDefault,
        },
      },
      {
        id: 'groups',
        fields: { assignmentGroups: ['backup'] },
        expected: {
          choices: [
            { ...modelDefault, allowedEfforts: ['low'], defaultEffort: 'low' },
            groupDefault,
          ],
          default: modelDefault,
        },
      },
      {
        id: 'mixed',
        fields: {
          assignmentModels: [flash, pro],
          assignmentGroups: ['backup'],
          assignmentDefaultGroupId: 'backup',
          assignmentGroupOptions: [fallback],
          openAssignmentModels: true,
        },
        expected: {
          choices: [
            { kind: 'model', ...flash },
            { kind: 'model', ...pro },
            { kind: 'group', ...fallback },
          ],
          default: groupDefault,
        },
      },
      {
        id: 'already-shaped',
        fields: { sub: { choices: [], default: null } },
        expected: { choices: [], default: null },
      },
      {
        id: 'engine-with-implicit-route',
        fields: { assignmentEngine: engine },
        expected: { choices: [routeChoice, engineChoice], default: engineDefault },
      },
      {
        id: 'engine-with-models',
        fields: { assignmentEngine: engine, assignmentModels: [flash, pro] },
        expected: {
          choices: [{ kind: 'model', ...flash }, { kind: 'model', ...pro }, engineChoice],
          default: engineDefault,
        },
      },
      {
        id: 'engine-with-routing-group',
        fields: {
          assignmentEngine: engine,
          assignmentGroups: ['backup'],
          assignmentDefaultGroupId: 'backup',
        },
        expected: { choices: [routeChoice, groupDefault, engineChoice], default: engineDefault },
      },
      {
        id: 'engine-with-models-and-routing-group',
        fields: {
          assignmentEngine: engine,
          assignmentModels: [flash],
          assignmentGroups: ['backup'],
          assignmentDefaultGroupId: 'backup',
          assignmentGroupOptions: [fallback],
        },
        expected: {
          choices: [{ kind: 'model', ...flash }, { kind: 'group', ...fallback }, engineChoice],
          default: engineDefault,
        },
      },
      {
        id: 'engine-with-default-account-and-model',
        fields: { assignmentEngine: { engine: 'claude' } },
        expected: {
          choices: [routeChoice, { kind: 'engine', engine: 'claude' }],
          default: { kind: 'engine', engine: 'claude' },
        },
      },
    ];
    homes.push({ root, close: () => prior.close() });
    attachOperationalModule(prior, 'test').transaction(
      (db) => {
        const insert = db.prepare('INSERT INTO model_presets (id, body) VALUES (?, ?)');
        for (const { id, fields } of fixtures)
          insert.run(
            id,
            JSON.stringify({
              id,
              name: id,
              revision: 7,
              createdAt: '2026-11-21',
              orchestrator: main,
              assignmentDefault: sub,
              ...fields,
              ...(migration === 'model-preset-sub-engine-choices' && !('sub' in fields)
                ? { sub: presetSubFromLegacy({ assignmentDefault: sub, ...fields }) }
                : {}),
            }),
          );
        db.prepare("INSERT INTO model_presets_import VALUES (1, '2026-11-21')").run();
      },
      ['model-presets'],
    );
    prior.close();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const database = mountOperationalDatabase({
        dshHome: root,
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      });
      homes.push({ root, close: () => database.close() });
      const store = createModelPresetStore({ rootDir: root, database });
      expect(store.list()).toHaveLength(fixtures.length);
      for (const { id, fields, expected } of fixtures)
        expect(store.get(id)).toMatchObject({ id, revision: 7, ...fields, sub: expected });
      expect(defaultPresetPlan(store.get('default')!).sub).toEqual({
        choices: [engineChoice],
        default: engineDefault,
      });
      expect(
        defaultPresetPlan(store.get('engine-with-routing-group')!).assignmentDefaultGroupId,
      ).toBeUndefined();
      expect(defaultPresetPlan(store.get('follows-main')!).sub).toEqual({
        choices: [{ ...groupDefault, allowedEfforts: ['high'], defaultEffort: 'high' }],
        default: groupDefault,
      });
      database.close();
    }
  },
);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'bh-default-preset-'));
  const database = mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  homes.push({ root, close: () => database.close() });
  return {
    root,
    database,
    open: () =>
      createModelPresetStore({
        rootDir: root,
        database,
        now: () => new Date('2026-11-21T00:00:00Z'),
      }),
  };
}

afterEach(() => {
  for (const home of homes) home.close();
  for (const home of homes.splice(0)) rmSync(home.root, { recursive: true, force: true });
});

describe('Default Model Preset cutover', () => {
  it('creates one pinned preset on a fresh Host and refuses deletion', () => {
    const store = fixture().open();
    const { preset } = store.migrateDefault({});
    expect(preset).toMatchObject({ id: 'default', name: 'Default', assignmentFollowsMain: true });
    expect(store.list()).toEqual([preset]);
    expect(() => store.delete(DEFAULT_MODEL_PRESET_ID, preset.revision)).toThrow(
      expect.objectContaining({ code: 'default-preset-pinned' }),
    );
  });

  it('previews without writing and keeps main effort, with sub following main', () => {
    const store = fixture().open();
    const preview = store.migrateDefault({ main }, { dryRun: true });
    expect(preview).toMatchObject({
      status: 'would-migrate',
      preset: { orchestrator: main, assignmentDefault: main, assignmentFollowsMain: true },
    });
    expect(store.list()).toEqual([]);
    expect(store.migrateDefault({ main }).preset).toEqual(preview.preset);
  });

  it('keeps explicit sub and both reasoning efforts', () => {
    expect(fixture().open().migrateDefault({ main, sub }).preset).toMatchObject({
      orchestrator: main,
      assignmentDefault: sub,
    });
  });

  it('moves the Routing Group, including its effort and Subscription Engine account, across the schema upgrade', () => {
    const root = mkdtempSync(join(tmpdir(), 'bh-default-preset-upgrade-'));
    const previous = mountOperationalDatabase({
      dshHome: root,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.slice(
          0,
          BOT_HARNESS_SCHEMA_PLAN.migrations.findIndex(({ id }) => id === 'default-model-preset'),
        ),
      ),
    });
    homes.push({ root, close: () => previous.close() });
    const account = {
      kind: 'engine',
      engine: 'codex',
      accountId: 'account-1',
      model: 'gpt-6',
      reasoningEffort: 'high',
    } as const;
    const group = createRoutingGroupStore({ database: previous }).create({
      name: 'Fallback',
      members: [account, { kind: 'model', ...main }],
    });
    attachOperationalModule(previous, 'test').transaction((db) => {
      db.prepare(
        'INSERT INTO routing_group_default (singleton, group_id, revision, effort) VALUES (1, ?, 1, ?)',
      ).run(group.id, 'max');
    }, []);
    previous.close();

    const database = mountOperationalDatabase({
      dshHome: root,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    homes.push({ root, close: () => database.close() });
    const legacy = attachOperationalModule(database, 'test');
    const store = createModelPresetStore({ rootDir: root, database });
    const readLegacy = () =>
      legacy.read((db) => db.prepare('SELECT group_id FROM legacy_routing_group_default').all());
    expect(store.migrateDefault({ main }, { dryRun: true }).status).toBe('would-migrate');
    expect(readLegacy()).toHaveLength(1);
    const { preset } = store.migrateDefault({ main });
    expect(preset).toMatchObject({
      orchestratorGroupId: group.id,
      orchestratorGroupEffort: 'max',
      assignmentFollowsMain: true,
    });
    const plan = resolveBotModelPlan({}, () => defaultPresetPlan(preset));
    expect(plan).toMatchObject({ sourcePresetId: 'default', assignmentDefaultGroupId: group.id });
    expect(createRoutingGroupStore({ database }).get(group.id)?.members[0]).toEqual(account);
    expect(readLegacy()).toEqual([]);
  });

  it('preserves a separately chosen sub when the existing settings page changes main', () => {
    const store = fixture().open();
    const { preset } = store.migrateDefault({ main, sub });
    const saved = store.setDefaultMain({
      expectedRevision: preset.revision,
      route: { ...main, reasoningEffort: 'max' },
      preserveSub: true,
    });
    expect(saved.assignmentDefault).toEqual(sub);
    expect(saved.assignmentFollowsMain).toBeUndefined();
  });

  it('inherits only the sub model when a Bot has customized its main model', () => {
    const { preset } = fixture().open().migrateDefault({ main, sub });
    const defaults = defaultPresetPlan(preset);
    const orphan = {
      revision: 1,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: sub,
      appliedAt: defaults.appliedAt,
    };
    expect(resolveBotModelPlan({ modelPlan: orphan }, () => defaults)).toEqual({
      ...orphan,
      assignmentDefault: sub,
      sub: defaults.sub,
    });
    expect(resolveBotModelPlan({ model: 'legacy-route' }, () => defaults)).toBeUndefined();
  });

  it('uses a fixed Orchestrator route without looking up the inherited selection', () => {
    const { preset } = fixture().open().migrateDefault({ main, sub });
    const fixed = { ...defaultPresetPlan(preset), orchestrator: sub };
    const selection = agentOptions(
      {
        bot: { slug: 'fixed', displayName: 'Fixed', workspaces: [], createdAt: preset.createdAt },
        inboundChannelId: undefined,
      },
      {
        currentSelection: () => {
          throw new Error('uncalled inherited selection');
        },
      },
      fixed,
    );
    expect(selection).toEqual(sub);
  });

  it('preserves a user preset called Default and never replays the source', () => {
    const { root, open } = fixture();
    const custom = {
      id: 'older-preset',
      name: 'Default',
      revision: 2,
      orchestrator: sub,
      assignmentDefault: sub,
      createdAt: '2026-11-20T00:00:00.000Z',
    };
    writeFileSync(join(root, 'model-presets.json'), JSON.stringify([custom]));
    const store = open();
    const migrated = store.migrateDefault({ main }).preset;
    expect(store.list()).toEqual([migrated, { ...custom, sub: presetSubFromLegacy(custom) }]);
    const edited = store.update(DEFAULT_MODEL_PRESET_ID, {
      ...migrated,
      expectedRevision: migrated.revision,
      orchestrator: sub,
    });
    expect(edited).toMatchObject({ orchestrator: sub, assignmentDefault: sub });
    expect(
      open().migrateDefault(() => {
        throw new Error('legacy source must not be reread');
      }),
    ).toEqual({ status: 'already-migrated', preset: edited });
  });
});

it('reads the Default preset route per role and falls back to the DSH default without it', () => {
  const main = { provider: 'opencode-go', model: 'deepseek-flash' };
  const sub = { provider: 'opencode-go', model: 'deepseek-pro', reasoningEffort: 'high' };
  const preset = {
    id: 'default',
    name: 'Default',
    revision: 1,
    createdAt: '2026-11-22T00:00:00.000Z',
    orchestrator: main,
    assignmentDefault: sub,
  };
  const dsh = { provider: 'deepseek-official', model: 'deepseek-flash' };
  expect(
    defaultPresetRoute(
      () => preset,
      'orchestrator',
      () => dsh,
    ),
  ).toEqual(main);
  expect(
    defaultPresetRoute(
      () => preset,
      'assignment',
      () => dsh,
    ),
  ).toEqual(sub);
  expect(
    defaultPresetRoute(
      () => undefined,
      'orchestrator',
      () => dsh,
    ),
  ).toEqual(dsh);
  expect(() =>
    defaultPresetRoute(
      () => undefined,
      'orchestrator',
      () => undefined,
    ),
  ).toThrow('Default Model Preset is unavailable');
});

it('uses the DSH default when the Default Model Preset database is in recovery', () => {
  const { root } = fixture();
  const recovery = mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  homes.push({ root, close: () => recovery.close() });
  expect(recovery.mode).toBe('recovery');
  const store = createModelPresetStore({ rootDir: root, database: recovery });
  const readPreset = () => store.get(DEFAULT_MODEL_PRESET_ID);
  expect(() => readPreset()).toThrow(expect.objectContaining({ code: 'recovery-mode' }));
  expect(defaultPresetRoute(readPreset, 'orchestrator', () => main)).toEqual(main);
  expect(() => defaultPresetRoute(readPreset, 'assignment', () => undefined)).toThrow(
    'Default Model Preset is unavailable',
  );
});

it.each([new Error('invalid preset'), new OperationalDatabaseError('read-failed', 'query failed')])(
  'propagates unrelated preset read errors: %s',
  (error) => {
    const readPreset = () => {
      throw error;
    };
    expect(() => defaultPresetRoute(readPreset, 'orchestrator', () => main)).toThrow(error);
  },
);
