import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { dshCommand, installedDshVersion } from '../dev-dsh-cli.mjs';

const worktree = '/worktree';
const node = 'test-node';
const cli = join(worktree, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const installedManifest = join(worktree, 'node_modules', '@deepseek-ai', 'dsh', 'package.json');
const worktreeManifest = join(worktree, 'package.json');

function options({ version = '0.2.0-rc.2', pin = '0.2.0-rc.2', missingCli = false } = {}) {
  const present = new Set([cli, installedManifest, worktreeManifest]);
  if (missingCli) present.delete(cli);
  const manifests = new Map([
    [worktreeManifest, JSON.stringify({ devDependencies: { '@deepseek-ai/dsh': pin } })],
    [installedManifest, JSON.stringify({ version })],
  ]);
  return {
    exists: (path) => present.has(path),
    read: (path) => manifests.get(path),
    node,
  };
}

describe('dev DSH CLI', () => {
  it('runs the installed bin.js under the current Node, not a PATH shim', () => {
    expect(dshCommand(worktree, options())).toEqual([node, cli]);
  });

  it('reports a missing CLI before attempting to launch DSH', () => {
    expect(() => dshCommand(worktree, options({ missingCli: true }))).toThrow(
      'local DSH CLI is missing',
    );
  });

  it('refuses a CLI that does not match the pinned DSH version', () => {
    expect(() => dshCommand(worktree, options({ version: '0.2.1-alpha.2' }))).toThrow(
      'local DSH CLI mismatch',
    );
  });

  it('reads the installed CLI version from its manifest', () => {
    expect(installedDshVersion(worktree, { read: options().read })).toBe('0.2.0-rc.2');
  });
});
