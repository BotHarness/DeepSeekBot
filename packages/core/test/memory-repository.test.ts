import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { ensureMemoryRepository, inspectMemoryRepository } from '../src/memory/repository.js';
import { createTempRoot } from './helpers.js';

function headOf(memoryDir: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: memoryDir,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  }).trim();
}

describe('Memory Repository lifecycle', () => {
  it('reports a missing Git executable without exposing a raw spawn error', () => {
    const root = createTempRoot();
    vi.stubEnv('PATH', join(root, 'no-git-on-path'));
    try {
      expect(ensureMemoryRepository({ memoryDir: join(root, 'memory') })).toMatchObject({
        ok: false,
        code: 'git-not-found',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('creates a real Git repository with a seed commit and is idempotent', () => {
    const memoryDir = join(createTempRoot(), 'memory');

    const first = ensureMemoryRepository({ memoryDir });

    expect(first).toEqual({ ok: true, memoryDir, created: true });
    expect(existsSync(join(memoryDir, '.git'))).toBe(true);
    const inspection = inspectMemoryRepository({ memoryDir });
    expect(inspection.state).toBe('ready');
    expect(inspection.head).toMatch(/^[0-9a-f]{40}$/);
    expect(inspection.dirty).toBe(false);

    const second = ensureMemoryRepository({ memoryDir });
    expect(second).toEqual({ ok: true, memoryDir, created: false });
    expect(inspectMemoryRepository({ memoryDir }).head).toBe(inspection.head);
  });

  it('never commits a provisional working-tree edit when it reopens', () => {
    const memoryDir = join(createTempRoot(), 'memory');
    ensureMemoryRepository({ memoryDir });
    const head = headOf(memoryDir);
    writeFileSync(join(memoryDir, 'note.md'), '# Note\n\nProvisional.\n', 'utf8');

    const reopened = ensureMemoryRepository({ memoryDir });

    expect(reopened).toEqual({ ok: true, memoryDir, created: false });
    expect(headOf(memoryDir)).toBe(head);
    expect(inspectMemoryRepository({ memoryDir })).toMatchObject({ state: 'ready', dirty: true });
  });

  it('repairs a repository that exists without a seed commit', () => {
    const memoryDir = join(createTempRoot(), 'memory');
    mkdirSync(memoryDir, { recursive: true });
    execFileSync('git', ['init', '-b', 'main'], {
      cwd: memoryDir,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    });

    const repaired = ensureMemoryRepository({ memoryDir });

    expect(repaired).toEqual({ ok: true, memoryDir, created: false });
    expect(headOf(memoryDir)).toMatch(/^[0-9a-f]{40}$/);
    expect(inspectMemoryRepository({ memoryDir })).toMatchObject({ state: 'ready', dirty: false });
  });

  it('does not add seed files when reopening an imported Git branch', () => {
    const root = createTempRoot();
    const source = join(root, 'source');
    const memoryDir = join(root, 'memory');
    mkdirSync(source);
    execFileSync('git', ['init', '-b', 'imported'], {
      cwd: source,
      shell: false,
      windowsHide: true,
    });
    execFileSync('git', ['config', 'user.name', 'QA'], {
      cwd: source,
      shell: false,
      windowsHide: true,
    });
    execFileSync('git', ['config', 'user.email', 'qa@example.invalid'], {
      cwd: source,
      shell: false,
      windowsHide: true,
    });
    writeFileSync(join(source, 'code.ts'), 'export const imported = true;\n');
    execFileSync('git', ['add', 'code.ts'], { cwd: source, shell: false, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'Imported memory'], {
      cwd: source,
      shell: false,
      windowsHide: true,
    });
    ensureMemoryRepository({ memoryDir });
    execFileSync('git', ['remote', 'add', 'qa', source], {
      cwd: memoryDir,
      shell: false,
      windowsHide: true,
    });
    execFileSync('git', ['fetch', 'qa', 'imported'], {
      cwd: memoryDir,
      shell: false,
      windowsHide: true,
    });
    execFileSync('git', ['switch', '-c', 'imported', 'FETCH_HEAD'], {
      cwd: memoryDir,
      shell: false,
      windowsHide: true,
    });
    const head = headOf(memoryDir);

    expect(existsSync(join(memoryDir, '.gitattributes'))).toBe(false);
    expect(ensureMemoryRepository({ memoryDir })).toEqual({
      ok: true,
      memoryDir,
      created: false,
    });
    expect(headOf(memoryDir)).toBe(head);
    expect(existsSync(join(memoryDir, '.gitattributes'))).toBe(false);
    expect(inspectMemoryRepository({ memoryDir })).toMatchObject({ state: 'ready', dirty: false });
  });
  it('reports a missing or invalid repository without mutating it', () => {
    const root = createTempRoot();
    expect(inspectMemoryRepository({ memoryDir: join(root, 'absent') })).toEqual({
      state: 'missing',
    });

    const brokenDir = join(root, 'broken');
    mkdirSync(join(brokenDir, '.git'), { recursive: true });
    expect(inspectMemoryRepository({ memoryDir: brokenDir }).state).toBe('invalid');
  });
});
