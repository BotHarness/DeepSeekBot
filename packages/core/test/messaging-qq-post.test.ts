import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const cores = new Set<BotHarnessCore>();
async function stop(core: BotHarnessCore) {
  core.externalMessaging.close();
  await core.runtime.close();
  core.operationalDatabase.close();
  cores.delete(core);
}
afterEach(async () => {
  vi.useRealTimers();
  for (const core of cores) await stop(core);
});

async function fixture(onRun?: (run: OrchestratorAgentRun) => Promise<void>) {
  const fingerprint = 'a'.repeat(64);
  const home = createTempRoot('qq-delayed-post-');
  type Consumer = Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];
  let consumer: Consumer | undefined;
  const transport: DshImOutboundService = {
    contractVersion: 1,
    receiptVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'own-app', channel: 'qq' }],
    listTargets: async () => [
      {
        targetId: 'saved-group',
        name: 'QQ QA',
        kind: 'group',
        route: { groupOpenId: 'own-group' },
      },
    ],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'qq',
      connected: true,
      account: { fingerprint },
      capabilities: [
        'proactive-text-checked',
        'proactive-receipt-checked',
        'proactive-fence-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
      ],
    }),
    consumeInbound: async (_account, input) => {
      consumer = input;
      return () => {
        if (consumer === input) consumer = undefined;
      };
    },
    qualifyReplyChecked: async (_account, route) => route,
    replyChecked: vi.fn(async (_account, route, _text, options) => {
      expect(options.beforeSend?.()).toBe(true);
      if (Date.now() > Date.parse('2026-10-14T00:05:00.000Z'))
        throw Object.assign(new Error('Expired'), { code: 'reply-window-expired' });
      return {
        sent: true as const,
        receipt: {
          version: 1 as const,
          messageId: 'native-reply',
          conversationId: route.conversationId,
        },
      };
    }),
    sendChecked: vi.fn(async (_account, _target, _text, options) => {
      expect(options.receipt).toBe(true);
      expect(options.beforeSend?.()).toBe(true);
      expect(options.expectedFingerprint).toBe(fingerprint);
      return {
        sent: true as const,
        receipt: { version: 1 as const, messageId: 'native-post', conversationId: 'own-group' },
      };
    }),
  };
  const provider = createDshImProvider(transport, 'qq')!;
  const boot = () => {
    const value = createCore({
      dshHome: home,
      ...(onRun
        ? {
            agents: {
              runOrchestrator: onRun,
              async runAssignment() {},
              requestAssignment() {
                throw new Error('Assignments are outside this QQ target test');
              },
              async close() {},
            },
          }
        : {}),
    });
    cores.add(value);
    value.externalMessaging.register(provider);
    return value;
  };
  let core = boot();
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const target = (await provider.targets('own-app'))[0]!;
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: provider.id,
    accountRef: 'own-app',
    fingerprint,
    targetRef: target.ref,
    targetDigest: target.digest,
  });
  return {
    get core() {
      return core;
    },
    transport,
    provider,
    grant,
    async receive() {
      await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
      for (let i = 0; i < 5; i++) await tick();
      if (!consumer) throw new Error('No QQ receiver');
      await consumer.onEvent(
        {
          version: 1,
          channel: 'qq',
          botId: 'own-app',
          fingerprint,
          eventId: 'native-request',
          messageId: 'native-request',
          actor: { kind: 'user', id: 'member' },
          conversation: { kind: 'group', id: 'own-group' },
          mentionedAccount: true,
          mentions: [{ id: 'own-app', key: '<@own-app>' }],
          at: '2026-10-14T00:00:01.000Z',
          text: 'Return this delayed task result here.',
          reply: { messageId: 'native-request', conversationId: 'own-group', actorId: 'member' },
          replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
        },
        { signal: consumer.signal },
      );
      return core.attention
        .list({ botSlug: 'ada' })
        .items.find(
          (item) =>
            core.externalMessaging.inbound.read('ada', item.id).event.messageId ===
            'native-request',
        )!.id;
    },
    async restart() {
      await stop(core);
      core = boot();
    },
  };
}

it('an expired QQ source reply retains the result; only a separate authorized post sends it', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T00:00:00.000Z'));
  const fx = await fixture();
  const source = await fx.receive();
  const dm = fx.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  const before = fx.core.channels.readMessages(dm.id);
  vi.setSystemTime(new Date('2026-10-14T00:06:00.000Z'));
  const text = 'Delayed task result: 221';
  const reply = await fx.core.externalMessaging.reply('ada', source, text);
  expect(reply).toMatchObject({
    state: 'failed',
    reason: 'reply-window-expired',
    sourceEventId: source,
    text,
  });
  expect(fx.transport.sendChecked).not.toHaveBeenCalled();
  expect(
    (await fx.core.externalMessaging.snapshot('ada')).grants.find((g) => g.id === fx.grant.id)
      ?.canPost,
  ).toBe(true);
  const result = await createBridgeMethods(OWNER_HUMAN_CONTEXT, fx.core).messagingSend({
    slug: 'ada',
    grantId: fx.grant.id,
    requestId: 'delayed_result_1154',
    text,
  });
  if (!result.ok) throw new Error(result.error.code);
  expect(result.value.intent).toMatchObject({
    state: 'provider-accepted',
    text,
    report: { platform: 'qq', conversationId: 'own-group' },
    receipt: { messageId: 'native-post', conversationId: 'own-group' },
  });
  expect(result.value.intent.id).not.toBe(reply.id);
  expect(result.value.intent.sourceEventId).toBeUndefined();
  expect(fx.core.channels.readMessages(dm.id)).toEqual(before);
  await fx.core.externalMessaging.post('ada', fx.grant.id, 'delayed_result_1154', text);
  expect(fx.transport.sendChecked).toHaveBeenCalledTimes(1);
});

it('an in-window QQ reply stays a source reply and creates no proactive send', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T00:00:00.000Z'));
  const fx = await fixture();
  const source = await fx.receive();
  expect(await fx.core.externalMessaging.reply('ada', source, 'Quick result')).toMatchObject({
    state: 'provider-accepted',
    sourceEventId: source,
    receipt: { messageId: 'native-reply' },
  });
  expect(fx.transport.sendChecked).not.toHaveBeenCalled();
});

it('the Orchestrator can identify its exact original QQ group before selecting a saved post grant', async () => {
  const targets: unknown[] = [];
  const fx = await fixture(async (run) => {
    if (!run.externalMessaging?.targets) throw new Error('No report targets');
    targets.push(...(await run.externalMessaging.targets()));
  });
  const dm = fx.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  const admission = fx.core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
    channelId: dm.id,
    messageId: 'inspect-qq-targets',
    body: 'Inspect my QQ report destinations',
  });
  if (!admission.admitted) throw new Error(admission.reason);
  await admission.settled;
  expect(targets).toEqual([
    expect.objectContaining({
      grantId: fx.grant.id,
      bindingId: fx.grant.bindingId,
      accountRef: 'own-app',
      platform: 'qq',
      conversationId: 'own-group',
      canPost: true,
    }),
  ]);
  expect(fx.transport.sendChecked).not.toHaveBeenCalled();
});

it.each([
  'send-permission-denied',
  'send-preflight-unavailable',
  'send-rate-limited',
  'network-error',
])('QQ %s retains the result and does not resend after restart', async (code) => {
  const fx = await fixture();
  fx.transport.sendChecked = vi.fn(async () => {
    throw Object.assign(new Error('Native refusal'), { code });
  });
  const result = await fx.core.externalMessaging.post(
    'ada',
    fx.grant.id,
    'retained_result_1154',
    'Retained result',
  );
  expect(result).toMatchObject({
    text: 'Retained result',
    state: code === 'network-error' ? 'unknown-outcome' : 'failed',
  });
  await fx.restart();
  expect(
    await fx.core.externalMessaging.post(
      'ada',
      fx.grant.id,
      'retained_result_1154',
      'Retained result',
    ),
  ).toMatchObject({ id: result.id, state: result.state });
  expect(fx.transport.sendChecked).toHaveBeenCalledTimes(1);
});

it('an unknown QQ source reply never becomes a proactive result or another reply on restart', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T00:00:00.000Z'));
  const fx = await fixture();
  const source = await fx.receive();
  fx.transport.replyChecked = vi.fn(async () => {
    throw new Error('Connection lost after dispatch');
  });
  const reply = await fx.core.externalMessaging.reply('ada', source, 'Uncertain result');
  expect(reply).toMatchObject({ state: 'unknown-outcome', text: 'Uncertain result' });
  await fx.restart();
  expect(await fx.core.externalMessaging.reply('ada', source, 'Uncertain result')).toMatchObject({
    id: reply.id,
    state: 'unknown-outcome',
  });
  expect(fx.transport.replyChecked).toHaveBeenCalledTimes(1);
  expect(fx.transport.sendChecked).not.toHaveBeenCalled();
});

it('QQ proactive receipt must match the original app-scoped saved group', async () => {
  const fx = await fixture();
  fx.core.registry.create({ slug: 'bea', displayName: 'Bea' });
  fx.transport.sendChecked = async () => ({
    sent: true,
    receipt: { version: 1, messageId: 'foreign', conversationId: 'another-group' },
  });
  expect(
    await fx.core.externalMessaging.post('ada', fx.grant.id, 'wrong_receipt_1154', 'Result'),
  ).toMatchObject({ state: 'unknown-outcome' });
  await expect(
    fx.core.externalMessaging.post('bea', fx.grant.id, 'borrowed_result_1154', 'Result'),
  ).rejects.toThrow('grant-unavailable');
});

it.each(['proactive-text-checked', 'proactive-receipt-checked', 'proactive-fence-checked'])(
  'a QQ account without %s is unavailable for posting and causes no native send',
  async (missing) => {
    const fx = await fixture();
    const describe = fx.transport.describeBot;
    fx.transport.describeBot = async (ref) => {
      const info = await describe(ref);
      return { ...info, capabilities: info.capabilities.filter((cap) => cap !== missing) };
    };
    expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.canPost).toBe(false);
    expect(
      await fx.core.externalMessaging.post('ada', fx.grant.id, 'unqualified_1154', 'Result'),
    ).toMatchObject({ state: 'failed', reason: 'capability-unavailable' });
    expect(fx.transport.sendChecked).not.toHaveBeenCalled();
  },
);

it('a final QQ revocation refuses an unstarted proactive effect', async () => {
  const fx = await fixture();
  let entered!: () => void;
  let release!: () => void;
  const began = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let sent = 0;
  fx.transport.sendChecked = async (_account, _target, _text, options) => {
    entered();
    await gate;
    if (options.beforeSend?.() !== true)
      throw Object.assign(new Error('Revoked'), { code: 'send-permission-denied' });
    sent++;
    return { sent: true };
  };
  const pending = fx.core.externalMessaging.post(
    'ada',
    fx.grant.id,
    'revoked_result_1154',
    'Result',
  );
  await began;
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  release();
  expect((await pending).state).not.toBe('provider-accepted');
  expect(sent).toBe(0);
});
