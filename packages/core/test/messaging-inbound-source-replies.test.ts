import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { createBotMessageTool } from '../src/runtime/bot-message-tool.js';
import { afterEach, expect, it, vi } from 'vitest';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import { event, fixture, sharedTarget, cleanup } from './messaging-inbound-fixtures.js';

afterEach(cleanup);

it('keeps independent reply messages for one source and replays only the same message identity', async () => {
  const fx = await fixture({ receipts: true });
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const id = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  const progress = await fx.core.externalMessaging.reply(
    'ada',
    id,
    'Work started',
    'message-progress',
  );
  const final = await fx.core.externalMessaging.reply('ada', id, 'Work completed', 'message-final');
  expect(progress.state).toBe('provider-accepted');
  expect(final.state).toBe('provider-accepted');
  expect(final.id).not.toBe(progress.id);
  expect(
    await fx.core.externalMessaging.reply('ada', id, 'Work started', 'message-progress'),
  ).toEqual(progress);
  await expect(
    fx.core.externalMessaging.reply('ada', id, 'Changed', 'message-progress'),
  ).rejects.toThrow('request-conflict');
  expect(fx.replies).toHaveLength(2);
});

it('does not repeat unknown reply outcomes and refuses a changed payload for the same source', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const id = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  fx.setReply(async () => {
    throw new Error('network uncertainty');
  });
  expect((await fx.core.externalMessaging.reply('ada', id, 'hello')).state).toBe('unknown-outcome');
  expect((await fx.core.externalMessaging.reply('ada', id, 'hello')).state).toBe('unknown-outcome');
  await expect(fx.core.externalMessaging.reply('ada', id, 'different')).rejects.toThrow(
    'request-conflict',
  );
  expect(fx.replies).toHaveLength(1);
});

it('marks stale/deleted remote sources as definite failure rather than rerouting to a group send', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const id = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  fx.setReply(async () => {
    throw Object.assign(new Error('stale'), { code: 'stale-route' });
  });
  expect(await fx.core.externalMessaging.reply('ada', id, 'hello')).toMatchObject({
    state: 'failed',
    reason: 'stale-route',
  });
  expect(fx.publicService.sendChecked).not.toHaveBeenCalled();
});

it('keeps an external-only report in Outbox, associates a real reply and enriches only its authenticated own echo', async () => {
  const fx = await fixture({ receipts: true });
  await fx.enable();
  const report = await fx.core.externalMessaging.post(
    'ada',
    fx.grant.id,
    'morning_report_639',
    'Morning report',
  );
  expect(report.state).toBe('provider-accepted');
  expect(report.receipt).toEqual({ version: 1, messageId: 'om-report', conversationId: 'oc-team' });
  expect(fx.query('SELECT * FROM source_events')).toHaveLength(0);
  expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(0);
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(0);
  await fx.echo('om-foreign');
  await fx.echo('om-report', 'Changed content');
  expect(fx.core.externalMessaging.history('ada')[0]?.echo).toBeUndefined();
  await fx.echo();
  await fx.echo();
  expect(fx.core.externalMessaging.history('ada')[0]?.echo?.eventId).toBe('echo-1');
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(0);
  const reply = event({
    reply: {
      messageId: 'om-1',
      conversationId: 'oc-team',
      actorId: 'ou-human',
      rootId: 'om-report',
      parentId: 'om-report',
      threadId: 'omt-report',
    },
  });
  await fx.receive(reply);
  await fx.receive(reply);
  await fx.idle();
  const item = fx.core.attention
    .list({ botSlug: 'ada' })
    .items.find((item) => item.sourceKind === 'bridge-message');
  expect(item).toBeDefined();
  const source = fx.core.externalMessaging.inbound.read('ada', item!.id);
  expect(source.report?.intentId).toBe(report.id);
  expect(source.report?.text).toBe('Morning report');
  expect(source.event.actor.id).toBe('ou-human');
  expect(fx.runs[0]?.inbox).toContain('Morning report');
  expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(0);
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(1);
  const repeated = await fx.core.externalMessaging.post(
    'ada',
    fx.grant.id,
    'morning_report_639',
    'Morning report',
  );
  expect(repeated.id).toBe(report.id);
  expect(fx.publicService.sendChecked).toHaveBeenCalledTimes(1);
  expect(() => fx.core.externalMessaging.inspectIntent('other', report.id)).toThrow(
    'intent-unavailable',
  );
  await expect(
    fx.core.externalMessaging.post('other', fx.grant.id, 'other_report_639', 'Bad'),
  ).rejects.toThrow('grant-unavailable');
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  expect(fx.core.externalMessaging.inspectIntent('ada', report.id).text).toBe('Morning report');
  await expect(
    fx.core.externalMessaging.post('ada', fx.grant.id, 'revoked_report_639', 'Bad'),
  ).rejects.toThrow('grant-revoked');
  await fx.restart();
  expect(fx.core.externalMessaging.inspectIntent('ada', report.id).receipt?.messageId).toBe(
    'om-report',
  );
});

it('does not associate a fabricated report parent or another conversation with an own report', async () => {
  const fx = await fixture({ receipts: true });
  await fx.enable();
  await fx.core.externalMessaging.post(
    'ada',
    fx.grant.id,
    'morning_report_parent',
    'Morning report',
  );
  await fx.receive(event());
  await fx.idle();
  const item = fx.core.attention
    .list({ botSlug: 'ada' })
    .items.find((item) => item.sourceKind === 'bridge-message');
  expect(fx.core.externalMessaging.inbound.read('ada', item!.id).report).toBeUndefined();
  await fx.receive(
    event({
      messageId: 'foreign',
      conversation: { kind: 'group', id: 'oc-other' },
      reply: {
        messageId: 'foreign',
        conversationId: 'oc-other',
        actorId: 'ou-human',
        parentId: 'om-report',
      },
    }),
  );
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(1);
});

it('refuses receipt-less providers before dispatch and preserves one unknown post without retry', async () => {
  const legacy = await fixture();
  await expect(
    legacy.core.externalMessaging.post('ada', legacy.grant.id, 'legacy_report_639', 'Report'),
  ).rejects.toThrow('capability-unavailable');
  expect(legacy.publicService.sendChecked).not.toHaveBeenCalled();
  const fx = await fixture({ receipts: true });
  fx.publicService.sendChecked = vi.fn(async () => ({ sent: true as const }));
  const report = await fx.core.externalMessaging.post(
    'ada',
    fx.grant.id,
    'unknown_report_639',
    'Report',
  );
  expect(report.state).toBe('unknown-outcome');
  expect(report.receipt).toBeUndefined();
  expect(
    (await fx.core.externalMessaging.post('ada', fx.grant.id, 'unknown_report_639', 'Report')).id,
  ).toBe(report.id);
  expect(fx.publicService.sendChecked).toHaveBeenCalledTimes(1);
});

async function secondResponder() {
  const fx = await fixture({ secondIdentity: true, receipts: true });
  const channelId = await sharedTarget(fx);
  const target = (await fx.core.externalMessaging.targets('dsh-im/feishu', 'lark-bea'))[0]!;
  const grant = await fx.core.externalMessaging.authorize({
    botSlug: 'bea',
    providerId: 'dsh-im/feishu',
    accountRef: 'lark-bea',
    targetRef: target.ref,
    fingerprint: 'b'.repeat(64),
    targetDigest: target.digest,
  });
  await fx.enable();
  await fx.receive(event());
  await fx.idle();
  const sourceId = fx.core.channels.readMessages(channelId)[0]!.id;
  return {
    ...fx,
    get core() {
      return fx.core;
    },
    sourceId,
    channelId,
    responderGrant: grant,
  };
}

it('replies to one shared source under two independent own identities, preserves the canonical route, and deduplicates each responder across restart', async () => {
  const fx = await secondResponder();
  expect(fx.query("SELECT * FROM inbox_admissions WHERE bot_slug = 'bea'")).toHaveLength(0);
  const source = fx.core.externalMessaging.inbound.readShared('bea', fx.sourceId);
  expect(source).toMatchObject({ grantId: fx.grant.id, event: { actor: { id: 'ou-human' } } });
  expect(source.contextReads).toBeUndefined();
  const own = await fx.core.externalMessaging.reply('ada', fx.sourceId, 'A reply');
  const shared = await fx.core.externalMessaging.reply('bea', fx.sourceId, 'B reply');
  expect(own.state).toBe('provider-accepted');
  expect(shared).toMatchObject({
    botSlug: 'bea',
    grantId: fx.responderGrant.id,
    sourceEventId: fx.sourceId,
    state: 'provider-accepted',
    reply: {
      accountRef: 'lark-bea',
      accountName: 'Bea Lark identity',
      route: { ...event().reply, actorId: 'ou-human-scoped-to-bea' },
    },
    receipt: { messageId: 'lark-bea-reply', conversationId: 'oc-team' },
  });
  expect(fx.replies.map((reply) => reply.botId)).toEqual(['lark-app', 'lark-bea']);
  expect(fx.replies[1]!.route).toEqual({ ...event().reply, actorId: 'ou-human-scoped-to-bea' });
  expect(fx.core.externalMessaging.inbound.read('ada', fx.sourceId).event.reply).toEqual(
    event().reply,
  );
  expect(await fx.core.externalMessaging.reply('bea', fx.sourceId, 'B reply')).toMatchObject({
    id: shared.id,
  });
  await fx.restart();
  expect(await fx.core.externalMessaging.reply('bea', fx.sourceId, 'B reply')).toMatchObject({
    id: shared.id,
  });
  expect(fx.replies).toHaveLength(2);
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(fx.query("SELECT * FROM inbox_admissions WHERE bot_slug = 'bea'")).toHaveLength(0);
  await expect(
    fx.core.externalMessaging.reply('bea', fx.sourceId, 'Different retry'),
  ).rejects.toThrow('request-conflict');
});

it('acquires the responder connection without enabling reception, discards its inbound messages, and releases it when identity pauses', async () => {
  const fx = await secondResponder();
  type Consumer = Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];
  let responder: Consumer | undefined;
  const consume = fx.publicService.consumeInbound!;
  fx.publicService.consumeInbound = async (account, input) => {
    if (account === 'lark-bea') responder = input;
    return consume(account, input);
  };
  const qualify = fx.publicService.qualifyReplyChecked!;
  fx.publicService.qualifyReplyChecked = async (account, route, options) => {
    if (!responder || responder.signal?.aborted)
      throw Object.assign(new Error('No owned consumer'), { code: 'capability-unavailable' });
    return qualify(account, route, options);
  };
  const reply = await fx.core.externalMessaging.reply('bea', fx.sourceId, 'Own connection reply');
  expect(reply.state).toBe('provider-accepted');
  expect(responder).toBeDefined();
  expect(fx.core.externalMessaging.inbound.status(fx.responderGrant.id)).toBe('off');
  const sourceCount = fx.query('SELECT * FROM source_events').length;
  await responder!.onEvent(
    event({
      botId: 'lark-bea',
      fingerprint: 'b'.repeat(64),
      messageId: 'om-not-collected',
      reply: { ...event().reply, messageId: 'om-not-collected' },
    }),
    { signal: responder!.signal! },
  );
  expect(fx.query('SELECT * FROM source_events')).toHaveLength(sourceCount);
  expect(fx.query("SELECT * FROM inbox_admissions WHERE bot_slug = 'bea'")).toHaveLength(0);
  await responder!.onEcho?.(
    {
      version: 1,
      botId: 'lark-bea',
      fingerprint: 'b'.repeat(64),
      eventId: 'echo-bea',
      messageId: 'lark-bea-reply',
      conversationId: 'oc-team',
      text: 'Own connection reply',
      at: '2026-10-04T00:00:00.000Z',
    },
    { signal: responder!.signal! },
  );
  expect(fx.core.externalMessaging.history('bea')[0]?.echo).toMatchObject({ eventId: 'echo-bea' });
  const identity = (await fx.core.externalMessaging.snapshot('bea')).identities![0]!;
  await fx.core.externalMessaging.identity('bea', {
    kind: 'update',
    id: identity.id,
    expectedRevision: identity.revision,
    name: identity.name,
    enabled: false,
  });
  expect(responder!.signal?.aborted).toBe(true);
  await expect(fx.core.externalMessaging.reply('bea', fx.sourceId, 'No fallback')).rejects.toThrow(
    'identity-paused',
  );
  expect(fx.replies).toHaveLength(1);
});

it('does not let an unavailable grant for a different group block the responder own-source reply', async () => {
  const fx = await secondResponder();
  const targets = await fx.publicService.listTargets('lark-bea');
  const otherTarget = {
    targetId: 'other-team',
    name: 'Other QA group',
    kind: 'group',
    route: { chatId: 'oc-other' },
  };
  vi.spyOn(fx.publicService, 'listTargets').mockResolvedValue([...targets, otherTarget]);
  const other = (await fx.core.externalMessaging.targets('dsh-im/feishu', 'lark-bea')).find(
    (target) => target.ref === 'other-team',
  )!;
  await fx.core.externalMessaging.authorize({
    botSlug: 'bea',
    providerId: 'dsh-im/feishu',
    accountRef: 'lark-bea',
    targetRef: other.ref,
    fingerprint: 'b'.repeat(64),
    targetDigest: other.digest,
  });
  vi.mocked(fx.publicService.listTargets).mockResolvedValue(targets);
  const reply = await fx.core.externalMessaging.reply('bea', fx.sourceId, 'Original group reply');
  expect(reply).toMatchObject({ state: 'provider-accepted', grantId: fx.responderGrant.id });
  expect(fx.replies).toEqual([
    {
      botId: 'lark-bea',
      text: 'Original group reply',
      route: { ...event().reply, actorId: 'ou-human-scoped-to-bea' },
    },
  ]);
});

it('ignores a grant from another Provider when replying to a shared source', async () => {
  const fx = await secondResponder();
  const fingerprint = 'c'.repeat(64);
  const transport: DshImOutboundService = {
    ...fx.publicService,
    listBots: async () => [{ botId: 'other-lark-app', channel: 'feishu' }],
    describeBot: async (botId) => {
      const info = await fx.publicService.describeBot(botId);
      return { ...info, account: { fingerprint } };
    },
  };
  const other = createDshImProvider(transport);
  if (!other) throw new Error('Missing alternate Provider fixture');
  const providerId = 'test/other-feishu';
  fx.core.externalMessaging.register({ ...other, id: providerId });
  const target = (await fx.core.externalMessaging.targets(providerId, 'other-lark-app'))[0];
  if (!target) throw new Error('Missing alternate Provider target');
  await fx.core.externalMessaging.authorize({
    botSlug: 'bea',
    providerId,
    accountRef: 'other-lark-app',
    targetRef: target.ref,
    fingerprint,
    targetDigest: target.digest,
  });

  const reply = await fx.core.externalMessaging.reply(
    'bea',
    fx.sourceId,
    'Original Provider reply',
  );
  expect(reply).toMatchObject({ state: 'provider-accepted', grantId: fx.responderGrant.id });
  expect(fx.replies).toEqual([
    {
      botId: 'lark-bea',
      text: 'Original Provider reply',
      route: { ...event().reply, actorId: 'ou-human-scoped-to-bea' },
    },
  ]);
});

it.each(['membership', 'authorization', 'identity'] as const)(
  'rechecks responder %s after preflight and refuses before the external side effect',
  async (change) => {
    const fx = await secondResponder();
    let checks = 0;
    fx.publicService.qualifyReplyChecked = async (_account, route) => {
      checks++;
      if (checks === 2) {
        if (change === 'membership') fx.core.channels.removeGroupMember(fx.channelId, 'bea');
        if (change === 'authorization')
          fx.core.externalMessaging.revoke('bea', fx.responderGrant.id);
        if (change === 'identity') {
          const identity = (await fx.core.externalMessaging.snapshot('bea')).identities![0]!;
          await fx.core.externalMessaging.identity('bea', {
            kind: 'update',
            id: identity.id,
            expectedRevision: identity.revision,
            name: identity.name,
            enabled: false,
          });
        }
      }
      return { ...route, actorId: 'ou-human-scoped-to-bea' };
    };
    const reply = await fx.core.externalMessaging.reply('bea', fx.sourceId, 'Refuse before send');
    expect(reply.state).toBe('failed');
    expect(fx.replies).toHaveLength(0);
    expect(
      await fx.core.externalMessaging.reply('ada', fx.sourceId, 'Independent A reply'),
    ).toMatchObject({ state: 'provider-accepted' });
  },
);

it.each(['reply-permission-denied', 'source-not-found', 'source-unavailable'] as const)(
  'preserves checked responder refusal %s without recording an accepted intent or trying A identity',
  async (code) => {
    const fx = await secondResponder();
    fx.publicService.qualifyReplyChecked = async () => {
      throw Object.assign(new Error('upstream private detail'), { code });
    };
    await expect(fx.core.externalMessaging.reply('bea', fx.sourceId, 'Never send')).rejects.toThrow(
      code,
    );
    expect(fx.replies).toHaveLength(0);
    expect(fx.core.externalMessaging.history('bea')).toHaveLength(0);
  },
);

it('refuses a changed qualified topic instead of falling back to the main group', async () => {
  const fx = await secondResponder();
  fx.publicService.qualifyReplyChecked = async (_account, route) => ({
    ...route,
    threadId: 'different-topic',
  });
  await expect(fx.core.externalMessaging.reply('bea', fx.sourceId, 'Never send')).rejects.toThrow(
    'stale-route',
  );
  expect(fx.replies).toHaveLength(0);
});

it('keeps an ambiguous responder send as one unknown outcome and never retries it', async () => {
  const fx = await secondResponder();
  let sends = 0;
  fx.publicService.replyChecked = async () => {
    sends++;
    throw new Error('transport interrupted after send');
  };
  const result = await fx.core.externalMessaging.reply('bea', fx.sourceId, 'Uncertain B reply');
  expect(result.state).toBe('unknown-outcome');
  expect(
    await fx.core.externalMessaging.reply('bea', fx.sourceId, 'Uncertain B reply'),
  ).toMatchObject({ id: result.id, state: 'unknown-outcome' });
  expect(sends).toBe(1);
});

it('fences removal after remote source validation, immediately before the SDK send', async () => {
  const fx = await secondResponder();
  let effects = 0;
  fx.publicService.replyChecked = async (_bot, _route, _text, options) => {
    fx.core.channels.removeGroupMember(fx.channelId, 'bea');
    if (options.beforeSend?.() !== true)
      throw Object.assign(new Error('stale-route'), { code: 'stale-route' });
    effects++;
    return { sent: true };
  };
  expect(
    await fx.core.externalMessaging.reply('bea', fx.sourceId, 'Withdrawn before effect'),
  ).toMatchObject({ state: 'failed', reason: 'stale-route' });
  expect(effects).toBe(0);
});

it('correlates a reply own echo with its owned Outbox receipt without another source or attention', async () => {
  const fx = await secondResponder();
  const intent = await fx.core.externalMessaging.reply('ada', fx.sourceId, 'A reply');
  const before = fx.query('SELECT * FROM inbox_admissions');
  await fx.echo('lark-app-reply', 'A reply');
  await fx.echo('lark-app-reply', 'A reply');
  expect(fx.core.externalMessaging.inspectIntent('ada', intent.id)).toMatchObject({
    echo: { eventId: 'echo-1' },
  });
  expect(fx.query('SELECT * FROM inbox_admissions')).toEqual(before);
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(fx.core.externalMessaging.history('bea')).toHaveLength(0);
});

it('refuses an account missing the final reply-fence capability before qualification or send', async () => {
  const fx = await secondResponder();
  const describe = fx.publicService.describeBot;
  fx.publicService.describeBot = async (id) => {
    const account = await describe(id);
    return {
      ...account,
      capabilities: account.capabilities.filter(
        (capability) => capability !== 'reply-fence-checked',
      ),
    };
  };
  await expect(
    fx.core.externalMessaging.reply('bea', fx.sourceId, 'Unavailable contract'),
  ).rejects.toThrow('capability-unavailable');
  expect(fx.publicService.qualifyReplyChecked).not.toHaveBeenCalled();
  expect(fx.replies).toHaveLength(0);
});

it('unified messaging preserves an unknown external outcome without concluding or replaying', async () => {
  let conclusions = 0;
  let result: unknown;
  let sourceId = '';
  const fx = await fixture({
    onRun: async (run) => {
      sourceId = run.triage!.current()[0]!;
      const tool = createBotMessageTool(() => run);
      const args = {
        source_event_id: sourceId,
        body: 'Result',
        resolve_inbox_ids: [sourceId],
        end_turn: true,
      };
      const context = {
        callId: ToolCallId('unknown-result'),
        signal: new AbortController().signal,
        concludeTurn: () => {
          conclusions += 1;
        },
      } as ToolRunContext;
      result = JSON.parse(String(await tool.execute(args, context)));
      expect(JSON.parse(String(await tool.execute(args, context)))).toEqual(result);
    },
  });
  fx.setReply(async () => {
    throw new Error('transport interrupted after dispatch');
  });
  await fx.enable();
  await fx.receive();
  await fx.idle();
  expect(result).toMatchObject({ status: 'unknown-outcome' });
  expect(conclusions).toBe(0);
  expect(fx.replies).toHaveLength(1);
  expect(
    fx.core.attention.list({ botSlug: 'ada' }).items.find((item) => item.id === sourceId)?.state,
  ).toBe('open');
});
