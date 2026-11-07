import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEFAULT_ILLUSTRATED_RECIPE } from '../src/bots/avatar-appearance.js';
import { MAX_PERSONA_BOT_AVATAR_BYTES } from '../src/bots/persona-bot.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { createTempRoot } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', [
    '-C',
    cwd,
    '-c',
    'user.name=QA',
    '-c',
    'user.email=qa@example.test',
    ...args,
  ]);
}

function bareRepository(
  files: Record<string, string | Buffer>,
  links: Record<string, string> = {},
) {
  const root = createTempRoot('botharness-presentation-');
  const work = join(root, 'work');
  const bare = join(root, 'bot.git');
  mkdirSync(work);
  execFileSync('git', ['init', '-q', '-b', 'main', work]);
  writeFileSync(join(work, 'PERSONA.md'), '# Shared Bot\n');
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(work, path)), { recursive: true });
    writeFileSync(join(work, path), content);
  }
  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(work, path)), { recursive: true });
    symlinkSync(target, join(work, path));
  }
  git(work, 'add', '.');
  git(work, 'commit', '-qm', 'Shared Bot');
  execFileSync('git', ['clone', '-q', '--bare', work, bare]);
  return { root, bare };
}

async function install(files: Record<string, string | Buffer>, links?: Record<string, string>) {
  const { root, bare } = bareRepository(files, links);
  const registry = createTestRegistry({
    rootDir: join(root, 'bots'),
    initializeMemory: (memoryDir) => ({ ok: ensureMemoryRepository({ memoryDir }).ok }),
    cloneMemory: async (destination) => {
      execFileSync('git', ['clone', '-q', '--', bare, destination]);
      return { ok: true };
    },
  });
  const result = await registry.createFromGit({
    slug: 'shared',
    displayName: 'Shared',
    gitUrl: 'https://example.test/bot.git',
  });
  expect(result.ok).toBe(true);
  return registry.get('shared');
}

describe('shared presentation after a Git install', () => {
  it('keeps the default avatar without a descriptor', async () => {
    const record = await install({});

    expect(record?.avatar).toBeUndefined();
    expect(record?.appearance).toBeUndefined();
  });

  it('applies a committed avatar image', async () => {
    const record = await install({
      '.botharness/bot.json': JSON.stringify({ avatar: { image: 'assets/avatar.png' } }),
      'assets/avatar.png': PNG,
    });

    expect(record?.avatar).toBe(`data:image/png;base64,${PNG.toString('base64')}`);
    expect(record?.appearance).toBeUndefined();
  });

  it('applies a generated avatar recipe', async () => {
    const record = await install({
      '.botharness/bot.json': JSON.stringify({ avatar: { recipe: DEFAULT_ILLUSTRATED_RECIPE } }),
    });

    expect(record?.appearance?.recipe).toEqual(DEFAULT_ILLUSTRATED_RECIPE);
    expect(record?.avatar).toMatch(/^data:image\/png;base64,/u);
  });

  it.each([
    ['invalid JSON', { '.botharness/bot.json': '{avatar:' }],
    ['an invalid recipe', { '.botharness/bot.json': '{"avatar":{"recipe":{"family":"nope"}}}' }],
    ['a missing image', { '.botharness/bot.json': '{"avatar":{"image":"assets/none.png"}}' }],
    [
      'an image that is not a PNG',
      {
        '.botharness/bot.json': '{"avatar":{"image":"assets/avatar.png"}}',
        'assets/avatar.png': 'not an image',
      },
    ],
    [
      'an oversized image',
      {
        '.botharness/bot.json': '{"avatar":{"image":"assets/avatar.png"}}',
        'assets/avatar.png': Buffer.concat([PNG, Buffer.alloc(MAX_PERSONA_BOT_AVATAR_BYTES)]),
      },
    ],
  ])('falls back to the default avatar for %s', async (_, files) => {
    const record = await install(files);

    expect(record?.avatar).toBeUndefined();
    expect(record?.displayName).toBe('Shared');
  });

  it('refuses an avatar symlink that leaves the cloned tree', async () => {
    const outside = createTempRoot('botharness-outside-');
    writeFileSync(join(outside, 'secret.png'), PNG);

    const record = await install(
      { '.botharness/bot.json': '{"avatar":{"image":"assets/avatar.png"}}' },
      { 'assets/avatar.png': join(outside, 'secret.png') },
    );

    expect(record?.avatar).toBeUndefined();
  });
});
