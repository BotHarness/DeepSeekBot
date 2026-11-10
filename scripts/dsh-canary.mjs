#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { processIsRunning } from './dev-instance-lifecycle.mjs';
import { assertDshVersion } from './dsh-compatibility.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_TAGS = 'https://registry.npmjs.org/-/package/@deepseek-ai/dsh/dist-tags';
export const SETUP_PASSED_CODES = new Set([
  'MISSING_CREDENTIAL',
  'INVALID_CREDENTIAL',
  'AUTH',
  'QUOTA',
]);
const DEGRADED = 'botharness.host_capability.degraded ';

function usage() {
  return [
    'Usage: node scripts/dsh-canary.mjs resolve [--tag next]',
    '       node scripts/dsh-canary.mjs run [--dsh-version <version> | --tag next] [--timeout <seconds>]',
  ].join('\n');
}

export function parseCanaryArgs(argv) {
  const [action, ...rest] = argv;
  if (action !== 'resolve' && action !== 'run') throw new Error(usage());
  const options = { action, tag: 'next', version: undefined, timeoutSeconds: 180 };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (value === undefined) throw new Error(`${flag} needs a value\n${usage()}`);
    if (flag === '--tag') options.tag = value;
    else if (flag === '--dsh-version' && action === 'run') options.version = value;
    else if (flag === '--timeout' && action === 'run') options.timeoutSeconds = Number(value);
    else throw new Error(`unknown option ${flag}\n${usage()}`);
    index += 1;
  }
  if (!Number.isInteger(options.timeoutSeconds) || options.timeoutSeconds <= 0)
    throw new Error('--timeout must be a positive whole number of seconds');
  return options;
}

export async function resolveDshTag(tag, fetchImpl = fetch) {
  const response = await fetchImpl(DIST_TAGS, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`npm dist-tags lookup failed: HTTP ${response.status}`);
  const tags = await response.json();
  const version = tags?.[tag];
  if (typeof version !== 'string') throw new Error(`DSH has no "${tag}" dist-tag`);
  return assertDshVersion(version);
}

export function classifyTurn(allMessages, botSlug, earlier) {
  const messages = allMessages.filter((message) => !earlier.has(message.id));
  const failed = messages.find((message) => message.sessionFailure !== undefined);
  if (failed !== undefined) {
    const { code, detail } = failed.sessionFailure;
    if (code !== undefined && SETUP_PASSED_CODES.has(code))
      return { state: 'pass', evidence: `turn reached the model and stopped at ${code}` };
    return { state: 'fail', evidence: `${code ?? 'no code'}: ${detail ?? ''}`.trim() };
  }
  const reply = messages.find(
    (message) => message.author?.kind === 'bot' && message.author.slug === botSlug,
  );
  if (reply !== undefined) return { state: 'pass', evidence: 'Bot replied' };
  return { state: 'pending' };
}

export function degradedCapabilities(entries) {
  return [
    ...new Set(
      entries
        .map((entry) => entry.code)
        .filter((code) => typeof code === 'string' && code.startsWith(DEGRADED)),
    ),
  ];
}

function diagnosticEntries(home) {
  const result = spawnSync(
    process.execPath,
    [
      join(root, 'packages', 'deepseekbot', 'dist', 'deepseekbot.mjs'),
      'diagnostic-logs',
      '--offline',
      '--home',
      home,
      '--kind',
      'all',
      '--limit',
      '1000',
    ],
    { cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
  );
  if (result.error !== undefined || result.status !== 0)
    throw new Error(`diagnostic-logs failed (exit ${result.status})`);
  return JSON.parse(result.stdout).entries ?? [];
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  await new Promise((resolveClose) => server.close(resolveClose));
  if (address === null || typeof address === 'string') throw new Error('No local port');
  return address.port;
}

function launch(home, port, version) {
  const result = spawnSync(
    process.execPath,
    [
      join(root, 'scripts', 'dev-instance.mjs'),
      '--home',
      home,
      '--port',
      String(port),
      '--dsh-version',
      version,
      '--build',
      '--json',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 900_000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.error !== undefined || result.status !== 0) {
    const detail = (result.stderr ?? result.error?.message ?? 'unknown error')
      .replace(/\?token=[^\s]+/gu, '?token=<redacted>')
      .trim()
      .slice(-1500);
    throw new Error(`DSH ${version} Host did not start (exit ${result.status}): ${detail}`);
  }
  return JSON.parse(result.stdout);
}

function rpcClient(port, home) {
  const cookieFile = join(
    tmpdir(),
    `dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`,
  );
  return async (method, args = {}) => {
    const cookie = readFileSync(cookieFile, 'utf8').split(';')[0];
    const response = await fetch(`http://127.0.0.1:${port}/api/botharness/${method}`, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: `dsh-canary-${method}-${Date.now()}`,
        method: `botharness/${method}`,
        payload: { args },
      }),
    });
    const envelope = await response.json();
    if (response.status !== 200 || envelope.result?.ok !== true)
      throw new Error(
        `botharness/${method} failed: HTTP ${response.status}, ${envelope.result?.error?.code ?? 'unknown'}`,
      );
    return envelope.result.value;
  };
}

function stop(pid) {
  if (pid === undefined) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function stopAndWait(pid) {
  stop(pid);
  const deadline = Date.now() + 20_000;
  while (processIsRunning(pid)) {
    if (Date.now() > deadline) throw new Error('Canary Host did not stop');
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
}

async function run(options) {
  const version = options.version ?? (await resolveDshTag(options.tag));
  assertDshVersion(version);
  const home = mkdtempSync(join(tmpdir(), 'bh-dsh-canary-'));
  const port = await availablePort();
  let instance;
  const report = { dsh: version, steps: [], degraded: [] };
  try {
    instance = launch(home, port, version);
    report.model = instance.secret;
    report.steps.push('Host started with the Tobs Bundle');
    const rpc = rpcClient(port, home);
    const created = await rpc('create', { displayName: `DSH canary ${Date.now()}` });
    const slug = created.bot?.slug;
    if (typeof slug !== 'string') throw new Error('Bot creation returned no slug');
    const dm = await rpc('channelDm', { slug, displayName: created.bot.displayName });
    const channelId = dm.channel?.id;
    if (typeof channelId !== 'string') throw new Error('Bot DM is unavailable');
    report.steps.push('Bot and DM created');
    const earlier = new Set(
      (await rpc('channelMessages', { channelId })).messages.map((message) => message.id),
    );
    const sent = await rpc('channelSend', { channelId, body: 'DSH canary: reply with OK.' });
    if (typeof sent.message?.id !== 'string') throw new Error('DM send returned no message id');
    earlier.add(sent.message.id);
    const deadline = Date.now() + options.timeoutSeconds * 1000;
    let outcome = { state: 'pending' };
    while (outcome.state === 'pending' && Date.now() < deadline) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
      const { messages } = await rpc('channelMessages', { channelId });
      outcome = classifyTurn(messages, slug, earlier);
    }
    if (outcome.state === 'pending')
      outcome = {
        state: 'fail',
        evidence: `no Bot turn outcome within ${options.timeoutSeconds}s`,
      };
    report.steps.push(`Orchestrator turn: ${outcome.evidence}`);
    await stopAndWait(instance.pid);
    instance = undefined;
    report.degraded = degradedCapabilities(diagnosticEntries(home));
    report.ok = outcome.state === 'pass' && report.degraded.length === 0;
  } catch (error) {
    report.ok = false;
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    stop(instance?.pid);
    if (report.ok) rmSync(home, { recursive: true, force: true });
    else report.retainedHome = home;
  }
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const options = parseCanaryArgs(process.argv.slice(2));
    if (options.action === 'resolve') {
      console.log(JSON.stringify({ tag: options.tag, dsh: await resolveDshTag(options.tag) }));
    } else {
      const report = await run(options);
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
