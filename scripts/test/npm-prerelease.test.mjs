import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  awaitPublished,
  assertCleanReleaseSource,
  readReleaseSourceState,
  checkPackage,
  existingArtifact,
  distTagFor,
  publicationOrder,
  publicationWaves,
  publishInWaves,
  releaseVersion,
  verifyRelease,
  verifyPackedCli,
  reusePublishedProvider,
} from '../npm-prerelease.mjs';
import { providerReleasePlan } from '../npm-provider-release.mjs';
import { productDsh, productImProvider } from '../product-artifacts.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true })));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(productVersion = '0.1.0-alpha.1') {
  const root = mkdtempSync(join(tmpdir(), 'npm-prerelease-test-'));
  roots.push(root);
  const runtime = { runtimeFiles: 1, runtimeSha256: 'a'.repeat(64) };
  const artifacts = publicationOrder.map((name, index) => {
    const dir = join(root, String(index));
    mkdirSync(join(dir, 'package'), { recursive: true });
    const version = name === productImProvider.name ? productImProvider.version : productVersion;
    const manifest = { name, version, license: 'MIT', main: './index.js' };
    if (name === '@botharness/core') {
      manifest.exports = { './cli': './cli/index.mjs' };
      mkdirSync(join(dir, 'package/cli'));
      writeFileSync(
        join(dir, 'package/cli/index.mjs'),
        'export const runBotCreateCli = () => { if (process.env.PATH !== "" || process.env.DEEPSEEKBOT_HOST_TOKEN || process.env.DEEPSEEKBOT_AGENT_TOKEN || process.env.NODE_PATH) throw new Error("ambient dependency"); console.log("deepseekbot packed help"); };',
      );
    }
    if (name === 'deepseekbot') {
      manifest.bin = { deepseekbot: './dist/deepseekbot.mjs' };
      mkdirSync(join(dir, 'package/dist'));
      writeFileSync(
        join(dir, 'package/dist/deepseekbot.mjs'),
        'import { runBotCreateCli } from "@botharness/core/cli"; runBotCreateCli();',
      );
      manifest.dependencies = Object.fromEntries(
        publicationOrder
          .slice(0, -1)
          .map((n) => [n, n === productImProvider.name ? productImProvider.version : version]),
      );
      manifest.dsh = { bundle: { patch: './cordis.im.patch.yml' } };
      writeFileSync(
        join(dir, 'package/cordis.im.patch.yml'),
        "- insert:\n    - id: xmanrui-dsh-im\n      name: '@botharness/im-provider'\n    - id: botharness-core\n      name: '@botharness/core'\n    - id: botharness-client\n      name: '@botharness/ui'\n    - id: botharness-browser\n      name: '@botharness/browser'\n    - id: botharness-computer\n      name: '@botharness/computer'\n",
      );
    }
    if (name === productImProvider.name) {
      manifest.botharness = { managedByProduct: true };
      writeFileSync(
        join(dir, 'package/PROVENANCE.json'),
        JSON.stringify({ source: productImProvider.upstream.source, compiledOutput: runtime }),
      );
    }
    writeFileSync(join(dir, 'package/package.json'), JSON.stringify(manifest));
    writeFileSync(join(dir, 'package/index.js'), 'export const apply = () => {};');
    writeFileSync(join(dir, 'package/LICENSE'), 'MIT');
    const filename = `${index}.tgz`;
    execFileSync('tar', ['-czf', join(root, filename), '-C', dir, 'package']);
    return {
      name,
      version,
      filename,
      integrity: `sha512-${createHash('sha512')
        .update(readFileSync(join(root, filename)))
        .digest('base64')}`,
    };
  });
  writeFileSync(
    join(root, 'artifacts.json'),
    JSON.stringify({
      productVersion,
      dsh: productDsh,
      providerRuntime: runtime,
      artifacts,
    }),
  );
  const plan = {
    productVersion,
    sourceSha: 'b'.repeat(40),
    sourceDirty: false,
    providerSource: productImProvider.upstream.source,
    dsh: productDsh,
    distTag: distTagFor(productVersion),
    publicationOrder,
    artifactsSha256: sha256(readFileSync(join(root, 'artifacts.json'))),
  };
  writeFileSync(join(root, 'release-plan.json'), JSON.stringify(plan));
  return { root, plan };
}

describe('reviewed npm prerelease', () => {
  function providerReadbackFixture() {
    const { root } = fixture();
    const inventory = JSON.parse(readFileSync(join(root, 'artifacts.json')));
    const artifact = inventory.artifacts.find((value) => value.name === productImProvider.name);
    const bytes = readFileSync(join(root, artifact.filename));
    const plan = {
      ...providerReleasePlan,
      version: artifact.version,
      providerSource: productImProvider.upstream.source,
      integrity: artifact.integrity,
      runtimeFiles: inventory.providerRuntime.runtimeFiles,
      runtimeSha256: inventory.providerRuntime.runtimeSha256,
    };
    const remote = {
      name: artifact.name,
      version: artifact.version,
      dist: { integrity: plan.integrity, tarball: 'https://registry.npmjs.org/qualified.tgz' },
    };
    const rebuilt = Buffer.concat([bytes, Buffer.from([0])]);
    writeFileSync(join(root, artifact.filename), rebuilt);
    artifact.integrity = `sha512-${createHash('sha512').update(rebuilt).digest('base64')}`;
    writeFileSync(join(root, 'artifacts.json'), JSON.stringify(inventory));
    return { root, artifact, bytes, plan, remote, rebuilt };
  }

  it('reuses the exact published Provider instead of a byte-different rebuild with the same runtime', async () => {
    const { root, artifact, bytes, plan, remote } = providerReadbackFixture();
    const read = vi.fn(async () => remote);
    const download = vi.fn(async () => bytes);
    expect(() => existingArtifact(artifact, remote)).toThrow('different bytes');
    await expect(reusePublishedProvider(root, { read, download, plan })).resolves.toBe(true);
    expect(read).toHaveBeenCalledWith(productImProvider.name, productImProvider.version);
    expect(readFileSync(join(root, artifact.filename))).toEqual(bytes);
    expect(
      JSON.parse(readFileSync(join(root, 'artifacts.json'))).artifacts.find(
        (value) => value.name === artifact.name,
      ).integrity,
    ).toBe(plan.integrity);
    expect(existingArtifact({ ...artifact, integrity: plan.integrity }, remote)).toBe(true);
  });

  it.each(['registry', 'archive', 'runtime'])(
    'refuses a conflicting published Provider %s without replacing the local archive',
    async (conflict) => {
      const { root, artifact, bytes, plan, remote, rebuilt } = providerReadbackFixture();
      if (conflict === 'registry') remote.dist.integrity = 'different';
      if (conflict === 'runtime') plan.runtimeSha256 = 'b'.repeat(64);
      await expect(
        reusePublishedProvider(root, {
          plan,
          read: async () => remote,
          download: async () => (conflict === 'archive' ? rebuilt : bytes),
        }),
      ).rejects.toThrow(/differs|different bytes/);
      expect(readFileSync(join(root, artifact.filename))).toEqual(rebuilt);
    },
  );

  it('keeps first-publication preparation when the pinned Provider is absent from registry', async () => {
    const { root, artifact, rebuilt } = providerReadbackFixture();
    const download = vi.fn();
    await expect(
      reusePublishedProvider(root, { read: async () => undefined, download }),
    ).resolves.toBe(false);
    expect(download).not.toHaveBeenCalled();
    expect(readFileSync(join(root, artifact.filename))).toEqual(rebuilt);
  });
  it.each(['0.0.0', '0.0.0-test.824', 'v0.1.0-alpha.1', 'latest', ''])(
    'refuses unintended public version %s',
    (v) => expect(() => releaseVersion(v)).toThrow(),
  );
  it.each([
    ['1.0.0', 'latest'],
    ['1.2.3', 'latest'],
    ['0.1.0-alpha.1', 'next'],
    ['1.1.0-rc.1', 'next'],
  ])('publishes %s to the %s dist-tag', (version, tag) => {
    expect(releaseVersion(version)).toBe(version);
    expect(distTagFor(version)).toBe(tag);
  });
  it('verifies a stable release planned for latest', () => {
    const { root } = fixture('1.0.0');
    const result = verifyRelease(root, { version: '1.0.0', clean: true });
    expect(result.plan.distTag).toBe('latest');
    expect(result.packages.at(-1).manifest.dependencies['@botharness/core']).toBe('1.0.0');
  });
  it('refuses a stable release planned for next', () => {
    const { root, plan } = fixture('1.0.0');
    writeFileSync(join(root, 'release-plan.json'), JSON.stringify({ ...plan, distTag: 'next' }));
    expect(() => verifyRelease(root)).toThrow('Reviewed release plan');
  });
  it('verifies real tarballs and dependency order with source/plan agreement', () => {
    const { root } = fixture();
    const result = verifyRelease(root, {
      version: '0.1.0-alpha.1',
      sourceSha: 'b'.repeat(40),
      clean: true,
      planSha256: sha256(readFileSync(join(root, 'release-plan.json'))),
    });
    expect(result.packages.map((p) => p.artifact.name)).toEqual(publicationOrder);
    expect(result.packages.at(-1).manifest.dependencies['@botharness/core']).toBe('0.1.0-alpha.1');
  });
  it.each([
    { sourceSha: 'c'.repeat(40) },
    { version: '0.2.0-alpha.1' },
    { planSha256: '0'.repeat(64) },
  ])('refuses mismatched review evidence %j', (expected) => {
    const { root } = fixture();
    expect(() => verifyRelease(root, expected)).toThrow('Reviewed release plan');
  });
  it.each(['sourceDirty', 'distTag', 'publicationOrder', 'providerSource'])(
    'refuses altered plan %s',
    (key) => {
      const { root, plan } = fixture();
      plan[key] = key === 'sourceDirty' ? true : 'wrong';
      writeFileSync(join(root, 'release-plan.json'), JSON.stringify(plan));
      expect(() => verifyRelease(root, { clean: true })).toThrow(
        key === 'sourceDirty'
          ? 'Release requires a clean source checkout'
          : 'Reviewed release plan',
      );
    },
  );
  it('does not accept a changed tarball even when its filename remains the same', () => {
    const { root } = fixture();
    writeFileSync(join(root, '0.tgz'), 'changed');
    expect(() => verifyRelease(root)).toThrow('Product artifact changed');
  });
  it('rejects local dependencies and absent executable files', () => {
    const artifact = { name: '@botharness/core', version: '0.1.0-alpha.1' };
    const manifest = {
      ...artifact,
      license: 'MIT',
      main: './dist/index.mjs',
      exports: { './cli': './cli/index.mjs' },
      dependencies: { other: 'link:../other' },
    };
    expect(() => checkPackage(manifest, artifact, ['package/LICENSE'], [artifact])).toThrow(
      'Non-registry dependency',
    );
    delete manifest.dependencies;
    expect(() => checkPackage(manifest, artifact, ['package/LICENSE'], [artifact])).toThrow(
      'Missing packed entry',
    );
  });
  it('rejects a core archive without the CLI used by Tob even if its Host entry remains', () => {
    const artifact = { name: '@botharness/core', version: '0.1.0-alpha.1' };
    const manifest = {
      ...artifact,
      license: 'MIT',
      main: './dist/index.mjs',
      exports: { './cli': './cli/index.mjs' },
    };
    const hostOnly = ['package/LICENSE', 'package/dist/index.mjs'];
    expect(() => checkPackage(manifest, artifact, hostOnly, [artifact])).toThrow(
      'Missing packed entry: @botharness/core:./cli/index.mjs',
    );
    const complete = [...hostOnly, 'package/cli/index.mjs'];
    expect(() => checkPackage(manifest, artifact, complete, [artifact])).not.toThrow();
    delete manifest.exports['./cli'];
    expect(() => checkPackage(manifest, artifact, complete, [artifact])).toThrow(
      'must export its bundled CLI',
    );
  });
  it('rejects an umbrella archive without its CLI executable rather than relying on a global install', () => {
    const artifact = { name: 'deepseekbot', version: '0.1.0-alpha.1' };
    const manifest = {
      ...artifact,
      license: 'MIT',
      bin: { deepseekbot: './dist/deepseekbot.mjs' },
    };
    expect(() => checkPackage(manifest, artifact, ['package/LICENSE'], [artifact])).toThrow(
      'Missing packed entry: deepseekbot:./dist/deepseekbot.mjs',
    );
    const files = ['package/LICENSE', 'package/dist/deepseekbot.mjs'];
    expect(() => checkPackage(manifest, artifact, files, [artifact])).not.toThrow();
    delete manifest.bin.deepseekbot;
    expect(() => checkPackage(manifest, artifact, files, [artifact])).toThrow(
      'must provide its bundled deepseekbot executable',
    );
  });
  it('executes the archived product CLI without a source checkout or global CLI in its environment', () => {
    const { root } = fixture();
    const { packages } = verifyRelease(root);
    expect(verifyPackedCli(root, packages, '/unused-no-dependencies')).toEqual({
      executable: 'deepseekbot',
      packedCoreExport: './cli/index.mjs',
      isolatedHelp: true,
    });
  });
  it('rejects an archived CLI whose imports depend on unpublished source files', () => {
    const { root } = fixture();
    const { packages } = verifyRelease(root);
    const productIndex = publicationOrder.indexOf('deepseekbot');
    writeFileSync(
      join(root, String(productIndex), 'package/dist/deepseekbot.mjs'),
      'import "../src/unpublished.mjs";',
    );
    execFileSync('tar', [
      '-czf',
      join(root, `${productIndex}.tgz`),
      '-C',
      join(root, String(productIndex)),
      'package',
    ]);
    expect(() => verifyPackedCli(root, packages, '/unused-no-dependencies')).toThrow();
  });
  it('recovers a partial publication only when the existing version has identical bytes', () => {
    const artifact = { name: 'deepseekbot', version: '0.1.0-alpha.1', integrity: 'sha512-test' };
    expect(existingArtifact(artifact, undefined)).toBe(false);
    expect(
      existingArtifact(artifact, { ...artifact, dist: { integrity: artifact.integrity } }),
    ).toBe(true);
    expect(() =>
      existingArtifact(artifact, { ...artifact, dist: { integrity: 'different' } }),
    ).toThrow('different bytes');
  });
  it('waits for a slow registry readback before confirming publication', async () => {
    const artifact = { name: 'deepseekbot', version: '1.0.0', integrity: 'sha512-test' };
    const published = { ...artifact, dist: { integrity: artifact.integrity } };
    const reads = [undefined, undefined, published];
    const read = async () => reads.shift();
    const sleep = async () => {};
    await expect(awaitPublished(artifact, { read, sleep, attempts: 5 })).resolves.toBe(3);
    await expect(
      awaitPublished(artifact, { read: async () => undefined, sleep, attempts: 2 }),
    ).resolves.toBe(0);
    await expect(
      awaitPublished(artifact, {
        read: async () => ({ ...artifact, dist: { integrity: 'different' } }),
        sleep,
      }),
    ).rejects.toThrow('different bytes');
  });
  it('publishes dependencies together and the product only after every dependency is confirmed', async () => {
    const entry = (name) => ({ artifact: { name } });
    const packages = publicationOrder.map(entry);
    const waves = publicationWaves(packages);
    expect(waves.map((wave) => wave.map(({ artifact }) => artifact.name))).toEqual([
      publicationOrder.slice(0, -1),
      ['deepseekbot'],
    ]);
    expect(publicationWaves([entry('deepseekbot')])).toHaveLength(1);
    const events = [];
    const pending = new Map();
    const run = publishInWaves(waves, ({ artifact }) => {
      events.push(`start ${artifact.name}`);
      return new Promise((done) => pending.set(artifact.name, done));
    });
    await Promise.resolve();
    expect(events).toEqual(publicationOrder.slice(0, -1).map((name) => `start ${name}`));
    for (const name of publicationOrder.slice(0, -1)) pending.get(name)();
    await new Promise((done) => setTimeout(done, 0));
    expect(events.at(-1)).toBe('start deepseekbot');
    pending.get('deepseekbot')();
    await run;
    const product = vi.fn();
    await expect(
      publishInWaves(waves, async ({ artifact }) => {
        if (artifact.name === '@botharness/core') throw new Error('core refused');
        if (artifact.name === 'deepseekbot') product();
      }),
    ).rejects.toThrow('core refused');
    expect(product).not.toHaveBeenCalled();
  });
});

describe('release source diagnostics', () => {
  function checkout(files = {}) {
    const directory = mkdtempSync(join(tmpdir(), 'release-source-test-'));
    roots.push(directory);
    const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' });
    git('init', '--quiet');
    git('config', 'core.autocrlf', 'false');
    git('config', 'core.hooksPath', join(directory, 'no-hooks'));
    for (const [name, content] of Object.entries(files))
      writeFileSync(join(directory, name), content);
    if (Object.keys(files).length) {
      git('add', '.');
      git(
        '-c',
        'user.name=Release QA',
        '-c',
        'user.email=release-qa@example.invalid',
        'commit',
        '--quiet',
        '--no-gpg-sign',
        '-m',
        'baseline',
      );
    }
    return { directory, git };
  }

  it('reports actual modified, deleted, renamed and untracked paths without changing files or the index', () => {
    const { directory, git } = checkout({
      'generated.js': 'original generated bytes',
      'deleted.txt': 'retained in git',
      'from name.txt': 'renamed bytes',
      '.gitignore': '.env\n',
    });
    expect(readReleaseSourceState(directory)).toEqual({
      sourceDirty: false,
      sourceChangeCount: 0,
      sourceChanges: [],
    });
    writeFileSync(join(directory, 'generated.js'), 'unreviewed generated changes');
    rmSync(join(directory, 'deleted.txt'));
    git('mv', 'from name.txt', 'to name.txt');
    writeFileSync(join(directory, '本地 notes.txt'), 'private untracked contents');
    writeFileSync(join(directory, '.env'), 'private ignored contents');
    const index = readFileSync(join(directory, '.git/index'));
    const state = readReleaseSourceState(directory);
    expect(state.sourceDirty).toBe(true);
    expect(state.sourceChangeCount).toBe(4);
    expect(state.sourceChanges).toEqual(
      expect.arrayContaining([
        expect.stringContaining('generated.js'),
        expect.stringContaining('deleted.txt'),
        expect.stringContaining('from name.txt'),
        expect.stringContaining('本地 notes.txt'),
      ]),
    );
    expect(state.sourceChanges.find((line) => line.startsWith('R '))).toContain('to name.txt');
    let error;
    try {
      assertCleanReleaseSource(state);
    } catch (failure) {
      error = failure;
    }
    expect(error.message).toContain('release-source-dirty');
    expect(error.message).toContain('generated.js');
    expect(error.message).not.toContain('private untracked contents');
    expect(error.message).not.toContain('.env');
    expect(readFileSync(join(directory, 'generated.js'), 'utf8')).toBe(
      'unreviewed generated changes',
    );
    expect(readFileSync(join(directory, '本地 notes.txt'), 'utf8')).toBe(
      'private untracked contents',
    );
    expect(readFileSync(join(directory, '.env'), 'utf8')).toBe('private ignored contents');
    expect(readFileSync(join(directory, 'to name.txt'), 'utf8')).toBe('renamed bytes');
    expect(readFileSync(join(directory, '.git/index'))).toEqual(index);
    expect(readReleaseSourceState(directory)).toEqual(state);
  });

  it('bounds the diagnostic list and reports omitted paths', () => {
    const { directory } = checkout();
    for (let i = 0; i < 65; i++) writeFileSync(join(directory, `pending-${i}.txt`), 'unreviewed');
    const state = readReleaseSourceState(directory);
    expect(state.sourceChangeCount).toBe(65);
    expect(state.sourceChanges).toHaveLength(50);
    expect(() => assertCleanReleaseSource(state)).toThrow('"sourceChangesOmitted": 15');
  });

  it('retains old clean plans and refuses old dirty plans without inventing paths', () => {
    expect(() => assertCleanReleaseSource({ sourceDirty: false })).not.toThrow();
    expect(() => assertCleanReleaseSource({ sourceDirty: true })).toThrow('original checkout');
    expect(() => assertCleanReleaseSource({})).toThrow('Release requires a clean source checkout');
  });

  it('includes captured paths when publication verifies a dirty reviewed artifact set', () => {
    const { root, plan } = fixture('1.1.0');
    writeFileSync(
      join(root, 'release-plan.json'),
      JSON.stringify({
        ...plan,
        sourceDirty: true,
        sourceChangeCount: 1,
        sourceChanges: [' M generated.js'],
      }),
    );
    expect(() => verifyRelease(root, { clean: true })).toThrow(' M generated.js');
    expect(verifyRelease(root).plan.sourceDirty).toBe(true);
  });
});
