import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  parseFiles,
  partitionFiles,
  runSelected,
  selectAffected,
  SHARD_THRESHOLD,
} from '../ci-affected.mjs';
import { DOCS_SITE_TEST, ROOT, SHARDS } from '../ci-plan.mjs';

const testFile = 'scripts/test/ci-affected.test.mjs';
const otherFile = `nested/${testFile}`;
const spec = (file) => ({ moduleId: resolve(ROOT, file) });
const module = (file, ok = true) => ({ ...spec(file), ok: () => ok });
function runnerFor(files = [testFile]) {
  const runner = {
    getRelevantTestSpecifications: vi.fn(async () => files.map(spec)),
    globTestSpecifications: vi.fn(async () => files.map(spec)),
    standalone: vi.fn(async () => {}),
    runTestSpecifications: vi.fn(async (specs) => ({
      testModules: specs.map((test) => ({ ...test, ok: () => true })),
      unhandledErrors: [],
    })),
    close: vi.fn(async () => {}),
  };
  return { runner, create: vi.fn(async () => runner) };
}

describe('affected test partitioning', () => {
  it.each([0, 1, SHARD_THRESHOLD - 1, SHARD_THRESHOLD, SHARD_THRESHOLD + 1, 158])(
    'covers all %i files exactly once with bounded, balanced shards',
    (count) => {
      const files = Array.from({ length: count }, (_, index) => `test/${index}.test.ts`);
      const result = partitionFiles(files);
      expect(result.count).toBe(count);
      expect(result.matrix.include).toHaveLength(count >= SHARD_THRESHOLD ? SHARDS : count ? 1 : 0);
      const selected = result.matrix.include.flatMap((shard) => shard.files);
      expect(selected.sort()).toEqual([...files].sort());
      expect(new Set(selected).size).toBe(count);
      if (count) {
        const sizes = result.matrix.include.map((shard) => shard.files.length);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      }
      expect(partitionFiles([...files].reverse())).toEqual(result);
    },
  );

  it('deduplicates selection before counting and assigning shards', () => {
    expect(partitionFiles([testFile, testFile])).toEqual({
      count: 1,
      matrix: { include: [{ shard: 1, files: [testFile] }] },
    });
  });

  it.each([
    '{}',
    'null',
    '[null]',
    '[1]',
    '[""]',
    '["../outside"]',
    '["/absolute"]',
    '["C:/absolute"]',
    '["a/../b"]',
    '["a\\nb"]',
    '["a\\\\b"]',
  ])('rejects malformed or escaping file input %s', (input) =>
    expect(() => parseFiles(input)).toThrow(),
  );
});

describe('affected test selection', () => {
  it('uses Vitest dependency selection and excludes the separately owned docs-site test', async () => {
    const { runner, create } = runnerFor([otherFile, testFile, DOCS_SITE_TEST]);
    const result = await selectAffected(['packages/core/src/shared.ts'], { create });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        related: ['packages/core/src/shared.ts'],
        watch: false,
        run: true,
        exclude: [DOCS_SITE_TEST],
      }),
    );
    expect(result.matrix.include[0].files).toEqual([otherFile, testFile].sort());
    expect(runner.runTestSpecifications).not.toHaveBeenCalled();
    expect(runner.close).toHaveBeenCalledOnce();
  });

  it('never turns an empty related list into a full run', async () => {
    const { create } = runnerFor();
    expect(await selectAffected([], { create })).toEqual({ count: 0, matrix: { include: [] } });
    expect(create).not.toHaveBeenCalled();
  });

  it('supports an empty resolved selection', async () => {
    const { create } = runnerFor([]);
    expect(await selectAffected(['unused.ts'], { create })).toEqual({
      count: 0,
      matrix: { include: [] },
    });
  });

  it('fails closed and closes Vitest on dependency-graph failure', async () => {
    const { runner, create } = runnerFor();
    runner.getRelevantTestSpecifications.mockRejectedValue(new Error('broken config'));
    await expect(selectAffected([testFile], { create })).rejects.toThrow('broken config');
    expect(runner.close).toHaveBeenCalledOnce();
  });

  it('rejects malformed Vitest selection output', async () => {
    const { runner, create } = runnerFor();
    runner.getRelevantTestSpecifications.mockResolvedValue([{ file: testFile }]);
    await expect(selectAffected([testFile], { create })).rejects.toThrow(
      'invalid test module path',
    );
    expect(runner.close).toHaveBeenCalledOnce();
  });
});

describe('exact affected shard execution', () => {
  it('runs exact specifications, without including a filename containing the selected path', async () => {
    const { runner, create } = runnerFor([testFile, otherFile]);
    await runSelected([testFile], { create });
    expect(runner.runTestSpecifications).toHaveBeenCalledWith([spec(testFile)]);
    expect(runner.standalone).toHaveBeenCalledOnce();
    expect(runner.close).toHaveBeenCalledOnce();
  });

  it('fails before running when even one selected test has disappeared', async () => {
    const { runner, create } = runnerFor([testFile]);
    await expect(runSelected([testFile, otherFile], { create })).rejects.toThrow(
      'Selected tests are missing',
    );
    expect(runner.runTestSpecifications).not.toHaveBeenCalled();
    expect(runner.close).toHaveBeenCalledOnce();
  });

  it.each([
    { testModules: [module(testFile, false)], unhandledErrors: [] },
    { testModules: [module(testFile)], unhandledErrors: [new Error('worker crashed')] },
    { testModules: [], unhandledErrors: [] },
  ])('fails on failed, crashed or incomplete runs', async (result) => {
    const { runner, create } = runnerFor();
    runner.runTestSpecifications.mockResolvedValue(result);
    await expect(runSelected([testFile], { create })).rejects.toThrow('failed or did not complete');
    expect(runner.close).toHaveBeenCalledOnce();
  });

  it.each([{ files: [] }, { files: [DOCS_SITE_TEST] }])(
    'rejects an invalid shard before starting Vitest',
    async ({ files }) => {
      const { create } = runnerFor();
      await expect(runSelected(files, { create })).rejects.toThrow('must contain tests');
      expect(create).not.toHaveBeenCalled();
    },
  );

  it.each([
    { related: '{bad', status: 1, output: '' },
    { related: '[]', status: 0, output: 'matrix={"include":[]}\ncount=0\nshards=0\n' },
  ])(
    'reports the correct CLI status and matrix for $related',
    ({ related, status, output: expected }) => {
      const directory = mkdtempSync(join(tmpdir(), 'ci-affected-'));
      try {
        const output = join(directory, 'output');
        writeFileSync(output, '');
        const child = spawnSync(process.execPath, ['scripts/ci-affected.mjs', '--select'], {
          cwd: ROOT,
          encoding: 'utf8',
          env: { ...process.env, RELATED: related, GITHUB_OUTPUT: output },
        });
        expect(child.status).toBe(status);
        if (status) expect(child.stderr).toContain('SyntaxError');
        expect(readFileSync(output, 'utf8')).toBe(expected);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
});
