import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PersonaBotDeletions } from '../src/bots/deletion.js';
import type { PersonaBotRegistry } from '../src/bots/registry.js';
import { memoryAttachmentReferences } from '../src/memory/backup.js';
import { createTempRoot } from './helpers.js';

const hash = (char: string) => `sha256:${char.repeat(64)}`;

function profile(bots: { slug: string; memoryDir?: string }[], erased: string[] = []) {
  const rootDir = createTempRoot('memory-references-');
  const registry = { rootDir, listHistorical: () => bots } as unknown as PersonaBotRegistry;
  const deletions = {
    get: (slug: string) => (erased.includes(slug) ? { memory: 'erased' } : undefined),
  } as unknown as PersonaBotDeletions;
  return { rootDir, registry, deletions };
}

describe('memoryAttachmentReferences', () => {
  it('reads references past links, special files, missing folders and incomplete Git (#2882)', () => {
    const { rootDir, registry, deletions } = profile(
      [{ slug: 'ada' }, { slug: 'gone' }, { slug: 'erased' }],
      ['erased'],
    );
    const memory = join(rootDir, 'ada', 'memory');
    mkdirSync(join(memory, 'notes'), { recursive: true });
    writeFileSync(join(memory, 'MEMORY.md'), `kept ${hash('a')}`);
    writeFileSync(join(memory, 'notes', 'photo.json'), JSON.stringify({ file: hash('b') }));
    writeFileSync(join(memory, 'notes', 'raw.bin'), hash('c'));
    const outside = createTempRoot('memory-references-outside-');
    writeFileSync(join(outside, 'linked.md'), hash('d'));
    symlinkSync(outside, join(memory, 'linked-notes'));
    symlinkSync(join(outside, 'linked.md'), join(memory, 'linked.md'));
    if (process.platform !== 'win32') execFileSync('mkfifo', [join(memory, 'pipe.md')]);
    mkdirSync(join(rootDir, 'erased', 'memory'), { recursive: true });
    writeFileSync(join(rootDir, 'erased', 'memory', 'MEMORY.md'), hash('e'));

    expect([...memoryAttachmentReferences(registry, deletions)].sort()).toEqual([
      hash('a'),
      hash('b'),
    ]);
  });
});
