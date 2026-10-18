import { developmentProfileManifest } from './dev-profile.mjs';
import {
  packagedProfileManifest,
  packagedWorkspaceSettings,
  verifiedProductArtifacts,
  verifyPackagedProfile,
  verifyProductComposition,
  parseProductComposition,
} from './packaged-profile.mjs';
import { productDsh } from './product-artifacts.mjs';
import {
  qualifiedImProvider,
  withQualifiedImProvider,
  verifyQualifiedImProvider,
} from './dev-im-provider.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  devSecretEnvironment,
  devSecretInstructions,
  profileDeepSeekCredential,
  resolveDevSecret,
} from './dev-secret.mjs';
import { pnpmCommand } from './dev-package-manager.mjs';
import {
  resolveAxModel,
  axModelEnvironment,
  assertInstalledGoModel,
  axModelPatch,
  axRuntimeWorkspace,
  goSessionQualified,
} from './dev-model.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function dshCommand(worktree) {
  const installedRoot = join(worktree, 'node_modules', '@deepseek-ai', 'dsh');
  const cli = join(installedRoot, 'lib', 'bin.js');
  if (!existsSync(cli)) {
    throw new Error(`local DSH CLI is missing in ${worktree}; run pnpm install there`);
  }
  const expected = JSON.parse(readFileSync(join(worktree, 'package.json'), 'utf8'))
    .devDependencies?.['@deepseek-ai/dsh'];
  const actual = installedDshVersion(worktree);
  if (actual !== expected) {
    throw new Error(`local DSH CLI mismatch: expected ${expected}, found ${actual}`);
  }
  return [process.execPath, cli];
}

function installedDshVersion(worktree) {
  return JSON.parse(
    readFileSync(join(worktree, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8'),
  ).version;
}

function parseArgs(argv) {
  const options = {
    home: join(homedir(), '.dsh-botharness-dev'),
    port: 3080,
    profile: 'web-dev',
    worktree: repoRoot,
    build: false,
    imProvider: false,
    productArtifacts: null,
    json: false,
    trustedHosts: [],
    clientDiagnostics: process.env['BOTHARNESS_CLIENT_DIAGNOSTICS'] !== '0',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];
    switch (flag) {
      case '--home':
        options.home = resolve(next ?? '');
        index += 1;
        break;
      case '--port':
        options.port = Number.parseInt(next ?? '', 10);
        index += 1;
        break;
      case '--profile':
        options.profile = next ?? options.profile;
        index += 1;
        break;
      case '--worktree':
        options.worktree = resolve(next ?? '');
        index += 1;
        break;
      case '--build':
        options.build = true;
        break;
      case '--trusted-host':
        if (!next) throw new Error('--trusted-host needs a host or host:port authority');
        options.trustedHosts.push(next);
        index += 1;
        break;
      case '--im-provider':
        options.imProvider = true;
        break;
      case '--product-artifacts':
        options.productArtifacts = resolve(next ?? '');
        index += 1;
        break;
      case '--no-client-diagnostics':
        options.clientDiagnostics = false;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`unknown option: ${flag}`);
    }
  }
  if (!Number.isInteger(options.port) || options.port <= 0) {
    throw new Error('--port must be a positive integer');
  }
  if (options.productArtifacts && options.imProvider)
    throw new Error(
      '--product-artifacts already includes its qualified IM Provider; omit --im-provider',
    );
  return options;
}

function run(command, args, options) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status}): ${result.stderr?.trim() ?? ''}`,
    );
  }
  return result.stdout ?? '';
}

function ensureProfile(options) {
  const profileDir = join(options.home, 'profiles', options.profile);
  const manifestPath = join(profileDir, 'package.json');
  const env = { ...process.env, DSH_HOME: options.home };
  const runtime = options.runtime ?? options.worktree;
  const [command, cli] = dshCommand(runtime);
  const profileCliManifest = join(
    options.home,
    'profiles',
    'node_modules',
    '@deepseek-ai',
    'dsh',
    'package.json',
  );
  if (existsSync(profileCliManifest)) {
    const profileVersion = JSON.parse(readFileSync(profileCliManifest, 'utf8')).version;
    const localVersion = installedDshVersion(runtime);
    if (profileVersion !== localVersion) {
      throw new Error(
        `Profile was created with DSH ${profileVersion}, but this worktree uses ${localVersion}; choose a fresh --home`,
      );
    }
  }
  if (!existsSync(manifestPath)) {
    run(
      command,
      [cli, '--profile', options.profile, '--from-default-profile', 'web', '--dump-config'],
      { env },
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (options.productArtifacts && installedDshVersion(runtime) !== productDsh)
    throw new Error(`Qualified product artifacts require DSH ${productDsh}`);
  const base = options.productArtifacts
    ? packagedProfileManifest(manifest, options.productArtifacts)
    : developmentProfileManifest(manifest, options.worktree);
  if (options.productArtifacts) {
    const before = new Set(manifest.dsh?.profile?.bundles ?? []);
    const after = new Set(base.dsh?.profile?.bundles ?? []);
    const migrated = [...before].filter((bundle) => !after.has(bundle) && bundle !== 'deepseekbot');
    if (migrated.length > 0 && !options.json)
      console.log(`Migrated into the deepseekbot umbrella: ${migrated.join(', ')}`);
  }
  if (options.imProvider && installedDshVersion(options.worktree) !== qualifiedImProvider.dsh)
    throw new Error(`Qualified IM provider requires DSH ${qualifiedImProvider.dsh}`);
  const composed = options.imProvider ? withQualifiedImProvider(base) : base;
  if (options.productArtifacts) {
    const workspace = join(profileDir, 'pnpm-workspace.yaml');
    const existing = existsSync(workspace) ? readFileSync(workspace, 'utf8') : '';
    writeFileSync(workspace, packagedWorkspaceSettings(existing, options.productArtifacts));
  }
  writeFileSync(manifestPath, `${JSON.stringify(composed, null, 2)}\n`);
  const [pnpmExecutable, pnpmArgs] = pnpmCommand(['install']);
  run(pnpmExecutable, pnpmArgs, { cwd: profileDir });
  if (options.productArtifacts) verifyPackagedProfile(profileDir, options.productArtifacts);
  if (options.productArtifacts) {
    const dump = run(command, [cli, '--profile', options.profile, '--dump-config'], {
      env,
      cwd: runtime,
    });
    verifyProductComposition(parseProductComposition(dump));
  }
  if (options.imProvider) verifyQualifiedImProvider(profileDir);
  return profileDir;
}

function launch(options) {
  if (options.build) {
    const [command, args] = pnpmCommand(['build']);
    run(command, args, { cwd: options.worktree });
  }
  const logPath = join(
    tmpdir(),
    `dsh-${basename(options.home).replace(/[^a-zA-Z0-9-]/gu, '-')}-${options.port}.log`,
  );
  const env = {
    BOTHARNESS_TELEMETRY: '0',
    ...process.env,
    DSH_HOME: options.home,
    BOTHARNESS_CLIENT_DIAGNOSTICS: options.clientDiagnostics ? '1' : '0',
    ...devSecretEnvironment(),
    ...axModelEnvironment(options.axModel),
  };
  const runtime = options.runtime ?? options.worktree;
  const [command, cli] = dshCommand(runtime);

  const logFd = openSync(logPath, 'w');
  const child = spawn(
    command,
    [
      cli,
      '--profile',
      options.profile,
      ...(options.modelPatch ? ['--patch', options.modelPatch] : []),
      '--port',
      String(options.port),
      ...options.trustedHosts.flatMap((host) => ['--trusted-host', host]),
      '--no-open',
    ],
    { env, cwd: runtime, detached: true, stdio: ['ignore', logFd, logFd] },
  );
  child.unref();
  return { child, logPath };
}

async function waitForToken(logPath, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  const pattern = /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u;
  while (Date.now() < deadline) {
    if (existsSync(logPath)) {
      const match = pattern.exec(readFileSync(logPath, 'utf8'));
      if (match !== null) return match[0];
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`no token URL after ${timeoutMs}ms; see ${logPath}`);
}

async function verifyPluginLayer(url, options) {
  const [base, token] = url.split('/?token=');
  const jar = join(
    tmpdir(),
    `dsh-${basename(options.home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`,
  );
  await fetch(`${base}/?token=${token}`, { redirect: 'manual' });
  const login = await fetch(`${base}/?token=${token}`, { redirect: 'manual' });
  const setCookie = login.headers.get('set-cookie');
  if (setCookie !== null) writeFileSync(jar, setCookie);
  const probe = await fetch(`${base}/api/botharness/list`, {
    signal: AbortSignal.timeout(10_000),
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(setCookie === null ? {} : { cookie: setCookie.split(';')[0] }),
    },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'dev-instance-probe',
      method: 'botharness/list',
      payload: { args: {} },
    }),
  });
  const envelope = await probe.json().catch(() => undefined);
  return {
    status: probe.status,
    ok: probe.status === 200 && envelope?.result?.ok === true,
    error:
      envelope?.result?.error?.code ?? (envelope === undefined ? 'invalid-response' : undefined),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const secret = resolveDevSecret();
  options.axModel = resolveAxModel();
  mkdirSync(options.home, { recursive: true });
  if (options.productArtifacts || options.axModel) {
    const version = options.productArtifacts
      ? verifiedProductArtifacts(options.productArtifacts).dsh
      : JSON.parse(readFileSync(join(options.worktree, 'package.json'), 'utf8')).devDependencies[
          '@deepseek-ai/dsh'
        ];
    if (options.axModel && !goSessionQualified(version, options.productArtifacts !== null))
      throw new Error(
        'AX Go session qualification requires DSH 0.2.1-rc.2, or 0.2.0-rc.1 with product artifacts',
      );
    options.runtime = join(options.home, options.productArtifacts ? 'packaged-cli' : 'ax-cli');
    mkdirSync(options.runtime, { recursive: true });
    const runtimeWorkspace = join(options.runtime, 'pnpm-workspace.yaml');
    if (!existsSync(runtimeWorkspace))
      writeFileSync(
        runtimeWorkspace,
        "packages: [.]\nallowBuilds:\n  '@deepseek-ai/dsh-subprocess-local': true\n  '@google/genai': false\n  koffi: true\n  node-pty: true\n  protobufjs: false\n",
      );
    if (options.axModel)
      writeFileSync(
        runtimeWorkspace,
        axRuntimeWorkspace(readFileSync(runtimeWorkspace, 'utf8'), options.runtime, version),
      );
    writeFileSync(
      join(options.runtime, 'package.json'),
      `${JSON.stringify({ name: 'botharness-isolated-cli-qa', private: true, devDependencies: { '@deepseek-ai/dsh': version } }, null, 2)}\n`,
    );
    const [command, args] = pnpmCommand(['install']);
    run(command, args, { cwd: options.runtime });
  }
  const profileDir = ensureProfile(options);
  if (options.axModel) {
    const runtime = options.runtime ?? options.worktree;
    await assertInstalledGoModel(runtime, options.axModel.model);
    const [command, cli] = dshCommand(runtime);
    const dump = run(command, [cli, '--profile', options.profile, '--dump-config'], {
      env: { ...process.env, DSH_HOME: options.home },
      cwd: runtime,
    });
    options.modelPatch = join(profileDir, 'botharness-ax-model.patch.yml');
    writeFileSync(options.modelPatch, axModelPatch(dump, options.axModel.model));
  }
  const profileCredential = profileDeepSeekCredential(options.home) !== undefined;
  if (!options.axModel && secret === undefined && !profileCredential)
    console.error(devSecretInstructions());
  const { child, logPath } = launch(options);
  const url = await waitForToken(logPath);
  const health = await verifyPluginLayer(url, options);
  if (!health.ok) {
    child.kill();
    throw new Error(
      `BotHarness API is unavailable (HTTP ${health.status}, ${health.error ?? 'unknown'}); see ${logPath}`,
    );
  }
  const summary = {
    pid: child.pid,
    url,
    log: logPath,
    home: options.home,
    worktree: options.worktree,
    secret:
      options.axModel?.source ??
      secret?.source ??
      (profileCredential
        ? 'DSH profile credentials (verify with a real model call)'
        : 'missing (model calls will fail)'),
    health,
    client: {
      state: 'unobserved',
      diagnostics: options.clientDiagnostics ? '/api/botharness/client-diagnostics' : 'disabled',
      verification: 'Read real browser console and DOM; API health is not UI readiness',
    },
    ...(options.axModel
      ? {
          model: {
            provider: options.axModel.provider,
            model: options.axModel.model,
            usability: 'verify with a real DM reply',
          },
        }
      : {}),
    ...(options.imProvider
      ? { imProvider: { source: qualifiedImProvider.source, upstreamReleased: false } }
      : {}),
    ...(options.productArtifacts
      ? {
          productArtifacts: {
            version: verifiedProductArtifacts(options.productArtifacts).productVersion,
            dsh: installedDshVersion(options.runtime ?? options.worktree),
            upstreamReleased: false,
          },
        }
      : {}),
    stop: `kill ${child.pid}`,
  };
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`dev Host API ready: ${url}`);
    console.log(`  DSH_HOME : ${summary.home}`);
    console.log(`  worktree : ${summary.worktree}`);
    console.log(`  secret   : ${summary.secret}`);
    if (summary.model)
      console.log(
        `  model    : ${summary.model.provider}/${summary.model.model} (${summary.model.usability})`,
      );
    console.log(`  plugin   : ${health.ok ? 'ready' : `unhealthy (HTTP ${health.status})`}`);
    console.log(`  log      : ${summary.log}`);
    console.log(`  stop     : ${summary.stop}`);
  }
  process.exitCode = 0;
}

main().catch((error) => {
  console.error(String(error instanceof Error ? error.message : error));
  process.exitCode = 1;
});
