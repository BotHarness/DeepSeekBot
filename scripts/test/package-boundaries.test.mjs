import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { checkPackageBoundaries, packageBoundaryErrors } from '../check-package-boundaries.mjs';

const workspaces = new Map([
  ['@botharness/mobile', 'apps/mobile'],
  ['@botharness/ui', 'packages/client'],
  ['@botharness/core', 'packages/core'],
  ['@botharness/host-client', 'packages/host-client'],
]);
describe('workspace dependency boundaries', () => {
  it.each([
    "import type { T } from '../../../apps/mobile/src/host/types';",
    "export * from '../../../apps/mobile/src/host/types';",
    "const value = import('../../../apps/mobile/src/host/types');",
    "const value = require('../../../apps/mobile/src/host/types');",
    "import { value } from '@botharness/mobile/host/types';",
  ])('rejects app dependencies including types, exports and runtime imports: %s', (source) => {
    expect(packageBoundaryErrors('packages/core/src/example.ts', source, workspaces)).toHaveLength(
      1,
    );
  });
  it.each([
    "import { value } from '../../client/src/example';",
    "export * from '@botharness/ui/panels';",
  ])('rejects core imports of client: %s', (source) => {
    expect(packageBoundaryErrors('packages/core/src/example.ts', source, workspaces)).toHaveLength(
      1,
    );
  });
  it.each([
    "import { value } from '../../core/src/example';",
    "import { value } from '../../core';",
    "export * from '@botharness/core';",
    "type Host = import('@botharness/core').Host",
    "const host = import('@botharness/core');",
  ])('rejects Host imports from Client source: %s', (source) => {
    expect(packageBoundaryErrors('packages/client/src/example.ts', source, workspaces)).toEqual([
      expect.stringContaining('client source must use Host RPC or shared contracts'),
    ]);
    expect(packageBoundaryErrors('packages/client/test/example.ts', source, workspaces)).toEqual(
      [],
    );
  });

  it('permits both apps and packages to consume shared logic', () => {
    expect(
      packageBoundaryErrors(
        'packages/core/src/example.ts',
        "import { value } from '@botharness/host-client/team-client';",
        workspaces,
      ),
    ).toEqual([]);
    expect(
      packageBoundaryErrors(
        'apps/mobile/src/example.ts',
        "import { value } from '@botharness/host-client/team-client';",
        workspaces,
      ),
    ).toEqual([]);
  });
  it.each([
    "import '../database/owner.js';",
    "export * from '@botharness/core/src/database/schema-plan.js';",
    "const store = import('../channels/sqlite-store.js');",
    "const sqlite = require('better-sqlite3');",
    "import { DatabaseSync } from 'node:sqlite';",
  ])('rejects direct operational database dependencies in CLI adapters: %s', (source) => {
    expect(packageBoundaryErrors('packages/core/src/bots/cli-live.ts', source, workspaces)).toEqual(
      [expect.stringContaining('CLI adapters must use the Host for operational database access')],
    );
  });
  it('keeps database ownership available to the offline CLI dispatcher', () => {
    expect(
      packageBoundaryErrors(
        'packages/core/src/bots/bot-create-cli.ts',
        "import '../database/owner.js';",
        workspaces,
      ),
    ).toEqual([]);
  });
  it('rejects a direct database dependency in the shared Host client', () => {
    expect(
      packageBoundaryErrors(
        'packages/host-client/src/example.ts',
        "import '../../core/src/database/owner.js';",
        workspaces,
      ),
    ).toHaveLength(1);
  });
  it('ignores prose and local variable names', () => {
    expect(
      packageBoundaryErrors(
        'packages/core/src/example.ts',
        'const text = "apps/mobile/src";',
        workspaces,
      ),
    ).toEqual([]);
  });
});

it('moves Client Host imports by target, rejects growth, and lowers the baseline after fixes', () => {
  const root = mkdtempSync(join(tmpdir(), 'client-host-baseline-'));
  const oldFile = 'packages/client/src/a.ts';
  const newFile = 'packages/client/src/feature/b.ts';
  const baseline = 'scripts/client-host-import-baseline.json';
  const target = '../../core/src/example.js';
  const movedTarget = '../' + target;
  const write = (file, source) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source);
  };
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, shell: false, windowsHide: true });

  try {
    git('init', '--initial-branch=main');
    write(oldFile, `import { one } from '${target}';`);
    write(baseline, JSON.stringify({ [oldFile]: { [target]: 1 } }));
    git('add', oldFile, baseline);
    const tree = git('write-tree').toString().trim();
    vi.stubEnv('BASELINE_BASE', tree);

    rmSync(join(root, oldFile));
    write(newFile, `import { one } from '${movedTarget}';`);
    expect(checkPackageBoundaries(root)).toEqual([]);
    expect(checkPackageBoundaries(root, { update: true })).toEqual([]);
    expect(JSON.parse(readFileSync(join(root, baseline), 'utf8'))).toEqual({
      [newFile]: { [movedTarget]: 1 },
    });
    expect(checkPackageBoundaries(root)).toEqual([]);

    write(newFile, `import { one } from '${movedTarget}'; import { two } from '${movedTarget}';`);
    const growth = `packages/core/src/example.js total grew from 1 to 2; counts rose in ${newFile} (1 → 2)`;
    expect(checkPackageBoundaries(root)).toEqual([expect.stringContaining(growth)]);
    expect(checkPackageBoundaries(root, { update: true })).toEqual([
      expect.stringContaining(growth),
    ]);
    write(baseline, JSON.stringify({ [newFile]: { [movedTarget]: 2 } }));
    expect(checkPackageBoundaries(root)).toEqual([
      expect.stringContaining(
        `packages/core/src/example.js total grew from 1 to 2; counts rose in ${newFile} (0 → 2)`,
      ),
    ]);

    write(baseline, JSON.stringify({ [newFile]: { [movedTarget]: 1 } }));
    write(newFile, '');
    expect(checkPackageBoundaries(root)).toEqual([
      expect.stringContaining(
        'total dropped from 1 to 0; shrink scripts/client-host-import-baseline.json',
      ),
    ]);
    expect(checkPackageBoundaries(root, { update: true })).toEqual([]);
    expect(JSON.parse(readFileSync(join(root, baseline), 'utf8'))).toEqual({});
    expect(checkPackageBoundaries(root)).toEqual([]);
  } finally {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
});
