import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertCleanReleaseSource,
  publicationOrder,
  readReleaseSourceState,
  verifyRelease,
} from './npm-prerelease.mjs';

export const originalRun = 40106777067;
export const originalPlanSha256 =
  '6aead2c27b0607e60181672d686496aad0e13b2f76409b19f6b6491329e9c3af';
const root = fileURLToPath(new URL('..', import.meta.url));
const hash = (bytes, algorithm = 'sha256', encoding = 'hex') =>
  createHash(algorithm).update(bytes).digest(encoding);
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');

export function verifyRecoveryBase(directory) {
  const bytes = readFileSync(join(directory, 'release-plan.json'));
  if (hash(bytes) !== originalPlanSha256)
    throw Error('Recovery requires the frozen original 1.5.0 plan');
  const plan = JSON.parse(bytes);
  if (plan.artifactsSha256 !== hash(readFileSync(join(directory, 'artifacts.json'))))
    throw Error('Original inventory changed');
  const inventory = json(join(directory, 'artifacts.json'));
  for (const artifact of [...inventory.artifacts, ...inventory.platformArtifacts]) {
    if (basename(artifact.filename) !== artifact.filename) throw Error('Unsafe original filename');
    if (
      artifact.integrity !==
      'sha512-' + hash(readFileSync(join(directory, artifact.filename)), 'sha512', 'base64')
    )
      throw Error('Original artifact changed: ' + artifact.name);
  }
  return { plan, inventory };
}

export async function verifyPublishedBase(inventory) {
  for (const artifact of [...inventory.artifacts, ...inventory.platformArtifacts]) {
    if (artifact.name === 'tobs' || artifact.name === '@botharness/tobs') continue;
    const response = await fetch(
      'https://registry.npmjs.org/' + encodeURIComponent(artifact.name) + '/' + artifact.version,
      { signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok) throw Error('Previously published package unavailable: ' + artifact.name);
    const metadata = await response.json();
    if (
      metadata.name !== artifact.name ||
      metadata.version !== artifact.version ||
      metadata.dist?.integrity !== artifact.integrity
    )
      throw Error('Published bytes differ: ' + artifact.name);
  }
}

export async function prepareRecovery(directory, output, { clean = true } = {}) {
  const { plan: original, inventory } = verifyRecoveryBase(directory);
  const state = readReleaseSourceState(root);
  if (clean) assertCleanReleaseSource(state);
  await verifyPublishedBase(inventory);
  mkdirSync(output, { recursive: true });
  const rejected = inventory.artifacts.find((artifact) => artifact.name === 'tobs');
  const temporary = mkdtempSync(join(tmpdir(), 'tobs-scoped-recovery-'));
  try {
    const files = execFileSync('tar', ['-tzf', join(directory, rejected.filename)], {
      encoding: 'utf8',
    })
      .trim()
      .split(/\r?\n/);
    if (files.some((file) => !file.startsWith('package/') || file.split('/').includes('..')))
      throw Error('Unsafe rejected archive');
    execFileSync('tar', ['-xzf', join(directory, rejected.filename), '-C', temporary]);
    const stage = join(temporary, 'package');
    const manifest = json(join(stage, 'package.json'));
    if (
      manifest.name !== 'tobs' ||
      manifest.version !== '1.5.0' ||
      manifest.dependencies.deepseekbot !== '1.5.0'
    )
      throw Error('Unexpected rejected package');
    manifest.name = '@botharness/tobs';
    save(join(stage, 'package.json'), manifest);
    copyFileSync(join(root, 'packages/tobs/README.md'), join(stage, 'README.md'));
    execFileSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['pack', '--ignore-scripts', '--pack-destination', output],
      { cwd: stage, shell: process.platform === 'win32', stdio: 'pipe' },
    );
    const filename = 'botharness-tobs-1.5.0.tgz';
    const scoped = {
      name: manifest.name,
      version: manifest.version,
      filename,
      integrity: 'sha512-' + hash(readFileSync(join(output, filename)), 'sha512', 'base64'),
    };
    for (const artifact of [...inventory.artifacts, ...inventory.platformArtifacts]) {
      if (artifact.name !== 'tobs')
        copyFileSync(join(directory, artifact.filename), join(output, artifact.filename));
    }
    save(join(output, 'artifacts.json'), {
      ...inventory,
      artifacts: inventory.artifacts.map((artifact) =>
        artifact.name === 'tobs' ? scoped : artifact,
      ),
    });
    save(join(output, 'release-plan.json'), {
      ...original,
      sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      ...state,
      publicationOrder,
      artifactsSha256: hash(readFileSync(join(output, 'artifacts.json'))),
      recovery: {
        originalRun,
        originalPlanSha256,
        originalSourceSha: original.sourceSha,
        replaced: rejected,
        changedPaths: ['package/package.json (name only)', 'package/README.md'],
        readmeSha256: hash(readFileSync(join(stage, 'README.md'))),
      },
    });
    return verifyRelease(output);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, output] = process.argv.slice(2);
  if (!directory || !output)
    throw Error('Use npm-scoped-tobs-recovery.mjs <original-artifacts> <output>');
  const result = await prepareRecovery(resolve(directory), resolve(output));
  console.log(JSON.stringify({ ...result.plan, planSha256: result.planSha256 }, null, 2));
}
