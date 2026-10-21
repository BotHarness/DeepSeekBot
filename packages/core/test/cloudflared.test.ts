import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CLOUDFLARED_ASSETS,
  CLOUDFLARED_SOURCES,
  CLOUDFLARED_VERSION,
  cloudflaredCacheRoot,
  cloudflaredExecutable,
  cloudflaredPackageName,
  createCloudflaredResolver,
  type CloudflaredResolverOptions,
} from '../src/devices/cloudflared.js';
import { createTempRoot } from './helpers.js';

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

const BINARY = Buffer.from('#!/bin/sh\necho pinned cloudflared\n');

function setup(
  overrides: Partial<CloudflaredResolverOptions> = {},
  body: Buffer = BINARY,
  cache = true,
) {
  const root = createTempRoot('botharness-cloudflared-');
  const cacheDir = join(root, 'cache');
  const requested: string[] = [];
  const logs: string[] = [];
  const options: CloudflaredResolverOptions = {
    ...(cache ? { cacheDir } : {}),
    platform: 'linux',
    arch: 'x64',
    env: {},
    assets: { 'linux-x64': { name: 'cloudflared-linux-amd64', sha256: sha256(BINARY) } },
    sources: [(asset) => `https://releases.test/${asset}`],
    locatePackage: () => undefined,
    fetchImpl: (async (url: string) => {
      requested.push(url);
      return new Response(new Uint8Array(body));
    }) as typeof fetch,
    log: (phase, detail) => logs.push(detail === undefined ? phase : `${phase} ${detail}`),
    ...overrides,
  };
  const cached = join(cacheDir, CLOUDFLARED_VERSION, 'cloudflared');
  return { root, cacheDir, cached, requested, logs, resolve: createCloudflaredResolver(options) };
}

describe('pinned cloudflared', () => {
  it('pins one release with a SHA-256 for every supported platform', () => {
    expect(CLOUDFLARED_VERSION).toMatch(/^\d{4}\.\d{1,2}\.\d+$/);
    expect(Object.keys(CLOUDFLARED_ASSETS).sort()).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
      'win32-x64',
    ]);
    for (const [platform, asset] of Object.entries(CLOUDFLARED_ASSETS)) {
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
      if (platform.startsWith('darwin-')) {
        expect(asset.name).toMatch(/\.tgz$/);
        expect(asset.binarySha256).toMatch(/^[a-f0-9]{64}$/);
      } else expect(asset.binarySha256).toBeUndefined();
    }
    expect(CLOUDFLARED_ASSETS['win32-x64']?.name).toBe('cloudflared-windows-amd64.exe');
    expect(CLOUDFLARED_SOURCES[0]?.('cloudflared-linux-amd64')).toBe(
      `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-amd64`,
    );
  });

  it('maps a platform to its package, executable and cache', () => {
    expect(cloudflaredPackageName('darwin', 'arm64')).toBe('@botharness/cloudflared-darwin-arm64');
    expect(cloudflaredPackageName('win32', 'x64')).toBe('@botharness/cloudflared-win32-x64');
    expect(cloudflaredExecutable('win32')).toBe('cloudflared.exe');
    expect(cloudflaredExecutable('linux')).toBe('cloudflared');
    expect(cloudflaredCacheRoot('/home/dsh')).toBe(join('/home/dsh', 'botharness', 'cloudflared'));
  });

  it('prefers the override, then the platform package, then the cache, then PATH', async () => {
    const packageDir = createTempRoot('botharness-cloudflared-package-');
    mkdirSync(join(packageDir, 'bin'));
    writeFileSync(join(packageDir, 'bin', 'cloudflared'), BINARY);
    const located: string[] = [];
    const locatePackage = (name: string): string => {
      located.push(name);
      return packageDir;
    };

    const override = setup({ env: { DEEPSEEKBOT_CLOUDFLARED: '/opt/cloudflared' }, locatePackage });
    expect(await override.resolve()).toEqual({ binary: '/opt/cloudflared', source: 'env' });
    expect(located).toEqual([]);

    const packaged = setup({ locatePackage });
    expect(await packaged.resolve()).toEqual({
      binary: join(packageDir, 'bin', 'cloudflared'),
      source: 'package',
    });
    expect(located).toEqual(['@botharness/cloudflared-linux-x64']);
    expect(packaged.requested).toEqual([]);
    if (process.platform !== 'win32')
      expect(statSync(join(packageDir, 'bin', 'cloudflared')).mode & 0o111).not.toBe(0);

    const downloaded = setup();
    expect(await downloaded.resolve()).toEqual({ binary: downloaded.cached, source: 'download' });
    expect(await downloaded.resolve()).toEqual({ binary: downloaded.cached, source: 'cache' });
    expect(downloaded.requested).toEqual(['https://releases.test/cloudflared-linux-amd64']);

    const uncached = setup({}, BINARY, false);
    expect(await uncached.resolve()).toEqual({ binary: 'cloudflared', source: 'path' });

    const unsupported = setup({ arch: 'ia32', locatePackage });
    expect(await unsupported.resolve()).toEqual({ binary: 'cloudflared', source: 'path' });
    expect(unsupported.requested).toEqual([]);
  });

  it('refuses a platform package whose binary differs from the pin', async () => {
    const packageDir = createTempRoot('botharness-cloudflared-package-');
    mkdirSync(join(packageDir, 'bin'));
    writeFileSync(join(packageDir, 'bin', 'cloudflared'), 'tampered');
    const { resolve, cached, logs } = setup({ locatePackage: () => packageDir });
    expect(await resolve()).toEqual({ binary: cached, source: 'download' });
    expect(logs).toContain('cloudflared-package-refused package=@botharness/cloudflared-linux-x64');
  });

  it('marks the verified download executable through an atomic rename', async () => {
    const { resolve, cached, cacheDir } = setup();
    await resolve();
    expect(readFileSync(cached)).toEqual(BINARY);
    if (process.platform !== 'win32') expect(statSync(cached).mode & 0o111).not.toBe(0);
    expect(readdirSync(cacheDir)).toEqual([CLOUDFLARED_VERSION]);
  });

  it('keeps concurrent downloads and repairs a cached binary that lost its exec bit', async () => {
    const { resolve, cached, cacheDir } = setup();
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, '.cloudflared.other'), 'partial');
    writeFileSync(join(cacheDir, '2020.1.1'), 'old');
    await resolve();
    expect(readdirSync(cacheDir).sort()).toEqual(['.cloudflared.other', CLOUDFLARED_VERSION]);
    if (process.platform === 'win32') return;
    chmodSync(cached, 0o644);
    expect(await resolve()).toEqual({ binary: cached, source: 'cache' });
    expect(statSync(cached).mode & 0o111).not.toBe(0);
  });

  it('refuses and deletes a download whose hash differs, then falls back to PATH', async () => {
    const { resolve, cacheDir, logs } = setup({}, Buffer.from('not the pinned binary'));
    expect(await resolve()).toEqual({
      binary: 'cloudflared',
      source: 'path',
      failure: 'cloudflared-hash-mismatch',
    });
    expect(readdirSync(cacheDir)).toEqual([]);
    expect(logs.some((line) => line.startsWith('cloudflared-hash-mismatch'))).toBe(true);
  });

  it('reports a download failure without leaving partial files', async () => {
    const { resolve, cacheDir } = setup({
      fetchImpl: (async () => new Response('down', { status: 503 })) as typeof fetch,
    });
    expect(await resolve()).toEqual({
      binary: 'cloudflared',
      source: 'path',
      failure: 'cloudflared-download-failed',
    });
    expect(readdirSync(cacheDir)).toEqual([]);
  });

  it('replaces a corrupted cached binary with a fresh verified download', async () => {
    const { resolve, cached, requested, logs } = setup();
    mkdirSync(join(cached, '..'), { recursive: true });
    writeFileSync(cached, 'corrupted');
    expect(await resolve()).toEqual({ binary: cached, source: 'download' });
    expect(readFileSync(cached)).toEqual(BINARY);
    expect(requested).toHaveLength(1);
    expect(logs).toContain(`cloudflared-cache-refused version=${CLOUDFLARED_VERSION}`);
  });

  it('shares one download between concurrent resolutions', async () => {
    const { resolve, cached, requested } = setup();
    const results = await Promise.all([resolve(), resolve(), resolve()]);
    expect(results.map((result) => result.binary)).toEqual([cached, cached, cached]);
    expect(requested).toHaveLength(1);
  });

  it('extracts a macOS archive and verifies the binary inside it', async () => {
    const source = createTempRoot('botharness-cloudflared-tgz-');
    writeFileSync(join(source, 'cloudflared'), BINARY);
    const archive = join(source, 'cloudflared-darwin-arm64.tgz');
    execFileSync('tar', ['-czf', archive, '-C', source, 'cloudflared']);
    const bytes = readFileSync(archive);
    const assets = {
      'darwin-arm64': {
        name: 'cloudflared-darwin-arm64.tgz',
        sha256: sha256(bytes),
        binarySha256: sha256(BINARY),
      },
    };
    const good = setup({ platform: 'darwin', arch: 'arm64', assets }, bytes);
    expect(await good.resolve()).toEqual({ binary: good.cached, source: 'download' });
    expect(readFileSync(good.cached)).toEqual(BINARY);

    const inner = setup(
      {
        platform: 'darwin',
        arch: 'arm64',
        assets: { 'darwin-arm64': { ...assets['darwin-arm64'], binarySha256: sha256('other') } },
      },
      bytes,
    );
    expect(await inner.resolve()).toMatchObject({ failure: 'cloudflared-hash-mismatch' });
    expect(existsSync(inner.cached)).toBe(false);
    expect(readdirSync(inner.cacheDir)).toEqual([]);
  });
});
