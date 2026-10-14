import { describe, expect, it } from 'vitest';
import {
  checkClassification,
  checkTestInclude,
  checkWorkflow,
  createIndex,
  DOCS_SITE_TEST,
  FULL_LABEL,
  matchesGlob,
  parseChanges,
  parseGitChanges,
  plan,
  REQUIRED_CHECK,
  rulesTable,
  syncGuide,
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
    "const workflow = new URL('../../.github/workflows/npm-release.yml', import.meta.url);",
  '.github/workflows/npm-release.yml': '',
  '.github/workflows/verify.yml': '',
  '.github/pr-screenshots/chip/compare.png': '',
  'changes/1640-chip.md': '',
  'docs/adr/0001-thing.md': '',
  'CHANGELOG.md': '',
};
const index = createIndex(Object.keys(repo), (file) => repo[file]);
const pr = (...paths) => ({
  event: 'pull_request',
  index,
  changes: paths.map((path) => ({ status: 'modified', path })),
});

describe('CI test plan', () => {
  it('runs related tests without the docs site for a Client-only change', () => {
    const result = plan(pr('packages/client/src/client/chip.tsx', 'changes/1640-chip.md'));
    expect(result).toMatchObject({ tests: 'affected', docsSite: false });
    expect(result.related).toEqual(['packages/client/src/client/chip.tsx']);
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

  it('runs everything when a code file is removed or renamed', () => {
    const removed = {
      ...pr(),
      changes: [{ status: 'removed', path: 'packages/client/src/client/old.tsx' }],
    };
    expect(plan(removed).tests).toBe('full');
    const renamed = {
      ...pr(),
      changes: [
        {
          status: 'renamed',
          path: 'packages/client/src/client/chip.tsx',
          previous: 'packages/client/src/client/old.tsx',
        },
      ],
    };
    expect(plan(renamed).tests).toBe('full');
    const prose = { ...pr(), changes: [{ status: 'removed', path: 'docs/adr/0002-gone.md' }] };
    expect(plan(prose).tests).not.toBe('full');
  });

  it('selects a helper that reads a changed data file, so its importing tests run', () => {
    const result = plan(pr('packages/market/migrations/0001.sql'));
    expect(result.tests).toBe('affected');
    expect(result.related).toContain('packages/market/test/market-harness.ts');
  });

  it('selects a test that names a changed file that is not a module', () => {
    expect(plan(pr('.github/workflows/npm-release.yml')).related).toEqual([
      'scripts/test/workflow.test.mjs',
    ]);
  });

  it('selects a test that runs a script whose imports changed', () => {
    expect(plan(pr('scripts/release-ledger.mjs')).related).toContain(
      'apps/docs/test/release-draft.test.ts',
    );
  });

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
      schedule: [{ cron: '0 0 * * *' }],
      workflow_dispatch: null,
    },
    jobs: {
      plan: {},
      static: {},
      'test-full': { strategy: { matrix: { shard: [1, 2, 3] } } },
      verify: { name: REQUIRED_CHECK, if: 'always()', needs: ['plan', 'static', 'test-full'] },
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
    broken.jobs['test-full'].strategy.matrix.shard = [1, 2];
    expect(checkWorkflow(broken)).toEqual([
      `The aggregate job must keep the required check name "${REQUIRED_CHECK}"`,
      'The aggregate job does not need lint',
      'The pull_request trigger filters paths; path selection belongs to scripts/ci-plan.mjs',
      'test-full must run a matrix of 3 shards to match SHARDS',
    ]);
  });

  it('regenerates a stale rules table in place', () => {
    const guide = `# Guide\n\n${rulesTable().replace('Lockfile', 'Old text')}\n\nAfter.\n`;
    const synced = syncGuide(guide);
    expect(synced).toMatch(/\| `pnpm-lock\.yaml` +\| Full suite +\| Yes +\| Lockfile +\|/);
    expect(synced.endsWith('\n\nAfter.\n')).toBe(true);
    expect(syncGuide(synced)).toBe(synced);
  });

  it('regenerates a CRLF guide table in the file line endings', () => {
    const guide = `# Guide\n\n${rulesTable().replace('Lockfile', 'Old text')}\n\nAfter.\n`;
    const crlf = guide.replaceAll('\n', '\r\n');
    expect(syncGuide(crlf)).toBe(syncGuide(guide).replaceAll('\n', '\r\n'));
  });
});
