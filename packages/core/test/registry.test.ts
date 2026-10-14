import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTestRegistry } from './registry-fixture.js';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isValidSlug } from '../src/index.js';
import { isPersonaBotRecord } from '../src/bots/persona-bot.js';
import { registryDatabase } from './registry-fixture.js';
import { createHash } from 'node:crypto';
import { DEFAULT_ILLUSTRATED_RECIPE, avatarSvg } from '../src/bots/avatar-appearance.js';
import { DEFAULT_LINE_RECIPE } from '../src/bots/avatar-line.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';

import { createTempRoot, FIXED_NOW } from './helpers.js';

function createRoot(): string {
  return createTempRoot('botharness-registry-');
}

describe('isValidSlug', () => {
  it('accepts kebab-case slugs and rejects hostile ones', () => {
    expect(isValidSlug('sales-assistant')).toBe(true);
    expect(isValidSlug('a1')).toBe(true);
    expect(isValidSlug('Sales')).toBe(false);
    expect(isValidSlug('-lead')).toBe(false);
    expect(isValidSlug('trail-')).toBe(false);
    expect(isValidSlug('..')).toBe(false);
    expect(isValidSlug('../evil')).toBe(false);
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('a'.repeat(65))).toBe(false);
  });
});

describe('createPersonaBotRegistry', () => {
  it('retains the committed appearance when the owner refuses the next commit', () => {
    const root = createRoot();
    let refuse = false;
    const database = registryDatabase(root, {
      faultInjector: ({ stage }) => {
        if (refuse && stage === 'before-commit') throw new Error('write refused');
      },
    });
    const registry = createTestRegistry({ rootDir: root, database });
    registry.create({ slug: 'ada', displayName: 'Ada' });
    expect(registry.setAppearance('ada', DEFAULT_ILLUSTRATED_RECIPE).ok).toBe(true);
    const original = registry.get('ada');
    refuse = true;
    expect(() =>
      registry.setAppearance('ada', { ...DEFAULT_ILLUSTRATED_RECIPE, hair: 'bob' }),
    ).toThrow();
    expect(database.mode).toBe('recovery');
    database.close();
    const reopened = mountOperationalDatabase({
      dshHome: root,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    try {
      expect(createTestRegistry({ rootDir: root, database: reopened }).get('ada')).toEqual(
        original,
      );
    } finally {
      reopened.close();
    }
  });

  it('retains an unsupported but safe appearance with its paired snapshot and drops unsafe or mismatched ones without losing the Bot', () => {
    const root = createRoot();
    const registry = createTestRegistry({ rootDir: root });
    registry.create({ slug: 'ada', displayName: 'Ada' });
    expect(registry.setAppearance('ada', DEFAULT_ILLUSTRATED_RECIPE).ok).toBe(true);
    const saved = registry.get('ada') as unknown as {
      avatar: string;
      appearance: { recipe: Record<string, unknown>; revision: string };
    };
    const png = Buffer.from(saved.avatar.split(',')[1]!, 'base64');
    const pair = (recipe: Record<string, unknown>) => ({
      recipe,
      revision: createHash('sha256').update(JSON.stringify(recipe)).update(png).digest('hex'),
    });
    const future = { ...saved.appearance.recipe, assetVersion: 999, tail: 'swirl', wiggle: 3 };
    const importRecord = (appearance: unknown) => {
      const importedRoot = createRoot();
      mkdirSync(join(importedRoot, 'ada'));
      writeFileSync(
        join(importedRoot, 'ada', 'bot.json'),
        JSON.stringify({ ...saved, appearance }),
      );
      return createTestRegistry({ rootDir: importedRoot });
    };
    const retained = importRecord(pair(future));
    expect(retained.get('ada')?.appearance).toEqual(pair(future));
    expect(retained.get('ada')?.avatar).toBe(saved.avatar);
    expect(retained.setPaused('ada', true).ok).toBe(true);
    expect(retained.get('ada')?.appearance).toEqual(pair(future));
    expect(retained.setAppearance('ada', { ...DEFAULT_ILLUSTRATED_RECIPE, hair: 'nope' }).ok).toBe(
      false,
    );
    expect(retained.get('ada')?.appearance).toEqual(pair(future));
    for (const hostile of [
      { ...future, tail: '<script>' },
      { ...future, tail: 'url(x)' },
      { ...future, tail: 'javascript:alert(1)' },
      { ...future, tail: { nested: true } },
      { ...future, assetVersion: 0 },
      { ...future, family: undefined },
    ]) {
      const bot = importRecord(pair(hostile)).get('ada');
      expect(bot?.displayName).toBe('Ada');
      expect(bot?.appearance).toBeUndefined();
    }
    const mismatched = importRecord({ ...saved.appearance, revision: 'f'.repeat(64) }).get('ada');
    expect(mismatched?.displayName).toBe('Ada');
    expect(mismatched?.appearance).toBeUndefined();
    expect(importRecord(saved.appearance).get('ada')?.appearance).toEqual(saved.appearance);
  });

  it('round-trips a portable recipe and snapshot through the owning validation and render path', () => {
    const root = createRoot();
    const registry = createTestRegistry({ rootDir: root });
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const recipe = { ...DEFAULT_LINE_RECIPE, eyes: 'big', mouth: 'fang' } as const;
    expect(registry.setAppearance('ada', recipe).ok).toBe(true);
    const portable = JSON.stringify(registry.get('ada'));
    const target = createRoot();
    mkdirSync(join(target, 'ada'), { recursive: true });
    writeFileSync(join(target, 'ada', 'bot.json'), portable);
    const restored = createTestRegistry({ rootDir: target }).get('ada');
    expect(restored?.appearance).toEqual(registry.get('ada')?.appearance);
    expect(avatarSvg(restored!.appearance!.recipe as typeof recipe)).toBe(avatarSvg(recipe));
  });

  it('clones Git history into Memory, renames its PERSONA.md on top of HEAD, and leaves no Bot after failure', async () => {
    const root = createRoot();
    const source = join(root, 'source');
    mkdirSync(source);
    execFileSync('git', ['init', '-q', source]);
    writeFileSync(join(source, 'PERSONA.md'), '# Imported persona\n');
    writeFileSync(join(source, 'notes.txt'), 'Imported memory\n');
    execFileSync('git', ['-C', source, 'add', '.']);
    execFileSync('git', [
      '-C',
      source,
      '-c',
      'user.name=QA',
      '-c',
      'user.email=qa@example.test',
      'commit',
      '-qm',
      'Imported',
    ]);
    const originalHead = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();

    let rejectClone = true;
    const registry = createTestRegistry({
      rootDir: join(root, 'bots'),
      initializeMemory: (memoryDir) => ({ ok: ensureMemoryRepository({ memoryDir }).ok }),
      cloneMemory: async (destination) => {
        if (rejectClone) {
          writeFileSync(join(destination, 'partial.txt'), 'partial');
          return { ok: false, code: 'git-clone-failed' };
        }
        execFileSync('git', ['clone', '--', source, destination]);
        return { ok: true };
      },
    });

    const input = {
      slug: 'imported',
      displayName: 'Imported',
      gitUrl: 'https://example.test/source.git',
    };
    expect(await registry.createFromGit(input)).toEqual({ ok: false, reason: 'git-clone-failed' });
    expect(registry.get('imported')).toBeUndefined();
    expect(existsSync(join(root, 'bots', 'imported'))).toBe(false);

    rejectClone = false;
    expect((await registry.createFromGit(input)).ok).toBe(true);
    expect(readFileSync(join(root, 'bots', 'imported', 'memory', 'notes.txt'), 'utf8')).toBe(
      'Imported memory\n',
    );
    const imported = join(root, 'bots', 'imported', 'memory');
    expect(
      execFileSync('git', ['-C', imported, 'rev-parse', 'HEAD~1'], { encoding: 'utf8' }).trim(),
    ).toBe(originalHead);
    expect(readFileSync(join(imported, 'SOUL.md'), 'utf8')).toBe('# Imported persona\n');
    expect(existsSync(join(imported, 'PERSONA.md'))).toBe(false);
  });
  it('persists the owning record without writing bot.json and reads it back through a fresh instance', () => {
    const root = createRoot();
    const registry = createTestRegistry({ rootDir: root, now: FIXED_NOW });

    const result = registry.create({ slug: 'research', displayName: '研究助手' });

    expect(result.ok).toBe(true);
    const stored = createTestRegistry({ rootDir: root }).get('research');
    expect(existsSync(join(root, 'research', 'bot.json'))).toBe(false);
    expect(stored).toMatchObject({
      slug: 'research',
      displayName: '研究助手',
      workspaces: [],
      createdAt: '2026-09-17T00:00:00.000Z',
      avatarSeed: 2,
    });
    expect(createTestRegistry({ rootDir: root }).get('research')).toMatchObject({
      slug: 'research',
    });
  });

  it('keeps Bots without a seed version on the original seed and rejects unknown versions', () => {
    const record = { slug: 'ada', displayName: 'Ada', workspaces: [], createdAt: '' };
    expect(isPersonaBotRecord(record, 'ada')).toBe(true);
    expect(isPersonaBotRecord({ ...record, avatarSeed: 2 }, 'ada')).toBe(true);
    expect(isPersonaBotRecord({ ...record, avatarSeed: 3 }, 'ada')).toBe(false);
  });

  it('persists independent Browser Access through record serialization and reload', () => {
    const root = createRoot();
    const registry = createTestRegistry({ rootDir: root });
    registry.create({ slug: 'browser-qa', displayName: 'Browser QA' });
    expect(registry.get('browser-qa')?.browserAccess).not.toBe(true);
    expect(registry.setBrowserAccess('browser-qa', true).ok).toBe(true);
    expect(registry.setComputerAccess('browser-qa', false).ok).toBe(true);
    expect(existsSync(join(root, 'browser-qa', 'bot.json'))).toBe(false);
    const reopened = createTestRegistry({ rootDir: root });
    expect(reopened.get('browser-qa')?.browserAccess).toBe(true);
    expect(reopened.get('browser-qa')?.computerAccess).not.toBe(true);
    expect(reopened.setComputerAccess('browser-qa', true).ok).toBe(true);
    expect(reopened.get('browser-qa')?.browserAccess).toBe(true);
    expect(reopened.setBrowserAccess('browser-qa', false).ok).toBe(true);
    const off = createTestRegistry({ rootDir: root }).get('browser-qa');
    expect(off?.browserAccess).not.toBe(true);
    expect(off?.computerAccess).toBe(true);
  });

  it('provisions the Memory directory for a name-only bot but writes no Persona', () => {
    const root = createRoot();
    const registry = createTestRegistry({ rootDir: root });
    registry.create({ slug: 'research', displayName: '研究助手' });

    expect(existsSync(join(root, 'research', 'memory'))).toBe(true);
    expect(existsSync(join(root, 'research', 'memory', 'SOUL.md'))).toBe(false);
    expect(registry.memoryDirFor('research')).toBe(join(root, 'research', 'memory'));
  });

  it('fails closed when the Memory Repository cannot be initialized', () => {
    const root = createRoot();
    const registry = createTestRegistry({
      rootDir: root,
      initializeMemory: () => ({ ok: false, message: 'git-init-failed' }),
    });

    expect(registry.create({ slug: 'broken', displayName: 'Broken' })).toEqual({
      ok: false,
      reason: 'memory-unavailable',
      detail: 'git-init-failed',
    });
    expect(registry.get('broken')).toBeUndefined();
    expect(existsSync(join(root, 'broken'))).toBe(false);
  });

  it('writes the provided persona body as SOUL.md and never overwrites an existing PERSONA.md', () => {
    const root = createRoot();
    const registry = createTestRegistry({ rootDir: root });
    registry.create({ slug: 'ada', displayName: 'Ada', persona: '# Ada\n\nBe kind.\n' });
    expect(readFileSync(join(root, 'ada', 'memory', 'SOUL.md'), 'utf8')).toBe(
      '# Ada\n\nBe kind.\n',
    );
    expect(readFileSync(join(root, 'ada', 'memory', 'MEMORY.md'), 'utf8')).toContain('Core Memory');

    mkdirSync(join(root, 'broken', 'memory'), { recursive: true });
    writeFileSync(join(root, 'broken', 'bot.json'), '{ not json');
    writeFileSync(join(root, 'broken', 'memory', 'PERSONA.md'), '# Handwritten\n');
    expect(registry.create({ slug: 'broken', displayName: 'Broken', persona: '# Bot\n' }).ok).toBe(
      true,
    );
    expect(readFileSync(join(root, 'broken', 'memory', 'PERSONA.md'), 'utf8')).toBe(
      '# Handwritten\n',
    );
    expect(existsSync(join(root, 'broken', 'memory', 'SOUL.md'))).toBe(false);
  });

  it('puts an explicitly provided Persona beside a custom memory dir', () => {
    const root = createRoot();
    const registry = createTestRegistry({ rootDir: root });
    const custom = join(root, 'outside-memory');
    registry.create({
      slug: 'ada',
      displayName: 'Ada',
      memoryDir: custom,
      persona: '# Ada\n',
    });
    expect(readFileSync(join(custom, 'SOUL.md'), 'utf8')).toBe('# Ada\n');
  });

  it('rejects duplicate slugs', () => {
    const registry = createTestRegistry({ rootDir: createRoot() });
    expect(registry.create({ slug: 'a', displayName: 'A' }).ok).toBe(true);
    expect(registry.create({ slug: 'a', displayName: 'A again' })).toEqual({
      ok: false,
      reason: 'duplicate',
    });
  });

  it('rejects invalid slugs at create time and never escapes the root', () => {
    const registry = createTestRegistry({ rootDir: createRoot() });
    expect(registry.create({ slug: '../evil', displayName: 'x' })).toEqual({
      ok: false,
      reason: 'invalid-slug',
    });
    expect(registry.get('../outside')).toBeUndefined();
    expect(registry.memoryDirFor('../outside')).toBeUndefined();
    expect(registry.remove('../outside')).toBe(false);
  });

  it('falls back to the slug when the display name is blank', () => {
    const registry = createTestRegistry({ rootDir: createRoot() });
    const result = registry.create({ slug: 'quiet', displayName: '   ' });
    expect(result.ok && result.record.displayName).toBe('quiet');
  });

  it('rejects a relative memory dir and stores an absolute one', () => {
    const root = createRoot();
    const registry = createTestRegistry({ rootDir: root });
    expect(registry.create({ slug: 'a', displayName: 'A', memoryDir: 'relative/path' })).toEqual({
      ok: false,
      reason: 'invalid-memory-dir',
    });
    const custom = join(root, 'memory-b');
    expect(registry.create({ slug: 'b', displayName: 'B', memoryDir: custom }).ok).toBe(true);
    expect(registry.memoryDirFor('b')).toBe(custom);
    expect(existsSync(custom)).toBe(true);
  });

  it('stores Memory in a new per-Bot folder under a chosen location', () => {
    const root = createRoot();
    const registry = createTestRegistry({ rootDir: root });
    const location = join(root, 'D-drive', 'BotMemory');
    mkdirSync(location, { recursive: true });
    const created = registry.create({
      slug: 'ada',
      displayName: 'Ada',
      persona: '# Ada\n',
      memoryLocation: location,
    });
    expect(created.ok).toBe(true);
    expect(registry.memoryDirFor('ada')).toBe(join(location, 'ada'));
    expect(readFileSync(join(location, 'ada', 'SOUL.md'), 'utf8')).toBe('# Ada\n');
    expect(existsSync(join(root, 'ada', 'memory'))).toBe(false);

    expect(
      registry.create({ slug: 'grace', displayName: 'Grace', memoryLocation: location }).ok,
    ).toBe(true);
    expect(registry.memoryDirFor('grace')).toBe(join(location, 'grace'));
  });

  it('refuses a relative, missing or already-occupied chosen Memory location', () => {
    const root = createRoot();
    const registry = createTestRegistry({ rootDir: root });
    expect(
      registry.create({ slug: 'a', displayName: 'A', memoryLocation: 'relative/folder' }),
    ).toEqual({ ok: false, reason: 'invalid-memory-dir' });
    expect(
      registry.create({ slug: 'a', displayName: 'A', memoryLocation: join(root, 'missing') }),
    ).toEqual({ ok: false, reason: 'invalid-memory-dir' });
    expect(existsSync(join(root, 'missing'))).toBe(false);
    const location = join(root, 'shared');
    mkdirSync(join(location, 'b'), { recursive: true });
    expect(registry.create({ slug: 'b', displayName: 'B', memoryLocation: location })).toEqual({
      ok: false,
      reason: 'invalid-memory-dir',
    });
    expect(registry.get('b')).toBeUndefined();
  });

  it('removes the new chosen Memory folder when Memory initialization fails', () => {
    const root = createRoot();
    const registry = createTestRegistry({
      rootDir: root,
      initializeMemory: () => ({ ok: false, message: 'no git' }),
    });
    const location = join(root, 'chosen');
    mkdirSync(location);
    expect(registry.create({ slug: 'c', displayName: 'C', memoryLocation: location })).toEqual({
      ok: false,
      reason: 'memory-unavailable',
      detail: 'no git',
    });
    expect(existsSync(join(location, 'c'))).toBe(false);
    expect(registry.get('c')).toBeUndefined();
  });

  it('finds a bot by workspace, tolerating trailing slashes and unknown paths', () => {
    const root = createRoot();
    const registry = createTestRegistry({ rootDir: root });
    registry.create({
      slug: 'research',
      displayName: 'Research',
      workspaces: [join(root, 'ws-a')],
    });
    registry.create({ slug: 'sales', displayName: 'Sales' });

    expect(registry.findByWorkspace(join(root, 'ws-a'))?.slug).toBe('research');
    expect(registry.findByWorkspace(`${join(root, 'ws-a')}/`)?.slug).toBe('research');
    expect(registry.findByWorkspace(join(root, 'missing'))).toBeUndefined();
    expect(registry.findByWorkspace('')).toBeUndefined();
  });

  it('stores model, preset, avatar and workspaces', () => {
    const registry = createTestRegistry({ rootDir: createRoot() });
    const result = registry.create({
      slug: 'research',
      displayName: '研究助手',
      roles: ['研究'],
      description: '检索与写作',
      avatar:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=',
      model: 'deepseek-chat',
      preset: 'standard',
      workspaces: ['/srv/materials'],
    });

    expect(result.ok && result.record).toMatchObject({
      roles: ['研究'],
      description: '检索与写作',
      avatar:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=',
      model: 'deepseek-chat',
      preset: 'standard',
      workspaces: ['/srv/materials'],
    });
  });

  it('normalizes role badges and description and omits blank ones', () => {
    const registry = createTestRegistry({ rootDir: createRoot() });
    const padded = registry.create({
      slug: 'padded',
      displayName: 'Padded',
      roles: ['  研究  '],
      description: '  一行简介  ',
    });
    const blank = registry.create({
      slug: 'blank',
      displayName: 'Blank',
      roles: ['   '],
      description: '',
    });

    expect(padded.ok && padded.record).toMatchObject({ roles: ['研究'], description: '一行简介' });
    expect(blank.ok && 'roles' in blank.record).toBe(false);
    expect(blank.ok && 'description' in blank.record).toBe(false);
  });

  it('updates editable fields, persists them, and clears blanks', () => {
    const root = createRoot();
    const registry = createTestRegistry({ rootDir: root });
    registry.create({
      slug: 'ada',
      displayName: 'Ada',
      roles: ['旧'],
      description: '旧简介',
      avatar:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=',
      model: 'old-model',
      preset: 'old-preset',
      workspaces: ['/old'],
    });

    const result = registry.update('ada', {
      displayName: '  Ada Lovelace  ',
      roles: ['研究'],
      description: '',
      avatar:
        'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJQBOgCHwAP7+4AAAAA==',
      workspaces: ['/srv/a', '/srv/b'],
    });

    expect(result.ok && result.record).toMatchObject({
      slug: 'ada',
      displayName: 'Ada Lovelace',
      roles: ['研究'],
      avatar:
        'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJQBOgCHwAP7+4AAAAA==',
      workspaces: ['/srv/a', '/srv/b'],
    });
    expect(result.ok && 'description' in result.record).toBe(false);
    expect(result.ok && result.record.model).toBe('old-model');
    expect(createTestRegistry({ rootDir: root }).get('ada')).toMatchObject({
      displayName: 'Ada Lovelace',
      avatar:
        'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJQBOgCHwAP7+4AAAAA==',
      workspaces: ['/srv/a', '/srv/b'],
    });
  });

  it('rejects updates for unknown slugs and invalid input', () => {
    const registry = createTestRegistry({ rootDir: createRoot() });
    registry.create({ slug: 'ada', displayName: 'Ada' });

    expect(registry.update('missing', { roles: ['x'] })).toEqual({
      ok: false,
      reason: 'not-found',
    });
    expect(registry.update('../evil', { roles: ['x'] })).toEqual({
      ok: false,
      reason: 'not-found',
    });
    expect(registry.update('ada', { displayName: '   ' })).toEqual({
      ok: false,
      reason: 'invalid-input',
    });
    expect(registry.update('ada', { workspaces: 'nope' as unknown as string[] })).toEqual({
      ok: false,
      reason: 'invalid-input',
    });
    expect(registry.update('ada', { avatar: 'blue' })).toEqual({
      ok: false,
      reason: 'invalid-input',
    });
    expect(registry.update('ada', { avatar: 'https://example.com/ada.png' })).toEqual({
      ok: false,
      reason: 'invalid-input',
    });
    expect(registry.update('ada', { avatar: 'data:image/svg+xml;base64,AAAA' })).toEqual({
      ok: false,
      reason: 'invalid-input',
    });
    expect(registry.update('ada', { roles: ['研究'] }).ok).toBe(true);
  });

  it('rejects a non-data avatar at creation', () => {
    const registry = createTestRegistry({ rootDir: createRoot() });
    expect(registry.create({ slug: 'ada', displayName: 'Ada', avatar: 'blue' })).toEqual({
      ok: false,
      reason: 'invalid-input',
    });
  });

  it('pauses and resumes through setPaused', () => {
    const root = createRoot();
    const registry = createTestRegistry({ rootDir: root });
    registry.create({ slug: 'ada', displayName: 'Ada' });

    const paused = registry.setPaused('ada', true);
    expect(paused.ok && paused.record.paused).toBe(true);
    expect(registry.get('ada')?.paused).toBe(true);
    expect(createTestRegistry({ rootDir: root }).get('ada')?.paused).toBe(true);

    const resumed = registry.setPaused('ada', false);
    expect(resumed.ok && 'paused' in resumed.record).toBe(false);
    expect(registry.get('ada')?.paused).toBeUndefined();
    expect(registry.setPaused('missing', true)).toEqual({ ok: false, reason: 'not-found' });
  });

  it('ignores a legacy paused flag introduced after the empty import marker', () => {
    const root = createRoot();
    const registry = createTestRegistry({ rootDir: root });
    mkdirSync(join(root, 'broken'));
    writeFileSync(
      join(root, 'broken', 'bot.json'),
      JSON.stringify({
        slug: 'broken',
        displayName: 'Broken',
        workspaces: [],
        createdAt: 'now',
        paused: 'yes',
      }),
    );

    expect(registry.get('broken')).toBeUndefined();
  });

  it('lists database Bots sorted and ignores late junk or poisoned legacy records', () => {
    const root = createRoot();
    const registry = createTestRegistry({ rootDir: root });
    registry.create({ slug: 'zeta', displayName: 'Z' });
    registry.create({ slug: 'alpha', displayName: 'A' });
    mkdirSync(join(root, 'not-a-bot'));
    writeFileSync(join(root, 'loose.txt'), 'x');
    mkdirSync(join(root, 'broken'));
    writeFileSync(join(root, 'broken', 'bot.json'), '{ not json');
    mkdirSync(join(root, 'poisoned'));
    writeFileSync(
      join(root, 'poisoned', 'bot.json'),
      JSON.stringify({ slug: 'someone-else', displayName: 'X', workspaces: [], createdAt: 'now' }),
    );

    expect(registry.list().map((record) => record.slug)).toEqual(['alpha', 'zeta']);
    expect(registry.get('broken')).toBeUndefined();
  });

  it('refuses direct removal and purge without confirmed lifecycle ownership', () => {
    const root = createRoot();
    const registry = createTestRegistry({ rootDir: root });
    registry.create({ slug: 'a', displayName: 'A', persona: '# A\n' });
    expect(() => registry.remove('a')).toThrow('confirmed PersonaBot deletion');
    expect(() => registry.remove('a', { purge: true })).toThrow('confirmed PersonaBot deletion');
    expect(registry.get('a')).toBeDefined();
    expect(existsSync(join(root, 'a', 'memory'))).toBe(true);
    expect(registry.remove('missing')).toBe(false);
  });

  it('ignores late corrupt bot.json and creates a database record without overwriting the source', () => {
    const root = createRoot();
    const registry = createTestRegistry({ rootDir: root });
    mkdirSync(join(root, 'broken', 'memory'), { recursive: true });
    writeFileSync(join(root, 'broken', 'bot.json'), '{ not json');

    expect(registry.get('broken')).toBeUndefined();
    expect(registry.list()).toEqual([]);
    expect(registry.create({ slug: 'broken', displayName: 'Broken' }).ok).toBe(true);
    expect(existsSync(join(root, 'broken', 'memory'))).toBe(true);
    expect(existsSync(join(root, 'broken', 'memory', 'PERSONA.md'))).toBe(false);
    expect(readFileSync(join(root, 'broken', 'bot.json'), 'utf8')).toBe('{ not json');
  });
});
