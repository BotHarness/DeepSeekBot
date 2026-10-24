import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { verifiedProductArtifacts } from './packaged-profile.mjs';

const artifacts = verifiedProductArtifacts(resolve(process.argv[2]));
const reportPath = resolve(process.argv[3]);
const temporary = mkdtempSync(join(tmpdir(), 'tobs-commands-'));
const prefix = join(temporary, 'prefix');
const cache = join(temporary, 'cache');
const home = join(temporary, 'home');
mkdirSync(home);
const report = { version: artifacts.productVersion, platform: process.platform, checks: [] };
const packages = new Map(
  [...artifacts.artifacts, ...artifacts.platformArtifacts].map((entry) => [
    entry.name,
    {
      entry,
      manifest: JSON.parse(
        execFileSync(
          'tar',
          ['-xOf', join(artifacts.directory, entry.filename), 'package/package.json'],
          { encoding: 'utf8' },
        ),
      ),
    },
  ]),
);
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const name = decodeURIComponent(url.pathname.slice(1));
  const item = packages.get(name);
  if (item) {
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        name,
        'dist-tags': { latest: item.entry.version },
        versions: {
          [item.entry.version]: {
            ...item.manifest,
            dist: {
              integrity: item.entry.integrity,
              tarball: `http://127.0.0.1:${server.address().port}/artifacts/${item.entry.filename}`,
            },
          },
        },
      }),
    );
    return;
  }
  const archive = [...packages.values()].find(
    ({ entry }) => name === `artifacts/${entry.filename}`,
  );
  if (archive) {
    response.end(readFileSync(join(artifacts.directory, archive.entry.filename)));
    return;
  }
  response.writeHead(302, { location: `https://registry.npmjs.org${url.pathname}${url.search}` });
  response.end();
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const registry = `http://127.0.0.1:${server.address().port}`;
const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  npm_config_registry: registry,
  npm_config_cache: cache,
  npm_config_prefix: prefix,
  npm_config_userconfig: join(temporary, 'empty.npmrc'),
  npm_config_ignore_scripts: 'true',
  npm_config_legacy_peer_deps: 'true',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
};
for (const key of Object.keys(env)) {
  if (/TOKEN|SECRET|PASSWORD|NODE_AUTH|NODE_PATH|DEEPSEEKBOT_HOST/iu.test(key)) delete env[key];
}
writeFileSync(env.npm_config_userconfig, '');
async function run(command, args, expected = 0) {
  const windows = process.platform === 'win32';
  const shim = windows && command !== 'npm';
  if (shim) assert.ok(args.every((arg) => /^[a-z-]+$/u.test(arg)));
  const executable = windows
    ? shim
      ? (process.env.ComSpec ?? 'cmd.exe')
      : process.execPath
    : command;
  const parameters = windows
    ? shim
      ? ['/d', '/s', '/c', `""%TOBS_QA_COMMAND%" ${args.join(' ')}"`]
      : [join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...args]
    : args;
  const child = spawn(executable, parameters, {
    cwd: temporary,
    env: shim ? { ...env, TOBS_QA_COMMAND: command } : env,
    windowsVerbatimArguments: shim,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  const code = await new Promise((done, reject) => {
    child.on('error', reject);
    child.on('close', done);
  });
  const result = {
    stdout: Buffer.concat(stdout).toString(),
    stderr: Buffer.concat(stderr)
      .toString()
      .replace(/\(node:\d+\)/gu, '(node:PID)'),
  };
  const text = result.stdout + result.stderr;
  assert.equal(code, expected, `${command} ${args.join(' ')} failed: ${text.slice(-2000)}`);
  return result;
}
const bin = (name) => join(prefix, process.platform === 'win32' ? `${name}.cmd` : `bin/${name}`);
async function help(name) {
  const { stdout: output } = await run(bin(name), ['--help']);
  assert.match(output, /tobs: manage your Bots/u);
  return output;
}
try {
  const version = artifacts.productVersion;
  await run('npm', ['install', '-g', `tobs@${version}`]);
  const baseline = await help('tobs');
  report.checks.push('new global Tobs installation');
  await run('npm', ['install', '-g', `deepseekbot@${version}`]);
  assert.equal(await help('deepseekbot'), baseline);
  assert.equal(await help('tobs'), baseline);
  report.checks.push('same-version global coexistence and help parity');
  const errorA = await run(bin('tobs'), ['not-a-command'], 2);
  const errorB = await run(bin('deepseekbot'), ['not-a-command'], 2);
  assert.deepEqual(errorA, errorB);
  report.checks.push('coded refusal and exit-code parity');
  await run('npm', ['uninstall', '-g', 'deepseekbot']);
  assert.equal(await help('tobs'), baseline);
  report.checks.push('uninstall legacy preserves Tobs');
  await run('npm', ['install', '-g', `deepseekbot@${version}`]);
  await run('npm', ['uninstall', '-g', 'tobs']);
  assert.equal(await help('deepseekbot'), baseline);
  report.checks.push('uninstall Tobs preserves legacy');
  for (const name of ['deepseekbot', 'tobs']) {
    const { stdout: output } = await run('npm', [
      'exec',
      '--yes',
      `--package=${name}@${version}`,
      '--',
      name,
      '--help',
    ]);
    assert.ok(output.endsWith(baseline));
  }
  report.checks.push('npm exec / npx package entry points');
  report.state = 'passed';
} catch (error) {
  report.state = 'failed';
  report.error = error.message;
  process.exitCode = 1;
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  mkdirSync(join(reportPath, '..'), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  rmSync(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 2));
