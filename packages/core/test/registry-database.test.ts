import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createPersonaBotRegistry } from '../src/bots/registry.js';
import type { PersonaBotRecord } from '../src/bots/persona-bot.js';
import { deriveAvatarAppearance } from '../src/bots/avatar-snapshot.js';
import { DEFAULT_ILLUSTRATED_RECIPE } from '../src/bots/avatar-appearance.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
  type OperationalDatabaseOwnerOptions,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createCore } from '../src/plugin.js';

const homes: string[] = [];
const owners: OperationalDatabaseOwner[] = [];
const route = { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'low' };
const legacy: PersonaBotRecord = {
  slug: 'existing',
  displayName: 'Existing',
  createdAt: '2026-10-05T00:00:00Z',
  workspaces: ['/workspace'],
  roles: ['Research'],
  description: 'Saved identity',
  paused: true,
  computerAccess: true,
  browserAccess: true,
  browserProfile: 'existing-profile',
  ...deriveAvatarAppearance(DEFAULT_ILLUSTRATED_RECIPE),
  modelPlan: {
    revision: 2,
    sourcePresetId: 'preset-id',
    sourcePresetName: 'Original',
    appliedAt: '2026-10-05T00:00:00Z',
    orchestrator: route,
    assignmentDefault: route,
    assignmentModels: [
      {
        provider: route.provider,
        model: route.model,
        allowedEfforts: ['low', 'high'],
        defaultEffort: 'low',
      },
    ],
  },
};
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'bh-registry-database-'));
  homes.push(home);
  const rootDir = join(home, 'botharness', 'bots');
  const directory = join(rootDir, legacy.slug);
  mkdirSync(join(directory, 'memory'), { recursive: true });
  writeFileSync(join(directory, 'memory', 'PERSONA.md'), '# Handwritten Soul\n');
  return { home, rootDir, directory, file: join(directory, 'bot.json') };
}
function mount(
  home: string,
  options: Omit<OperationalDatabaseOwnerOptions, 'dshHome' | 'schemaPlan'> = {},
) {
  const owner = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    ...options,
  });
  owners.push(owner);
  return owner;
}
afterEach(() => {
  for (const owner of owners.splice(0)) owner.close();
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});
describe('Registry database authority', () => {
  it('imports validated identity/appearance/access/independent plan once, excludes unknown fields and preserves Soul', () => {
    const f = fixture();
    const original = JSON.stringify({
      ...legacy,
      credential: 'not-copied',
      modelPlan: {
        ...legacy.modelPlan,
        credential: 'not-copied',
        orchestrator: { ...route, secret: 'not-copied' },
      },
    });
    writeFileSync(f.file, original);
    const owner = mount(f.home);
    const registry = createPersonaBotRegistry({ rootDir: f.rootDir, database: owner });
    expect(registry.get(legacy.slug)).toEqual(legacy);
    expect(registry.update(legacy.slug, { displayName: 'Updated' }).ok).toBe(true);
    expect(
      registry.customizeModelPlan(legacy.slug, { ...route, reasoningEffort: 'high' }, 2).ok,
    ).toBe(true);
    expect(registry.customizeModelPlan(legacy.slug, route, 2).ok).toBe(false);
    const saved = registry.get(legacy.slug);
    expect(readFileSync(f.file, 'utf8')).toBe(original);
    writeFileSync(f.file, '{broken after cutover');
    owner.close();
    const reopened = createPersonaBotRegistry({ rootDir: f.rootDir, database: mount(f.home) });
    expect(reopened.get(legacy.slug)).toEqual(saved);
    rmSync(f.file);
    expect(reopened.list()).toEqual([saved]);
    expect(readFileSync(join(f.directory, 'memory', 'PERSONA.md'), 'utf8')).toBe(
      '# Handwritten Soul\n',
    );
  });
  it('persists an Orchestrator-only override and retains Assignment inheritance across restart and later edits', () => {
    const f = fixture();
    const owner = mount(f.home);
    const registry = createPersonaBotRegistry({ rootDir: f.rootDir, database: owner });
    registry.create({ slug: 'new', displayName: 'New' });
    expect(registry.customizeModelPlan('new', route, 0).ok).toBe(true);
    const saved = registry.get('new')!.modelPlan!;
    expect(saved.orchestrator).toEqual(route);
    expect(saved).not.toHaveProperty('assignmentDefault');
    expect(saved).not.toHaveProperty('assignmentModels');
    expect(registry.customizeModelPlan('new', route, 0).ok).toBe(false);
    owner.close();
    const reopened = createPersonaBotRegistry({ rootDir: f.rootDir, database: mount(f.home) });
    expect(reopened.get('new')?.modelPlan).toEqual(saved);
    expect(reopened.customizeModelPlan('new', { ...route, reasoningEffort: 'high' }, 1).ok).toBe(
      true,
    );
    expect(reopened.get('new')?.modelPlan).not.toHaveProperty('assignmentDefault');
  });
  it('marks an empty import and ignores later introduced JSON records', () => {
    const f = fixture();
    const owner = mount(f.home);
    const registry = createPersonaBotRegistry({ rootDir: f.rootDir, database: owner });
    expect(registry.list()).toEqual([]);
    registry.create({ slug: 'new', displayName: 'New' });
    writeFileSync(f.file, JSON.stringify(legacy));
    expect(
      createPersonaBotRegistry({ rootDir: f.rootDir, database: owner })
        .list()
        .map((r) => r.slug),
    ).toEqual(['new']);
    expect(existsSync(join(f.rootDir, 'new', 'bot.json'))).toBe(false);
  });
  it.each([
    '{broken',
    JSON.stringify({ ...legacy, slug: 'different' }),
    JSON.stringify({ ...legacy, paused: 'yes' }),
    JSON.stringify({ ...legacy, modelPlan: { ...legacy.modelPlan, revision: 0 } }),
  ])(
    'rejects invalid input without a partial registry/marker and retries after repair',
    (invalid) => {
      const f = fixture();
      mkdirSync(join(f.rootDir, 'valid'));
      writeFileSync(
        join(f.rootDir, 'valid', 'bot.json'),
        JSON.stringify({ ...legacy, slug: 'valid' }),
      );
      writeFileSync(f.file, invalid);
      const owner = mount(f.home);
      expect(() => createPersonaBotRegistry({ rootDir: f.rootDir, database: owner })).toThrow(
        'Registry import failed',
      );
      const port = attachOperationalModule(owner, 'test');
      expect(port.read((db) => db.prepare('SELECT slug FROM persona_bots').all())).toEqual([]);
      expect(
        port.read((db) => db.prepare('SELECT singleton FROM persona_bots_import').all()),
      ).toEqual([]);
      expect(readFileSync(f.file, 'utf8')).toBe(invalid);
      writeFileSync(f.file, JSON.stringify(legacy));
      expect(createPersonaBotRegistry({ rootDir: f.rootDir, database: owner }).list()).toHaveLength(
        2,
      );
    },
  );
  it('rolls back import records and marker when commit is interrupted', () => {
    const f = fixture();
    writeFileSync(f.file, JSON.stringify(legacy));
    const owner = mount(f.home, {
      faultInjector: ({ stage }) => {
        if (stage === 'before-commit') throw new Error('interrupted');
      },
    });
    expect(() => createPersonaBotRegistry({ rootDir: f.rootDir, database: owner })).toThrow();
    expect(owner.mode).toBe('recovery');
    owner.close();
    const next = mount(f.home);
    const port = attachOperationalModule(next, 'test');
    expect(port.read((db) => db.prepare('SELECT slug FROM persona_bots').all())).toEqual([]);
    expect(
      port.read((db) => db.prepare('SELECT singleton FROM persona_bots_import').all()),
    ).toEqual([]);
    expect(
      createPersonaBotRegistry({ rootDir: f.rootDir, database: next }).get(legacy.slug),
    ).toEqual(legacy);
  });
  it('does not let a diagnostics observer turn a committed import into failure', () => {
    const f = fixture();
    writeFileSync(f.file, JSON.stringify(legacy));
    const registry = createPersonaBotRegistry({
      rootDir: f.rootDir,
      database: mount(f.home),
      onImport: () => {
        throw new Error('observer');
      },
    });
    expect(registry.get(legacy.slug)).toEqual(legacy);
  });
  it('blocks competing/closed owners before file or registry mutation, including async Git import', async () => {
    const f = fixture();
    writeFileSync(f.file, JSON.stringify(legacy));
    const owner = mount(f.home);
    const registry = createPersonaBotRegistry({ rootDir: f.rootDir, database: owner });
    const second = mount(f.home);
    expect(second.mode).toBe('recovery');
    const refused = createPersonaBotRegistry({
      rootDir: f.rootDir,
      database: second,
      cloneMemory: async () => ({ ok: true }),
    });
    expect(() => refused.create({ slug: 'denied', displayName: 'Denied' })).toThrow();
    expect(() => refused.remove(legacy.slug)).toThrow();
    expect(existsSync(f.directory)).toBe(true);
    expect(existsSync(join(f.rootDir, 'denied'))).toBe(false);
    await expect(
      refused.createFromGit({
        slug: 'denied',
        displayName: 'Denied',
        gitUrl: 'https://example.test/soul.git',
      }),
    ).rejects.toThrow();
    owner.close();
    expect(() => registry.get(legacy.slug)).toThrow();
    expect(() => registry.setBrowserAccess(legacy.slug, false)).toThrow();
  });
  it('Core closes its owner lease when registry import aborts startup', () => {
    const f = fixture();
    writeFileSync(f.file, '{broken');
    expect(() => createCore({ dshHome: f.home })).toThrow('Registry import failed');
    const next = mount(f.home);
    expect(next.mode).toBe('ready');
    expect(readFileSync(f.file, 'utf8')).toBe('{broken');
  });
  it('refuses legacy removal/purge and preserves Registry authority and Soul', () => {
    const f = fixture();
    writeFileSync(f.file, JSON.stringify(legacy));
    const owner = mount(f.home);
    const registry = createPersonaBotRegistry({ rootDir: f.rootDir, database: owner });
    expect(() => registry.remove(legacy.slug)).toThrow('confirmed PersonaBot deletion');
    expect(() => registry.remove(legacy.slug, { purge: true })).toThrow(
      'confirmed PersonaBot deletion',
    );
    expect(registry.get(legacy.slug)).toEqual(legacy);
    expect(readFileSync(f.file, 'utf8')).toBe(JSON.stringify(legacy));
    expect(readFileSync(join(f.directory, 'memory', 'PERSONA.md'), 'utf8')).toBe(
      '# Handwritten Soul\n',
    );
  });
  it('keeps Core recovery diagnostics available and rejects Registry operations in a competing Host', async () => {
    const f = fixture();
    const first = createCore({ dshHome: f.home });
    const second = createCore({ dshHome: f.home });
    try {
      expect(second.operationalDatabase.diagnostics().mode).toBe('recovery');
      expect(() => second.registry.create({ slug: 'denied', displayName: 'Denied' })).toThrow();
      expect(() =>
        second.runtime.admitDmMessage({
          channelId: 'qa-channel',
          messageId: 'qa-message',
          body: 'must not execute',
        }),
      ).toThrow();
      expect(existsSync(join(f.rootDir, 'denied'))).toBe(false);
    } finally {
      for (const core of [second, first]) {
        await core.runtime.close();
        core.live.close();
        core.externalMessaging.close();
        core.operationalDatabase.close();
      }
    }
  });
});
