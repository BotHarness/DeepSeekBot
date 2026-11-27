import { expect, it } from 'vitest';

import { workspaceLookRequest } from '../src/cli/cli-workspace-look.js';
import { cliEffects } from '../src/kernel/cli-effects.js';
import { isInboxCommand } from '../src/cli/cli-inbox.js';

it('reads, sets and clears a Session folder look', () => {
  const cwd = '/work/site';
  expect(workspaceLookRequest('workspace-look', { cwd })).toEqual({
    method: 'workspaceLook',
    args: { path: cwd },
  });
  expect(
    workspaceLookRequest('workspace-look-set', { cwd, color: 'green', symbol: 'globe' }),
  ).toEqual({
    method: 'workspaceLookSet',
    args: { path: cwd, look: { color: 'green', icon: { kind: 'symbol', id: 'globe' } } },
  });
  expect(workspaceLookRequest('workspace-look-set', { cwd, emoji: ' 🚀 ' })).toEqual({
    method: 'workspaceLookSet',
    args: { path: cwd, look: { icon: { kind: 'emoji', emoji: '🚀' } } },
  });
  expect(workspaceLookRequest('workspace-look-set', { cwd, monogram: true })).toEqual({
    method: 'workspaceLookSet',
    args: { path: cwd, look: { icon: { kind: 'monogram' } } },
  });
  expect(workspaceLookRequest('workspace-look-set', { cwd, clear: true })).toEqual({
    method: 'workspaceLookSet',
    args: { path: cwd, look: null },
  });
});

it('refuses a missing folder, no look, two icons or --clear with other flags', () => {
  const cwd = '/work/site';
  for (const [command, values] of [
    ['workspace-look', {}],
    ['workspace-look-set', { cwd }],
    ['workspace-look-set', { cwd, symbol: 'globe', monogram: true }],
    ['workspace-look-set', { cwd, clear: true, color: 'red' }],
  ] as const)
    expect(() => workspaceLookRequest(command, values)).toThrow(
      expect.objectContaining({ code: 'usage' }),
    );
});

it('registers both commands as Host commands with read and write effects', () => {
  expect(isInboxCommand('workspace-look')).toBe(true);
  expect(isInboxCommand('workspace-look-set')).toBe(true);
  expect(cliEffects(['workspace-look', '--cwd', '/w'])).toBeDefined();
  expect(cliEffects(['workspace-look-set', '--cwd', '/w', '--clear'])).toBeDefined();
});
