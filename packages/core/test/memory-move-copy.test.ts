import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const crossDevice = vi.hoisted(() => ({ on: false }));

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return {
    ...fs,
    renameSync: (from: string, to: string) => {
      if (crossDevice.on && !from.includes('.moving-')) {
        const error = new Error('cross-device link not permitted') as NodeJS.ErrnoException;
        error.code = 'EXDEV';
        throw error;
      }
      fs.renameSync(from, to);
    },
  };
});

const { moveMemoryDirectory } = await import('../src/bots/memory-move.js');
const { ensureMemoryRepository, inspectMemoryRepository } =
  await import('../src/memory/repository.js');
const { createTempRoot } = await import('./helpers.js');

afterEach(() => {
  crossDevice.on = false;
});

describe('moveMemoryDirectory across drives', () => {
  it('copies Memory, checks its HEAD, then removes the old folder', () => {
    const from = join(createTempRoot('botharness-memory-copy-'), 'memory');
    ensureMemoryRepository({ memoryDir: from });
    writeFileSync(join(from, 'note.md'), 'kept\n');
    const head = inspectMemoryRepository({ memoryDir: from }).head;
    const parent = createTempRoot('botharness-memory-copy-target-');
    crossDevice.on = true;

    expect(moveMemoryDirectory(from, join(parent, 'ada'))).toEqual({ copied: true });

    expect(existsSync(from)).toBe(false);
    expect(inspectMemoryRepository({ memoryDir: join(parent, 'ada') })).toMatchObject({
      state: 'ready',
      head,
      dirty: true,
    });
    expect(readdirSync(parent)).toEqual(['ada']);
  });
});
