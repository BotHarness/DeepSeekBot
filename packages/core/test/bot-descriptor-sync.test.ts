import { fallbackPrimaryColor } from '../src/bots/primary-color.js';
import { seededBannerRecipe } from '@botharness/pixel-banner';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  canonicalAvatarRecipe,
  DEFAULT_ILLUSTRATED_RECIPE,
  seededAvatarRecipe,
  seededAvatarRecipeV2,
} from '../src/bots/avatar-appearance.js';
import {
  backfillBotDescriptors,
  BOT_DESCRIPTOR_COMMIT_MESSAGE,
  syncBotDescriptor,
} from '../src/bots/bot-descriptor-sync.js';
import { readSharedPresentation } from '../src/bots/shared-presentation.js';
import { parseBotDescriptor } from '../src/marketplace/descriptor.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { createTestRegistry } from './registry-fixture.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const PNG_URL = `data:image/png;base64,${PNG.toString('base64')}`;

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'botharness-descriptor-'));
  roots.push(root);
  return root;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}

function descriptorOf(memoryDir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(memoryDir, '.botharness/bot.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}

function registryAt(root: string) {
  return createTestRegistry({
    rootDir: join(root, 'bots'),
    initializeMemory: (memoryDir) => ({ ok: ensureMemoryRepository({ memoryDir }).ok }),
    syncDescriptor: syncBotDescriptor,
  });
}

describe('Bot descriptor sync', () => {
  it('commits a descriptor with the name, tags, bio and seeded avatar when a Bot is created', () => {
    const registry = registryAt(tempRoot());
    const created = registry.create({
      slug: 'travel',
      displayName: '旅行规划师',
      roles: ['行程规划', '酒店比价'],
      description: '帮你排行程、比酒店',
      workspaces: [],
    });
    expect(created.ok).toBe(true);
    const memoryDir = registry.memoryDirFor('travel')!;

    const descriptor = descriptorOf(memoryDir);
    expect(descriptor).toEqual({
      name: '旅行规划师',
      tags: ['行程规划', '酒店比价'],
      bio: '帮你排行程、比酒店',
      avatar: { recipe: canonicalAvatarRecipe(seededAvatarRecipeV2('旅行规划师')) },
      banner: { recipe: seededBannerRecipe('旅行规划师') },
      primaryColor: { mode: 'automatic', fallback: fallbackPrimaryColor('travel') },
    });
    expect(existsSync(join(memoryDir, '.botharness/banner.png'))).toBe(true);
    expect(parseBotDescriptor(JSON.stringify(descriptor))).toBeDefined();
    expect(readSharedPresentation(memoryDir)?.appearance?.recipe).toEqual(
      canonicalAvatarRecipe(seededAvatarRecipeV2('旅行规划师')),
    );
    expect(git(memoryDir, 'status', '--porcelain')).toBe('');
    expect(git(memoryDir, 'log', '-1', '--format=%B')).toBe(`${BOT_DESCRIPTOR_COMMIT_MESSAGE}\n`);
  });

  it('rewrites the descriptor in one commit on rename, tags, bio and avatar changes', () => {
    const registry = registryAt(tempRoot());
    registry.create({ slug: 'scribe', displayName: 'Scribe', workspaces: [] });
    const memoryDir = registry.memoryDirFor('scribe')!;
    const commits = () => Number(git(memoryDir, 'rev-list', '--count', 'HEAD').trim());
    const before = commits();

    registry.update('scribe', { displayName: 'Meeting Scribe', roles: ['Notes'] });
    expect(descriptorOf(memoryDir)).toMatchObject({ name: 'Meeting Scribe', tags: ['Notes'] });
    expect(descriptorOf(memoryDir)).not.toHaveProperty('roles');
    expect(commits()).toBe(before + 1);

    registry.setAppearance('scribe', DEFAULT_ILLUSTRATED_RECIPE);
    expect(descriptorOf(memoryDir)['avatar']).toEqual({
      recipe: canonicalAvatarRecipe(DEFAULT_ILLUSTRATED_RECIPE),
    });
    expect(commits()).toBe(before + 2);

    expect(registry.setPrimaryColor('scribe', { mode: 'custom', color: '#1d1b22' }).ok).toBe(true);
    expect(descriptorOf(memoryDir)['primaryColor']).toEqual({
      mode: 'custom',
      color: '#1d1b22',
      fallback: fallbackPrimaryColor('scribe'),
    });
    expect(registry.setPrimaryColor('scribe', { mode: 'automatic' }).ok).toBe(true);
    expect(descriptorOf(memoryDir)['primaryColor']).toEqual({
      mode: 'automatic',
      fallback: fallbackPrimaryColor('scribe'),
    });
    expect(commits()).toBe(before + 4);

    registry.update('scribe', { avatar: PNG_URL });
    expect(descriptorOf(memoryDir)['avatar']).toEqual({ image: '.botharness/avatar.png' });
    expect(readFileSync(join(memoryDir, '.botharness/avatar.png'))).toEqual(PNG);
    expect(readSharedPresentation(memoryDir)?.avatar).toBe(PNG_URL);
    expect(commits()).toBe(before + 5);

    registry.update('scribe', { avatar: '' });
    expect(existsSync(join(memoryDir, '.botharness/avatar.png'))).toBe(false);
    expect(descriptorOf(memoryDir)['avatar']).toEqual({
      recipe: canonicalAvatarRecipe(seededAvatarRecipeV2('Meeting Scribe')),
    });
    expect(git(memoryDir, 'status', '--porcelain')).toBe('');

    const beforeBio = commits();
    registry.update('scribe', { description: 'Takes notes' });
    expect(descriptorOf(memoryDir)['bio']).toBe('Takes notes');
    expect(commits()).toBe(beforeBio + 1);

    registry.update('scribe', { description: '' });
    expect(descriptorOf(memoryDir)).not.toHaveProperty('bio');
    expect(commits()).toBe(beforeBio + 2);
  });

  it('commits only the descriptor and keeps other keys and pending Memory edits', () => {
    const registry = registryAt(tempRoot());
    registry.create({ slug: 'keeper', displayName: 'Keeper', workspaces: [] });
    const memoryDir = registry.memoryDirFor('keeper')!;
    writeFileSync(
      join(memoryDir, '.botharness/bot.json'),
      JSON.stringify({ name: 'Keeper', badges: ['beta'] }),
    );
    writeFileSync(join(memoryDir, 'notes.md'), 'draft\n');

    registry.update('keeper', { displayName: 'Keeper Two' });

    expect(descriptorOf(memoryDir)).toMatchObject({ name: 'Keeper Two', badges: ['beta'] });
    expect(git(memoryDir, 'show', '--name-only', '--format=', 'HEAD').trim()).toBe(
      '.botharness/bot.json',
    );
    expect(git(memoryDir, 'status', '--porcelain').trim()).toBe('?? notes.md');
  });

  it('keeps an existing avatar entry that already shows the same image', () => {
    const memoryDir = join(tempRoot(), 'memory');
    mkdirSync(join(memoryDir, 'assets'), { recursive: true });
    mkdirSync(join(memoryDir, '.botharness'));
    writeFileSync(join(memoryDir, 'assets/avatar.png'), PNG);
    writeFileSync(
      join(memoryDir, '.botharness/bot.json'),
      JSON.stringify({ avatar: { image: 'assets/avatar.png' } }),
    );

    const result = syncBotDescriptor(
      memoryDir,
      { slug: 'shared', displayName: 'Shared', workspaces: [], createdAt: '', avatar: PNG_URL },
      { onlyIfMissing: false },
    );

    expect(result).toBe('written');
    expect(descriptorOf(memoryDir)).toEqual({
      name: 'Shared',
      avatar: { image: 'assets/avatar.png' },
      banner: { recipe: seededBannerRecipe('Shared') },
      primaryColor: { mode: 'automatic', fallback: fallbackPrimaryColor('shared') },
    });
    expect(existsSync(join(memoryDir, '.botharness/avatar.png'))).toBe(false);
  });

  it('backfills only Bots without a descriptor and skips missing Memory', () => {
    const root = tempRoot();
    const registry = createTestRegistry({
      rootDir: join(root, 'bots'),
      initializeMemory: (memoryDir) => ({ ok: ensureMemoryRepository({ memoryDir }).ok }),
    });
    registry.create({ slug: 'old', displayName: 'Old Bot', workspaces: [] });
    registry.create({ slug: 'edited', displayName: 'Edited', workspaces: [] });
    registry.create({ slug: 'gone', displayName: 'Gone', workspaces: [] });
    const edited = registry.memoryDirFor('edited')!;
    mkdirSync(join(edited, '.botharness'));
    writeFileSync(join(edited, '.botharness/bot.json'), '{"name":"Hand edited"}\n');
    rmSync(registry.memoryDirFor('gone')!, { recursive: true });
    const messages: string[] = [];

    backfillBotDescriptors(registry, (message) => messages.push(message));

    expect(descriptorOf(registry.memoryDirFor('old')!)).toMatchObject({ name: 'Old Bot' });
    expect(readFileSync(join(edited, '.botharness/bot.json'), 'utf8')).toBe(
      '{"name":"Hand edited"}\n',
    );
    expect(existsSync(registry.memoryDirFor('gone')!)).toBe(false);
    expect(messages).toEqual([
      expect.stringMatching(/^bot-descriptor-backfill initiator=host-startup written=1 failed=0 /u),
    ]);
    const legacy = registry.memoryDirFor('edited')!;
    rmSync(join(legacy, '.botharness/bot.json'));
    const { avatarSeed: _, ...record } = registry.get('edited')!;
    expect(syncBotDescriptor(legacy, record)).toBe('written');
    expect(descriptorOf(legacy)['avatar']).toEqual({
      recipe: canonicalAvatarRecipe(seededAvatarRecipe('Edited')),
    });
  });

  it('clips a long name, too many tags and a long bio to the descriptor limits', () => {
    const memoryDir = join(tempRoot(), 'memory');
    mkdirSync(memoryDir);

    syncBotDescriptor(
      memoryDir,
      {
        slug: 'long',
        displayName: 'N'.repeat(80),
        roles: Array.from({ length: 10 }, (_, index) => `Role ${index} ${'x'.repeat(40)}`),
        description: 'b'.repeat(200),
        workspaces: [],
        createdAt: '',
      },
      { onlyIfMissing: false },
    );

    const descriptor = parseBotDescriptor(
      readFileSync(join(memoryDir, '.botharness/bot.json'), 'utf8'),
    );
    expect(descriptor?.name).toHaveLength(60);
    expect(descriptor?.tags).toHaveLength(8);
    expect(descriptor?.bio).toHaveLength(160);
  });
});
