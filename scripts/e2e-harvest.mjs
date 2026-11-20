import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const helper = join(root, 'scripts', 'dev-instance.mjs');
const keep = process.argv.includes('--keep');
const home = mkdtempSync(join(tmpdir(), 'bh-harvest-web-'));
const env = {
  ...process.env,
  PATH: [join(root, 'node_modules', '.bin'), process.env.PATH ?? ''].join(delimiter),
};
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

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

function launch(port) {
  const result = spawnSync(
    process.execPath,
    [helper, '--home', home, '--port', String(port), '--build', '--json'],
    {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 600_000,
      maxBuffer: 4 * 1024 * 1024,
      shell: false,
      windowsHide: true,
    },
  );
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
    signal: AbortSignal.timeout(15_000),
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookie() },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `e2e-harvest-${namespace}-${method}-${Date.now()}`,
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

async function waitFor(check, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await check();
    if (last !== undefined) return last;
    await sleep(2_000);
  }
  throw new Error(`Timed out waiting for ${label}`);
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
try {
  const port = await availablePort();
  const instance = launch(port);
  pid = instance.pid;
  console.log(`Isolated Host on 127.0.0.1:${port} (home ${home})`);

  const displayName = `Harvest QA ${Date.now()}`;
  const created = await rpc(port, 'botharness', 'create', { displayName });
  const slug = created.bot?.slug;
  if (typeof slug !== 'string') throw new Error('PersonaBot creation returned no slug');
  const group = (
    await rpc(port, 'botharness', 'channelCreate', {
      name: `Harvest ${Date.now()}`,
      members: [slug],
    })
  ).channel;
  if (typeof group?.id !== 'string') throw new Error('Group Channel creation failed');
  await rpc(port, 'botharness', 'channelGroupWakeSet', {
    channelId: group.id,
    botSlug: slug,
    mode: 'digest',
    count: 2,
    intervalSeconds: 60,
  });

  const botReplies = async () => {
    const timeline = await rpc(port, 'botharness', 'channelTimeline', { channelId: group.id });
    return (timeline.page?.entries ?? []).filter((entry) => entry.author?.kind === 'bot');
  };

  const marker = Date.now().toString(36).toUpperCase();
  const alpha = `HARVEST-ALPHA-${marker}`;
  const bravo = `HARVEST-BRAVO-${marker}`;
  await rpc(port, 'botharness', 'channelSend', {
    channelId: group.id,
    body: `请稍后在本群只回复一句话，确认你同时看到了 ${alpha} 与 ${bravo}。${alpha}`,
  });
  await rpc(port, 'botharness', 'channelSend', {
    channelId: group.id,
    body: `第二条：${bravo}`,
  });
  const digestReply = await waitFor(
    async () =>
      (await botReplies()).find(
        (entry) => entry.body.includes(alpha) && entry.body.includes(bravo),
      ),
    180_000,
    'digest harvest reply',
  );
  const afterDigest = await botReplies();
  if (afterDigest.length !== 1) {
    throw new Error(`Digest harvest produced ${afterDigest.length} Bot replies, expected 1`);
  }

  const charlie = `HARVEST-CHARLIE-${marker}`;
  const mentionBody = `@${displayName} 请在本群回复一句包含 ${charlie} 的确认。`;
  await rpc(port, 'botharness', 'channelSend', {
    channelId: group.id,
    body: mentionBody,
    mentions: [{ botSlug: slug, label: displayName, start: 0, end: 1 + displayName.length }],
  });
  const mentionReply = await waitFor(
    async () => (await botReplies()).find((entry) => entry.body.includes(charlie)),
    180_000,
    'mention reply',
  );
  const finalReplies = await botReplies();

  console.log(
    JSON.stringify(
      {
        ok: true,
        slug,
        channelId: group.id,
        digestReply: digestReply.body,
        mentionReply: mentionReply.body,
        botReplyCount: finalReplies.length,
      },
      null,
      2,
    ),
  );
} finally {
  if (!keep) stop(pid);
  console.log(keep ? `Host kept running (pid ${pid}, home ${home})` : 'Host stopped');
}
