import { existsSync, lstatSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export function within(root: string, target: string): boolean {
  const tail = relative(root, target);
  return tail === '' || (tail !== '..' && !tail.startsWith('..' + sep) && !isAbsolute(tail));
}

export function canonicalPath(path: string, links = 0): string {
  if (links > 40) throw new Error('grant-protected-path');
  const absolute = isAbsolute(path) ? path : process.cwd() + sep + path;
  try {
    return realpathSync.native(absolute);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    try {
      const entry = lstatSync(absolute);
      if (entry.isSymbolicLink())
        return canonicalPath(resolve(dirname(absolute), readlinkSync(absolute)), links + 1);
      throw new Error('grant-protected-path');
    } catch (entryError) {
      if (!(entryError instanceof Error) || !('code' in entryError) || entryError.code !== 'ENOENT')
        throw entryError;
    }
    const parent = canonicalPath(dirname(absolute), links);
    if (existsSync(parent) && !statSync(parent).isDirectory())
      throw new Error('grant-protected-path');
    return join(parent, basename(absolute));
  }
}
