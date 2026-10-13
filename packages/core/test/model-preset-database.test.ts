import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import {
  createModelPresetStore,
  isAssignmentModelOption,
  type ModelPreset,
} from '../src/models/presets.js';

const homes: string[] = [];
const owners: OperationalDatabaseOwner[] = [];
const route = { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' };
const legacy: ModelPreset = {
  id: 'old-id',
  name: 'Existing',
  revision: 4,
  createdAt: '2026-10-05T00:00:00Z',
  orchestrator: route,
  assignmentDefault: route,
  assignmentModels: [
    {
      provider: route.provider,
      model: route.model,
      allowedEfforts: ['low', 'high'],
      defaultEffort: 'high',
    },
  ],
};
function home(): string {
  const value = mkdtempSync(join(tmpdir(), 'bh-preset-database-'));
  homes.push(value);
  return value;
}
function mount(
  root: string,
  faultInjector?: Parameters<typeof mountOperationalDatabase>[0]['faultInjector'],
) {
  const owner = mountOperationalDatabase({
    dshHome: root,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    ...(faultInjector === undefined ? {} : { faultInjector }),
  });
  owners.push(owner);
  return owner;
}
afterEach(() => {
  for (const owner of owners.splice(0)) owner.close();
  for (const root of homes.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Model Preset owning database persistence', () => {
  it('imports declared fields once, retains the source and ignores later legacy edits across a cold reopen', () => {
    const root = home();
    const file = join(root, 'model-presets.json');
    writeFileSync(
      file,
      JSON.stringify([
        { ...legacy, credential: 'do-not-copy', orchestrator: { ...route, secret: 'do-not-copy' } },
      ]),
    );
    const owner = mount(root);
    const store = createModelPresetStore({ rootDir: root, database: owner });
    expect(store.list()).toEqual([legacy]);
    expect(readFileSync(file, 'utf8')).toContain('do-not-copy');
    const updated = store.update(legacy.id, {
      name: 'Updated',
      expectedRevision: 4,
      orchestrator: route,
      assignmentDefault: route,
    });
    expect(updated?.revision).toBe(5);
    writeFileSync(file, 'broken source after cutover');
    owner.close();
    const reopened = createModelPresetStore({ rootDir: root, database: mount(root) });
    expect(reopened.list()).toEqual([updated]);
    rmSync(file);
    expect(reopened.get(legacy.id)).toEqual(updated);
  });

  it('keeps a usage note on an allowed Assignment model across a cold reopen', () => {
    const root = home();
    const owner = mount(root);
    const assignmentModels = [
      { ...legacy.assignmentModels![0]!, note: 'Use for hard debugging' },
      {
        provider: 'kimi',
        model: 'k2',
        allowedEfforts: [''],
        defaultEffort: '',
        note: 'Quick lookups',
      },
    ];
    const created = createModelPresetStore({ rootDir: root, database: owner }).create({
      name: 'Notes',
      orchestrator: route,
      assignmentDefault: route,
      assignmentModels,
    });
    owner.close();
    expect(
      createModelPresetStore({ rootDir: root, database: mount(root) }).get(created.id)
        ?.assignmentModels,
    ).toEqual(assignmentModels);
  });

  it('rejects a blank or oversized usage note', () => {
    const option = { provider: 'kimi', model: 'k2', allowedEfforts: [''], defaultEffort: '' };
    expect(isAssignmentModelOption({ ...option, note: 'Quick lookups' })).toBe(true);
    expect(isAssignmentModelOption({ ...option, note: '   ' })).toBe(false);
    expect(isAssignmentModelOption({ ...option, note: 'x'.repeat(501) })).toBe(false);
    expect(isAssignmentModelOption({ ...option, note: 3 })).toBe(false);
  });

  it('does not let diagnostics failure change the committed import outcome', () => {
    const root = home();
    writeFileSync(join(root, 'model-presets.json'), JSON.stringify([legacy]));
    const owner = mount(root);
    const store = createModelPresetStore({
      rootDir: root,
      database: owner,
      onImport: () => {
        throw new Error('observer failed');
      },
    });
    expect(store.list()).toEqual([legacy]);
    owner.close();
    expect(createModelPresetStore({ rootDir: root, database: mount(root) }).list()).toEqual([
      legacy,
    ]);
  });

  it('marks an empty import so a subsequently introduced legacy file cannot override new templates', () => {
    const root = home();
    const owner = mount(root);
    const store = createModelPresetStore({ rootDir: root, database: owner });
    const created = store.create({ name: 'New', orchestrator: route, assignmentDefault: route });
    writeFileSync(join(root, 'model-presets.json'), JSON.stringify([legacy]));
    owner.close();
    expect(createModelPresetStore({ rootDir: root, database: mount(root) }).list()).toEqual([
      created,
    ]);
  });

  it.each([
    '{broken',
    JSON.stringify([legacy, legacy]),
    JSON.stringify([{ ...legacy, revision: 0 }]),
  ])(
    'rejects a corrupt import without records or marker and can retry corrected source (%s)',
    (invalid) => {
      const root = home();
      const owner = mount(root);
      const file = join(root, 'model-presets.json');
      writeFileSync(file, invalid);
      expect(() => createModelPresetStore({ rootDir: root, database: owner })).toThrow(
        'Invalid Model Preset import source',
      );
      expect(
        attachOperationalModule(owner, 'test').read((db) =>
          db.prepare('SELECT singleton FROM model_presets_import').all(),
        ),
      ).toEqual([]);
      expect(readFileSync(file, 'utf8')).toBe(invalid);
      writeFileSync(file, JSON.stringify([legacy]));
      expect(createModelPresetStore({ rootDir: root, database: owner }).list()).toEqual([legacy]);
    },
  );

  it('rolls back the complete import when the owner refuses commit, then retries with identical IDs', () => {
    const root = home();
    writeFileSync(join(root, 'model-presets.json'), JSON.stringify([legacy]));
    const owner = mount(root, ({ stage }) => {
      if (stage === 'before-commit') throw new Error('commit interruption');
    });
    expect(() => createModelPresetStore({ rootDir: root, database: owner })).toThrow();
    owner.close();
    const next = mount(root);
    const port = attachOperationalModule(next, 'test');
    expect(port.read((db) => db.prepare('SELECT id FROM model_presets').all())).toEqual([]);
    expect(
      port.read((db) => db.prepare('SELECT singleton FROM model_presets_import').all()),
    ).toEqual([]);
    expect(createModelPresetStore({ rootDir: root, database: next }).list()).toEqual([legacy]);
  });

  it('keeps legacy data out of competing-writer and closed-owner operation paths', () => {
    const root = home();
    const owner = mount(root);
    writeFileSync(join(root, 'model-presets.json'), JSON.stringify([legacy]));
    const first = createModelPresetStore({ rootDir: root, database: owner });
    const second = mount(root);
    expect(second.mode).toBe('recovery');
    const unavailable = createModelPresetStore({ rootDir: root, database: second });
    expect(() => unavailable.list()).toThrow();
    expect(() =>
      unavailable.create({ name: 'Forbidden', orchestrator: route, assignmentDefault: route }),
    ).toThrow();
    owner.close();
    expect(() => first.list()).toThrow();
    expect(() =>
      first.update(legacy.id, {
        name: 'Forbidden',
        expectedRevision: 4,
        orchestrator: route,
        assignmentDefault: route,
      }),
    ).toThrow();
  });
});
