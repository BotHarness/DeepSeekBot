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
const clientHostBaseline = 'scripts/client-host-import-baseline.json';
const coreLayerBaseline = 'scripts/core-layer-baseline.json';
const emptyCoreLayerBaseline = { upward: {}, peerCycles: {} };

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
    "import { createBridgeMethods } from '../bridge/methods.js';",
    "import type { BotMetadataResult } from '../team/bot-administration.js';",
    "type AllBotPreview = import('../channels/all-bot-mention.js').AllBotPreview;",
    "export type { HumanContext } from '../humans/context.js';",
    'const bridge = import(`../bridge/rpc.js`);',
    "import type { HostCore } from '@botharness/core';",
    "export * from '@botharness/core/src/bridge/methods.js';",
    "export * from '..';",
  ])('rejects Kernel dependencies on other Host core modules: %s', (source) => {
    expect(
      packageBoundaryErrors('packages/core/src/kernel/results.ts', source, workspaces),
    ).toEqual([expect.stringContaining('Kernel must not depend on another Host core module')]);
  });
  it('allows Kernel dependencies on its own files, protocols and Node built-ins', () => {
    expect(
      packageBoundaryErrors(
        'packages/core/src/kernel/rpc-result.ts',
        [
          "import type { BridgeResult } from './method-utils.js';",
          "import { RemoteError } from '@deepseek-ai/dsh-typert-protocol';",
          "import { isEngineId } from '@botharness/host-protocol/subscription-engine';",
          "import { isDeepStrictEqual } from 'node:util';",
        ].join('\n'),
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
    expect(packageBoundaryErrors('packages/core/src/cli/cli-live.ts', source, workspaces)).toEqual([
      expect.stringContaining('CLI adapters must use the Host for operational database access'),
    ]);
  });
  it('keeps database ownership available to the offline Profile bridge', () => {
    expect(
      packageBoundaryErrors(
        'packages/core/src/bridge/cli-offline.ts',
        "import '../database/owner.js';",
        workspaces,
      ),
    ).toEqual([]);
  });
  it.each(['registry', 'deletion'])('keeps PersonaBot %s independent of Tob', (module) => {
    expect(
      packageBoundaryErrors(
        `packages/core/src/bots/${module}.ts`,
        "import type { TobService } from '../tob/service.js';",
        workspaces,
      ),
    ).toEqual([expect.stringContaining('PersonaBot lifecycle must use record protection policy')]);
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
  const baseline = clientHostBaseline;
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
    write(coreLayerBaseline, JSON.stringify(emptyCoreLayerBaseline));
    git('add', oldFile, baseline, coreLayerBaseline);
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

const core = 'packages/core/src';
const database = `${core}/database/owner.ts`;
const runtime = `${core}/runtime/start.ts`;
const bots = `${core}/bots/owner.ts`;
const team = `${core}/team/owner.ts`;
const upward = "import '../runtime/start.js';";
const botsToTeam = "import '../team/owner.js';";
const teamToBots = "import '../bots/owner.js';";

function withCoreFixture(files, verify, baseline = emptyCoreLayerBaseline) {
  const root = mkdtempSync(join(tmpdir(), 'core-layer-baseline-'));
  const write = (file, source) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source);
  };
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, shell: false, windowsHide: true });
  try {
    git('init', '--initial-branch=main');
    write(clientHostBaseline, '{}');
    if (baseline) write(coreLayerBaseline, JSON.stringify(baseline));
    for (const [file, source] of Object.entries(files)) write(file, source);
    git('add', '--', 'scripts', 'packages');
    vi.stubEnv('BASELINE_BASE', git('write-tree').toString().trim());
    verify(root, write);
  } finally {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
}

describe('Host core internal layers', () => {
  it.each([
    upward,
    "import {} from '../runtime/start.js';",
    "import { type B, type C } from '../runtime/start.js';",
    "import start from '../runtime/start.js';",
    "import * as startup from '../runtime/start.js';",
    "import { type Options, start } from '../runtime/start.js';",
    "export {} from '../runtime/start.js';",
    "export { type E } from '../runtime/start.js';",
    "export { type Options, start } from '../runtime/start.js';",
    "export * from '../runtime/start.js';",
    "export * as startup from '../runtime/start.js';",
    "const start = import('../runtime/start.js');",
    'const start = import(`../runtime/start.js`);',
    "const start = require('../runtime/start.js');",
    "import start = require('../runtime/start.js');",
  ])('rejects upward runtime dependencies: %s', (source) => {
    withCoreFixture({ [database]: '', [runtime]: '' }, (root, write) => {
      write(database, source);
      expect(checkPackageBoundaries(root)).toEqual([
        expect.stringContaining(
          `database tier 2 -> runtime tier 4): database -> runtime total grew from 0 to 1; counts rose in ${database}`,
        ),
      ]);
    });
  });

  it('allows type-only dependencies, require.resolve, and inline tests', () => {
    withCoreFixture({ [database]: '', [runtime]: '' }, (root, write) => {
      write(
        database,
        `
        import type { A } from '../runtime/start.js';
        export type { D } from '../runtime/start.js';
        export type * from '../runtime/start.js';
        type F = import('../runtime/start.js').F;
        import type G = require('../runtime/start.js');
        const path = require.resolve('../runtime/start.js');
      `,
      );
      write(`${core}/database/owner.spec.ts`, upward);
      write(`${core}/database/__tests__/owner.ts`, "import '../../runtime/start.js';");
      expect(checkPackageBoundaries(root)).toEqual([]);
    });
  });

  it('allows downward, intra-module, and one-way peer imports until a reverse peer edge is added', () => {
    withCoreFixture({ [bots]: '', [team]: '' }, (root, write) => {
      write(bots, `${botsToTeam} import './internal.js';`);
      write(`${core}/bots/internal.ts`, "import './owner.js';");
      write(`${core}/features/start.ts`, "import '../bots/owner.js';");
      write(`${core}/plugin.ts`, "import './features/start.js';");
      expect(checkPackageBoundaries(root)).toEqual([]);

      write(team, teamToBots);
      const errors = checkPackageBoundaries(root);
      const cycle = 'mutual peer cycle (domain tier 3, bots <-> team)';
      expect(errors).toEqual([
        expect.stringContaining(`${cycle}: bots -> team total grew from 0 to 1`),
        expect.stringContaining(`${cycle}: team -> bots total grew from 0 to 1`),
      ]);
    });
  });

  it('classifies top-level entry files as composition, including the extensionless index', () => {
    withCoreFixture({ [runtime]: '', [`${core}/index.ts`]: '' }, (root, write) => {
      write(runtime, "export * from '..'; const index = require('../');");
      expect(checkPackageBoundaries(root)).toEqual([
        expect.stringContaining(
          'runtime tier 4 -> composition tier 6): runtime -> index.ts total grew from 0 to 2',
        ),
      ]);
    });
  });

  it('allows a longer same-tier cycle without a mutual pair', () => {
    const channels = `${core}/channels/owner.ts`;
    withCoreFixture({ [bots]: '', [team]: '', [channels]: '' }, (root, write) => {
      write(bots, botsToTeam);
      write(team, "import '../channels/owner.js';");
      write(channels, teamToBots);
      expect(checkPackageBoundaries(root)).toEqual([]);
    });
  });

  it('requires an explicit layer assignment for new directories and top-level runtime files', () => {
    withCoreFixture({ [database]: '' }, (root, write) => {
      mkdirSync(join(root, core, 'new-module'));
      write(`${core}/util.ts`, '');
      write(`${core}/util.test.ts`, '');
      expect(checkPackageBoundaries(root)).toEqual([
        expect.stringContaining(
          `${core}/new-module: no Host core layer assigned; add the directory to CORE_LAYER_ORDER`,
        ),
        expect.stringContaining(
          `${core}/util.ts: no Host core layer assigned; add the file to CORE_LAYER_ORDER`,
        ),
      ]);
    });
  });

  it('initializes from base source, rejects hand-edited growth, and lets --update resync stale local baselines', () => {
    withCoreFixture(
      { [database]: upward, [runtime]: '' },
      (root, write) => {
        write(database, `${upward}\n${upward}`);
        expect(checkPackageBoundaries(root, { update: true })).toEqual([
          expect.stringContaining('database -> runtime total grew from 1 to 2'),
        ]);

        const baseline = {
          ...emptyCoreLayerBaseline,
          upward: { [database]: { 'database -> runtime': 2 } },
        };
        write(coreLayerBaseline, JSON.stringify(baseline));
        expect(checkPackageBoundaries(root)).toEqual([
          expect.stringContaining(`${coreLayerBaseline}: Host core upward import`),
        ]);

        write(database, upward);
        expect(checkPackageBoundaries(root, { update: true })).toEqual([]);
        expect(JSON.parse(readFileSync(join(root, coreLayerBaseline), 'utf8'))).toEqual({
          upward: { [database]: { 'database -> runtime': 1 } },
          peerCycles: {},
        });
        expect(checkPackageBoundaries(root)).toEqual([]);
      },
      null,
    );
  });

  it('ratchets each direction and drops a cycle after one direction disappears', () => {
    const baseline = {
      upward: { [database]: { 'database -> runtime': 1 } },
      peerCycles: {
        [bots]: { 'bots -> team': 1 },
        [team]: { 'team -> bots': 1 },
      },
    };
    withCoreFixture(
      { [database]: upward, [runtime]: '', [bots]: botsToTeam, [team]: teamToBots },
      (root, write) => {
        expect(checkPackageBoundaries(root)).toEqual([]);

        write(team, `${teamToBots}\n${teamToBots}`);
        expect(checkPackageBoundaries(root, { update: true })).toEqual([
          expect.stringContaining('team -> bots total grew from 1 to 2'),
        ]);
        write(
          coreLayerBaseline,
          JSON.stringify({
            ...baseline,
            peerCycles: { ...baseline.peerCycles, [team]: { 'team -> bots': 2 } },
          }),
        );
        expect(checkPackageBoundaries(root)).toEqual([
          expect.stringContaining(`${coreLayerBaseline}: Host core mutual peer cycle`),
        ]);
        write(coreLayerBaseline, JSON.stringify(baseline));

        write(team, '');
        write(database, '');
        const hint = `total dropped from 1 to 0; shrink ${coreLayerBaseline} with node scripts/check-package-boundaries.mjs --update`;
        expect(checkPackageBoundaries(root)).toEqual([
          `database -> runtime ${hint}`,
          `bots -> team ${hint}`,
          `team -> bots ${hint}`,
        ]);
        expect(checkPackageBoundaries(root, { update: true })).toEqual([]);
        expect(JSON.parse(readFileSync(join(root, coreLayerBaseline), 'utf8'))).toEqual(
          emptyCoreLayerBaseline,
        );
        expect(checkPackageBoundaries(root)).toEqual([]);
      },
      baseline,
    );
  });
});

it('keeps Renderer imports independent of BotHarness and DSH', () => {
  const file = 'packages/artifact-renderers/src/index.ts';
  for (const source of [
    "import type { Host } from '@botharness/host-client/client';",
    "type Host = import('@botharness/host-client/client').HostClient;",
    "export { dsh } from '@deepseek-ai/dsh-client-ui';",
    'const host = import(`@deepseek-ai/dsh`);',
    "const host = require('../../core/src/plugin.js');",
  ])
    expect(packageBoundaryErrors(file, source)).toEqual([
      expect.stringContaining('Artifact Renderers must be independent of BotHarness and DSH'),
    ]);
  expect(packageBoundaryErrors(file, "export { markdown } from './markdown';")).toEqual([]);
  expect(packageBoundaryErrors(file, "import { expect } from 'vitest';")).toEqual([]);
});
