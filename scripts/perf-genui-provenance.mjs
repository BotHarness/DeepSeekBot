import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function genuiDirtySourceHashes(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root }).toString();
  const paths = new Set([
    ...git('diff', '--name-only', '--diff-filter=d', '-z', 'HEAD').split('\0'),
    ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0'),
  ]);
  return Object.fromEntries(
    [...paths]
      .filter((path) => path && /\.(?:mjs|ts|tsx|json|yml)$/u.test(path))
      .map((path) => [
        path,
        createHash('sha256')
          .update(readFileSync(join(root, path)))
          .digest('hex'),
      ]),
  );
}
