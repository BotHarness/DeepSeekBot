#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function editedPath(event) {
  const input = event?.tool_input ?? {};
  return input.file_path ?? input.path ?? input.notebook_path ?? null;
}

const event = JSON.parse(readFileSync(0, 'utf8') || '{}');
const path = editedPath(event);
if (path !== null) {
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'lint-ratchet.mjs'), path], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exitCode = 2;
  }
}
