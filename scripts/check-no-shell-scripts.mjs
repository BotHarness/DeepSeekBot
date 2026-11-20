#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const banned = new Set(['.ps1', '.cmd', '.bat']);

export function findShellScripts(paths) {
  return paths.filter((path) => {
    const lower = path.toLowerCase().replaceAll('\\', '/');
    const dot = lower.lastIndexOf('.');
    if (dot < 0 || lower.lastIndexOf('/') > dot) return false;
    return banned.has(lower.slice(dot));
  });
}

export function listRepositoryFiles(root) {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scripts = findShellScripts(listRepositoryFiles(root));

if (scripts.length > 0) {
  for (const script of scripts) {
    process.stderr.write(`shell script [no-shell-scripts] ${script}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write('No .ps1/.cmd/.bat scripts.\n');
}
