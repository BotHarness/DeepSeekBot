import { acquireHome, verifyStartedHost } from './dev-instance-lifecycle.mjs';
import { developmentProfileManifest } from './dev-profile.mjs';
import {
  packagedProfileManifest,
  packagedWorkspaceSettings,
  verifiedProductArtifacts,
  verifyPackagedProfile,
  verifyProductComposition,
  parseProductComposition,
} from './packaged-profile.mjs';
import { assertDshVersion } from './dsh-compatibility.mjs';
import {
  qualifiedImProvider,
  withQualifiedImProvider,
  verifyQualifiedImProvider,
} from './dev-im-provider.mjs';
import { spawn } from 'node:child_process';
import {
  constants,
  fchmodSync,
  existsSync,
  mkdirSync,
  lstatSync,
  closeSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
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
  withoutAxRuntimePatch,
  installedGoAdapter,
} from './dev-model.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function dshCommand(worktree) {
  const installedRoot = join(worktree, 'node_modules', '@deepseek-ai', 'dsh');
  const cli = join(installedRoot, 'lib', 'bin.js');
  if (!existsSync(cli)) {
    throw new Error(`local DSH CLI is missing in ${worktree}; run pnpm install there`);
  }
  assertDshVersion(installedDshVersion(worktree));
  return [process.execPath, cli];
}

export function describeRuntime(options) {
  const runtime = options.runtime ?? options.worktree;
  return {
    runtime,
    dshVersion: installedDshVersion(runtime),
    ...(options.imProvider
      ? { imProvider: { source: qualifiedImProvider.source, upstreamReleased: false } }
      : {}),
    ...(options.productArtifacts
      ? {
          productArtifacts: {
            version: verifiedProductArtifacts(options.productArtifacts).productVersion,
            dsh: installedDshVersion(runtime),
            upstreamReleased: false,
          },
        }
      : {}),
  };
}

function installedDshVersion(worktree) {
  return JSON.parse(
    readFileSync(join(worktree, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8'),
  ).version;
}

export function parseArgs(argv) {
  const options = {
    home: join(homedir(), '.dsh-botharness-dev'),
    port: 3080,
    profile: 'web-dev',
    worktree: repoRoot,
    build: false,
    imProvider: false,
    productArtifacts: null,
    dshVersion: null,
    json: false,
    trustedHosts: [],
    clientDiagnostics: process.env['BOTHARNESS_CLIENT_DIAGNOSTICS'] !== '0',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];
    if (
      [
        '--dsh-version',
        '--home',
        '--port',
        '--profile',
        '--worktree',
        '--trusted-host',
        '--product-artifacts',
      ].includes(flag) &&
      (typeof next !== 'string' || next.trim() === '' || next.startsWith('--'))
    )
      throw new Error(`${flag} needs a value`);
    switch (flag) {
      case '--dsh-version':
        options.dshVersion = assertDshVersion(next);
        index += 1;
        break;
      case '--home':
        options.home = resolve(next ?? '');
        index += 1;
        break;
      case '--port':
        if (!/^\d+$/u.test(next)) throw new Error('--port must be an integer from 1 to 65535');
        options.port = Number(next);
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
  if (!Number.isInteger(options.port) || options.port <= 0 || options.port > 65535) {
    throw new Error('--port must be an integer from 1 to 65535');
  }
  if (options.productArtifacts && options.imProvider)
    throw new Error(
      '--product-artifacts already includes its qualified IM Provider; omit --im-provider',
    );
  profileDirectory(options);
  return options;
}

export function profileDirectory(options) {
  if (typeof options.profile !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(options.profile))
    throw new Error('--profile must contain only letters, digits, underscores or hyphens');
  const profileDir = join(options.home, 'profiles', options.profile);
  for (const path of [
    join(options.home, 'profiles'),
    profileDir,
    join(profileDir, 'package.json'),
    join(profileDir, 'pnpm-workspace.yaml'),
    join(profileDir, 'botharness-ax-model.patch.yml'),
  ]) {
    try {
      if (lstatSync(path).isSymbolicLink())
        throw new Error('Profile paths must not be symbolic links');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return profileDir;
}

async function ensureProfile(options) {
  const profileDir = profileDirectory(options);
  const manifestPath = join(profileDir, 'package.json');
  const env = { ...process.env, DSH_HOME: options.home };
  const runtime = options.runtime ?? options.worktree;
  const [command, cli] = dshCommand(runtime);
  if (!existsSync(manifestPath)) {
    await options.lease.run(
      command,
      [cli, '--profile', options.profile, '--from-default-profile', 'web', '--dump-config'],
      { env },
    );
  }
  profileDirectory(options);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
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
  const composed = options.imProvider ? withQualifiedImProvider(base) : base;
  profileDirectory(options);
  if (options.productArtifacts) {
    const workspace = join(profileDir, 'pnpm-workspace.yaml');
    const existing = existsSync(workspace) ? readFileSync(workspace, 'utf8') : '';
    writeFileSync(workspace, packagedWorkspaceSettings(existing, options.productArtifacts));
  }
  writeFileSync(manifestPath, `${JSON.stringify(composed, null, 2)}\n`);
  const [pnpmExecutable, pnpmArgs] = pnpmCommand(['install']);
  await options.lease.run(pnpmExecutable, pnpmArgs, { cwd: profileDir });
  if (options.productArtifacts) verifyPackagedProfile(profileDir, options.productArtifacts);
  if (options.productArtifacts) {
    const dump = await options.lease.run(
      command,
      [cli, '--profile', options.profile, '--dump-config'],
      {
        env,
        cwd: runtime,
      },
    );
    verifyProductComposition(parseProductComposition(dump));
  }
  if (options.imProvider) verifyQualifiedImProvider(profileDir);
  return profileDir;
}

async function launch(options) {
  if (options.build) {
    const [command, args] = pnpmCommand(['build']);
    await options.lease.run(command, args, { cwd: options.worktree });
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
  child.ownedProcessGroup = process.platform !== 'win32';
  closeSync(logFd);
  child.unref();
  return { child, logPath };
}

async function waitForToken(logPath, checkRunning, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  const pattern = /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u;
  while (Date.now() < deadline) {
    checkRunning();
    if (existsSync(logPath)) {
      const match = pattern.exec(readFileSync(logPath, 'utf8'));
      if (match !== null) return match[0];
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`no token URL after ${timeoutMs}ms; see ${logPath}`);
}

export async function verifyPluginLayer(url, options) {
  const [base, token] = url.split('/?token=');
  const login = await fetch(`${base}/?token=${token}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  const setCookie = login.headers.get('set-cookie');
  if (setCookie !== null) {
    const legacyJar = join(
      tmpdir(),
      `dsh-${basename(options.home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`,
    );
    for (const jar of [join(options.home, '.botharness-auth.cookie'), legacyJar]) {
      const fd = openSync(
        jar,
        constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      try {
        fchmodSync(fd, 0o600);
        writeFileSync(fd, setCookie);
      } finally {
        closeSync(fd);
      }
    }
  }

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
  const lease = acquireHome(options.home);
  options.lease = lease;
  try {
    const secret = resolveDevSecret();
    options.axModel = resolveAxModel();
    mkdirSync(options.home, { recursive: true });
    if (options.productArtifacts || options.axModel || options.dshVersion) {
      if (options.productArtifacts) verifiedProductArtifacts(options.productArtifacts);
      const version = options.dshVersion ?? installedDshVersion(options.worktree);
      assertDshVersion(version);
      options.runtime = join(options.home, options.productArtifacts ? 'packaged-cli' : 'ax-cli');
      mkdirSync(options.runtime, { recursive: true });
      const runtimeWorkspace = join(options.runtime, 'pnpm-workspace.yaml');
      if (!existsSync(runtimeWorkspace))
        writeFileSync(
          runtimeWorkspace,
          "packages: [.]\nallowBuilds:\n  '@deepseek-ai/dsh-subprocess-local': true\n  '@google/genai': false\n  koffi: true\n  node-pty: true\n  protobufjs: false\n",
        );
      writeFileSync(
        runtimeWorkspace,
        withoutAxRuntimePatch(readFileSync(runtimeWorkspace, 'utf8')),
      );
      writeFileSync(
        join(options.runtime, 'package.json'),
        `${JSON.stringify({ name: 'botharness-isolated-cli-qa', private: true, devDependencies: { '@deepseek-ai/dsh': version } }, null, 2)}\n`,
      );
      const [command, args] = pnpmCommand(['install']);
      await options.lease.run(command, args, { cwd: options.runtime });
      if (options.axModel) {
        const adapter = installedGoAdapter(options.runtime);
        writeFileSync(
          runtimeWorkspace,
          axRuntimeWorkspace(
            readFileSync(runtimeWorkspace, 'utf8'),
            options.runtime,
            adapter.version,
            adapter.source,
          ),
        );
        await options.lease.run(command, args, { cwd: options.runtime });
      }
    }
    const profileDir = await ensureProfile(options);
    if (options.axModel) {
      const runtime = options.runtime ?? options.worktree;
      await assertInstalledGoModel(runtime, options.axModel.model);
      const [command, cli] = dshCommand(runtime);
      const dump = await options.lease.run(
        command,
        [cli, '--profile', options.profile, '--dump-config'],
        {
          env: { ...process.env, DSH_HOME: options.home },
          cwd: runtime,
        },
      );
      profileDirectory(options);
      options.modelPatch = join(profileDir, 'botharness-ax-model.patch.yml');
      writeFileSync(options.modelPatch, axModelPatch(dump, options.axModel.model));
    }
    const profileCredential = profileDeepSeekCredential(options.home) !== undefined;
    if (!options.axModel && secret === undefined && !profileCredential)
      console.error(devSecretInstructions());
    const runtimeDescription = describeRuntime(options);
    const { child, logPath } = await launch(options);
    const { url, health } = await verifyStartedHost(child, async (checkRunning) => {
      lease.started(child, logPath);
      const url = await waitForToken(logPath, checkRunning);
      const health = await verifyPluginLayer(url, options);
      if (!health.ok)
        throw new Error(
          `BotHarness API is unavailable (HTTP ${health.status}, ${health.error ?? 'unknown'}); see ${logPath}`,
        );
      checkRunning();
      return { url, health };
    });
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
      ...runtimeDescription,
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
  } finally {
    lease.release();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(String(error instanceof Error ? error.message : error));
    process.exitCode = 1;
  });
}
