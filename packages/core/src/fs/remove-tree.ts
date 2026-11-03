import { chmodSync, lstatSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

type Remove = (path: string, options: Parameters<typeof rmSync>[1]) => void;

const REMOVE_OPTIONS = { recursive: true, force: true, maxRetries: 5, retryDelay: 100 } as const;

function permissionError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'EPERM' || code === 'EACCES';
}

function makeWritable(root: string): void {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) continue;
    try {
      chmodSync(current, stat.mode | 0o200);
    } catch {}
    if (!stat.isDirectory()) continue;
    try {
      for (const name of readdirSync(current)) stack.push(join(current, name));
    } catch {}
  }
}

export function removeTree(path: string, remove: Remove = rmSync): void {
  try {
    remove(path, REMOVE_OPTIONS);
    return;
  } catch (error) {
    if (!permissionError(error)) throw error;
  }
  makeWritable(path);
  remove(path, REMOVE_OPTIONS);
}

export function removeTreeQuietly(path: string, remove: Remove = rmSync): boolean {
  try {
    removeTree(path, remove);
    return true;
  } catch {
    return false;
  }
}
