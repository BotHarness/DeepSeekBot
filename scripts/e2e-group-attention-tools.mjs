import { basename } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

const port = Number(process.argv[2]);
const home = process.argv[3];
if (!Number.isSafeInteger(port) || !home)
  throw new Error('Usage: node scripts/e2e-group-attention-tools.mjs <port> <DSH_HOME>');
const origin = `http://127.0.0.1:${port}`;
const cookie = readFileSync(
  `/tmp/dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`,
  'utf8',
).split(';')[0];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function rpc(method, args = {}) {
  const response = await fetch(`${origin}/api/botharness/${method}`, {
    signal: AbortSignal.timeout(20_000),
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `group-attention-${method}-${Date.now()}`,
      method: `botharness/${method}`,
      payload: { args },
    }),
  });
  const envelope = await response.json();
  if (response.status !== 200 || envelope.result?.ok !== true)
    throw new Error(
      `${method}: HTTP ${response.status}, ${JSON.stringify(envelope.result?.error)}`,
    );
  return envelope.result.value;
}

async function waitFor(check, label, timeout = 180_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result !== undefined) return result;
    await sleep(1_500);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function groupRecord(id) {
  return (await rpc('channels')).channels.find((channel) => channel.id === id);
}

async function botReply(dmId, marker) {
  return waitFor(async () => {
    const timeline = await rpc('channelTimeline', { channelId: dmId });
    return (timeline.page?.entries ?? []).find(
      (entry) => entry.author?.kind === 'bot' && entry.body.includes(marker),
    );
  }, `Bot DM reply ${marker}`);
}

async function attention(botSlug, marker, state) {
  return waitFor(async () => {
    const item = (await rpc('botAttention', { slug: botSlug })).items.find((entry) =>
      entry.summary?.includes(marker),
    );
    return item?.state === state ? item : undefined;
  }, `${marker} attention ${state}`);
}

if (process.argv[4] === '--verify-restart') {
  const [, , , , , groupId, botSlug] = process.argv;
  const group = await groupRecord(groupId);
  if (
    group?.wakePolicies?.[botSlug]?.mode !== 'silent' ||
    group.wakePolicies[botSlug].revision !== 2
  )
    throw new Error('Human override was not durable after Host restart');
  console.log(JSON.stringify({ restart: true, mode: 'silent', revision: 2 }));
  process.exit(0);
}

const stamp = Date.now();
const bot = (await rpc('create', { displayName: `Attention Tool QA ${stamp}` })).bot;
if (!bot?.slug) throw new Error('PersonaBot creation failed');
const dm = (await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName })).channel;
const group = (
  await rpc('channelCreate', {
    name: `Attention Tool Group ${stamp}`,
    members: [bot.slug],
  })
).channel;
if (!dm?.id || !group?.id) throw new Error('Fixture Channels were not created');

const firstMarker = `BOT-POLICY-${stamp}`;
await rpc('channelSend', {
  channelId: dm.id,
  body: `请使用 group_attention_get 读取群 ${group.name}（Channel ID ${group.id}）里你自己的提醒设置，然后用 group_attention_set 将它改为 mentions。最后用 bot_send_message 在当前私聊回复 ${firstMarker}、新模式和 revision。`,
});
await waitFor(async () => {
  const policy = (await groupRecord(group.id))?.wakePolicies?.[bot.slug];
  return policy?.mode === 'mentions' && policy.revision === 1 ? policy : undefined;
}, 'Bot Tool policy revision 1');
const firstReply = await botReply(dm.id, firstMarker);

const ordinaryMarker = `ORDINARY-${stamp}`;
await rpc('channelSend', { channelId: group.id, body: `普通消息 ${ordinaryMarker}` });
const ordinary = await waitFor(
  async () =>
    (await rpc('botAttention', { slug: bot.slug })).items.find(
      (item) => item.summary?.includes(ordinaryMarker) && item.state === 'pending',
    ),
  'mentions-mode pending ordinary message',
  30_000,
);
const mentionMarker = `MENTION-${stamp}`;
await rpc('channelSend', {
  channelId: group.id,
  body: `@${bot.displayName} 请回复 ${mentionMarker}，并说出上条普通消息的代号。`,
  mentions: [
    {
      botSlug: bot.slug,
      label: bot.displayName,
      start: 0,
      end: bot.displayName.length + 1,
    },
  ],
});
const mentionReply = await botReply(group.id, mentionMarker);
if (!mentionReply.body.includes(ordinaryMarker))
  throw new Error('Direct mention did not bring the pending ordinary message into context');
await attention(bot.slug, ordinaryMarker, 'handled');

await rpc('channelGroupWakeSet', {
  channelId: group.id,
  botSlug: bot.slug,
  mode: 'silent',
  count: 5,
  intervalSeconds: 30,
});
const secondMarker = `HUMAN-POLICY-${stamp}`;
await rpc('channelSend', {
  channelId: dm.id,
  body: `请用 group_attention_get 重新读取群 ${group.name}（Channel ID ${group.id}）中你自己的提醒设置，再用 bot_send_message 在当前私聊回复 ${secondMarker}、模式、revision 和最后编辑者。请不要修改设置。`,
});
const secondReply = await botReply(dm.id, secondMarker);
const latest = (await groupRecord(group.id))?.wakePolicies?.[bot.slug];
if (latest?.mode !== 'silent' || latest.revision !== 2)
  throw new Error('Human override did not remain the current policy');
const silentMarker = `SILENT-${stamp}`;
await rpc('channelSend', { channelId: group.id, body: `静默普通消息 ${silentMarker}` });
const silent = await attention(bot.slug, silentMarker, 'pending');
const silentMentionMarker = `SILENT-MENTION-${stamp}`;
await rpc('channelSend', {
  channelId: group.id,
  body: `@${bot.displayName} 请只回复 ${silentMentionMarker}；不要调用 channel_read 或其他读取工具。`,
  mentions: [
    {
      botSlug: bot.slug,
      label: bot.displayName,
      start: 0,
      end: bot.displayName.length + 1,
    },
  ],
});
await botReply(group.id, silentMentionMarker);
await attention(bot.slug, silentMentionMarker, 'handled');
await attention(bot.slug, silentMarker, 'pending');

const result = {
  botSlug: bot.slug,
  dmId: dm.id,
  groupId: group.id,
  botRevision: 1,
  humanRevision: latest.revision,
  pendingOrdinary: ordinary.state,
  mentionReply: mentionReply.body,
  silentOrdinary: silent.state,
  botReply: firstReply.body,
  overrideReply: secondReply.body,
};
if (process.env.BH_E2E_RESULT) writeFileSync(process.env.BH_E2E_RESULT, JSON.stringify(result));
console.log(JSON.stringify(result));
