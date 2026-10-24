import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { verifyPublishedBase, verifyRecoveryBase } from '../npm-scoped-tobs-recovery.mjs';
import { productManifest, tobsManifest } from '../product-artifacts.mjs';

afterEach(() => vi.unstubAllGlobals());

it('rejects a replacement original plan before reading or packing artifacts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tobs-recovery-refusal-'));
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'release-plan.json'), '{"productVersion":"1.5.0"}');
    expect(() => verifyRecoveryBase(directory)).toThrow('frozen original 1.5.0 plan');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('requires registry integrity for every retained package and skips only the new entry', async () => {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          name: 'deepseekbot',
          version: '1.5.0',
          dist: { integrity: 'sha512-original' },
        }),
      ),
  );
  vi.stubGlobal('fetch', fetch);
  const legacy = { name: 'deepseekbot', version: '1.5.0', integrity: 'sha512-original' };
  const inventory = {
    artifacts: [legacy, { name: '@botharness/tobs', version: '1.5.0' }],
    platformArtifacts: [],
  };
  await verifyPublishedBase(inventory);
  expect(fetch).toHaveBeenCalledTimes(1);
  legacy.integrity = 'sha512-rebuilt';
  await expect(verifyPublishedBase(inventory)).rejects.toThrow('Published bytes differ');
});

it('keeps the scoped npm introduction aligned with the GitHub English README and owns only tobs', () => {
  const github = readFileSync(new URL('../../README.en.md', import.meta.url), 'utf8');
  const npm = readFileSync(new URL('../../packages/tobs/README.md', import.meta.url), 'utf8');
  expect(npm).toBe(github.replaceAll('deepseekbot@1.4.1', '@botharness/tobs@1.5.0'));
  expect(npm).toContain('formerly named **DeepSeekBot**');
  const product = productManifest({}, '1.5.0');
  const scoped = tobsManifest(product);
  expect(scoped.name).toBe('@botharness/tobs');
  expect(scoped.bin).toEqual({ tobs: './src/tobs.mjs' });
  expect(scoped.dependencies).toEqual({ ...product.dependencies, deepseekbot: '1.5.0' });
  expect(scoped.dsh).toEqual(product.dsh);
});
