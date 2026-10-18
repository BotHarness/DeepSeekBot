import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productDshVersions } from './product-artifacts.mjs';
import { verifiedProductArtifacts } from './packaged-profile.mjs';

const usage = 'Use node scripts/e2e-fresh-profile-install.mjs <artifacts> <fresh-output>';

export function freshProfileOverrides(artifacts) {
  return Object.fromEntries(
    artifacts.artifacts
      .filter((artifact) => artifact.name !== 'deepseekbot')
      .map((artifact) => [artifact.name, `file:${join(artifacts.directory, artifact.filename)}`]),
  );
}

export function ignoredBuilds(output) {
  const named = /Ignored build scripts: ([^\n]*)/u.exec(output)?.[1]?.trim();
  if (named) return named;
  return output.includes('ERR_PNPM_IGNORED_BUILDS') ? 'unnamed dependencies' : '';
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 900_000,
    ...options,
  });
  return { status: result.status, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}` };
}

async function boot({ dsh, runtime, env, port, log }) {
  const fd = openSync(log, 'w');
  const child = spawn(dsh, ['--profile', 'qa', '--port', String(port), '--no-open'], {
    cwd: runtime,
    env,
    detached: true,
    stdio: ['ignore', fd, fd],
  });
  const stop = async () => {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      return;
    }
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try {
        process.kill(-child.pid, 0);
      } catch {
        return;
      }
      await new Promise((done) => setTimeout(done, 100));
    }
    process.kill(-child.pid, 'SIGKILL');
  };
  let url;
  const deadline = Date.now() + 180_000;
  while (url === undefined && child.exitCode === null && Date.now() < deadline) {
    await new Promise((done) => setTimeout(done, 250));
    url = /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u.exec(
      readFileSync(log, 'utf8'),
    )?.[0];
  }
  if (url === undefined) {
    await stop();
    throw new Error('Host printed no sign-in URL; inspect the private boot log');
  }
  try {
    assert.doesNotMatch(
      readFileSync(log, 'utf8'),
      /disabling profile plugin row|incompatible with dsh/u,
      'A product Plugin was disabled by native preflight',
    );
  } catch (error) {
    await stop();
    throw error;
  }
  const [base, token] = url.split('/?token=');
  const login = await fetch(`${base}/?token=${token}`, { redirect: 'manual' });
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const rpc = async (method, args = {}) => {
    const response = await fetch(`${base}/api/botharness/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: crypto.randomUUID(),
        method: `botharness/${method}`,
        payload: { args },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.status, 200, `${method} returned HTTP ${response.status}`);
    const envelope = await response.json();
    assert.equal(envelope.result?.ok, true, `${method} failed`);
    return envelope.result.value;
  };
  return { rpc, stop };
}

async function qualify(artifacts, version, root, port) {
  const runtime = join(root, 'runtime');
  const home = join(root, 'dsh-home');
  const userHome = join(root, 'user-home');
  for (const directory of [runtime, home, userHome]) mkdirSync(directory, { recursive: true });
  const env = { ...process.env, DSH_HOME: home, HOME: userHome, BOTHARNESS_TELEMETRY: '0' };
  writeFileSync(join(runtime, 'package.json'), '{"private":true}\n');
  let step = run('npm', ['install', `@deepseek-ai/dsh@${version}`, '--no-audit', '--no-fund'], {
    cwd: runtime,
    env,
  });
  assert.equal(step.status, 0, `DSH ${version} did not install`);
  const dsh = join(runtime, 'node_modules/.bin/dsh');
  step = run(dsh, ['--profile', 'qa', '--from-default-profile', 'web', '--dump-config'], {
    cwd: runtime,
    env,
  });
  assert.equal(step.status, 0, 'The web Profile template did not initialize');
  const profile = join(home, 'profiles/qa');
  const workspace = join(profile, 'pnpm-workspace.yaml');
  const overrides = Object.entries(freshProfileOverrides(artifacts))
    .map(([name, spec]) => `  '${name}': '${spec}'\n`)
    .join('');
  writeFileSync(
    workspace,
    `${existsSync(workspace) ? readFileSync(workspace, 'utf8') : ''}\noverrides:\n${overrides}`,
  );
  const product = artifacts.artifacts.find((artifact) => artifact.name === 'deepseekbot');
  step = run(
    dsh,
    ['plugin', '--profile', 'qa', 'add', join(artifacts.directory, product.filename)],
    {
      cwd: runtime,
      env,
    },
  );
  writeFileSync(join(root, 'install.private.log'), step.output, { mode: 0o600 });
  const blocked = ignoredBuilds(step.output);
  assert.equal(
    blocked,
    '',
    `A fresh Profile install needs build approval for: ${blocked}. Users would have to approve it before DeepSeekBot installs.`,
  );
  assert.equal(step.status, 0, 'The product did not install into a fresh Profile');
  const manifestPath = join(profile, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.dsh.profile.bundles = [...new Set([...manifest.dsh.profile.bundles, 'deepseekbot'])];
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const first = await boot({ dsh, runtime, env, port, log: join(root, 'boot-1.private.log') });
  let slug;
  try {
    const bot = (await first.rpc('create', { displayName: 'Fresh install Bot' })).bot;
    assert.ok((await first.rpc('channelDm', { slug: bot.slug })).channel.id);
    slug = bot.slug;
  } finally {
    await first.stop();
  }
  const second = await boot({ dsh, runtime, env, port, log: join(root, 'boot-2.private.log') });
  try {
    assert.ok((await second.rpc('list')).bots.some((bot) => bot.slug === slug));
  } finally {
    await second.stop();
  }
}

async function main() {
  if (process.argv.length !== 4) throw new Error(usage);
  const artifacts = verifiedProductArtifacts(resolve(process.argv[2]));
  const output = resolve(process.argv[3]);
  if (existsSync(output)) throw new Error('Use a fresh output directory');
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const report = {
    productVersion: artifacts.productVersion,
    node: process.version,
    platform: process.platform,
    scope:
      'Fresh Profile, no pre-approved builds: one install step, Host boot, Bot and DM creation, restart persistence. Browser, model and IM delivery are separate gates.',
    rows: productDshVersions.map((dsh) => ({ dsh, state: 'pending' })),
  };
  const results = await Promise.allSettled(
    report.rows.map((row, index) =>
      qualify(artifacts, row.dsh, join(output, `dsh-${row.dsh}`), 32980 + index).then(
        () => {
          row.state = 'passed';
        },
        (error) => {
          row.state = 'failed';
          row.error = error instanceof Error ? error.message : 'Fresh install failed';
          throw error;
        },
      ),
    ),
  );
  writeFileSync(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  for (const row of report.rows)
    console.log(`DSH ${row.dsh}: ${row.state}${row.error ? ` (${row.error})` : ''}`);
  if (results.some((result) => result.status === 'rejected')) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
