import { lstatSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, sep } from 'node:path';

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
    const root = parse(absolute).root;
    const segments = absolute.slice(root.length).split(sep === '\\' ? /[\\/]+/u : /\/+/u);
    let current = realpathSync.native(root);
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]!;
      if (!segment || segment === '.') continue;
      if (segment === '..') {
        current = dirname(current);
        continue;
      }
      const candidate = join(current, segment);
      try {
        const entry = lstatSync(candidate);
        if (entry.isSymbolicLink()) {
          const target = readlinkSync(candidate);
          const next = isAbsolute(target) ? target : current + sep + target;
          return canonicalPath(next + sep + segments.slice(index + 1).join(sep), links + 1);
        }
        if (index < segments.length - 1 && !entry.isDirectory())
          throw new Error('grant-protected-path');
      } catch (entryError) {
        if (
          !(entryError instanceof Error) ||
          !('code' in entryError) ||
          entryError.code !== 'ENOENT'
        )
          throw entryError;
      }
      current = candidate;
    }
    return current;
  }
}
