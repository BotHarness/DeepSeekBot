import { spawnSync, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { verifyPaths } from './verify-app.mjs';
import { behavior, digest } from './computer-lifecycle-report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[process.argv.indexOf('--name') + 1];
if (!process.argv.includes('--name') || !/^ax1977-[a-z0-9-]+$/u.test(name ?? ''))
  throw new Error('Usage: node scripts/prepare-computer-lifecycle.mjs --name ax1977-<unique-task>');
const paths = verifyPaths(name, root);
const directory = resolve(paths.dir, 'preflight', `attempt-${Date.now()}-${process.pid}`);
mkdirSync(directory, { recursive: true });
const record = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  startedAt: new Date().toISOString(),
  status: 'blocked',
  commands: [],
};
const container = `botharness-${name}`;
const volume = `${container}-config`;
const image = 'lscr.io/linuxserver/webtop:ubuntu-xfce';
function command(bin, args, options = {}) {
  const r = spawnSync(bin, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
  record.commands.push({
    executable: bin === process.execPath ? 'node' : bin,
    args: args.map((s) => s.replaceAll(paths.home, '[isolated-home]')),
    exitCode: r.status,
    error: r.error?.code,
  });
  if (r.status !== 0)
    throw new Error(
      `${bin === process.execPath ? 'node' : bin} ${args[0]} failed: ${(r.stderr ?? '').slice(0, 300).replaceAll(paths.home, '[isolated-home]')}`,
    );
  return r.stdout;
}
async function port() {
  const server = createServer();
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', done);
  });
  const value = server.address().port;
  await new Promise((done) => server.close(done));
  return value;
}
try {
  if (existsSync(paths.home) || existsSync(paths.instance))
    throw new Error('Use a fresh isolated instance name; do not reuse another Profile');
  const version = JSON.parse(command('docker', ['version', '--format', '{{json .}}']));
  record.docker = version;
  if (!version.Server?.Version) throw new Error('Docker Engine unavailable');
  const containers = command('docker', ['container', 'ls', '--all', '--format', '{{.Names}}'])
    .trim()
    .split('\n');
  const volumes = command('docker', ['volume', 'ls', '--format', '{{.Name}}']).trim().split('\n');
  if (containers.includes(container) || volumes.includes(volume))
    throw new Error('Task resource name already exists; do not adopt it');
  const imageId = command('docker', ['image', 'inspect', image, '--format', '{{.Id}}']).trim();
  if (!imageId.startsWith('sha256:'))
    throw new Error(
      'Container image is not already available; ask Human to prepare the existing environment',
    );
  const ownership = {
    taskCreated: true,
    initialContainerAbsent: true,
    initialVolumeAbsent: true,
    name,
    container,
    volume,
    image,
    imageId,
    hostPort: await port(),
    createdAt: new Date().toISOString(),
  };
  mkdirSync(paths.home, { recursive: true });
  command(
    process.execPath,
    [
      'node_modules/@deepseek-ai/dsh/lib/bin.js',
      '--profile',
      'web-dev',
      '--from-default-profile',
      'web',
      '--dump-config',
    ],
    { env: { ...process.env, DSH_HOME: paths.home }, timeout: 120_000 },
  );
  const patch = resolve(paths.home, 'profiles/web-dev/cordis.patch.yml');
  const rows = parse(readFileSync(patch, 'utf8')) ?? [];
  if (!Array.isArray(rows) || rows.some((r) => r.id === 'botharness-computer'))
    throw new Error('Unexpected initial Profile patch; preserve it for inspection');
  rows.push({
    id: 'botharness-computer',
    config: {
      target: 'container',
      containerName: container,
      volumeName: volume,
      image: imageId,
      hostPort: ownership.hostPort,
      resolution: '1280x800',
      dataDir: '',
      autoAllowActions: false,
      idleStopMinutes: 30,
    },
  });
  writeFileSync(patch, stringify(rows), { mode: 0o600 });
  writeFileSync(
    resolve(paths.dir, 'computer-ownership.json'),
    JSON.stringify(ownership, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  const launch = JSON.parse(
    command(process.execPath, ['scripts/verify-app.mjs', 'launch', '--name', name], {
      timeout: 600_000,
    }),
  );
  if (!launch.health?.ok) throw new Error('Isolated Host did not become healthy');
  record.status = 'prepared';
  record.actual =
    'Fresh isolated Profile explicitly targets its own Container Computer; Engine and existing image qualified. No Computer started yet.';
} catch (error) {
  record.reason = error.message;
  process.exitCode = 1;
} finally {
  record.finishedAt = new Date().toISOString();
  record.actual ??= record.reason;
  const bytes = JSON.stringify(record, null, 2) + '\n';
  writeFileSync(resolve(directory, 'preflight.json'), bytes, { mode: 0o600 });
  if (record.status === 'blocked') {
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    writeFileSync(
      resolve(directory, 'run.json'),
      JSON.stringify(
        {
          version: 1,
          behavior,
          commit: record.commit,
          base: git('merge-base', 'HEAD', 'origin/main'),
          dirty: git('status', '--porcelain').length > 0,
          startedAt: record.startedAt,
          finishedAt: record.finishedAt,
          status: 'blocked',
          reason: record.reason,
          expected:
            'Existing Docker Engine and image, fresh isolated Profile and exclusive task resource names',
          actual: record.actual,
          environment: { platform: process.platform, arch: process.arch, node: process.version },
          evidence: { 'preflight.json': digest(bytes) },
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
  }
  console.log(
    JSON.stringify({ status: record.status, reason: record.reason, evidence: directory }, null, 2),
  );
}
