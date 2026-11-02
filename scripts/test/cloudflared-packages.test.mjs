import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cloudflaredOptionalDependencies,
  cloudflaredPackageNames,
  cloudflaredPackages,
  cloudflaredPin,
  fetchCloudflaredAssets,
  listCloudflaredPackages,
  stageCloudflaredPackages,
} from '../cloudflared-packages.mjs';
import { productManifest } from '../product-artifacts.mjs';
import { checkPackage, publicationOrder, publicationWaves } from '../npm-prerelease.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true })));
const temporary = () => {
  const root = mkdtempSync(join(tmpdir(), 'cloudflared-packages-test-'));
  roots.push(root);
  return root;
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const scaffold = (platform) =>
  JSON.parse(
    readFileSync(
      new URL(`../../packages/cloudflared/${platform}/package.json`, import.meta.url),
      'utf8',
    ),
  );

function fixtureEntries(root) {
  const binary = Buffer.from('fixture cloudflared');
  const source = join(root, 'source');
  mkdirSync(source);
  writeFileSync(join(source, 'cloudflared'), binary);
  execFileSync('tar', ['-czf', join(source, 'mac.tgz'), '-C', source, 'cloudflared']);
  const archive = readFileSync(join(source, 'mac.tgz'));
  const entries = cloudflaredPackages
    .filter((entry) => ['darwin-arm64', 'linux-x64'].includes(entry.platform))
    .map((entry) => ({
      ...entry,
      asset:
        entry.platform === 'darwin-arm64'
          ? { name: entry.asset.name, sha256: sha256(archive), binarySha256: sha256(binary) }
          : { name: entry.asset.name, sha256: sha256(binary) },
      url: `https://releases.test/${entry.asset.name}`,
    }));
  const bodies = new Map([
    ['https://releases.test/cloudflared-darwin-arm64.tgz', archive],
    ['https://releases.test/cloudflared-linux-amd64', binary],
  ]);
  return { entries, bodies, binary };
}

describe('cloudflared platform packages', () => {
  it('scaffolds one optional package per pinned platform in the esbuild pattern', () => {
    expect(cloudflaredPackageNames).toEqual([
      '@botharness/cloudflared-darwin-arm64',
      '@botharness/cloudflared-darwin-x64',
      '@botharness/cloudflared-linux-arm64',
      '@botharness/cloudflared-linux-x64',
      '@botharness/cloudflared-win32-x64',
    ]);
    for (const entry of cloudflaredPackages) {
      const manifest = scaffold(entry.platform);
      expect(manifest).toMatchObject({
        name: entry.name,
        private: true,
        license: 'Apache-2.0',
        os: [entry.os],
        cpu: [entry.cpu],
      });
      expect(manifest.files).toContain(`bin/${entry.executable}`);
      expect(
        existsSync(new URL(`../../packages/cloudflared/${entry.platform}/bin`, import.meta.url)),
      ).toBe(false);
    }
    expect(cloudflaredPackages.find((entry) => entry.os === 'win32')?.executable).toBe(
      'cloudflared.exe',
    );
  });

  it('lists the packages, assets and hashes without downloading', () => {
    const listed = listCloudflaredPackages();
    expect(listed.cloudflared).toBe(cloudflaredPin.version);
    expect(listed.packages.map((entry) => entry.name)).toEqual(cloudflaredPackageNames);
    for (const entry of listed.packages) {
      expect(entry.url).toBe(
        `https://github.com/cloudflare/cloudflared/releases/download/${cloudflaredPin.version}/${entry.asset}`,
      );
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('wires every platform package into the published product as an exact optional dependency', () => {
    const release = productManifest({}, '1.2.3');
    expect(release.optionalDependencies).toEqual(cloudflaredOptionalDependencies('1.2.3'));
    expect(Object.keys(release.dependencies)).not.toContain(cloudflaredPackageNames[0]);
    const deepseekbot = publicationOrder.indexOf('deepseekbot');
    for (const name of cloudflaredPackageNames)
      expect(publicationOrder.indexOf(name)).toBeLessThan(deepseekbot);
    const waves = publicationWaves(publicationOrder.map((name) => ({ artifact: { name } })));
    expect(waves[0].map(({ artifact }) => artifact.name)).toEqual(
      expect.arrayContaining(cloudflaredPackageNames),
    );
  });

  it('fetches, verifies and stages each binary with its product version', async () => {
    const root = temporary();
    const { entries, bodies, binary } = fixtureEntries(root);
    const requested = [];
    const assets = join(root, 'assets');
    const fetchImpl = async (url) => {
      requested.push(url);
      return new Response(new Uint8Array(bodies.get(url)));
    };
    await fetchCloudflaredAssets({
      directory: assets,
      fetchImpl,
      packages: entries,
      log: () => {},
    });
    await fetchCloudflaredAssets({
      directory: assets,
      fetchImpl,
      packages: entries,
      log: () => {},
    });
    expect(requested).toHaveLength(2);

    const staging = join(root, 'staging');
    const directories = stageCloudflaredPackages({
      assetsDirectory: assets,
      staging,
      version: '1.2.3',
      packages: entries,
    });
    expect(directories.map((directory) => readdirSync(directory).sort())).toEqual([
      ['LICENSE', 'README.md', 'bin', 'package.json'],
      ['LICENSE', 'README.md', 'bin', 'package.json'],
    ]);
    for (const [index, directory] of directories.entries()) {
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
      expect(manifest).toMatchObject({
        name: entries[index].name,
        version: '1.2.3',
        license: 'Apache-2.0',
        os: [entries[index].os],
        cpu: [entries[index].cpu],
        botharness: { cloudflared: cloudflaredPin.version, sha256: sha256(binary) },
      });
      expect(manifest.private).toBeUndefined();
      const bin = join(directory, 'bin', 'cloudflared');
      expect(readFileSync(bin)).toEqual(binary);
      if (process.platform !== 'win32') expect(statSync(bin).mode & 0o111).not.toBe(0);
      expect(readFileSync(join(directory, 'LICENSE'), 'utf8')).toContain('Apache License');
    }
  });

  it('refuses an asset or extracted binary that differs from the pin', async () => {
    const root = temporary();
    const { entries } = fixtureEntries(root);
    await expect(
      fetchCloudflaredAssets({
        directory: join(root, 'assets'),
        fetchImpl: async () => new Response('tampered'),
        packages: entries,
        log: () => {},
      }),
    ).rejects.toThrow('differs from the pin');
    expect(readdirSync(join(root, 'assets'))).toEqual([]);

    const assets = join(root, 'tampered');
    mkdirSync(assets);
    writeFileSync(join(assets, entries[1].asset.name), 'tampered');
    expect(() =>
      stageCloudflaredPackages({
        assetsDirectory: assets,
        staging: join(root, 'staging'),
        version: '1.2.3',
        packages: [entries[1]],
      }),
    ).toThrow('differs from the pin');
  });

  it('refuses a platform package without its binary or with the wrong license', () => {
    const entry = cloudflaredPackages[0];
    const artifact = { name: entry.name, version: '1.2.3' };
    const manifest = {
      name: entry.name,
      version: '1.2.3',
      license: 'Apache-2.0',
      os: [entry.os],
      cpu: [entry.cpu],
    };
    const files = ['package/package.json', 'package/LICENSE', `package/bin/${entry.executable}`];
    expect(() => checkPackage(manifest, artifact, files, [])).not.toThrow();
    expect(() => checkPackage(manifest, artifact, files.slice(0, 2), [])).toThrow(
      'Invalid platform package',
    );
    expect(() => checkPackage({ ...manifest, license: 'MIT' }, artifact, files, [])).toThrow(
      'Invalid public manifest',
    );
  });
});
