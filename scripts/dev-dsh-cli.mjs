import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function dshCommand(
  worktree,
  { exists = existsSync, read = readFileSync, node = process.execPath } = {},
) {
  const cli = join(worktree, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  if (!exists(cli)) {
    throw new Error(`local DSH CLI is missing in ${worktree}; run pnpm install there`);
  }
  const expected = JSON.parse(read(join(worktree, 'package.json'), 'utf8')).devDependencies?.[
    '@deepseek-ai/dsh'
  ];
  const actual = installedDshVersion(worktree, { read });
  if (actual !== expected) {
    throw new Error(`local DSH CLI mismatch: expected ${expected}, found ${actual}`);
  }
  return [node, cli];
}

export function installedDshVersion(worktree, { read = readFileSync } = {}) {
  return JSON.parse(
    read(join(worktree, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8'),
  ).version;
}
