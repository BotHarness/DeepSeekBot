import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, realpathSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { inspectMemoryRepository } from '../memory/repository.js';
import type { PersonaBotRegistry } from './registry.js';

export type MemoryMoveTarget =
  | { ok: true; from: string; to: string; custom: boolean }
  | { ok: false; code: 'invalid-memory-dir' | 'memory-unavailable'; message: string };

export interface MemoryMoveResult {
  copied: boolean;
  leftover?: string;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function nested(left: string, right: string): boolean {
  const inside = (root: string, child: string) => {
    const path = relative(root, child);
    return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
  };
  return inside(left, right) || inside(right, left);
}

export function memoryMoveTarget(
  registry: PersonaBotRegistry,
  slug: string,
  location: string | null,
): MemoryMoveTarget {
  const from = registry.memoryDirFor(slug);
  if (from === undefined || inspectMemoryRepository({ memoryDir: from }).state !== 'ready')
    return {
      ok: false,
      code: 'memory-unavailable',
      message: 'This Bot has no readable Memory repository to move.',
    };
  if (location === null)
    return { ok: true, from, to: registry.defaultMemoryDirFor(slug), custom: false };
  if (!isAbsolute(location) || !isDirectory(location))
    return {
      ok: false,
      code: 'invalid-memory-dir',
      message: 'The Memory location must be an existing absolute folder.',
    };
  const to = join(resolve(location), slug);
  if (to === from) return { ok: true, from, to, custom: true };
  if (existsSync(to))
    return {
      ok: false,
      code: 'invalid-memory-dir',
      message: `${to} already exists; choose another folder.`,
    };
  if (nested(canonical(from), join(canonical(location), slug)))
    return {
      ok: false,
      code: 'invalid-memory-dir',
      message: 'The new Memory location cannot be inside the current one.',
    };
  return { ok: true, from, to, custom: true };
}

export function moveMemoryDirectory(from: string, to: string): MemoryMoveResult {
  const before = inspectMemoryRepository({ memoryDir: from });
  if (before.state !== 'ready') throw new Error('The Memory repository is not readable');
  if (existsSync(to)) throw new Error(`${to} already exists`);
  if (!isDirectory(dirname(to))) mkdirSync(dirname(to), { recursive: true });
  try {
    renameSync(from, to);
    return { copied: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
  }
  const staging = join(dirname(to), `.${basename(to)}.moving-${randomUUID()}`);
  try {
    cpSync(from, staging, {
      recursive: true,
      verbatimSymlinks: true,
      preserveTimestamps: true,
      errorOnExist: true,
      force: false,
    });
    const copied = inspectMemoryRepository({ memoryDir: staging });
    if (copied.state !== 'ready' || copied.head !== before.head)
      throw new Error('The copied Memory repository does not match the original');
    renameSync(staging, to);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  try {
    rmSync(from, { recursive: true, force: true });
    return { copied: true };
  } catch {
    return { copied: true, leftover: from };
  }
}
