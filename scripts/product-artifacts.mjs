import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import { readComposedReleaseLedgers } from './change-fragments.mjs';
import {
  cloudflaredOptionalDependencies,
  fetchCloudflaredAssets,
  stageCloudflaredPackages,
} from './cloudflared-packages.mjs';
import { providerRuntimeDigest } from './dev-im-provider.mjs';
import { pnpmCommand } from './dev-package-manager.mjs';

export const productDsh = '0.2.1-rc.2';
export const productDshRange = '>=0.2.0-rc.2 <0.3.0-0';
export const productDshPeerRange = `${productDshRange} || >=0.2.1-0 <0.3.0-0`;
export const providerDshRange = '>=0.2.0-0';
export const providerDshPeerRange = `${providerDshRange} || >=0.2.1-0`;
export const productDshVersions = Object.freeze(['0.2.0-rc.2', productDsh]);

export const productImProvider = Object.freeze({
  name: '@botharness/im-provider',
  version: '4.32.0-botharness.21',
  sourceManifestSha256: '3331e8f771a91abf396eb4e7ed5c0acc4c3b504cdccc7d715e37062708384cc2',
  sourceLockSha256: '3476c34c7d4515000d2617beaf2568b2a794b60de9b350cd8eafb7a2bf21adef',
  upstream: Object.freeze({
    package: '@xmanrui/dsh-im',
    packageVersion: '4.32.0',
    source: 'beaed4a6dabb583654d28fb09298716267039b4a',
    dsh: '0.2.0-rc.2',
    runtimeFiles: 421,
    runtimeSha256: '42e1140e67ba2f74122db3d49bb2c8aece239b7d75f9564ce713a8a491902706',
  }),
});

export function productManifest(manifest, version) {
  if (semver.valid(version) !== version) throw new Error('An explicit product SemVer is required');
  const { private: _private, scripts: _scripts, devDependencies: _dev, ...result } = manifest;
  return {
    ...result,
    version,
    license: 'MIT',
    repository: {
      type: 'git',
      url: 'git+https://github.com/BotHarness/BotHarness.git',
      directory: 'packages/deepseekbot',
    },
    description:
      'DeepSeekBot (DSB): the open-source Grok Bot alternative for DeepSeek Harness. PersonaBots with their own identity, Git Memory, Groups and Lark, Slack, Discord, QQ and WeChat identities. Not the same project as DS Bot (ds-bot).',
    homepage: 'https://deepseekbot.app/en/',
    bugs: { url: 'https://github.com/BotHarness/BotHarness/issues' },
    keywords: [
      'deepseekbot',
      'dsb',
      'deepseek-bot',
      'deepseek',
      'deepseek-harness',
      'dsh',
      'dsh-plugin',
      'ai-agent',
      'persona',
      'memory',
      'grok-bot',
      'lark',
      'feishu',
      'slack',
      'discord',
      'wechat',
      'qq',
    ],
    publishConfig: { access: 'public' },
    dependencies: {
      ...manifest.dependencies,
      '@botharness/browser': version,
      '@botharness/computer': version,
      '@botharness/core': version,
      '@botharness/ui': version,
      [productImProvider.name]: productImProvider.version,
    },
    optionalDependencies: {
      ...manifest.optionalDependencies,
      ...cloudflaredOptionalDependencies(version),
    },
    dsh: { ...manifest.dsh, bundle: { patch: './cordis.im.patch.yml' } },
    files: ['dist', 'desktop-theme', 'cordis.im.patch.yml', 'README.md', 'LICENSE'],
  };
}

export function verifyProviderSource(directory) {
  const bytes = readFileSync(join(directory, 'package.json'));
  const manifest = JSON.parse(bytes.toString('utf8'));
  const digest = providerRuntimeDigest(directory);
  if (
    manifest.name !== productImProvider.upstream.package ||
    manifest.version !== productImProvider.upstream.packageVersion ||
    createHash('sha256').update(bytes).digest('hex') !== productImProvider.sourceManifestSha256 ||
    createHash('sha256')
      .update(readFileSync(join(directory, 'package-lock.json')))
      .digest('hex') !== productImProvider.sourceLockSha256 ||
    digest.runtimeFiles !== productImProvider.upstream.runtimeFiles ||
    digest.runtimeSha256 !== productImProvider.upstream.runtimeSha256
  )
    throw new Error('Provider input differs from the qualified immutable artifact');
  return digest;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr?.slice(-2500)}`);
  return result.stdout;
}

function copyAvailable(source, target, paths) {
  for (const path of paths) {
    if (!existsSync(join(source, path))) throw new Error(`Missing artifact input: ${path}`);
    cpSync(join(source, path), join(target, path), { recursive: true });
  }
}

export function providerManifest(original) {
  const {
    scripts: _scripts,
    devDependencies: _dev,
    directories: _directories,
    bin: _bin,
    ...manifest
  } = original;
  return {
    ...manifest,
    name: productImProvider.name,
    version: productImProvider.version,
    description: 'BotHarness-qualified IM Provider, maintained from dsh-im',
    repository: { type: 'git', url: 'git+https://github.com/BotHarness/BotHarness.git' },
    bugs: { url: 'https://github.com/BotHarness/BotHarness/issues' },
    homepage: 'https://botharness.ai/docs/lark-connection/',
    files: [
      'assets',
      'lib',
      'locale',
      'plugin-src',
      'src',
      'cordis.patch.yml',
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
      'README.md',
      'README.en.md',
      'PROVENANCE.json',
    ],
    engines: { node: '>=22', dsh: providerDshRange },
    peerDependencies: Object.fromEntries(
      Object.entries(manifest.peerDependencies ?? {}).map(([name, range]) => [
        name,
        name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')
          ? providerDshPeerRange
          : range,
      ]),
    ),
    dsh: {
      ...manifest.dsh,
      compatibility: { dsh: providerDshRange, profiles: ['web'] },
    },
    botharness: { managedByProduct: true, upstreamSource: productImProvider.upstream.source },
  };
}

export function stageProvider(source, target, repoRoot) {
  const input = verifyProviderSource(source);
  mkdirSync(target, { recursive: true });
  copyAvailable(source, target, [
    'assets',
    'lib',
    'locale',
    'plugin-src',
    'src',
    'LICENSE',
    'README.md',
    'README.en.md',
    'THIRD_PARTY_NOTICES.md',
  ]);
  writeJson(
    join(target, 'package.json'),
    providerManifest(JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))),
  );
  writeFileSync(
    join(target, 'cordis.patch.yml'),
    `- insert:\n    - id: xmanrui-dsh-im\n      name: '${productImProvider.name}'\n`,
  );
  for (const filename of ['README.md', 'README.en.md']) {
    const path = join(target, filename);
    writeFileSync(
      path,
      `# BotHarness-managed IM Provider\n\nThis independently versioned Provider is maintained from dsh-im and installed and updated through the BotHarness product. Configure accounts through native Settings → IM bots. Do not follow the upstream standalone installation commands below for this scoped artifact; its standalone installer is not shipped. The following upstream documentation is retained for attribution and platform reference.\n\n---\n\n${readFileSync(path, 'utf8')}`,
    );
  }
  cpSync(
    join(repoRoot, 'scripts/product-provider/update-rpc.mjs'),
    join(target, 'plugin-src/host/update-rpc.mjs'),
  );
  cpSync(
    join(repoRoot, 'scripts/product-provider/update-policy.mjs'),
    join(target, 'plugin-src/host/update-policy.mjs'),
  );
  cpSync(
    join(repoRoot, 'scripts/product-provider/update-panel.js'),
    join(target, 'plugin-src/client/update-panel.js'),
  );
  const localePath = join(target, 'plugin-src/client/i18n.js');
  const locale = readFileSync(localePath, 'utf8');
  if (!locale.includes('const EN = Object.freeze({'))
    throw new Error('Provider locale seam changed');
  writeFileSync(
    localePath,
    locale.replace(
      'const EN = Object.freeze({',
      `const EN = Object.freeze({
  '随 BotHarness 更新': 'Updates with BotHarness',
  '此 IM 连接器随 BotHarness 更新，以保持兼容。': 'This IM Provider updates with BotHarness to retain compatibility.',`,
    ),
  );
  symlinkSync(join(source, 'node_modules'), join(target, 'node_modules'), 'dir');
  writeJson(join(target, 'tsconfig.json'), { compilerOptions: { alwaysStrict: true } });
  const env = { ...process.env, DSH_IM_CLIENT_ID: productImProvider.name };
  run(process.execPath, ['plugin-src/client/build.mjs'], { cwd: target, env });
  run(process.execPath, ['plugin-src/host/build.mjs'], { cwd: target, env });
  const output = providerRuntimeDigest(target);
  writeJson(join(target, 'PROVENANCE.json'), {
    name: productImProvider.name,
    version: productImProvider.version,
    source: productImProvider.upstream.source,
    sourceRepository: 'https://github.com/DoodleBears/dsh-im',
    upstreamRepository: 'https://github.com/xmanrui/dsh-im',
    dsh: productImProvider.upstream.dsh,
    qualifiedInput: input,
    compiledOutput: output,
    sourceManifestSha256: productImProvider.sourceManifestSha256,
    sourceLockSha256: productImProvider.sourceLockSha256,
    managedSources: Object.fromEntries(
      ['update-rpc.mjs', 'update-policy.mjs', 'update-panel.js'].map((name) => [
        name,
        createHash('sha256')
          .update(readFileSync(join(repoRoot, 'scripts/product-provider', name)))
          .digest('hex'),
      ]),
    ),
    upstreamReleased: false,
    derivation:
      'First-party package/client identity and product-managed updates; transport contracts unchanged',
  });
  return output;
}

export function packProduct({
  repoRoot,
  outputDirectory,
  providerSource,
  version,
  cloudflaredAssets,
}) {
  const productRelease = productManifest(
    JSON.parse(readFileSync(join(repoRoot, 'packages/deepseekbot/package.json'), 'utf8')),
    version,
  );
  const output = resolve(outputDirectory);
  mkdirSync(output, { recursive: true });
  const staging = join(output, 'packages');
  if (existsSync(staging)) throw new Error('Use a fresh artifact output directory');
  mkdirSync(staging);
  const artifacts = [];
  const packageDirectories = [];
  for (const name of ['core', 'client', 'browser', 'computer']) {
    const source = join(repoRoot, 'packages', name);
    const target = join(staging, name);
    mkdirSync(target);
    const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
    const { private: _private, devDependencies: _dev, scripts: _scripts, ...release } = manifest;
    for (const path of manifest.files) copyAvailable(source, target, [path]);
    const ledgers = name === 'core' ? ['CHANGELOG.md', 'CHANGELOG.zh.md'] : [];
    if (ledgers.length > 0) {
      const { english, chinese } = readComposedReleaseLedgers(repoRoot);
      writeFileSync(join(target, 'CHANGELOG.md'), english);
      writeFileSync(join(target, 'CHANGELOG.zh.md'), chinese);
    }
    cpSync(join(repoRoot, 'LICENSE'), join(target, 'LICENSE'));
    writeJson(join(target, 'package.json'), {
      ...release,
      version,
      license: 'MIT',
      repository: {
        type: 'git',
        url: 'git+https://github.com/BotHarness/BotHarness.git',
        directory: `packages/${name}`,
      },
      files: [...release.files, ...ledgers, 'LICENSE'],
      publishConfig: { access: 'public' },
    });
    packageDirectories.push(target);
  }
  const provider = join(staging, 'im-provider');
  const providerRuntime = stageProvider(providerSource, provider, repoRoot);
  packageDirectories.push(provider);
  const platformDirectories = stageCloudflaredPackages({
    repoRoot,
    assetsDirectory: cloudflaredAssets,
    staging,
    version,
  });
  const product = join(staging, 'deepseekbot');
  mkdirSync(product);
  const source = join(repoRoot, 'packages/deepseekbot');
  writeJson(join(product, 'package.json'), productRelease);
  copyAvailable(source, product, ['dist', 'desktop-theme', 'cordis.im.patch.yml', 'README.md']);
  cpSync(join(repoRoot, 'LICENSE'), join(product, 'LICENSE'));
  packageDirectories.push(product);
  const pack = (directory, { preserveModes = false } = {}) => {
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    if (preserveModes)
      run('npm', ['pack', '--pack-destination', output, '--ignore-scripts'], {
        cwd: directory,
        shell: process.platform === 'win32',
      });
    else {
      const [command, args] = pnpmCommand(['pack', '--pack-destination', output]);
      run(command, args, { cwd: directory });
    }
    const filename = `${manifest.name.replace(/^@/, '').replace('/', '-')}-${manifest.version}.tgz`;
    const bytes = readFileSync(join(output, filename));
    return {
      name: manifest.name,
      version: manifest.version,
      filename,
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    };
  };
  for (const directory of packageDirectories) artifacts.push(pack(directory));
  const platformArtifacts = platformDirectories.map((directory) =>
    pack(directory, { preserveModes: true }),
  );
  writeJson(join(output, 'artifacts.json'), {
    productVersion: version,
    dsh: productDsh,
    providerRuntime,
    artifacts,
    platformArtifacts,
  });
  return [...artifacts, ...platformArtifacts];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const values = new Map();
  for (let i = 2; i < process.argv.length; i += 2) values.set(process.argv[i], process.argv[i + 1]);
  for (const key of ['--output', '--provider-source', '--version'])
    if (!values.get(key)) throw new Error(`Required argument: ${key}`);
  const cloudflaredAssets = await fetchCloudflaredAssets({
    directory: resolve(
      values.get('--cloudflared-assets') ?? join(values.get('--output'), 'cloudflared-assets'),
    ),
  });
  console.log(
    JSON.stringify(
      packProduct({
        repoRoot: fileURLToPath(new URL('..', import.meta.url)),
        outputDirectory: values.get('--output'),
        providerSource: resolve(values.get('--provider-source')),
        version: values.get('--version'),
        cloudflaredAssets,
      }),
      null,
      2,
    ),
  );
}
