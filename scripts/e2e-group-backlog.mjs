import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const port = Number(process.argv[2]);
const home = process.argv[3];
if (!Number.isSafeInteger(port) || typeof home !== 'string') {
  throw new Error('Usage: node scripts/e2e-group-backlog.mjs <port> <DSH_HOME>');
}
const cookie = readFileSync(
  `/tmp/dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`,
  'utf8',
).split(';')[0];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rpc(method, args = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/botharness/${method}`, {
    signal: AbortSignal.timeout(15_000),
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `backlog-${method}-${Date.now()}`,
      method: `botharness/${method}`,
      payload: { args },
    }),
  });
  const envelope = await response.json();
  if (response.status !== 200 || envelope.result?.ok !== true) {
    throw new Error(
      `${method}: HTTP ${response.status}, ${JSON.stringify(envelope.result?.error)}`,
    );
  }
  return envelope.result.value;
}

async function waitForReply(channelId, marker) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const timeline = await rpc('channelTimeline', { channelId });
    const reply = (timeline.page?.entries ?? []).find(
      (entry) => entry.author?.kind === 'bot' && entry.body.includes(marker),
    );
    if (reply !== undefined) return reply;
    await sleep(2_000);
  }
  throw new Error(`No real Bot reply containing ${marker}`);
}

async function waitForAdmission(slug, marker, state) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    let cursor;
    for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
      const page = await rpc('botAttention', {
        slug,
        state,
        limit: 100,
        ...(cursor === undefined ? {} : { cursor }),
      });
      const item = page.items.find((row) => row.summary?.includes(marker));
      if (item !== undefined) return item;
      cursor = page.nextCursor;
      if (cursor === undefined) break;
    }
    await sleep(500);
  }
  throw new Error(`${marker} did not reach ${state}`);
}

async function findPendingInGroup(slug, channelId, stamp) {
  let cursor;
  for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
    const page = await rpc('botAttention', {
      slug,
      state: 'pending',
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    });
    const item = page.items.find(
      (row) => row.sourceChannelId === channelId && row.summary?.includes(`BACKLOG_${stamp}_`),
    );
    if (item !== undefined) return item;
    cursor = page.nextCursor;
    if (cursor === undefined) break;
  }
  throw new Error('No unselected Group message remained pending');
}

const stamp = Date.now();
const displayName = `BacklogQA-${stamp}`;
const created = await rpc('create', { displayName });
const botSlug = created.bot?.slug;
if (typeof botSlug !== 'string') throw new Error('No Bot slug');
const group = (await rpc('channelCreate', { name: `Backlog QA ${stamp}`, members: [botSlug] }))
  .channel;
if (typeof group?.id !== 'string') throw new Error('No Group Channel ID');
await rpc('channelGroupWakeSet', {
  channelId: group.id,
  botSlug,
  mode: 'mentions',
  count: 5,
  intervalSeconds: 30,
});

const marker = (index) => `BACKLOG_${stamp}_${String(index).padStart(3, '0')}`;
for (let index = 0; index < 110; index += 1) {
  await rpc('channelSend', {
    channelId: group.id,
    body: `待处理的群消息 ${index + 1}。代号 ${marker(index)}。`,
  });
}
await waitForAdmission(botSlug, marker(0), 'pending');
const directMarker = `BACKLOG_DIRECT_${stamp}`;
await rpc('channelSend', {
  channelId: group.id,
  body: `@${displayName} 请只根据本轮自动附上的群聊上下文，回复其中最早和最近两条普通消息的代号，并包含 ${directMarker}。不需要再读历史、记忆或执行其他工具；只调用 bot_send_message 回复。`,
  mentions: [{ botSlug, label: displayName, start: 0, end: displayName.length + 1 }],
});
const reply = await waitForReply(group.id, directMarker);
if (!reply.body.includes(marker(0)) || !reply.body.includes(marker(109))) {
  throw new Error(`Real reply missed oldest or nearby context: ${reply.body}`);
}
await waitForAdmission(botSlug, marker(0), 'handled');
await waitForAdmission(botSlug, marker(109), 'handled');
const pendingAfterFirst = await findPendingInGroup(botSlug, group.id, stamp);

const continuationMarker = `BACKLOG_CONTINUE_${stamp}`;
await rpc('channelSend', {
  channelId: group.id,
  body: `@${displayName} 请只根据本轮自动附上的群聊上下文，继续看下一批最早的待处理消息，并回复 ${continuationMarker}。不需要再读历史、记忆或执行其他工具；只调用 bot_send_message 回复。`,
  mentions: [{ botSlug, label: displayName, start: 0, end: displayName.length + 1 }],
});
await waitForReply(group.id, continuationMarker);
await waitForAdmission(botSlug, marker(10), 'handled');
const pendingAfterSecond = await findPendingInGroup(botSlug, group.id, stamp);

console.log(
  JSON.stringify(
    {
      ok: true,
      bot: displayName,
      botSlug,
      group: group.name,
      groupId: group.id,
      first: marker(0),
      nearby: marker(109),
      continued: marker(10),
      pendingAfterFirst: pendingAfterFirst.summary,
      pendingAfterSecond: pendingAfterSecond.summary,
      reply: reply.body,
    },
    null,
    2,
  ),
);
