import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildShellIsolationProbe } from '../e2e-team-security.mjs';

it('limits B2 account discovery to member Spaces in the test Profile', () => {
  const home = join('fixtures', 'test profile');
  const probe = buildShellIsolationProbe({
    home,
    foreignFiles: [join(home, 'spaces', 'bob', 'bob-account.md')],
    outside: join(home, 'spaces', 'bob', 'shell-owned.txt'),
    own: join(home, 'spaces', 'alice', 'own.txt'),
    port: '12345',
  });

  expect(probe.split('\n').filter((line) => line.startsWith('find '))).toEqual([
    expect.stringContaining(`find '${join(home, 'spaces')}' -name 'bob-account.md'`),
  ]);
});
