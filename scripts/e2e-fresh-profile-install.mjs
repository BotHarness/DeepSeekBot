import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productDshVersions } from './product-artifacts.mjs';
import { verifiedProductArtifacts } from './packaged-profile.mjs';

const usage = 'Use node scripts/e2e-fresh-profile-install.mjs <artifacts> <fresh-output>';

export function freshProfileOverrides(artifacts, productName = 'deepseekbot') {
  return Object.fromEntries(
    artifacts.artifacts
      .filter((artifact) => artifact.name !== productName)
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
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  };
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
  return { rpc, stop, base, token };
}

async function qualify(artifacts, version, root, port, productName, upgradeFrom) {
  const runtime = join(root, 'runtime');
  const home = join(root, 'dsh-home');
  const userHome = join(root, 'user-home');
  for (const directory of [runtime, home, userHome]) mkdirSync(directory, { recursive: true });
  const env = { ...process.env, DSH_HOME: home, HOME: userHome, BOTHARNESS_TELEMETRY: '0' };
  for (const key of Object.keys(env))
    if (/API_KEY|TOKEN|SECRET|PASSWORD|NODE_AUTH|DEEPSEEKBOT_HOST/iu.test(key)) delete env[key];
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
  const manifestPath = join(profile, 'package.json');
  const enable = (name) => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.dsh.profile.bundles = [...new Set([...manifest.dsh.profile.bundles, name])];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  };
  let preserved;
  if (upgradeFrom) {
    step = run(dsh, ['plugin', '--profile', 'qa', 'add', `deepseekbot@${upgradeFrom}`], {
      cwd: runtime,
      env,
    });
    writeFileSync(join(root, 'legacy-install.private.log'), step.output, { mode: 0o600 });
    assert.equal(step.status, 0, 'Published legacy product did not install');
    assert.equal(ignoredBuilds(step.output), '');
    enable('deepseekbot');
    const legacy = await boot({
      dsh,
      runtime,
      env,
      port,
      log: join(root, 'legacy-boot.private.log'),
    });
    try {
      const bot = (
        await legacy.rpc('create', {
          displayName: 'Existing upgrade Bot',
          description: 'Retained legacy configuration',
          roles: ['migration-qa'],
          workspaces: [userHome],
          persona: 'Preserve this legacy persona through the Tobs migration.',
          coreMemory: 'The migration acceptance marker is retained-memory-150.',
        })
      ).bot;
      const dm = await legacy.rpc('channelDm', { slug: bot.slug });
      const message = (
        await legacy.rpc('channelSend', {
          channelId: dm.channel.id,
          body: 'Historical message created before installing Tobs 1.5.0.',
        })
      ).message;
      await legacy.rpc('pause', { slug: bot.slug });
      const detail = (await legacy.rpc('get', { slug: bot.slug })).bot;
      preserved = {
        slug: bot.slug,
        channelId: dm.channel.id,
        message,
        configuration: Object.fromEntries(
          [
            'displayName',
            'description',
            'roles',
            'workspaces',
            'standingLimits',
            'approvalTemplate',
            'paused',
            'memoryDir',
          ].map((key) => [key, detail[key]]),
        ),
        memories: await Promise.all(
          ['SOUL.md', 'MEMORY.md'].map(async (path) => {
            const result = await legacy.rpc('memoryFile', { channelId: dm.channel.id, path });
            assert.ok(result.file?.body, `Legacy ${path} must contain fixture data`);
            return { path, body: result.file.body };
          }),
        ),
      };
    } finally {
      await legacy.stop();
    }
  }
  if (upgradeFrom && productName === 'tobs') {
    step = run(dsh, ['plugin', '--profile', 'qa', 'remove', 'deepseekbot'], { cwd: runtime, env });
    writeFileSync(join(root, 'legacy-remove.private.log'), step.output, { mode: 0o600 });
    assert.equal(step.status, 0, 'The old product could not be removed');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.dependencies?.deepseekbot, undefined);
    manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(
      (name) => name !== 'deepseekbot',
    );
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const workspace = join(profile, 'pnpm-workspace.yaml');
  const overrides = Object.entries(
    freshProfileOverrides(artifacts, upgradeFrom ? 'tobs' : productName),
  )
    .map(([name, spec]) => `  '${name}': '${spec}'\n`)
    .join('');
  writeFileSync(
    workspace,
    `${existsSync(workspace) ? readFileSync(workspace, 'utf8') : ''}\noverrides:\n${overrides}`,
  );
  const product = artifacts.artifacts.find((artifact) => artifact.name === productName);
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
  enable(productName);
  if (upgradeFrom && productName === 'deepseekbot') {
    const alias = artifacts.artifacts.find((artifact) => artifact.name === 'tobs');
    step = run(
      dsh,
      ['plugin', '--profile', 'qa', 'add', join(artifacts.directory, alias.filename)],
      { cwd: runtime, env },
    );
    writeFileSync(join(root, 'alias-install.private.log'), step.output, { mode: 0o600 });
    assert.equal(step.status, 0, 'Tobs command did not install alongside the legacy Bundle');
    assert.equal(ignoredBuilds(step.output), '');
    assert.equal(
      JSON.parse(readFileSync(manifestPath, 'utf8')).dsh.profile.bundles.includes('tobs'),
      false,
      'Existing Profile must retain only the legacy product Bundle',
    );
  }
  const verifyPreserved = async (
    host,
    expectedDescription = preserved?.configuration.description,
  ) => {
    if (!preserved) return;
    assert.equal(
      (await host.rpc('channelDm', { slug: preserved.slug })).channel.id,
      preserved.channelId,
    );
    const detail = (await host.rpc('get', { slug: preserved.slug })).bot;
    for (const [key, value] of Object.entries(preserved.configuration))
      assert.deepEqual(
        detail[key],
        key === 'description' ? expectedDescription : value,
        `Retain Bot ${key}`,
      );
    const messages = (await host.rpc('channelMessages', { channelId: preserved.channelId }))
      .messages;
    assert.equal(
      messages.find((message) => message.id === preserved.message.id)?.body,
      preserved.message.body,
    );
    for (const memory of preserved.memories)
      assert.equal(
        (await host.rpc('memoryFile', { channelId: preserved.channelId, path: memory.path })).file
          ?.body,
        memory.body,
      );
    if (productName === 'tobs') {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      assert.equal(manifest.dependencies?.deepseekbot, undefined);
      assert.equal(manifest.dsh.profile.bundles.includes('deepseekbot'), false);
      assert.equal(manifest.dsh.profile.bundles.filter((name) => name === 'tobs').length, 1);
    }
  };
  const first = await boot({ dsh, runtime, env, port, log: join(root, 'boot-1.private.log') });
  let slug;
  try {
    const bot = preserved ?? (await first.rpc('create', { displayName: 'Fresh install Bot' })).bot;
    const dm = await first.rpc('channelDm', { slug: bot.slug });
    assert.ok(dm.channel.id);
    slug = bot.slug;
    await verifyPreserved(first);
    if (preserved) {
      assert.equal(dm.channel.id, preserved.channelId, 'Upgrade must retain the existing DM');
      const cli = (name, args, expected = 0, token = first.token) => {
        const result = run(
          join(profile, 'node_modules/.bin', name),
          [...args, '--host', first.base],
          {
            cwd: runtime,
            env: { ...env, DEEPSEEKBOT_HOST_TOKEN: token },
          },
        );
        assert.equal(result.status, expected, `${name} ${args[0]} exit code differs`);
        return JSON.parse(result.stdout);
      };
      assert.ok(JSON.stringify(cli('tobs', ['show', slug])).includes(slug));
      const update = (name, description) => {
        const observed = cli(name, ['show', slug]);
        assert.ok(observed.profileFingerprint);
        return cli(name, [
          'update',
          slug,
          '--description',
          description,
          '--expected-profile',
          observed.profileFingerprint,
        ]);
      };
      if (productName === 'deepseekbot') {
        assert.deepEqual(cli('tobs', ['list']), cli('deepseekbot', ['list']));
        update('tobs', 'Updated through Tobs');
        assert.match(JSON.stringify(cli('deepseekbot', ['show', slug])), /Updated through Tobs/u);
        update('deepseekbot', 'Updated through legacy');
        assert.match(JSON.stringify(cli('tobs', ['show', slug])), /Updated through legacy/u);
        const refused = cli('tobs', ['list'], 1, 'invalid-qualification-token');
        assert.equal(refused.error.code, 'host-unauthorized');
        assert.deepEqual(refused, cli('deepseekbot', ['list'], 1, 'invalid-qualification-token'));
      } else {
        update('tobs', 'Updated after Bundle replacement');
        assert.match(
          JSON.stringify(cli('tobs', ['show', slug])),
          /Updated after Bundle replacement/u,
        );
        assert.equal(
          cli('tobs', ['list'], 1, 'invalid-qualification-token').error.code,
          'host-unauthorized',
        );
      }
    }
  } finally {
    await first.stop();
  }
  const second = await boot({ dsh, runtime, env, port, log: join(root, 'boot-2.private.log') });
  try {
    assert.ok((await second.rpc('list')).bots.some((bot) => bot.slug === slug));
    await verifyPreserved(
      second,
      productName === 'deepseekbot' ? 'Updated through legacy' : 'Updated after Bundle replacement',
    );
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
      'Fresh Profiles plus published 1.4.1 upgrade and old Bundle removal/Tobs installation in the same Profile: preserve Bot configuration, DM identity/history and SOUL/MEMORY across restart; CLI cross-writes and unauthorized refusal parity. Browser, model and IM delivery are separate gates.',
    rows: [
      ...productDshVersions.flatMap((dsh) =>
        ['deepseekbot', 'tobs'].map((productName) => ({ dsh, productName, state: 'pending' })),
      ),
      { dsh: '0.2.1-rc.2', productName: 'deepseekbot', upgradeFrom: '1.4.1', state: 'pending' },
      { dsh: '0.2.1-rc.2', productName: 'tobs', upgradeFrom: '1.4.1', state: 'pending' },
    ],
  };
  for (const [index, row] of report.rows.entries()) {
    try {
      await qualify(
        artifacts,
        row.dsh,
        join(output, `${row.productName}-dsh-${row.dsh}${row.upgradeFrom ? '-upgrade' : ''}`),
        32980 + index,
        row.productName,
        row.upgradeFrom,
      );
      row.state = 'passed';
    } catch (error) {
      row.state = 'failed';
      row.error = error instanceof Error ? error.message : 'Install qualification failed';
    }
    writeFileSync(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  for (const row of report.rows)
    console.log(
      `${row.productName} / DSH ${row.dsh}: ${row.state}${row.error ? ` (${row.error})` : ''}`,
    );
  if (report.rows.some((row) => row.state === 'failed')) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
