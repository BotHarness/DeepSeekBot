import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

import {
  assertOrchestratorWorkingDirectory,
  OrchestratorWorkingDirectoryError,
} from '../src/runtime/orchestrator-working-directory.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('accepts another spelling of the Memory directory and names the fix for a different one', () => {
  const root = mkdtempSync(join(tmpdir(), 'botharness-orchestrator-cwd-'));
  roots.push(root);
  const memory = join(root, 'home', 'bots', 'ada', 'memory');
  mkdirSync(memory, { recursive: true });
  mkdirSync(join(root, 'copy'));
  symlinkSync(join(root, 'home'), join(root, 'linked'), 'dir');

  expect(() =>
    assertOrchestratorWorkingDirectory('s', join(root, 'linked', 'bots', 'ada', 'memory'), memory),
  ).not.toThrow();
  expect(() =>
    assertOrchestratorWorkingDirectory(
      's',
      join(root, 'home', 'bots', '..', 'bots', 'ada', 'memory'),
      memory,
    ),
  ).not.toThrow();
  expect(() => assertOrchestratorWorkingDirectory('s', undefined, memory)).not.toThrow();
  let error: unknown;
  try {
    assertOrchestratorWorkingDirectory('s', join(root, 'copy'), memory);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(OrchestratorWorkingDirectoryError);
  expect((error as Error).message).toMatch(/start a new Session/);
});
