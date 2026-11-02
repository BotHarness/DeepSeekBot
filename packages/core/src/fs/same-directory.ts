import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

function canonical(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

export function sameDirectory(left: string, right: string): boolean {
  return left === right || canonical(left) === canonical(right);
}
