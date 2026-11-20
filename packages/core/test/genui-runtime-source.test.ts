import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadGenuiRuntimeSource } from '../src/runtime/genui-runtime-source.js';

describe('packaged GenUI runtime source', () => {
  let directory: string;
  let sourceUrl: URL;
  let manifestUrl: URL;
  const source = 'globalThis.__BotHarnessGenuiRuntime = {};';
  const sha256 = createHash('sha256').update(source).digest('hex');
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'genui-runtime-test-'));
    sourceUrl = pathToFileURL(join(directory, 'runtime.js'));
    manifestUrl = pathToFileURL(join(directory, 'runtime.json'));
    await writeFile(sourceUrl, source);
    await writeFile(
      manifestUrl,
      JSON.stringify({ renderer: { bytes: Buffer.byteLength(source), sha256 } }),
    );
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('returns frozen, byte-checked and hash-checked UTF-8 source', async () => {
    const result = await loadGenuiRuntimeSource(sourceUrl, manifestUrl);
    expect(result).toEqual({ source, sha256 });
    expect(Object.isFrozen(result)).toBe(true);
  });
  it('refuses equal-length source corruption', async () => {
    await writeFile(sourceUrl, source.replace('{}', '[]'));
    await expect(loadGenuiRuntimeSource(sourceUrl, manifestUrl)).rejects.toThrow(
      'identity changed',
    );
  });
  it.each([
    'missing',
    'oversized-source',
    'oversized-manifest',
    'invalid-utf8',
    'invalid-manifest',
    'wrong-size',
  ])('refuses %s assets', async (kind) => {
    if (kind === 'missing') await rm(sourceUrl);
    if (kind === 'oversized-source') await writeFile(sourceUrl, 'x'.repeat(2_097_153));
    if (kind === 'oversized-manifest') await writeFile(manifestUrl, ' '.repeat(4097));
    if (kind === 'invalid-utf8') await writeFile(sourceUrl, Buffer.from([0xff]));
    if (kind === 'invalid-manifest')
      await writeFile(manifestUrl, '{"renderer":{"bytes":1,"sha256":"unknown"}}');
    if (kind === 'wrong-size') await writeFile(sourceUrl, `${source} `);
    await expect(loadGenuiRuntimeSource(sourceUrl, manifestUrl)).rejects.toThrow();
  });
});
