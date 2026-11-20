import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { initializeMemoryGit } from '../src/memory/git.js';
import {
  CORE_MEMORY_TEMPLATE,
  migrateLegacySoul,
  migrateLegacySouls,
  renderStandingPrompt,
  seedStandingFiles,
  standingUsage,
} from '../src/memory/soul.js';
import { createTempRoot } from './helpers.js';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
}

function repository(): string {
  const root = createTempRoot();
  initializeMemoryGit(root);
  return root;
}

function commitAll(root: string, message = 'seed'): void {
  git(root, 'add', '-A');
  git(root, 'commit', '--no-gpg-sign', '-m', message);
}

describe('renderStandingPrompt', () => {
  it('renders Soul then Core Memory with usage computed from code points', () => {
    const root = createTempRoot();
    writeFileSync(join(root, 'SOUL.md'), '我是小助手。\n');
    writeFileSync(join(root, 'MEMORY.md'), '- [Acme](customers/acme.md)\n');

    expect(renderStandingPrompt(root)).toBe(
      [
        '## Soul (SOUL.md) [0% — 6/5,000 chars]',
        '',
        '我是小助手。',
        '',
        '## Core Memory (MEMORY.md) [1% — 27/3,000 chars]',
        '',
        '- [Acme](customers/acme.md)',
      ].join('\n'),
    );
  });

  it('truncates an over-limit file with an explicit consolidation note', () => {
    const root = createTempRoot();
    writeFileSync(join(root, 'MEMORY.md'), 'abcdef');

    const prompt = renderStandingPrompt(root, { soul: 10, coreMemory: 4 });

    expect(prompt).toBe(
      '## Core Memory (MEMORY.md) [150% — 6/4 chars]\n\nabcd\n\n' +
        '[Truncated: MEMORY.md has 6 characters, over its 4-character limit. Consolidate it below the limit; the full file is still on disk.]',
    );
  });

  it('prefers SOUL.md, falls back to PERSONA.md and omits empty or absent files', () => {
    const root = createTempRoot();
    expect(renderStandingPrompt(root)).toBe('');

    writeFileSync(join(root, 'PERSONA.md'), 'legacy\n');
    writeFileSync(join(root, 'MEMORY.md'), '   \n');
    expect(renderStandingPrompt(root)).toBe('## Soul (PERSONA.md) [0% — 6/5,000 chars]\n\nlegacy');

    writeFileSync(join(root, 'SOUL.md'), 'current\n');
    expect(renderStandingPrompt(root)).toBe('## Soul (SOUL.md) [0% — 7/5,000 chars]\n\ncurrent');
  });
});

describe('standingUsage', () => {
  it('reports present standing files with their limits', () => {
    const root = createTempRoot();
    expect(standingUsage(root)).toEqual([]);

    writeFileSync(join(root, 'PERSONA.md'), '我是小助手。\n');
    writeFileSync(join(root, 'MEMORY.md'), 'abcdef');

    expect(standingUsage(root, { soul: 5000, coreMemory: 4 })).toEqual([
      { path: 'PERSONA.md', role: 'soul', chars: 6, limit: 5000 },
      { path: 'MEMORY.md', role: 'coreMemory', chars: 6, limit: 4 },
    ]);
  });
});

describe('migrateLegacySoul', () => {
  it('renames a tracked, clean PERSONA.md in one commit and is idempotent', () => {
    const root = repository();
    writeFileSync(join(root, 'PERSONA.md'), '# Ada\n');
    writeFileSync(join(root, 'notes.md'), 'staged elsewhere\n');
    commitAll(root);
    writeFileSync(join(root, 'notes.md'), 'local edit\n');

    expect(migrateLegacySoul(root)).toBe('committed');
    expect(readFileSync(join(root, 'SOUL.md'), 'utf8')).toBe('# Ada\n');
    expect(existsSync(join(root, 'PERSONA.md'))).toBe(false);
    expect(git(root, 'log', '-1', '--format=%s')).toBe('Rename PERSONA.md to SOUL.md (ADR-0134)\n');
    expect(git(root, 'show', '--name-status', '--format=', 'HEAD').trim()).toBe(
      'R100\tPERSONA.md\tSOUL.md',
    );
    expect(git(root, 'status', '--porcelain')).toBe(' M notes.md\n');

    expect(migrateLegacySoul(root)).toBe('unchanged');
  });

  it('renames an untracked PERSONA.md on disk without committing', () => {
    const root = repository();
    commitAll(root);
    writeFileSync(join(root, 'PERSONA.md'), '# Ada\n');
    const head = git(root, 'rev-parse', 'HEAD').trim();

    expect(migrateLegacySoul(root)).toBe('renamed');
    expect(existsSync(join(root, 'SOUL.md'))).toBe(true);
    expect(existsSync(join(root, 'PERSONA.md'))).toBe(false);
    expect(git(root, 'rev-parse', 'HEAD').trim()).toBe(head);
  });

  it('leaves a locally modified PERSONA.md alone', () => {
    const root = repository();
    writeFileSync(join(root, 'PERSONA.md'), '# Ada\n');
    commitAll(root);
    writeFileSync(join(root, 'PERSONA.md'), '# Ada, edited\n');

    expect(migrateLegacySoul(root)).toBe('blocked');
    expect(readFileSync(join(root, 'PERSONA.md'), 'utf8')).toBe('# Ada, edited\n');
    expect(existsSync(join(root, 'SOUL.md'))).toBe(false);
  });

  it('never overwrites an existing SOUL.md', () => {
    const root = repository();
    writeFileSync(join(root, 'PERSONA.md'), 'old\n');
    writeFileSync(join(root, 'SOUL.md'), 'new\n');

    expect(migrateLegacySoul(root)).toBe('unchanged');
    expect(readFileSync(join(root, 'SOUL.md'), 'utf8')).toBe('new\n');
  });

  it('reports startup migration counts without failing on one broken Bot', () => {
    const migrated = repository();
    writeFileSync(join(migrated, 'PERSONA.md'), '# Ada\n');
    commitAll(migrated);
    const messages: string[] = [];

    migrateLegacySouls(
      {
        list: () => [{ slug: 'ada' }, { slug: 'missing' }],
        memoryDirFor: (slug) => (slug === 'ada' ? migrated : join(migrated, 'nope')),
      },
      (message) => messages.push(message),
    );

    expect(existsSync(join(migrated, 'SOUL.md'))).toBe(true);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(
      /^soul-migration initiator=host-startup committed=1 renamed=0 blocked=0 failed=0 durationMs=\d+$/,
    );
  });
});

describe('seedStandingFiles', () => {
  it('writes the Soul and the Core Memory template', () => {
    const root = createTempRoot();

    expect(seedStandingFiles(root, { soul: '# Ada\n', coreMemoryTemplate: true })).toEqual([
      'SOUL.md',
      'MEMORY.md',
    ]);
    expect(readFileSync(join(root, 'SOUL.md'), 'utf8')).toBe('# Ada\n');
    expect(readFileSync(join(root, 'MEMORY.md'), 'utf8')).toBe(CORE_MEMORY_TEMPLATE);
  });

  it('keeps existing files and never adds SOUL.md beside a legacy PERSONA.md', () => {
    const root = createTempRoot();
    writeFileSync(join(root, 'PERSONA.md'), 'legacy\n');
    writeFileSync(join(root, 'MEMORY.md'), 'mine\n');

    expect(seedStandingFiles(root, { soul: 'new\n', coreMemoryTemplate: true })).toEqual([]);
    expect(existsSync(join(root, 'SOUL.md'))).toBe(false);
    expect(readFileSync(join(root, 'MEMORY.md'), 'utf8')).toBe('mine\n');
  });

  it('skips a blank Soul and the template when not requested', () => {
    const root = createTempRoot();
    expect(seedStandingFiles(root, { soul: '  \n', coreMemoryTemplate: false })).toEqual([]);
    expect(existsSync(join(root, 'SOUL.md'))).toBe(false);
    expect(existsSync(join(root, 'MEMORY.md'))).toBe(false);
  });
});
