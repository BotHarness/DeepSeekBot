import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const port = Number(process.argv[2]);
const home = process.argv[3];
if (!Number.isSafeInteger(port) || typeof home !== 'string') {
  throw new Error('Usage: node scripts/e2e-silent-channel-read.mjs <port> <DSH_HOME>');
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
      rpcId: `silent-read-${method}-${Date.now()}`,
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

async function attentionFor(slug, marker, expected) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const page = await rpc('botAttention', { slug, limit: 100 });
    const item = page.items.find((row) => row.summary?.includes(marker));
    if (item?.state === expected) return item;
    await sleep(1_000);
  }
  throw new Error(`${marker} did not reach ${expected}`);
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

const stamp = Date.now();
const displayName = `SilentReadQA-${stamp}`;
const created = await rpc('create', { displayName });
const botSlug = created.bot?.slug;
if (typeof botSlug !== 'string') throw new Error('No Bot slug');
const group = (await rpc('channelCreate', { name: `Silent Read QA ${stamp}`, members: [botSlug] }))
  .channel;
if (typeof group?.id !== 'string') throw new Error('No Group Channel ID');
await rpc('channelGroupWakeSet', {
  channelId: group.id,
  botSlug,
  mode: 'silent',
  count: 5,
  intervalSeconds: 30,
});
const marker = (index) => `SILENT_READ_${stamp}_${index}`;
for (let index = 1; index <= 3; index += 1) {
  await rpc('channelSend', {
    channelId: group.id,
    body: `静默群消息 ${index}：${marker(index)}。`,
  });
  await attentionFor(botSlug, marker(index), 'pending');
}
const dm = (await rpc('channels')).channels.find(
  (channel) => channel.type === 'dm' && channel.botSlug === botSlug,
);
if (typeof dm?.id !== 'string') throw new Error('No Bot DM');
const replyMarker = `SILENT_READ_REPLY_${stamp}`;
await rpc('channelSend', {
  channelId: dm.id,
  body: `请用 channel_read 精确读取群 ${group.name}（channel_id: ${group.id}）中包含 SILENT_READ_${stamp}_ 的消息，limit 设为 1。只读取这一页，不要翻页、不要读其他历史、不要执行文件工具。然后在本私聊用 bot_send_message 回复实际返回的那一条代号，并包含 ${replyMarker}。`,
});
const reply = await waitForReply(dm.id, replyMarker);
if (!reply.body.includes(marker(3))) {
  throw new Error(`Real reply did not use the latest exact read result: ${reply.body}`);
}
const handled = await attentionFor(botSlug, marker(3), 'handled');
const pending1 = await attentionFor(botSlug, marker(1), 'pending');
const pending2 = await attentionFor(botSlug, marker(2), 'pending');
console.log(
  JSON.stringify(
    {
      ok: true,
      bot: displayName,
      botSlug,
      group: group.name,
      readAndHandled: handled.summary,
      remainedPending: [pending1.summary, pending2.summary],
      reply: reply.body,
    },
    null,
    2,
  ),
);
