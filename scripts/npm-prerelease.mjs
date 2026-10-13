import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import { packProduct, productImProvider } from './product-artifacts.mjs';
import {
  verifiedProductArtifacts,
  parseProductComposition,
  verifyProductComposition,
} from './packaged-profile.mjs';
import { providerReleasePlan, verifyProviderArchive } from './npm-provider-release.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
export const publicationOrder = [
  productImProvider.name,
  '@botharness/core',
  '@botharness/ui',
  '@botharness/browser',
  '@botharness/computer',
  'deepseekbot',
];
const registry = 'https://registry.npmjs.org';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function releaseVersion(version) {
  if (semver.valid(version) !== version || semver.lt(version, '0.0.1'))
    throw new Error('Choose an exact public SemVer, for example 1.0.0 or 1.1.0-alpha.1');
  return version;
}

export function distTagFor(version) {
  return semver.prerelease(version) ? 'next' : 'latest';
}

export function readReleaseSourceState(directory) {
  const changes = execFileSync(
    'git',
    [
      '--no-optional-locks',
      '-c',
      'core.quotePath=false',
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
    ],
    { cwd: directory, encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean);
  return {
    sourceDirty: changes.length > 0,
    sourceChangeCount: changes.length,
    sourceChanges: changes.slice(0, 50),
  };
}

export function assertCleanReleaseSource(plan) {
  if (plan.sourceDirty === false) return;
  const changes = plan.sourceChanges?.slice(0, 50) ?? [];
  throw new Error(
    'Release requires a clean source checkout.\n' +
      JSON.stringify(
        {
          code: 'release-source-dirty',
          sourceChangeCount: plan.sourceChangeCount ?? null,
          sourceChanges: changes,
          sourceChangesOmitted: Math.max(
            0,
            (plan.sourceChangeCount ?? changes.length) - changes.length,
          ),
          hint: 'Inspect git status and review the listed paths. Preserve unknown changes; do not reset or clean them automatically. Older plans without paths must be inspected in their original checkout.',
        },
        null,
        2,
      ),
  );
}

function tarText(directory, artifact, path) {
  return execFileSync('tar', ['-xOf', join(directory, artifact.filename), `package/${path}`], {
    encoding: 'utf8',
  });
}

export function checkPackage(manifest, artifact, files, inventory) {
  if (
    manifest.name !== artifact.name ||
    manifest.version !== artifact.version ||
    manifest.private ||
    manifest.license !== 'MIT'
  )
    throw new Error(`Invalid public manifest: ${artifact.name}`);
  for (const [name, spec] of Object.entries({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  })) {
    if (typeof spec !== 'string' || !semver.validRange(spec))
      throw new Error(`Non-registry dependency: ${name}`);
    const internal = inventory.find((a) => a.name === name);
    if (internal && spec !== internal.version)
      throw new Error(`Unpinned product dependency: ${name}`);
  }
  for (const path of [
    manifest.main,
    manifest.dsh?.bundle?.patch,
    manifest.dsh?.client ? './lib/client.js' : undefined,
    'LICENSE',
  ].filter(Boolean)) {
    if (!files.includes(`package/${path.replace(/^\.\//, '')}`))
      throw new Error(`Missing packed entry: ${artifact.name}:${path}`);
  }
  if (
    files.some((path) => /(^|\/)(\.npmrc|\.env(?:\..*)?|.*\.token|\.credentials\.yaml)$/.test(path))
  )
    throw new Error(`Private configuration in package: ${artifact.name}`);
}

export function verifyRelease(directory, expected = {}) {
  const inventory = verifiedProductArtifacts(directory);
  releaseVersion(inventory.productVersion);
  const planBytes = readFileSync(join(directory, 'release-plan.json'));
  const plan = JSON.parse(planBytes);
  if (
    plan.productVersion !== inventory.productVersion ||
    plan.distTag !== distTagFor(inventory.productVersion) ||
    !/^[a-f0-9]{40}$/.test(plan.sourceSha) ||
    plan.providerSource !== productImProvider.upstream.source ||
    plan.dsh !== inventory.dsh ||
    JSON.stringify(plan.publicationOrder) !== JSON.stringify(publicationOrder) ||
    plan.artifactsSha256 !== digest(readFileSync(join(directory, 'artifacts.json'))) ||
    (expected.version && plan.productVersion !== expected.version) ||
    (expected.sourceSha && plan.sourceSha !== expected.sourceSha) ||
    (expected.planSha256 && digest(planBytes) !== expected.planSha256)
  )
    throw new Error('Reviewed release plan does not match these artifacts');
  if (expected.clean) assertCleanReleaseSource(plan);
  const packages = publicationOrder.map((name) => {
    const artifact = inventory.artifacts.find((a) => a.name === name);
    const files = execFileSync('tar', ['-tzf', join(directory, artifact.filename)], {
      encoding: 'utf8',
    })
      .trim()
      .split(/\r?\n/);
    if (files.some((path) => !path.startsWith('package/') || path.split('/').includes('..')))
      throw new Error('Unsafe tarball path');
    const manifest = JSON.parse(tarText(directory, artifact, 'package.json'));
    checkPackage(manifest, artifact, files, inventory.artifacts);
    return { artifact, manifest };
  });
  const product = packages.find((p) => p.artifact.name === 'deepseekbot');
  for (const name of publicationOrder.slice(0, -1)) {
    if (
      product.manifest.dependencies?.[name] !==
      inventory.artifacts.find((a) => a.name === name).version
    )
      throw new Error(`Missing exact product dependency: ${name}`);
  }
  const patch = parseProductComposition(
    tarText(directory, product.artifact, 'cordis.im.patch.yml'),
  );
  if (
    !Array.isArray(patch) ||
    patch.some((row) => Object.keys(row).length !== 1 || !Array.isArray(row.insert))
  )
    throw new Error('Unexpected product Patch operation');
  verifyProductComposition(patch.flatMap((row) => row.insert));
  const provider = packages[0];
  const provenance = JSON.parse(tarText(directory, provider.artifact, 'PROVENANCE.json'));
  if (
    provenance.source !== plan.providerSource ||
    JSON.stringify(provenance.compiledOutput) !== JSON.stringify(inventory.providerRuntime)
  )
    throw new Error('Provider provenance differs from release inventory');
  return { plan, packages, planSha256: digest(planBytes) };
}

const registryMetadata = new Map();
async function registryPackage(name, version) {
  if (!registryMetadata.has(name)) {
    const response = await fetch(`${registry}/${encodeURIComponent(name)}`);
    if (response.status === 404) registryMetadata.set(name, undefined);
    else {
      if (!response.ok) throw new Error(`Registry read failed (${response.status}): ${name}`);
      registryMetadata.set(name, await response.json());
    }
  }
  const metadata = registryMetadata.get(name);
  if (!metadata) return undefined;
  const selected = semver.valid(version)
    ? version
    : semver.maxSatisfying(Object.keys(metadata.versions ?? {}), version);
  return metadata.versions?.[selected];
}

export function existingArtifact(artifact, remote) {
  if (!remote) return false;
  if (
    remote.name !== artifact.name ||
    remote.version !== artifact.version ||
    remote.dist?.integrity !== artifact.integrity
  )
    throw new Error(
      `Registry version already has different bytes: ${artifact.name}@${artifact.version}`,
    );
  return true;
}

async function registryVersion(name, version) {
  const response = await fetch(
    `${registry}/${encodeURIComponent(name)}/${encodeURIComponent(version)}?readback=${Date.now()}`,
    { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(10_000) },
  );
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Registry read failed (${response.status}): ${name}`);
  return response.json();
}

export async function reusePublishedProvider(
  directory,
  {
    read = registryVersion,
    download = async (url) => {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'registry.npmjs.org')
        throw new Error('Unexpected Provider archive origin');
      const response = await fetch(parsed, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Provider archive download failed: ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },
    plan = providerReleasePlan,
  } = {},
) {
  const inventory = verifiedProductArtifacts(directory);
  const artifact = inventory.artifacts.find((value) => value.name === productImProvider.name);
  const remote = await read(artifact.name, artifact.version);
  if (!remote) return false;
  if (
    plan.name !== artifact.name ||
    plan.version !== artifact.version ||
    plan.providerSource !== productImProvider.upstream.source ||
    plan.runtimeFiles !== inventory.providerRuntime.runtimeFiles ||
    plan.runtimeSha256 !== inventory.providerRuntime.runtimeSha256
  )
    throw new Error('Published Provider differs from the locally qualified runtime');
  existingArtifact({ ...artifact, integrity: plan.integrity }, remote);
  const bytes = await download(remote.dist.tarball);
  if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== plan.integrity)
    throw new Error('Downloaded Provider differs from the qualified archive');
  const temporary = join(directory, `${artifact.filename}.registry-readback`);
  try {
    writeFileSync(temporary, bytes);
    const entry = (path) =>
      JSON.parse(execFileSync('tar', ['-xOf', temporary, `package/${path}`], { encoding: 'utf8' }));
    verifyProviderArchive(
      { bytes, manifest: entry('package.json'), provenance: entry('PROVENANCE.json') },
      plan,
    );
    writeFileSync(join(directory, artifact.filename), bytes);
    artifact.integrity = plan.integrity;
    const { directory: _directory, ...manifest } = inventory;
    writeFileSync(join(directory, 'artifacts.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    rmSync(temporary, { force: true });
  }
  return true;
}

export async function awaitPublished(
  artifact,
  {
    read = registryVersion,
    attempts = 240,
    delayMs = 10_000,
    sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  } = {},
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (existingArtifact(artifact, await read(artifact.name, artifact.version))) return attempt;
    if (attempt < attempts) {
      if (attempt % 6 === 1)
        console.log(
          `Waiting for the registry to show ${artifact.name}@${artifact.version} (${attempt}/${attempts})`,
        );
      await sleep(delayMs);
    }
  }
  return 0;
}

export function publicationWaves(packages) {
  const product = publicationOrder.at(-1);
  return [
    packages.filter(({ artifact }) => artifact.name !== product),
    packages.filter(({ artifact }) => artifact.name === product),
  ].filter((wave) => wave.length);
}

export async function publishInWaves(waves, publish) {
  for (const wave of waves) {
    const results = await Promise.allSettled(wave.map((entry) => publish(entry)));
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
  }
}

async function registryPreflight(packages) {
  const internal = new Set(publicationOrder);
  const checked = new Set();
  const existing = new Set();
  for (const { artifact, manifest } of packages) {
    if (existingArtifact(artifact, await registryPackage(artifact.name, artifact.version)))
      existing.add(artifact.name);
    for (const [name, spec] of Object.entries({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    })) {
      const key = `${name}@${spec}`;
      if (internal.has(name) || checked.has(key)) continue;
      if (!(await registryPackage(name, spec)))
        throw new Error(`Unavailable registry dependency: ${key}`);
      checked.add(key);
    }
  }
  return existing;
}

async function main() {
  const mode = process.argv[2];
  const args = new Map();
  for (let i = 3; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
  const directory = resolve(args.get('--output') ?? args.get('--artifacts') ?? '');
  if (
    !['prepare', 'verify', 'publish'].includes(mode) ||
    (!args.get('--output') && !args.get('--artifacts'))
  )
    throw new Error('Use prepare --output, verify/publish --artifacts');
  if (mode === 'prepare') {
    const version = releaseVersion(args.get('--version'));
    if (!args.get('--provider-source')) throw new Error('Qualified --provider-source is required');
    packProduct({
      repoRoot: root,
      outputDirectory: directory,
      providerSource: resolve(args.get('--provider-source')),
      version,
    });
    await reusePublishedProvider(directory);
    const sourceState = readReleaseSourceState(root);
    if (sourceState.sourceDirty)
      console.warn(JSON.stringify({ code: 'release-source-dirty', ...sourceState }));
    writeFileSync(
      join(directory, 'release-plan.json'),
      `${JSON.stringify(
        {
          productVersion: version,
          distTag: distTagFor(version),
          sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: root,
            encoding: 'utf8',
          }).trim(),
          ...sourceState,
          providerSource: productImProvider.upstream.source,
          dsh: productImProvider.upstream.dsh,
          publicationOrder,
          artifactsSha256: digest(readFileSync(join(directory, 'artifacts.json'))),
        },
        null,
        2,
      )}\n`,
    );
  }
  const release = verifyRelease(directory, {
    version: args.get('--version'),
    sourceSha: args.get('--source-sha'),
    planSha256: args.get('--plan-sha256'),
    clean: mode === 'publish',
  });
  if (
    mode === 'publish' &&
    (!args.get('--version') ||
      !args.get('--source-sha') ||
      !args.get('--plan-sha256') ||
      args.get('--confirm') !== `publish ${release.plan.productVersion} to ${release.plan.distTag}`)
  )
    throw new Error(
      'Publishing requires the reviewed version, source SHA, plan SHA-256 and exact confirmation',
    );
  const existing = await registryPreflight(release.packages);
  const emptyUserConfig = join(directory, '.npm-release-empty');
  writeFileSync(emptyUserConfig, '');
  const npmConfig = [
    '--registry',
    registry,
    '--userconfig',
    emptyUserConfig,
    '--globalconfig',
    process.platform === 'win32' ? 'NUL' : '/dev/null',
  ];
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (/^npm_config_.*(auth|token|password)/i.test(key)) delete env[key];
  delete env.NPM_TOKEN;
  delete env.NODE_AUTH_TOKEN;
  const token = process.env.NPM_TOKEN;
  if (mode === 'publish') {
    if (token) env['npm_config_//registry.npmjs.org/:_authToken'] = token;
    else if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL)
      throw new Error('Publication needs npm trusted publishing (GitHub OIDC) or NPM_TOKEN');
  }
  const npm = (args) =>
    new Promise((done, fail) => {
      const child = spawn('npm', [...args, ...npmConfig], {
        cwd: directory,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let output = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        output += chunk;
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
      });
      child.on('error', fail);
      child.on('close', (status) => {
        output = output.trim();
        if (output) console.log(output.split('\n').slice(-40).join('\n'));
        if (status !== 0)
          fail(Object.assign(new Error(`npm ${args[0]} failed`), { status: status ?? 1 }));
        else done(stdout);
      });
    });
  const started = Date.now();
  const elapsed = () => `${Math.round((Date.now() - started) / 1000)}s`;
  await publishInWaves(publicationWaves(release.packages), async ({ artifact }) => {
    if (existing.has(artifact.name)) {
      console.log(`Verified already published bytes: ${artifact.name}@${artifact.version}`);
      return;
    }
    const publishArgs = [
      'publish',
      join(directory, artifact.filename),
      '--access',
      'public',
      '--tag',
      release.plan.distTag,
      '--ignore-scripts',
    ];
    if (mode !== 'publish') publishArgs.push('--dry-run');
    await npm(publishArgs);
    console.log(`npm ${mode} returned at ${elapsed()}: ${artifact.name}@${artifact.version}`);
    registryMetadata.delete(artifact.name);
    if (mode === 'publish' && !(await awaitPublished(artifact)))
      throw new Error(
        `Registry has not confirmed ${artifact.name}; stop and inspect before retrying`,
      );
    console.log(
      `${mode === 'publish' ? 'Published and read back' : 'Dry run passed'} at ${elapsed()}: ${artifact.name}@${artifact.version}`,
    );
  });
  if (mode === 'publish' && release.plan.distTag === 'latest') {
    for (const { artifact } of release.packages) {
      if (artifact.version !== release.plan.productVersion) continue;
      if (!token) {
        console.log(
          `next not moved without NPM_TOKEN; run: npm dist-tag add ${artifact.name}@${artifact.version} next`,
        );
        continue;
      }
      await npm(['dist-tag', 'add', `${artifact.name}@${artifact.version}`, 'next']);
      console.log(`Moved next to ${artifact.name}@${artifact.version}`);
    }
  }
  console.log(JSON.stringify({ ...release.plan, planSha256: release.planSha256 }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      error?.status !== undefined
        ? 'npm/tar subprocess failed; inspect registry state and permissions before retrying'
        : error.message,
    );
    process.exitCode = 1;
  });
}
