import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { prepareZipImportProof } from './e2e-zip-import-proof.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const helper = join(root, 'scripts', 'dev-instance.mjs');
const withDm = process.argv.includes('--with-dm');
const home = mkdtempSync(join(tmpdir(), 'bh-e2e-web-'));
const workspacePath = join(home, 'workspace');
const expectedVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  .devDependencies['@deepseek-ai/dsh'];
const env = {
  ...process.env,
  PATH: [join(root, 'node_modules', '.bin'), process.env.PATH ?? ''].join(delimiter),
};

function dshVersion() {
  const result = spawnSync('dsh', ['--version'], { cwd: root, env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Installed DSH CLI is unavailable');
  const version = result.stdout.trim();
  if (version !== expectedVersion) {
    throw new Error(`Expected DSH ${expectedVersion}, found ${version}`);
  }
  return version;
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No local port');
  await new Promise((resolveClose) => server.close(resolveClose));
  return address.port;
}

function launch(port, build) {
  const args = [helper, '--home', home, '--port', String(port), '--json'];
  if (build) args.push('--build');
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 600_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error !== undefined || result.status !== 0) {
    const detail = (result.stderr ?? result.error?.message ?? 'unknown error')
      .replace(/\?token=[^\s]+/gu, '?token=<redacted>')
      .trim()
      .slice(-800);
    throw new Error(`Isolated DSH launch failed (exit ${result.status ?? 'unknown'}): ${detail}`);
  }
  const instance = JSON.parse(result.stdout);
  if (instance.health?.ok !== true || !Number.isInteger(instance.pid)) {
    throw new Error('Isolated DSH Host did not pass the authenticated health probe');
  }
  return instance;
}

function cookie() {
  const file = join(tmpdir(), `dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`);
  const value = readFileSync(file, 'utf8').split(';')[0];
  if (!value.includes('=')) throw new Error('DSH authentication cookie is unavailable');
  return value;
}

async function rpc(port, namespace, method, args = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/${namespace}/${method}`, {
    signal: AbortSignal.timeout(10_000),
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookie() },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `e2e-create-${namespace}-${method}`,
      method: `${namespace}/${method}`,
      payload: { args },
    }),
  });
  const envelope = await response.json();
  if (response.status !== 200 || envelope.result?.ok !== true) {
    const code = envelope.result?.error?.code ?? 'unknown';
    throw new Error(`${namespace}/${method} failed: HTTP ${response.status}, ${code}`);
  }
  return envelope.result.value;
}

function creationCli(instance, command, input) {
  const login = new URL(instance.url);
  const token = login.searchParams.get('token');
  if (!token) throw new Error('Isolated Host login token is unavailable');
  const result = spawnSync(
    process.execPath,
    [
      join(root, 'packages', 'deepseekbot', 'dist', 'deepseekbot.mjs'),
      command,
      '--host',
      login.origin,
      '--timeout',
      '30',
      '--name',
      input.displayName,
      ...(input.gitUrl
        ? ['--from-git', input.gitUrl, '--expected-commit', input.expectedCommit]
        : ['--persona', input.persona]),
      '--description',
      input.description,
      '--role',
      input.roles[0],
      '--operation-key',
      input.operationKey,
    ],
    {
      cwd: root,
      env: { ...env, DEEPSEEKBOT_HOST_TOKEN: token },
      encoding: 'utf8',
      timeout: 45_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.error !== undefined || result.status !== 0)
    throw new Error(
      'Creation CLI ' + command + ' failed (exit ' + (result.status ?? 'unknown') + ')',
    );
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error('Creation CLI did not return one JSON document');
  }
}

function gitPreviewCli(instance, gitUrl) {
  const login = new URL(instance.url);
  const token = login.searchParams.get('token');
  if (!token) throw new Error('Isolated Host login token is unavailable');
  const result = spawnSync(
    process.execPath,
    [
      join(root, 'packages', 'deepseekbot', 'dist', 'deepseekbot.mjs'),
      'bot-import-preview',
      '--host',
      login.origin,
      '--from-git',
      gitUrl,
    ],
    {
      cwd: root,
      env: { ...env, DEEPSEEKBOT_HOST_TOKEN: token },
      encoding: 'utf8',
      timeout: 45000,
      windowsHide: true,
    },
  );
  if (result.status !== 0) throw new Error('Git source CLI inspection failed');
  return JSON.parse(result.stdout);
}

function sameReceipt(actual, expected) {
  if (
    actual?.operationKey !== expected.operationKey ||
    actual?.botSlug !== expected.botSlug ||
    actual?.status !== 'created' ||
    actual?.channelId !== expected.channelId
  )
    throw new Error('Creation recovery changed the original Bot or DM receipt');
}

async function creationCounts(port) {
  const [bots, channels] = await Promise.all([
    rpc(port, 'botharness', 'list'),
    rpc(port, 'botharness', 'channels'),
  ]);
  return { bots: bots.bots, channels: channels.channels };
}

async function verifyOneCreation(port, baseline, receipt, input) {
  const current = await creationCounts(port);
  if (
    current.bots.length !== baseline.bots.length + 1 ||
    current.channels.length !== baseline.channels.length + 1 ||
    current.bots.filter(
      (bot) => bot.slug === receipt.botSlug && bot.displayName === input.displayName,
    ).length !== 1 ||
    current.channels.filter(
      (channel) =>
        channel.id === receipt.channelId &&
        channel.type === 'dm' &&
        channel.botSlug === receipt.botSlug,
    ).length !== 1
  )
    throw new Error('Creation retry did not preserve exactly one new Bot and its DM');
}

async function waitForStop(port) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) });
    } catch {
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('Isolated DSH Host did not stop');
}

function stop(pid) {
  if (pid === undefined) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

let pid;
const version = dshVersion();
const port = await availablePort();
try {
  mkdirSync(workspacePath);
  const gitSource = join(home, 'git-source');
  mkdirSync(gitSource);
  const git = (...args) =>
    execFileSync('git', ['-C', gitSource, ...args], { encoding: 'utf8', windowsHide: true }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Import QA');
  git('config', 'user.email', 'import@example.test');
  writeFileSync(join(gitSource, 'SOUL.md'), 'Immutable imported persona.');
  git('add', '.');
  git('commit', '--quiet', '-m', 'source fixture');
  const sourceCommit = git('rev-parse', 'HEAD');
  const gitUrl = 'https://import-fixture.example/source.git';
  const rewriteIndex = Number(env.GIT_CONFIG_COUNT ?? 0);
  env.GIT_CONFIG_COUNT = String(rewriteIndex + 1);
  env['GIT_CONFIG_KEY_' + rewriteIndex] = 'url.' + gitSource.replaceAll('\\', '/') + '/.insteadOf';
  env['GIT_CONFIG_VALUE_' + rewriteIndex] = gitUrl;
  const first = launch(port, true);
  pid = first.pid;

  const native = await rpc(port, 'workspace', 'create', { request: { path: workspacePath } });
  const workspaceId = native.workspace?.workspaceId;
  if (typeof workspaceId !== 'string') throw new Error('Native Workspace has no id');
  const options = await rpc(port, 'botharness', 'workspaceOptions');
  if (!options.workspaces.some((entry) => entry.id === workspaceId)) {
    throw new Error('Native Workspace is absent from BotHarness Workspace options');
  }

  const displayName = `Web QA ${Date.now()}`;
  const created = await rpc(port, 'botharness', 'create', {
    displayName,
    roles: ['research'],
    workspaces: [workspaceId],
  });
  const slug = created.bot?.slug;
  if (typeof slug !== 'string') throw new Error('PersonaBot creation returned no slug');
  const dm = await rpc(port, 'botharness', 'channelDm', { slug, displayName });
  const channelId = dm.channel?.id;
  if (typeof channelId !== 'string') throw new Error('PersonaBot DM Channel is unavailable');
  const before = await rpc(port, 'botharness', 'memorySnapshot', { channelId });
  const head = before.snapshot?.head;
  if (typeof head !== 'string' || !/^[0-9a-f]{40}$/u.test(head)) {
    throw new Error('Git Memory Repository has no accepted HEAD');
  }

  const dmBody = `Web DM restart check ${Date.now()}`;
  let sentMessageId;
  if (withDm) {
    const sent = await rpc(port, 'botharness', 'channelSend', { channelId, body: dmBody });
    sentMessageId = sent.message?.id;
    if (typeof sentMessageId !== 'string') throw new Error('DM send returned no message id');
    const history = await rpc(port, 'botharness', 'channelTimeline', { channelId });
    if (
      history.page.entries.filter(
        (entry) =>
          entry.id === sentMessageId && entry.body === dmBody && entry.author.kind === 'human',
      ).length !== 1
    ) {
      throw new Error('DM send did not commit exactly one Human message');
    }
  }

  const creationInput = {
    operationKey: 'e2e-blank-create-001',
    displayName: 'Blank recovery QA',
    persona: 'Keep replies short.',
    description: 'Creation recovery check',
    roles: ['qa'],
  };
  const creationBaseline = await creationCounts(port);
  const missing = await rpc(port, 'botharness', 'createLookup', creationInput);
  const missingCli = creationCli(first, 'create-status', creationInput);
  const afterLookup = await creationCounts(port);
  if (
    missing.receipt !== null ||
    missingCli.receipt !== null ||
    afterLookup.bots.length !== creationBaseline.bots.length ||
    afterLookup.channels.length !== creationBaseline.channels.length
  )
    throw new Error('Creation lookup mutated a previously absent operation');

  await rpc(port, 'botharness', 'create', creationInput);
  const recovered = await rpc(port, 'botharness', 'createLookup', creationInput);
  const receipt = recovered.receipt;
  if (
    receipt?.operationKey !== creationInput.operationKey ||
    receipt.status !== 'created' ||
    typeof receipt.botSlug !== 'string' ||
    typeof receipt.channelId !== 'string'
  )
    throw new Error('The Host did not return a completed blank creation receipt');
  sameReceipt(creationCli(first, 'create-status', creationInput).receipt, receipt);
  const retried = creationCli(first, 'create', creationInput);
  sameReceipt(retried.operation, receipt);
  if (retried.bot?.id !== receipt.botSlug || retried.dm?.channelId !== receipt.channelId)
    throw new Error('Creation CLI returned a different Bot or DM');
  await verifyOneCreation(port, creationBaseline, receipt, creationInput);

  const gitInput = {
    operationKey: 'e2e-git-import-001',
    displayName: 'Git recovery QA',
    gitUrl,
    expectedCommit: sourceCommit,
    description: 'Pinned Git source',
    roles: ['qa'],
  };
  const gitBaseline = await creationCounts(port);
  const gitPreview = gitPreviewCli(first, gitUrl);
  if (gitPreview.source?.commit !== sourceCommit || gitPreview.source?.gitUrl !== gitUrl)
    throw new Error('Git preview changed selected source');
  const gitMissing = await rpc(port, 'botharness', 'botImportLookup', gitInput);
  if (gitMissing.receipt !== null || creationCli(first, 'create-status', gitInput).receipt !== null)
    throw new Error('Unexpected existing Git operation');
  await rpc(port, 'botharness', 'createFromGit', gitInput);
  const gitReceipt = (await rpc(port, 'botharness', 'botImportLookup', gitInput)).receipt;
  if (gitReceipt?.status !== 'created') throw new Error('Missing completed Git receipt');
  const importedDetail = await rpc(port, 'botharness', 'get', { slug: gitReceipt.botSlug });
  if (
    readFileSync(join(importedDetail.bot.memoryDir, 'SOUL.md'), 'utf8') !==
    'Immutable imported persona.'
  )
    throw new Error('Git import changed the selected personality');
  sameReceipt(creationCli(first, 'create', gitInput).operation, gitReceipt);
  await verifyOneCreation(port, gitBaseline, gitReceipt, gitInput);
  writeFileSync(join(gitSource, 'SOUL.md'), 'Remote source changed after accepted import.');
  git('add', '.');
  git('commit', '--quiet', '-m', 'move remote HEAD');
  const staleInput = { ...gitInput, operationKey: 'e2e-git-stale-source-001' };
  let staleRefused = false;
  try {
    await rpc(port, 'botharness', 'createFromGit', staleInput);
  } catch (error) {
    staleRefused = error instanceof Error && error.message.endsWith('git-source-changed');
  }
  if (!staleRefused) throw new Error('Changed Git source was not refused');
  const completeBaseline = await creationCounts(port);
  if (
    completeBaseline.bots.length !== gitBaseline.bots.length + 1 ||
    completeBaseline.channels.length !== gitBaseline.channels.length + 1
  )
    throw new Error('Stale source published a Bot or DM');

  const zipProof = await prepareZipImportProof({
    root,
    home,
    port,
    sourceSlug: receipt.botSlug,
    rpc,
    cookie,
    env,
  });

  stop(pid);
  await waitForStop(port);
  pid = undefined;
  const restarted = launch(port, false);
  pid = restarted.pid;

  sameReceipt((await rpc(port, 'botharness', 'createLookup', creationInput)).receipt, receipt);
  sameReceipt(creationCli(restarted, 'create-status', creationInput).receipt, receipt);
  sameReceipt(creationCli(restarted, 'create', creationInput).operation, receipt);
  sameReceipt((await rpc(port, 'botharness', 'botImportLookup', gitInput)).receipt, gitReceipt);
  sameReceipt(creationCli(restarted, 'create-status', gitInput).receipt, gitReceipt);
  sameReceipt(creationCli(restarted, 'create', gitInput).operation, gitReceipt);
  if (
    readFileSync(join(importedDetail.bot.memoryDir, 'SOUL.md'), 'utf8') !==
    'Immutable imported persona.'
  )
    throw new Error('Git recovery replaced imported personality with changed remote source');
  const afterRecovery = await creationCounts(port);
  if (
    afterRecovery.bots.length !== completeBaseline.bots.length ||
    afterRecovery.channels.length !== completeBaseline.channels.length
  )
    throw new Error('Restart recovery duplicated a Bot or DM');

  const zipImported = await zipProof.finishAfterUploadRestart(restarted);
  stop(pid);
  await waitForStop(port);
  pid = undefined;
  const zipRestarted = launch(port, false);
  pid = zipRestarted.pid;
  await zipImported.verifyAfterImportRestart(zipRestarted);

  const list = await rpc(port, 'botharness', 'list');
  const read = await rpc(port, 'botharness', 'get', { slug });
  const after = await rpc(port, 'botharness', 'memorySnapshot', { channelId });
  if (!list.bots.some((bot) => bot.slug === slug))
    throw new Error('PersonaBot missing after restart');
  if (read.bot?.displayName !== displayName || !read.bot.workspaces.includes(workspaceId)) {
    throw new Error('PersonaBot identity or Workspace changed after restart');
  }
  if (after.snapshot?.head !== head) throw new Error('Memory HEAD changed after restart');
  if (withDm) {
    const history = await rpc(port, 'botharness', 'channelTimeline', { channelId });
    if (
      history.page.entries.filter(
        (entry) =>
          entry.id === sentMessageId && entry.body === dmBody && entry.author.kind === 'human',
      ).length !== 1
    ) {
      throw new Error('Committed DM Human message missing or duplicated after restart');
    }
  }
  if (typeof read.bot.memoryDir !== 'string') throw new Error('Memory Repository path unavailable');
  const gitHead = execFileSync('git', ['-C', read.bot.memoryDir, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (gitHead !== head) throw new Error('Git HEAD differs from the public Memory snapshot');

  console.log(
    JSON.stringify({
      version,
      result: 'pass',
      workspaceCreated: true,
      personaBotCreated: true,
      persistedAfterRestart: true,
      gitMemoryReady: true,
      blankCreationLookup: true,
      blankCreationCli: true,
      blankCreationRetry: true,
      blankCreationAfterRestart: true,
      gitImportPreview: true,
      gitImportCliRecovery: true,
      gitImportAfterRestart: true,
      zipUploadAfterRestart: true,
      zipImportCliRecovery: true,
      zipImportAfterRestart: true,
      ...(withDm ? { dmHistoryAfterRestart: true } : {}),
    }),
  );
} finally {
  stop(pid);
}
