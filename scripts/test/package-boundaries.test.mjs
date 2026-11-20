import { describe, expect, it } from 'vitest';
import { packageBoundaryErrors } from '../check-package-boundaries.mjs';

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

  it('counts legacy imports and requires removing a stale allowance', () => {
    const file = 'packages/client/src/example.ts';
    const source = "import { one } from '@botharness/core';";
    const baseline = { '@botharness/core': 1 };

    expect(packageBoundaryErrors(file, source, workspaces, baseline)).toEqual([]);
    expect(
      packageBoundaryErrors(file, source + source.replace('one', 'two'), workspaces, baseline),
    ).toEqual([expect.stringContaining('client source must use Host RPC or shared contracts')]);
    expect(packageBoundaryErrors(file, '', workspaces, baseline)).toEqual([
      expect.stringContaining('shrink scripts/client-host-import-baseline.json'),
    ]);
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
