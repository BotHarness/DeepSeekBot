import { setImmediate as tick } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { resolveRetainedQuote } from '../src/messaging/retained-context.js';
import { afterEach, expect, it } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent, MessagingQuote } from '../src/messaging/provider.js';
import { createTempRoot } from './helpers.js';
const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
const fingerprint = 'a'.repeat(64);
async function fixture(qualified = true) {
  const inboxes: string[] = [];
  const core = createCore({
    dshHome: createTempRoot('wechat-context-'),
    agents: {
      async runOrchestrator(run) {
        inboxes.push(run.inbox);
      },
      async runAssignment() {},
      requestAssignment: () => ({ delivery: 'steer' }),
      async stopAssignment() {},
      async close() {},
    },
  });
  cores.push(core);
  expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  let consumer!: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];
  const service: DshImOutboundService = {
    contractVersion: 1,
    listBots: async () => [{ botId: 'wx', channel: 'weixin' }],
    listTargets: async () => [
      { targetId: 'owner', name: 'Owner', kind: 'user', route: { toUserId: 'owner' } },
    ],
    describeBot: async () => ({
      version: 1,
      channel: 'weixin',
      botId: 'wx',
      connected: true,
      account: { fingerprint },
      capabilities: [
        'proactive-text-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        ...(qualified ? ['source-quote-checked'] : []),
      ],
    }),
    consumeInbound: async (_id, options) => {
      consumer = options;
      return () => {};
    },
    replyChecked: async () => ({ sent: true }),
    sendChecked: async () => ({ sent: true }),
  };
  const provider = createDshImProvider(service, 'weixin')!;
  core.externalMessaging.register(provider);
  const target = (await core.externalMessaging.targets(provider.id, 'wx'))[0]!;
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: provider.id,
    accountRef: 'wx',
    targetRef: target.ref,
    fingerprint,
    targetDigest: target.digest,
  });
  await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
  const id = (messageId: string) =>
    'im-' +
    createHash('sha256')
      .update(JSON.stringify([provider.id, fingerprint, 'owner', messageId]))
      .digest('hex');
  const receive = async (number: number, quote?: MessagingQuote, text = `retained ${number}`) => {
    const messageId = String(9007199254740993000n + BigInt(number));
    const event: MessagingInboundEvent = {
      version: 1,
      channel: 'weixin',
      botId: 'wx',
      fingerprint,
      eventId: messageId,
      messageId,
      actor: { kind: 'user', id: 'owner' },
      conversation: { kind: 'dm', id: 'owner' },
      mentions: [],
      mentionedAccount: false,
      at: `2026-10-07T00:00:${String(number).padStart(2, '0')}.000Z`,
      text,
      ...(quote ? { quote } : {}),
      reply: { messageId, conversationId: 'owner', actorId: 'owner' },
      replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    };
    await consumer.onEvent(event, { signal: consumer.signal });
    return id(messageId);
  };
  return { core, grant, receive, inboxes, consumer: () => consumer };
}
it('qualifies native quote opt-in and resolves server IDs only in canonical authorized sources', async () => {
  const fx = await fixture();
  expect(fx.consumer().sourceQuotes).toBe(true);
  const original = await fx.receive(1);
  const quoted = await fx.receive(2, {
    serverMessageId: '9007199254740993001',
    summary: 'summary, not body',
    itemId: 'native-item',
  });
  const source = fx.core.externalMessaging.inbound.read('ada', quoted);
  expect(source.quote).toEqual({ kind: 'retained', text: 'retained 1', sourceEventId: original });
  expect(source.event.quote?.serverMessageId).toBe('9007199254740993001');
  expect(source.event.reply.threadId).toBeUndefined();
  const itemOnly = await fx.receive(3, { itemId: '9007199254740993001', summary: 'summary' });
  expect(fx.core.externalMessaging.inbound.read('ada', itemOnly).quote).toMatchObject({
    kind: 'unavailable',
    reason: 'no-server-message-id',
  });
  const absent = await fx.receive(4, { serverMessageId: '9999999999999999999' });
  expect(fx.core.externalMessaging.inbound.read('ada', absent).quote?.kind).toBe('unavailable');
  const embedded = await fx.receive(5, {
    text: 'actual native quote',
    summary: 'different summary',
  });
  expect(fx.core.externalMessaging.inbound.read('ada', embedded).quote).toEqual({
    kind: 'native',
    text: 'actual native quote',
  });
  await expect(fx.receive(2, { serverMessageId: '9999999999999999999' })).rejects.toThrow(
    'source-conflict',
  );
  await expect(
    fx.core.externalMessaging.inbound.context('other-bot', quoted, 'session', {
      scope: 'retained',
    }),
  ).rejects.toThrow('source-unavailable');
});
it('pages a stable local snapshot, excludes new arrivals, and binds cursors to authorization and anchor', async () => {
  const fx = await fixture();
  const ids: string[] = [];
  for (let index = 1; index <= 25; index++) ids.push(await fx.receive(index));
  const context = (
    anchor: string,
    query: Parameters<typeof fx.core.externalMessaging.inbound.context>[3],
  ) => fx.core.externalMessaging.inbound.context('ada', anchor, 'paging', query);
  const first = await context(ids[24]!, { scope: 'retained' });
  expect(first.coverage).toBe('retained-local-sources');
  expect(first.messages).toHaveLength(20);
  expect(first.nextCursor).toBeDefined();
  await fx.receive(26);
  await expect(context(ids[23]!, { scope: 'retained', cursor: first.nextCursor! })).rejects.toThrow(
    'history-cursor-unavailable',
  );
  const second = await context(ids[24]!, { scope: 'retained', cursor: first.nextCursor! });
  expect(second.messages).toHaveLength(5);
  expect(second.nextCursor).toBeUndefined();
  expect(
    new Set([...first.messages, ...second.messages].map((item) => item.sourceEventId)).size,
  ).toBe(25);
  await expect(context(ids[24]!, { scope: 'retained', cursor: first.nextCursor! })).rejects.toThrow(
    'history-cursor-unavailable',
  );
  const nearby = await context(ids[11]!, {
    scope: 'retained-nearby',
    beforeCount: 2,
    afterCount: 2,
  });
  expect(nearby.messages.map((item) => item.text)).toEqual([
    'retained 10',
    'retained 11',
    'retained 13',
    'retained 14',
  ]);
  const next = await context(ids[24]!, { scope: 'retained' });
  await fx.core.externalMessaging.inbound.setEnabled('ada', fx.grant.id, false);
  await expect(context(ids[24]!, { scope: 'retained', cursor: next.nextCursor! })).rejects.toThrow(
    'source-unavailable',
  );
});
it('does not accept unqualified references or promote a native title to quoted body', async () => {
  const fx = await fixture(false);
  expect(fx.consumer().sourceQuotes).toBeUndefined();
  await expect(fx.receive(1, { summary: 'only summary' })).rejects.toThrow('untrusted-source');
});

it('recovers an oversized local record with a larger budget without consuming it', async () => {
  const fx = await fixture();
  const anchor = await fx.receive(1, undefined, '长'.repeat(1500));
  const first = await fx.core.externalMessaging.inbound.context('ada', anchor, 'budget', {
    scope: 'retained',
    maxCharacters: 1000,
  });
  expect(first.messages).toEqual([]);
  expect(first.requiredCharacters).toBeGreaterThan(1000);
  expect(first.nextCursor).toBeDefined();
  const recovered = await fx.core.externalMessaging.inbound.context('ada', anchor, 'budget', {
    scope: 'retained',
    cursor: first.nextCursor!,
    maxCharacters: 24000,
  });
  expect(recovered.messages.map((item) => item.sourceEventId)).toEqual([anchor]);
  expect(recovered.nextCursor).toBeUndefined();
});

it('never resolves a server reference from a client acknowledgement, pending receipt or another conversation', async () => {
  const fx = await fixture();
  const anchor = await fx.receive(1, { serverMessageId: 'server-reference' });
  const source = fx.core.externalMessaging.inbound.read('ada', anchor);
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE source_events (bot_slug TEXT, source_kind TEXT, source_event_id TEXT, payload_json TEXT);
    CREATE TABLE messaging_outbox (bot_slug TEXT, body TEXT);`);
  const route = {
    providerId: fx.grant.providerId,
    accountRef: 'wx',
    fingerprint,
    conversationId: 'owner',
  };
  const current = (await fx.core.externalMessaging.snapshot('ada')).grants.find(
    (item) => item.id === fx.grant.id,
  )!;
  const resolve = () => resolveRetainedQuote(db, current, source, () => undefined, true);
  const replace = (body: unknown) => {
    db.exec('DELETE FROM messaging_outbox');
    db.prepare('INSERT INTO messaging_outbox VALUES (?, ?)').run('ada', JSON.stringify(body));
  };
  const intent = {
    id: 'sent-original',
    text: 'genuine sent text',
    reply: route,
    state: 'provider-accepted',
    receipt: { messageId: 'server-reference', identityKind: 'client-acknowledgement' },
  };
  try {
    replace(intent);
    expect(resolve().kind).toBe('unavailable');
    replace({ ...intent, state: 'sending', receipt: { messageId: 'server-reference' } });
    expect(resolve().kind).toBe('unavailable');
    replace({
      ...intent,
      reply: { ...route, conversationId: 'another' },
      receipt: { messageId: 'server-reference' },
    });
    expect(resolve().kind).toBe('unavailable');
    replace({ ...intent, receipt: { messageId: 'server-reference' } });
    expect(resolve()).toEqual({
      kind: 'retained',
      text: 'genuine sent text',
      intentId: 'sent-original',
    });
  } finally {
    db.close();
  }
});

it('preserves native quote summary and partial semantics alongside resolved Inbox text', async () => {
  const fx = await fixture();
  await fx.receive(1);
  const quote: MessagingQuote = {
    serverMessageId: '9007199254740993001',
    summary: 'Image excerpt',
    attachmentKind: 'image',
    partial: { start: 'first', end: 'last', startIndex: 1, endIndex: 4, digest: 'f'.repeat(64) },
  };
  await fx.receive(2, quote);
  await tick();
  await fx.core.runtime.whenIdle();
  const line = fx.inboxes
    .join('\n')
    .split('\n')
    .find((line) => line.includes('Image excerpt'))!;
  const data = JSON.parse(line.split('Message data: ')[1]!);
  expect(data.quote).toMatchObject({ ...quote, kind: 'retained', text: 'retained 1' });
});
