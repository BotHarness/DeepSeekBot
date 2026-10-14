import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const name = 'botharness-dev-fake-im';
export const FAKE_IM_PLATFORMS = Object.freeze(['feishu', 'slack', 'discord', 'weixin']);
export const FAKE_IM_ACCOUNT = 'fake-im-app';
export const FAKE_IM_USER = Object.freeze({ id: 'fake-im-human', name: 'Fake IM Human' });
const DM_CONVERSATION = 'fake-im-dm';
const GROUP_CONVERSATION = 'fake-im-group';
const CAPABILITIES = Object.freeze([
  'proactive-text-checked',
  'exclusive-text-consumer',
  'ordinary-text-consumer',
  'reply-text-checked',
  'reply-context-checked',
  'reply-receipt-checked',
  'reply-fence-checked',
]);

export function fakeImSpool(home, platform) {
  return join(resolve(home), 'fake-im', platform);
}

export function fakeImFingerprint(platform) {
  return createHash('sha256').update(`botharness-dev-fake-im:${platform}`).digest('hex');
}

function checkedPlatform(platform) {
  if (!FAKE_IM_PLATFORMS.includes(platform))
    throw new Error(`fake IM platform must be one of ${FAKE_IM_PLATFORMS.join(', ')}`);
  return platform;
}

export function fakeImPatch({ home, platform }) {
  const config = { spool: fakeImSpool(home, checkedPlatform(platform)), platform };
  return [
    '- insert:',
    `    - id: ${name}`,
    `      name: ${JSON.stringify(pathToFileURL(import.meta.filename).pathname)}`,
    '      config:',
    ...Object.entries(config).map(([key, value]) => `        ${key}: ${JSON.stringify(value)}`),
    '',
  ].join('\n');
}

export function createFakeDshIm({ platform, record = () => {} }) {
  checkedPlatform(platform);
  const fingerprint = fakeImFingerprint(platform);
  const consumers = new Set();
  const service = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: FAKE_IM_ACCOUNT, channel: platform }],
    listTargets: async () =>
      platform === 'weixin'
        ? [
            {
              targetId: 'owner',
              name: FAKE_IM_USER.name,
              kind: 'user',
              route: { toUserId: DM_CONVERSATION },
            },
          ]
        : [],
    describeBot: async (botId) => {
      if (botId !== FAKE_IM_ACCOUNT)
        throw Object.assign(new Error('unknown fake IM app'), { code: 'account-changed' });
      return {
        version: 1,
        channel: platform,
        botId,
        account: { fingerprint, name: `Fake ${platform} app` },
        connected: true,
        capabilities: [...CAPABILITIES],
      };
    },
    sendChecked: async (botId, targetId, text) => {
      record({ kind: 'send', botId, targetId, text });
      return { sent: true };
    },
    consumeInbound: async (botId, options) => {
      if (options.expectedFingerprint !== fingerprint)
        throw Object.assign(new Error('fingerprint changed'), { code: 'account-changed' });
      const consumer = { botId, options };
      consumers.add(consumer);
      record({ kind: 'consumer-attached', botId });
      return () => {
        consumers.delete(consumer);
        record({ kind: 'consumer-detached', botId });
      };
    },
    qualifyReplyChecked: async (_botId, route) => route,
    replyChecked: async (botId, route, text, options) => {
      if (options.beforeSend && !options.beforeSend())
        throw Object.assign(new Error('stale-route'), { code: 'stale-route' });
      record({ kind: 'reply', botId, route, text });
      return {
        sent: true,
        receipt: {
          version: 1,
          messageId: `fake-reply-${route.messageId}`,
          conversationId: route.conversationId,
        },
      };
    },
  };
  return {
    service,
    get consumers() {
      return consumers.size;
    },
    async deliver(event) {
      const targets = [...consumers].filter((consumer) => consumer.botId === event.botId);
      if (targets.length === 0) return { accepted: false, reason: 'no-consumer' };
      for (const { options } of targets) await options.onEvent(event, { signal: options.signal });
      return { accepted: true };
    },
  };
}

export function fakeImEvent({ platform, text, group = false, mention = group, id = randomUUID() }) {
  checkedPlatform(platform);
  if (group && platform === 'weixin') throw new Error('personal WeChat admits only owner DMs');
  if (!group && mention) throw new Error('a mention needs --group');
  const conversationId = group ? GROUP_CONVERSATION : DM_CONVERSATION;
  return {
    version: 1,
    channel: platform,
    botId: FAKE_IM_ACCOUNT,
    fingerprint: fakeImFingerprint(platform),
    eventId: `fake-event-${id}`,
    messageId: `fake-message-${id}`,
    actor: { kind: 'user', ...FAKE_IM_USER },
    conversation: { kind: group ? 'group' : 'dm', id: conversationId },
    mentions: mention ? [{ id: 'fake-im-app-user', key: '@_user_1', name: 'Fake app' }] : [],
    mentionedAccount: mention,
    at: new Date().toISOString(),
    text: mention ? `@_user_1 ${text}` : text,
    reply: { messageId: `fake-message-${id}`, conversationId, actorId: FAKE_IM_USER.id },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  };
}

export function apply(ctx, { spool, platform = 'feishu' } = {}) {
  if (!spool) throw new Error('fake IM needs a task-owned spool directory');
  const inbox = join(spool, 'in');
  const done = join(spool, 'done');
  mkdirSync(inbox, { recursive: true });
  mkdirSync(done, { recursive: true });
  const record = (entry) =>
    appendFileSync(
      join(spool, 'outbox.jsonl'),
      `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
    );
  const fake = createFakeDshIm({ platform, record });
  ctx.provide('dshIm', fake.service);
  ctx.logger?.info?.(`fake-im phase=ready platform=${platform}`);
  let polling = false;
  const timer = setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      for (const file of readdirSync(inbox)
        .filter((entry) => entry.endsWith('.json'))
        .sort()) {
        const event = JSON.parse(readFileSync(join(inbox, file), 'utf8'));
        renameSync(join(inbox, file), join(done, file));
        try {
          record({ kind: 'delivered', messageId: event.messageId, ...(await fake.deliver(event)) });
        } catch (error) {
          record({ kind: 'refused', messageId: event.messageId, code: error?.code ?? 'error' });
        }
      }
    } finally {
      polling = false;
    }
  }, 250);
  ctx.effect?.(() => () => clearInterval(timer), 'botharness: dev fake IM spool');
}

function parseSendArgs(argv) {
  const options = { group: false, mention: undefined, wait: 120, text: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--home') options.home = argv[++index];
    else if (flag === '--platform') options.platform = argv[++index];
    else if (flag === '--group') options.group = true;
    else if (flag === '--no-mention') options.mention = false;
    else if (flag === '--wait') options.wait = Number(argv[++index]);
    else options.text.push(flag);
  }
  if (!options.home || options.text.length === 0)
    throw new Error(
      'usage: dev-fake-im.mjs send --home <DSH_HOME> [--platform <p>] [--group [--no-mention]] [--wait <s>] <text>',
    );
  return options;
}

async function send(argv) {
  const options = parseSendArgs(argv);
  const platform =
    options.platform ??
    FAKE_IM_PLATFORMS.find((candidate) => existsSync(fakeImSpool(options.home, candidate)));
  if (!platform) throw new Error('no fake IM spool under this home; launch with --fake-im');
  const spool = fakeImSpool(options.home, platform);
  const event = fakeImEvent({
    platform,
    text: options.text.join(' '),
    group: options.group,
    mention: options.mention ?? options.group,
  });
  const outbox = join(spool, 'outbox.jsonl');
  const offset = existsSync(outbox) ? readFileSync(outbox, 'utf8').length : 0;
  writeFileSync(join(spool, 'in', `${Date.now()}-${event.messageId}.json`), JSON.stringify(event));
  const started = Date.now();
  const lines = () =>
    (existsSync(outbox) ? readFileSync(outbox, 'utf8').slice(offset) : '')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter(
        (entry) =>
          entry.messageId === event.messageId || entry.route?.messageId === event.messageId,
      );
  while (Date.now() - started < options.wait * 1000) {
    await new Promise((done) => setTimeout(done, 250));
    const seen = lines();
    const reply = seen.find((entry) => entry.kind === 'reply');
    const delivered = seen.find((entry) => entry.kind !== 'reply');
    if (reply || (delivered && delivered.accepted !== true)) {
      console.log(
        JSON.stringify(
          {
            messageId: event.messageId,
            delivery: delivered ?? null,
            reply: reply ? reply.text : null,
            seconds: (Date.now() - started) / 1000,
          },
          null,
          2,
        ),
      );
      return;
    }
  }
  console.log(
    JSON.stringify(
      {
        messageId: event.messageId,
        delivery: lines()[0] ?? null,
        reply: null,
        waited: options.wait,
      },
      null,
      2,
    ),
  );
}

async function bind(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) options[argv[index]] = argv[index + 1];
  const home = options['--home'];
  const port = Number(options['--port']);
  const slug = options['--bot'];
  if (!home || !Number.isInteger(port) || !slug)
    throw new Error('usage: dev-fake-im.mjs bind --home <DSH_HOME> --port <n> --bot <slug>');
  const platform =
    options['--platform'] ??
    FAKE_IM_PLATFORMS.find((candidate) => existsSync(fakeImSpool(home, candidate)));
  if (!platform) throw new Error('no fake IM spool under this home; launch with --fake-im');
  const jar = join(
    tmpdir(),
    `dsh-${basename(resolve(home)).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`,
  );
  const response = await fetch(`http://127.0.0.1:${port}/api/botharness/messagingIdentity`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: readFileSync(jar, 'utf8').split(';')[0],
    },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: randomUUID(),
      method: 'botharness/messagingIdentity',
      payload: {
        args: {
          slug,
          input: {
            kind: 'bind',
            providerId: `dsh-im/${platform}`,
            accountRef: FAKE_IM_ACCOUNT,
            fingerprint: fakeImFingerprint(platform),
          },
        },
      },
    }),
  });
  const result = (await response.json()).result;
  if (result?.ok !== true)
    throw new Error(`bind failed: ${JSON.stringify(result?.error ?? response.status)}`);
  const { identity } = result.value;
  console.log(
    JSON.stringify({ bound: identity.id, platform, newConversations: identity.newConversations }),
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [mode, ...args] = process.argv.slice(2);
  const command = { send, bind }[mode];
  if (command === undefined) {
    console.error('usage: dev-fake-im.mjs bind|send --home <DSH_HOME> [options]');
    process.exitCode = 1;
  } else
    command(args).catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
