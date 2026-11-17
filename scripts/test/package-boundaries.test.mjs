import { describe, expect, it } from 'vitest';
import { packageBoundaryErrors } from '../check-package-boundaries.mjs';

const workspaces = new Map([
  ['@botharness/mobile', 'apps/mobile'],
  ['@botharness/ui', 'packages/client'],
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
