import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export const cloudflaredPin = Object.freeze(
  JSON.parse(
    readFileSync(new URL('../packages/core/src/devices/cloudflared.json', import.meta.url), 'utf8'),
  ),
);

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const cloudflaredPackages = Object.freeze(
  Object.entries(cloudflaredPin.assets).map(([platform, asset]) => {
    const [os, cpu] = platform.split('-');
    return Object.freeze({
      platform,
      name: `@botharness/cloudflared-${platform}`,
      os,
      cpu,
      executable: os === 'win32' ? 'cloudflared.exe' : 'cloudflared',
      asset,
      url: `https://github.com/cloudflare/cloudflared/releases/download/${cloudflaredPin.version}/${asset.name}`,
    });
  }),
);

export const cloudflaredPackageNames = Object.freeze(cloudflaredPackages.map((p) => p.name));

export function cloudflaredOptionalDependencies(version) {
  return Object.fromEntries(cloudflaredPackageNames.map((name) => [name, version]));
}

export async function fetchCloudflaredAssets({
  directory,
  fetchImpl = fetch,
  log = console.log,
  packages = cloudflaredPackages,
}) {
  mkdirSync(directory, { recursive: true });
  for (const entry of packages) {
    const target = join(directory, entry.asset.name);
    if (existsSync(target) && digest(readFileSync(target)) === entry.asset.sha256) continue;
    rmSync(target, { force: true });
    const response = await fetchImpl(entry.url, { signal: AbortSignal.timeout(300_000) });
    if (!response.ok)
      throw new Error(`cloudflared download failed (${response.status}): ${entry.asset.name}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== entry.asset.sha256)
      throw new Error(`cloudflared asset differs from the pin: ${entry.asset.name}`);
    const partial = `${target}.partial`;
    writeFileSync(partial, bytes);
    renameSync(partial, target);
    log(`Verified cloudflared ${cloudflaredPin.version} asset: ${entry.asset.name}`);
  }
  return directory;
}

function extractedBinary(entry, archive) {
  if (!entry.asset.name.endsWith('.tgz')) return readFileSync(archive);
  const temporary = mkdtempSync(join(dirname(archive), '.extract-'));
  try {
    execFileSync('tar', ['-xzf', archive, '-C', temporary, entry.executable]);
    return readFileSync(join(temporary, entry.executable));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function cloudflaredManifest(source, entry, version) {
  const { private: _private, ...manifest } = source;
  if (
    manifest.name !== entry.name ||
    JSON.stringify(manifest.os) !== JSON.stringify([entry.os]) ||
    JSON.stringify(manifest.cpu) !== JSON.stringify([entry.cpu])
  )
    throw new Error(`cloudflared package scaffold differs from the pin: ${entry.name}`);
  return {
    ...manifest,
    version,
    description: `cloudflared ${cloudflaredPin.version} for DeepSeekBot Connect (${entry.platform})`,
    license: 'Apache-2.0',
    repository: {
      type: 'git',
      url: 'git+https://github.com/BotHarness/BotHarness.git',
      directory: `packages/cloudflared/${entry.platform}`,
    },
    botharness: {
      cloudflared: cloudflaredPin.version,
      sha256: entry.asset.binarySha256 ?? entry.asset.sha256,
    },
    publishConfig: { access: 'public' },
  };
}

export function stageCloudflaredPackages({
  repoRoot = root,
  assetsDirectory,
  staging,
  version,
  packages = cloudflaredPackages,
}) {
  const directories = [];
  for (const entry of packages) {
    const archive = join(assetsDirectory, entry.asset.name);
    if (!existsSync(archive)) throw new Error(`Missing cloudflared asset: ${entry.asset.name}`);
    if (digest(readFileSync(archive)) !== entry.asset.sha256)
      throw new Error(`cloudflared asset differs from the pin: ${entry.asset.name}`);
    const binary = extractedBinary(entry, archive);
    if (digest(binary) !== (entry.asset.binarySha256 ?? entry.asset.sha256))
      throw new Error(`cloudflared binary differs from the pin: ${entry.name}`);
    const source = join(repoRoot, 'packages/cloudflared', entry.platform);
    const target = join(staging, `cloudflared-${entry.platform}`);
    mkdirSync(join(target, 'bin'), { recursive: true });
    const scaffold = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
    writeFileSync(
      join(target, 'package.json'),
      `${JSON.stringify(cloudflaredManifest(scaffold, entry, version), null, 2)}\n`,
    );
    cpSync(join(repoRoot, 'packages/cloudflared/README.md'), join(target, 'README.md'));
    cpSync(join(repoRoot, 'packages/cloudflared/LICENSE'), join(target, 'LICENSE'));
    const bin = join(target, 'bin', entry.executable);
    writeFileSync(bin, binary);
    chmodSync(bin, 0o755);
    directories.push(target);
  }
  return directories;
}

export function listCloudflaredPackages() {
  return {
    cloudflared: cloudflaredPin.version,
    packages: cloudflaredPackages.map((entry) => ({
      name: entry.name,
      os: entry.os,
      cpu: entry.cpu,
      bin: `bin/${entry.executable}`,
      asset: entry.asset.name,
      url: entry.url,
      sha256: entry.asset.sha256,
      ...(entry.asset.binarySha256 ? { binarySha256: entry.asset.binarySha256 } : {}),
    })),
  };
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const args = new Map();
  for (let i = 0; i < rest.length; i += 2) args.set(rest[i], rest[i + 1]);
  if (mode === 'list') {
    console.log(JSON.stringify(listCloudflaredPackages(), null, 2));
    return;
  }
  if (mode === 'fetch' && args.get('--assets')) {
    await fetchCloudflaredAssets({ directory: resolve(args.get('--assets')) });
    return;
  }
  throw new Error('Use cloudflared-packages.mjs list | fetch --assets <dir>');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
