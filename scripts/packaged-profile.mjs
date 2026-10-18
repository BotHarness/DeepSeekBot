import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parse, parseDocument } from 'yaml';
import semver from 'semver';
import { productDsh, productImProvider } from './product-artifacts.mjs';
import { providerRuntimeDigest } from './dev-im-provider.mjs';

export function verifyProductComposition(entries) {
  const expected = new Map([
    ['xmanrui-dsh-im', productImProvider.name],
    ['botharness-core', '@botharness/core'],
    ['botharness-client', '@botharness/ui'],
    ['botharness-browser', '@botharness/browser'],
    ['botharness-computer', '@botharness/computer'],
  ]);
  const found = new Map();
  const names = new Set(expected.values());
  function visit(rows) {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (expected.has(row?.id)) {
        if (
          found.has(row.id) ||
          row.name !== expected.get(row.id) ||
          (row.disabled !== undefined && row.disabled !== false)
        )
          throw new Error(
            `Product component ${row.id} conflicts with another Patch; remove the duplicate/disabled entry, retain stored data, then retry`,
          );
        found.set(row.id, row.name);
      }
      if (names.has(row?.name) && expected.get(row?.id) !== row.name)
        throw new Error(
          `Product component ${row.name} has a duplicate or unexpected Loader identity`,
        );
      if (row?.name === '@xmanrui/dsh-im')
        throw new Error(
          'Standalone upstream Provider conflicts with the product; remove its entry and retain stored data',
        );
      visit(row?.config);
    }
  }
  visit(entries);
  if (found.size !== expected.size)
    throw new Error('Product Patch did not activate all five qualified components');
}

export function parseProductComposition(source) {
  return parse(source, {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value) => ({ __jsExpr: value }) }],
  });
}

const PRODUCT_PACKAGES = new Set([
  'deepseekbot',
  '@botharness/browser',
  '@botharness/computer',
  '@botharness/core',
  '@botharness/ui',
  productImProvider.name,
]);

export const productAllowBuilds = {
  esbuild: true,
  workerd: true,
  puppeteer: true,
  '@deepseek-ai/dsh-subprocess-local': true,
  '@google/genai': false,
  koffi: true,
  'node-pty': true,
  protobufjs: false,
  'agent-browser': false,
  'react-native-enriched-markdown': false,
};

export function verifiedProductArtifacts(directory) {
  const root = resolve(directory);
  const manifest = JSON.parse(readFileSync(join(root, 'artifacts.json'), 'utf8'));
  if (
    manifest.dsh !== productDsh ||
    !Number.isSafeInteger(manifest.providerRuntime?.runtimeFiles) ||
    manifest.providerRuntime.runtimeFiles < 1 ||
    !/^[a-f0-9]{64}$/.test(manifest.providerRuntime.runtimeSha256) ||
    typeof manifest.productVersion !== 'string' ||
    semver.valid(manifest.productVersion) !== manifest.productVersion ||
    !Array.isArray(manifest.artifacts) ||
    manifest.artifacts.length !== PRODUCT_PACKAGES.size
  )
    throw new Error('Product artifacts do not describe the qualified package set');
  const seen = new Set();
  for (const artifact of manifest.artifacts) {
    if (
      !PRODUCT_PACKAGES.has(artifact.name) ||
      seen.has(artifact.name) ||
      typeof artifact.filename !== 'string' ||
      basename(artifact.filename) !== artifact.filename ||
      !artifact.filename.endsWith('.tgz')
    )
      throw new Error('Invalid product artifact identity');
    const expectedVersion =
      artifact.name === productImProvider.name
        ? productImProvider.version
        : manifest.productVersion;
    if (artifact.version !== expectedVersion)
      throw new Error('Product artifact versions do not match');
    const bytes = readFileSync(join(root, artifact.filename));
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    if (artifact.integrity !== integrity)
      throw new Error(`Product artifact changed: ${artifact.name}`);
    seen.add(artifact.name);
  }
  return { ...manifest, directory: root };
}

const ownedStandaloneBundles = new Set([
  '@botharness/browser',
  '@botharness/computer',
  '@botharness/core',
  '@botharness/ui',
]);

export function packagedProfileManifest(manifest, directory) {
  const bundles = manifest.dsh?.profile?.bundles ?? [];
  for (const standalone of ['@xmanrui/dsh-im', productImProvider.name])
    if (bundles.includes(standalone))
      throw new Error(
        `Standalone Bundle ${standalone} conflicts with the product; remove its Bundle entry, retain credentials/history, then retry`,
      );
  const retained = bundles.filter((bundle) => !ownedStandaloneBundles.has(bundle));
  const artifacts = verifiedProductArtifacts(directory);
  const product = artifacts.artifacts.find((artifact) => artifact.name === 'deepseekbot');
  return {
    ...manifest,
    dependencies: {
      ...manifest.dependencies,
      deepseekbot: `file:${join(artifacts.directory, product.filename)}`,
    },
    dsh: {
      ...manifest.dsh,
      profile: {
        ...manifest.dsh?.profile,
        bundles: [
          '@deepseek-ai/dsh-base',
          '@deepseek-ai/dsh-web-app',
          'deepseekbot',
          ...retained.filter(
            (bundle) =>
              !['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'deepseekbot'].includes(
                bundle,
              ),
          ),
        ],
      },
    },
  };
}

export function verifyPackagedProfile(profileDirectory, directory) {
  const expected = verifiedProductArtifacts(directory);
  const productManifestPath = join(profileDirectory, 'node_modules', 'deepseekbot', 'package.json');
  const dependencyRequire = createRequire(realpathSync(productManifestPath));
  const installedPaths = new Map();
  for (const artifact of expected.artifacts) {
    const manifestPath =
      artifact.name === 'deepseekbot'
        ? productManifestPath
        : dependencyRequire.resolve(`${artifact.name}/package.json`);
    installedPaths.set(artifact.name, dirname(manifestPath));
    const installed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (installed.name !== artifact.name || installed.version !== artifact.version)
      throw new Error(`Installed product package differs: ${artifact.name}`);
  }
  const provider = installedPaths.get(productImProvider.name);
  const provenance = JSON.parse(readFileSync(join(provider, 'PROVENANCE.json'), 'utf8'));
  const digest = providerRuntimeDigest(provider);
  if (
    provenance.source !== productImProvider.upstream.source ||
    provenance.dsh !== expected.dsh ||
    digest.runtimeFiles !== provenance.compiledOutput.runtimeFiles ||
    digest.runtimeSha256 !== provenance.compiledOutput.runtimeSha256 ||
    digest.runtimeFiles !== expected.providerRuntime.runtimeFiles ||
    digest.runtimeSha256 !== expected.providerRuntime.runtimeSha256
  )
    throw new Error('Installed Provider differs from its qualified provenance');
  return {
    version: expected.productVersion,
    providerVersion: productImProvider.version,
    source: provenance.source,
    runtime: digest,
  };
}

export function packagedWorkspaceSettings(source, directory) {
  const document = parseDocument(source || 'packages: [.]\n');
  if (document.errors.length) throw new Error('Cannot update invalid Profile workspace settings');
  const previous = document.toJS();
  const overrides = { ...previous?.overrides };
  const artifacts = verifiedProductArtifacts(directory);
  for (const artifact of artifacts.artifacts)
    overrides[`${artifact.name}@${artifact.version}`] =
      `file:${join(artifacts.directory, artifact.filename)}`;
  document.set('overrides', overrides);
  document.set('allowBuilds', { ...productAllowBuilds, ...previous?.allowBuilds });
  return document.toString();
}
