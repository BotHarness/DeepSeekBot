import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  androidNativeTests,
  checkClassification,
  checkTestInclude,
  checkWorkflow,
  createIndex,
  DOCS_SITE_TEST,
  FULL_LABEL,
  matchesGlob,
  mobileVerification,
  parseChanges,
  memberConfinement,
  timelinePerf,
  uiVisual,
  parseGitChanges,
  plan,
  REQUIRED_CHECK,
  ROOT,
  SHARDS,
  rulesTable,
  syncGuide,
  localCommands,
} from '../ci-plan.mjs';

const repo = {
  'package.json': '{}',
  'pnpm-lock.yaml': '',
  'vitest.config.ts': '',
  'packages/client/src/client/chip.tsx': "export const chip = 'x';",
  'packages/client/test/chip.test.ts': "import { chip } from '../src/client/chip.js';",
  'packages/core/src/plugin.ts': 'export const plugin = 1;',
  'packages/market/migrations/0001.sql': 'create table t (id int);',
  'packages/market/test/market-harness.ts':
    "const migrations = new URL('../migrations/', import.meta.url);",
  'packages/market/test/market.test.ts': "import './market-harness.js';",
  'scripts/sync-docs.mjs': "import { collect } from './docs-reference.mjs';",
  'scripts/docs-reference.mjs': 'export const collect = 1;',
  'scripts/release-draft.mjs': "import { ledger } from './release-ledger.mjs';",
  'scripts/release-ledger.mjs': 'export const ledger = 1;',
  'apps/docs/astro.config.ts': 'import { syncDocs } from "../../scripts/sync-docs.mjs";',
  'apps/docs/test/release-draft.test.ts':
    'const script = resolve(ROOT, "scripts/release-draft.mjs");',
  [DOCS_SITE_TEST]: 'const docs = resolve(ROOT, "apps/docs");',
  'apps/docs/src/pages/index.astro': '',
  'scripts/test/workflow.test.mjs':
    "const workflow = new URL('../../.github/workflows/npm-provider-release.yml', import.meta.url);",
  '.github/workflows/npm-provider-release.yml': '',
  '.github/workflows/verify.yml': '',
  '.github/pr-screenshots/chip/compare.png': '',
  'changes/1640-chip.md': '',
  'docs/adr/0001-thing.md': '',
  'CHANGELOG.md': '',
  'CHANGELOG.zh.md': '',
  'apps/docs/test/changelog-release-site.test.ts':
    'readFileSync(resolve(ROOT, "CHANGELOG.md")); readFileSync(resolve(ROOT, "CHANGELOG.zh.md"));',
};
const index = createIndex(Object.keys(repo), (file) => repo[file]);
const pr = (...paths) => ({
  event: 'pull_request',
  index,
  changes: paths.map((path) => ({ status: 'modified', path })),
});

it('runs native capture regressions for a source-patch-only change', () => {
  expect(plan(pr('docs/research/patches/dsh-desktop-window-capture.patch')).tests).toBe('full');
});

it('selects affected tests and mobile verification the same way for a merge group', () => {
  const input = pr('packages/client/src/client/chip.tsx');
  const queued = { ...input, event: 'merge_group' };
  expect(plan(queued)).toEqual(plan(input));
  expect(plan(queued).tests).toBe('affected');
  expect(mobileVerification(queued)).toEqual(mobileVerification(input));
});

describe('mobile verification selection', () => {
  const sources = {
    ...repo,
    'apps/mobile/app/index.tsx': "import { color } from '../../../packages/core/src/color';",
    'packages/core/src/color.ts': "export { color } from './palette.js';",
    'packages/core/src/palette.ts': 'export const color = 1;',
    'packages/core/src/palette.ios.ts': 'export const color = 2;',
    'packages/core/src/devices/connect-account.ts': 'export const connect = 1;',
  };
  const mobileIndex = (extra = {}) => {
    const files = { ...sources, ...extra };
    return createIndex(Object.keys(files), (file) => files[file]);
  };
  const select = (paths, extra = {}) =>
    mobileVerification({
      event: 'pull_request',
      changes: paths.map((path) => ({ path, status: 'modified' })),
      index: mobileIndex(),
      ...extra,
    });

  it('skips the Host-only #2529 change and docs without skipping shared imports', () => {
    expect(
      select([
        'packages/core/src/devices/connect-account.ts',
        'docs/bot-cli.md',
        'changes/2526-connect-account-deleted.md',
      ]).run,
    ).toBe(false);
    expect(select(['packages/core/src/palette.ts']).run).toBe(true);
    expect(select(['packages/core/src/palette.ios.ts']).run).toBe(true);
  });

  it.each([
    'apps/mobile/app/index.tsx',
    'apps/mobile/assets/icon.png',
    'apps/mobile/app.config.js',
    'apps/mobile/modules/a/index.ts',
    'pnpm-lock.yaml',
    '.node-version',
    'scripts/ci-plan.mjs',
    '.github/workflows/verify.yml',
  ])('runs for %s', (path) => {
    expect(select([path]).run).toBe(true);
  });

  it.each([
    'docs/guide.md',
    'apps/mobile/README.md',
    'apps/mobile/test/a.test.ts',
    'apps/mobile/.maestro/flow.yaml',
    'apps/mobile/store/notes.md',
  ])('skips non-bundle input %s', (path) => {
    expect(select([path]).run).toBe(false);
  });

  it('keeps full-event, label, truncation, unknown and deletion fallbacks', () => {
    for (const event of ['push', 'schedule', 'workflow_dispatch', 'workflow_call'])
      expect(select([], { event }).run).toBe(true);
    expect(select([], { labels: [FULL_LABEL] }).run).toBe(true);
    expect(select([], { truncated: true }).run).toBe(true);
    expect(select(['unknown/input']).run).toBe(true);
    expect(
      select([], { changes: [{ path: 'packages/core/src/removed.ts', status: 'removed' }] }).run,
    ).toBe(true);
    expect(
      select([], {
        changes: [
          {
            path: 'packages/core/src/new.ts',
            previous: 'apps/mobile/src/old.ts',
            status: 'renamed',
          },
        ],
      }).run,
    ).toBe(true);
  });

  it('traces require, side-effect imports, assets and cycles conservatively', () => {
    const index = mobileIndex({
      'apps/mobile/app/index.tsx': "import '../../../packages/core/src/start';",
      'packages/core/src/start.ts':
        "const value = require('./other'); const image = require('./icon.png');",
      'packages/core/src/other.ts': "export * from './start';",
      'packages/core/src/icon.png': '',
    });
    expect(select(['packages/core/src/other.ts'], { index }).run).toBe(true);
    expect(select(['packages/core/src/icon.png'], { index }).run).toBe(true);
  });

  it('runs when an import cannot be safely resolved', () => {
    for (const source of [
      "import './missing';",
      'const x = require(path);',
      "import x from '@/shared';",
      "import x from '@botharness/core';",
      "import x from 'shared';",
      "const x = require('../../../packages/core/src/color' + variant);",
      'const x = require.resolve(path);',
    ]) {
      expect(
        select(['packages/core/src/devices/connect-account.ts'], {
          index: mobileIndex({ 'apps/mobile/app/index.tsx': source }),
        }).run,
      ).toBe(true);
    }
  });

  it('parses imports across comments, template expressions and regex literals', () => {
    for (const source of [
      "import /* annotation */ '../../../packages/core/src/color';",
      "const x = require /* annotation */ ('../../../packages/core/src/color');",
      "const x = `${require('../../../packages/core/src/color')}`;",
      "const apostrophe = /'/; import x from '../../../packages/core/src/color';",
      "import shared = require('../../../packages/core/src/color');",
    ]) {
      const index = mobileIndex({ 'apps/mobile/app/index.tsx': source });
      expect(select(['packages/core/src/color.ts'], { index }).run).toBe(true);
      expect(select(['packages/core/src/devices/connect-account.ts'], { index }).run).toBe(false);
    }
  });

  it('keeps removed script inputs conservative', () => {
    expect(select([], { changes: [{ path: 'scripts/deleted.mjs', status: 'removed' }] }).run).toBe(
      true,
    );
  });

  it('follows declared workspace packages while accepting declared external dependencies', () => {
    const index = mobileIndex({
      'apps/mobile/app/index.tsx': "import '@botharness/shared'; import 'external/subpath';",
      'apps/mobile/package.json': JSON.stringify({ dependencies: { external: '1.0.0' } }),
      'packages/shared/package.json': JSON.stringify({ name: '@botharness/shared' }),
      'packages/shared/src/value.ts': 'export const value = 1;',
    });
    expect(select(['packages/shared/src/value.ts'], { index }).run).toBe(true);
    expect(select(['packages/core/src/devices/connect-account.ts'], { index }).run).toBe(false);
  });
});

describe('CI test plan', () => {
  it('runs the UI visual checks for Client source, the gallery and full runs', () => {
    expect(uiVisual('affected', [{ path: 'packages/client/src/client/ds/nav-item.tsx' }])).toBe(
      true,
    );
    expect(uiVisual('affected', [{ path: 'scripts/ui-visual/gallery.tsx' }])).toBe(true);
    expect(uiVisual('affected', [{ path: 'scripts/check-ui-visual.mjs' }])).toBe(true);
    expect(uiVisual('affected', [{ path: 'packages/core/src/index.ts' }])).toBe(false);
    expect(uiVisual('full', [])).toBe(true);
  });

  it('runs the member Shell confinement job for execution source, its tests and full runs', () => {
    expect(
      memberConfinement('affected', [{ path: 'packages/core/src/execution/shell-reach.ts' }]),
    ).toBe(true);
    expect(
      memberConfinement('affected', [{ path: 'packages/core/test/member-confinement.test.ts' }]),
    ).toBe(true);
    expect(memberConfinement('affected', [{ path: '.github/workflows/verify.yml' }])).toBe(true);
    expect(memberConfinement('affected', [{ path: 'packages/core/src/index.ts' }])).toBe(false);
    expect(memberConfinement('full', [])).toBe(true);
  });

  it('runs the timeline performance budget for Client source, perf tooling and full runs', () => {
    expect(timelinePerf('affected', [{ path: 'packages/client/src/client/bot-main.tsx' }])).toBe(
      true,
    );
    expect(timelinePerf('affected', [{ path: 'scripts/perf-budgets/timeline.json' }])).toBe(true);
    expect(timelinePerf('affected', [{ path: 'scripts/perf-idle-timeline.mjs' }])).toBe(true);
    for (const path of [
      'scripts/perf-genui-opening.mjs',
      'scripts/perf-genui-opening-observer.mjs',
      'scripts/perf-genui-provenance.mjs',
      'scripts/perf-genui-browser-diagnostics.mjs',
      'scripts/perf-budgets/genui-opening.json',
    ]) {
      expect(timelinePerf('affected', [{ path }])).toBe(true);
    }
    expect(timelinePerf('affected', [{ path: 'scripts/foreground-timeline-scroll.mjs' }])).toBe(
      true,
    );
    expect(timelinePerf('full', [])).toBe(true);
    expect(timelinePerf('affected', [{ path: 'packages/core/src/index.ts' }])).toBe(false);
    expect(timelinePerf('affected', [{ path: 'packages/client/test/a.test.ts' }])).toBe(false);
  });

  it('runs native module tests for Kotlin, native config, removals and full runs', () => {
    expect(
      androidNativeTests('none', [
        { path: 'apps/mobile/modules/stream-reveal/android/src/main/java/TextReveal.kt' },
      ]),
    ).toBe(true);
    expect(
      androidNativeTests('none', [
        { path: 'apps/mobile/modules/stream-reveal/expo-module.config.json' },
      ]),
    ).toBe(true);
    expect(
      androidNativeTests('affected', [
        { path: 'elsewhere.kt', previous: 'apps/mobile/modules/stream-reveal/old.kt' },
      ]),
    ).toBe(true);
    expect(androidNativeTests('full', [])).toBe(true);
    expect(
      androidNativeTests('affected', [{ path: 'apps/mobile/src/ui/chat/message-bubble.tsx' }]),
    ).toBe(false);
    expect(androidNativeTests('none', [{ path: 'docs/research/rendering.md' }])).toBe(false);
  });
  it('runs related tests without the docs site for a Client-only change', () => {
    const result = plan(pr('packages/client/src/client/chip.tsx', 'changes/1640-chip.md'));
    expect(result).toMatchObject({ tests: 'affected', docsSite: false });
    expect(result.related).toEqual(['packages/client/src/client/chip.tsx']);
  });

  it('selects the Core source-scanning helper for an added or edited Core source file', () => {
    const helper = 'packages/core/test/source-files.ts';
    const files = {
      'packages/core/src/features/activity/events.ts': '',
      [helper]: readFileSync(join(ROOT, helper), 'utf8'),
      'packages/core/test/messaging-store-boundary.test.ts':
        "import { sourceFilesMatching } from './source-files.js';",
    };
    const sourceIndex = createIndex(Object.keys(files), (file) => files[file]);
    for (const status of ['added', 'modified'])
      expect(
        plan({
          event: 'pull_request',
          index: sourceIndex,
          changes: [{ status, path: 'packages/core/src/features/activity/events.ts' }],
        }).related,
      ).toContain(helper);
  });

  it('selects nothing for screenshots and change fragments', () => {
    expect(
      plan(pr('.github/pr-screenshots/chip/compare.png', 'changes/1640-chip.md')),
    ).toMatchObject({
      tests: 'none',
      docsSite: false,
      related: [],
    });
  });

  it.each([
    'pnpm-lock.yaml',
    'package.json',
    'packages/client/package.json',
    'vitest.config.ts',
    'packages/client/tsconfig.json',
    'tsdown.config.ts',
    '.github/workflows/verify.yml',
    'scripts/ci-plan.mjs',
  ])('runs everything when %s changes', (path) => {
    expect(plan(pr(path))).toMatchObject({ tests: 'full', docsSite: true });
  });

  it('runs everything for a path no rule classifies', () => {
    const result = plan(pr('brand-new-root-dir/thing.ts'));
    expect(result.tests).toBe('full');
    expect(result.reason).toContain('matches no rule');
  });

  it('selects related tests when a removed or renamed code file has no remaining references', () => {
    const removed = plan({
      ...pr('packages/client/test/chip.test.ts'),
      changes: [
        { status: 'removed', path: 'packages/client/src/client/old.tsx' },
        { status: 'modified', path: 'packages/client/test/chip.test.ts' },
      ],
    });
    expect(removed).toMatchObject({
      tests: 'affected',
      related: ['packages/client/test/chip.test.ts'],
    });
    const renamed = plan({
      ...pr(),
      changes: [
        {
          status: 'renamed',
          path: 'packages/client/src/client/chip.tsx',
          previous: 'packages/client/src/client/old.tsx',
        },
      ],
    });
    expect(renamed).toMatchObject({
      tests: 'affected',
      related: ['packages/client/src/client/chip.tsx'],
    });
    const prose = { ...pr(), changes: [{ status: 'removed', path: 'docs/adr/0002-gone.md' }] };
    expect(plan(prose).tests).not.toBe('full');
  });

  it('selects files that still import or name a removed code file', () => {
    const files = {
      ...repo,
      'packages/client/src/client/uses-old.ts': "export * from './old.js';",
      'packages/client/test/old-path.test.ts': "vi.mock('../src/client/old.tsx');",
      'packages/client/test/old-root.test.ts':
        'const file = resolve(ROOT, "packages/client/src/client/old.tsx");',
      'packages/host-client/package.json': JSON.stringify({
        name: '@botharness/host-client',
        exports: { './*': './src/*.ts' },
      }),
      'packages/host-client/src/kept.ts': '',
      'packages/core/src/uses-host.ts': "import { gone } from '@botharness/host-client/gone';",
      'apps/docs/test/uses-alias.test.ts': "import page from '@/pages/gone.ts';",
      'packages/client/test/unrelated.test.ts': "import { old } from 'old';",
    };
    const staleIndex = createIndex(Object.keys(files), (file) => files[file]);
    const result = plan({
      event: 'pull_request',
      index: staleIndex,
      changes: [
        { status: 'removed', path: 'packages/client/src/client/old.tsx' },
        { status: 'removed', path: 'packages/host-client/src/gone.ts' },
        {
          status: 'renamed',
          path: 'apps/docs/src/pages/kept.ts',
          previous: 'apps/docs/src/pages/gone.ts',
        },
      ],
    });
    expect(result.tests).toBe('affected');
    expect(result.related).toEqual(
      expect.arrayContaining([
        'apps/docs/test/uses-alias.test.ts',
        'packages/client/src/client/uses-old.ts',
        'packages/client/test/old-path.test.ts',
        'packages/client/test/old-root.test.ts',
        'packages/core/src/uses-host.ts',
      ]),
    );
    expect(result.related).not.toContain('packages/client/test/unrelated.test.ts');
  });

  it('keeps directory, index-import, listing and docs-site references to removed files', () => {
    const files = {
      ...repo,
      'packages/client/test/retired.test.ts':
        'const dir = resolve(ROOT, "packages/client/src/retired");',
      'packages/client/test/widget.test.ts': "import '../src/widget';",
      'packages/client/src/client/plugin.js': '',
      'packages/client/assets/plugins.json': JSON.stringify({ plugin: '../src/client/plugin.js' }),
      [DOCS_SITE_TEST]: 'const script = resolve(ROOT, "scripts/old.mjs");',
    };
    const headIndex = (removed) =>
      createIndex(
        Object.keys(files).filter((file) => !removed.includes(file)),
        (file) => files[file],
      );
    const removal = (path) => ({
      event: 'pull_request',
      index: headIndex([path]),
      changes: [{ status: 'removed', path }],
    });
    expect(plan(removal('packages/client/src/retired/only.ts')).related).toContain(
      'packages/client/test/retired.test.ts',
    );
    expect(plan(removal('packages/client/src/widget/index.ts')).related).toContain(
      'packages/client/test/widget.test.ts',
    );
    const listing = plan(removal('packages/client/src/client/plugin.js'));
    expect(listing.tests).toBe('full');
    expect(listing.reason).toContain('packages/client/assets/plugins.json still names');
    expect(plan(removal('scripts/old.mjs'))).toMatchObject({ docsSite: true });
    const prefixed = {
      ...files,
      'packages/kit/package.json': JSON.stringify({
        name: '@botharness/kit',
        exports: { './*': './src/prefix-*.ts' },
      }),
      'packages/kit/src/prefix-kept.ts': '',
      'packages/kit/plugins.json': JSON.stringify({ plugin: '@botharness/kit/gone' }),
    };
    const prefixedIndex = createIndex(Object.keys(prefixed), (file) => prefixed[file]);
    expect(
      plan({
        event: 'pull_request',
        index: prefixedIndex,
        changes: [{ status: 'removed', path: 'packages/kit/src/prefix-gone.ts' }],
      }).tests,
    ).toBe('full');
    const own = {
      ...files,
      'packages/client/src/gadget/config.json': JSON.stringify({ entry: './index.ts' }),
    };
    const ownIndex = createIndex(
      Object.keys(own).filter((file) => file !== 'packages/client/src/gadget/index.ts'),
      (file) => own[file],
    );
    expect(
      plan({
        event: 'pull_request',
        index: ownIndex,
        changes: [{ status: 'removed', path: 'packages/client/src/gadget/index.ts' }],
      }).tests,
    ).toBe('full');
  });

  it('runs everything when a config listing still names a removed code file', () => {
    const files = {
      ...repo,
      'apps/mobile/app.json': JSON.stringify({ plugins: ['packages/core/src/plugin.ts'] }),
    };
    const listingIndex = createIndex(
      Object.keys(files).filter((file) => file !== 'packages/core/src/plugin.ts'),
      (file) => files[file],
    );
    const result = plan({
      event: 'pull_request',
      index: listingIndex,
      changes: [{ status: 'removed', path: 'packages/core/src/plugin.ts' }],
    });
    expect(result.tests).toBe('full');
    expect(result.reason).toContain('apps/mobile/app.json still names');
  });

  it('selects the Core source-scanning helper when a Core source file is removed', () => {
    const helper = 'packages/core/test/source-files.ts';
    const files = {
      'packages/core/src/features/activity/kept.ts': '',
      [helper]: readFileSync(join(ROOT, helper), 'utf8'),
    };
    const sourceIndex = createIndex(Object.keys(files), (file) => files[file]);
    expect(
      plan({
        event: 'pull_request',
        index: sourceIndex,
        changes: [{ status: 'removed', path: 'packages/core/src/features/activity/events.ts' }],
      }).related,
    ).toContain(helper);
  });

  it('selects a helper that reads a changed data file, so its importing tests run', () => {
    const result = plan(pr('packages/market/migrations/0001.sql'));
    expect(result.tests).toBe('affected');
    expect(result.related).toContain('packages/market/test/market-harness.ts');
  });

  it('runs the full plan when release verification gates change', () => {
    expect(plan(pr('.github/workflows/npm-release.yml')).tests).toBe('full');
  });

  it('selects a test that names a changed file that is not a module', () => {
    expect(plan(pr('.github/workflows/npm-provider-release.yml')).related).toEqual([
      'scripts/test/workflow.test.mjs',
    ]);
  });

  it('selects a test that runs a script whose imports changed', () => {
    expect(plan(pr('scripts/release-ledger.mjs')).related).toContain(
      'apps/docs/test/release-draft.test.ts',
    );
  });

  it.each(['CHANGELOG.md', 'CHANGELOG.zh.md'])(
    'selects release projection tests for %s',
    (path) => {
      expect(plan(pr(path))).toMatchObject({
        tests: 'affected',
        docsSite: true,
        related: expect.arrayContaining(['apps/docs/test/changelog-release-site.test.ts']),
      });
    },
  );

  it('builds the docs site for docs inputs and docs site imports, never as a related test', () => {
    for (const path of [
      'docs/adr/0001-thing.md',
      'CHANGELOG.md',
      'packages/core/src/plugin.ts',
      'apps/docs/src/pages/index.astro',
      'scripts/docs-reference.mjs',
    ]) {
      const result = plan(pr(path));
      expect(result.docsSite, path).toBe(true);
      expect(result.related).not.toContain(DOCS_SITE_TEST);
    }
  });

  it.each(['push', 'schedule', 'workflow_dispatch'])('runs everything on %s', (event) => {
    expect(plan({ ...pr('changes/1640-chip.md'), event })).toMatchObject({
      tests: 'full',
      docsSite: true,
    });
  });

  it(`runs everything when the PR carries ${FULL_LABEL}`, () => {
    expect(plan({ ...pr('changes/1640-chip.md'), labels: [FULL_LABEL] })).toMatchObject({
      tests: 'full',
    });
  });

  it('runs everything when the changed file list was truncated', () => {
    expect(plan({ ...pr('changes/1640-chip.md'), truncated: true }).tests).toBe('full');
  });

  it('reads GitHub and git change lists', () => {
    expect(parseChanges('renamed\tb.ts\ta.ts\nmodified\tc.ts\t\n')).toEqual([
      { status: 'renamed', path: 'b.ts', previous: 'a.ts' },
      { status: 'modified', path: 'c.ts', previous: undefined },
    ]);
    expect(parseGitChanges('R100\ta.ts\tb.ts\nM\tc.ts\n')).toEqual([
      { status: 'r', path: 'b.ts', previous: 'a.ts' },
      { status: 'm', path: 'c.ts' },
    ]);
  });

  it('matches globs with braces and double stars', () => {
    expect(matchesGlob('packages/a/test/x/y.test.tsx', 'packages/*/test/**/*.test.{ts,tsx}')).toBe(
      true,
    );
    expect(matchesGlob('packages/a/test/y.test.ts', 'packages/*/test/**/*.test.{ts,tsx}')).toBe(
      true,
    );
    expect(matchesGlob('packages/a/src/y.test.ts', 'packages/*/test/**')).toBe(false);
    expect(matchesGlob('CHANGELOG.zh.md', '{CHANGELOG,CHANGELOG.zh}.md')).toBe(true);
  });
});

describe('CI test plan drift checks', () => {
  it('names an unclassified file and a rule that matches nothing', () => {
    const rules = [
      { glob: 'src/**', tests: 'related', docsSite: false, why: '' },
      { glob: 'gone/**', tests: 'none', docsSite: false, why: '' },
    ];
    expect(checkClassification(['src/a.ts', 'new/b.ts'], rules)).toEqual([
      'new/b.ts matches no rule; classify it in RULES in scripts/ci-plan.mjs',
      'Rule gone/** matches no tracked file; remove or correct it in scripts/ci-plan.mjs',
    ]);
  });

  it('names a test file outside the Vitest include', () => {
    const problems = checkTestInclude(
      [
        DOCS_SITE_TEST,
        'apps/docs/astro.config.ts',
        'scripts/sync-docs.mjs',
        'scripts/sync-slides.mjs',
        'packages/a/test/x.test.tsx',
        'apps/site/test/y.test.ts',
        '.agents/skills/vendored/scripts/z.test.ts',
      ],
      ['packages/*/test/**/*.test.ts', 'apps/docs/test/**/*.test.ts'],
    );
    expect(problems).toEqual([
      'packages/a/test/x.test.tsx is a test outside the Vitest include in vitest.config.ts',
      'apps/site/test/y.test.ts is a test outside the Vitest include in vitest.config.ts',
    ]);
  });

  const workflow = () => ({
    on: {
      push: { branches: ['main'] },
      pull_request: { types: ['opened', 'labeled'] },
      merge_group: { types: ['checks_requested'] },
      schedule: [{ cron: '0 0 * * *' }],
      workflow_dispatch: null,
    },
    jobs: {
      plan: {},
      static: {},
      'test-full': { strategy: { matrix: '${{ fromJSON(needs.plan.outputs.matrix) }}' } },
      'test-affected': { if: `needs.plan.outputs.shards == '${SHARDS}'` },
      verify: {
        name: REQUIRED_CHECK,
        if: 'always()',
        needs: ['plan', 'static', 'test-full', 'test-affected'],
        steps: [
          {
            run: `if (plan.shards !== '${SHARDS}') fail(); if (shards === '${SHARDS}') affected();`,
          },
        ],
      },
    },
  });

  it('accepts a workflow whose aggregate covers every job', () => {
    expect(checkWorkflow(workflow())).toEqual([]);
  });

  it('names a job the aggregate forgot, a renamed check, a path filter and a shard mismatch', () => {
    const broken = workflow();
    broken.jobs.lint = {};
    broken.jobs.verify.name = 'verify';
    broken.on.pull_request.paths = ['packages/**'];
    delete broken.on.merge_group;
    broken.jobs['test-full'].strategy.matrix = { shard: [1, 2, 3] };
    broken.jobs['test-affected'].if = "needs.plan.outputs.shards == '3'";
    broken.jobs.verify.steps = [{ run: "if (shards === '3') affected();" }];
    expect(checkWorkflow(broken)).toEqual([
      `The aggregate job must keep the required check name "${REQUIRED_CHECK}"`,
      'The aggregate job does not need lint',
      'The pull_request trigger filters paths; path selection belongs to scripts/ci-plan.mjs',
      '.github/workflows/verify.yml must run on merge_group checks_requested',
      'test-full must take its duration-balanced matrix from the plan job',
      `test-affected must run when the plan selects ${SHARDS} shards`,
      `The aggregate job must expect ${SHARDS} full and affected shards`,
    ]);
  });

  it('regenerates a stale rules table in place', () => {
    const guide = `# Guide\n\n${rulesTable().replace('Lockfile', 'Old text')}\n\nAfter.\n`;
    const synced = syncGuide(guide);
    expect(synced).toMatch(/\| `pnpm-lock\.yaml` +\| Full suite +\| Yes +\| Lockfile +\|/);
    expect(synced.endsWith('\n\nAfter.\n')).toBe(true);
    expect(syncGuide(synced)).toBe(synced);
  });
});

it('verifies mobile when a shared workspace package changes', () => {
  const files = {
    'apps/mobile/package.json': JSON.stringify({ name: '@botharness/mobile' }),
    'apps/mobile/src/session.ts': "import { client } from '@botharness/host-client/client';",
    'packages/host-client/package.json': JSON.stringify({ name: '@botharness/host-client' }),
    'packages/host-client/src/client.ts': "import { codec } from '@botharness/host-protocol/wire';",
    'packages/host-protocol/package.json': JSON.stringify({ name: '@botharness/host-protocol' }),
    'packages/host-protocol/src/wire.ts': 'export const codec = 1;',
  };
  for (const path of ['packages/host-client/src/client.ts', 'packages/host-protocol/src/wire.ts']) {
    expect(
      mobileVerification({
        event: 'pull_request',
        changes: [{ status: 'modified', path }],
        index: createIndex(Object.keys(files), (file) => files[file]),
      }),
    ).toEqual({ run: true, reason: `${path} is imported by mobile` });
  }
});

describe('local test plan commands', () => {
  it('runs only the related tests for an affected plan', () => {
    expect(
      localCommands({ tests: 'affected', related: ['scripts/a.mjs'], docsSite: false }),
    ).toEqual([
      [
        'vitest',
        'related',
        '--run',
        '--passWithNoTests',
        '--project',
        '!docs-site',
        'scripts/a.mjs',
      ],
    ]);
  });

  it('runs the full suite and the docs site test when the plan asks for them', () => {
    expect(localCommands({ tests: 'full', related: [], docsSite: true })).toEqual([
      ['vitest', 'run', '--project', '!docs-site'],
      ['slides:build'],
      ['vitest', 'run', DOCS_SITE_TEST],
    ]);
    expect(localCommands({ tests: 'none', related: [], docsSite: false })).toEqual([]);
  });
});
