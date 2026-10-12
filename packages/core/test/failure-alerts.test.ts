import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import { MessagingProviderError, type MessagingInboundEvent } from '../src/messaging/provider.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
  vi.useRealTimers();
});
async function fixture() {
  const agents: BotAgentAdapter = {
    async runOrchestrator() {
      throw new Error('TRANSPORT: private-token=do-not-send and confidential prompt');
    },
    async runAssignment() {},
    requestAssignment() {
      throw Error('No Assignment expected');
    },
    async close() {},
  };
  const dshHome = createTempRoot('bh-failure-alert-');
  const core = createCore({ dshHome, agents });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.channels.getOrCreateDm('ada', 'Ada');
  let receiver: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  let disposition: 'none' | 'known' | 'unknown' = 'none';
  let qualify = async () => {};
  let reply = async () => {};
  const texts: string[] = [];
  let receiptCount = 0;
  const replies = vi.fn<NonNullable<DshImOutboundService['replyChecked']>>(
    async (_bot, route, text, input) => {
      if (input.beforeSend && !input.beforeSend())
        throw new MessagingProviderError('authorization-changed', 'not-started');
      if (text.includes('Bot work failed') || text.includes('Work-failure alert test')) {
        await reply();
        if (disposition !== 'none')
          throw new MessagingProviderError(
            'test-unavailable',
            disposition === 'known' ? 'not-started' : 'unknown',
          );
        texts.push(text);
      }
      return {
        sent: true,
        receipt: {
          version: 1,
          messageId: `om_${++receiptCount}`,
          conversationId: route.conversationId,
        },
      };
    },
  );
  const service: DshImOutboundService = {
    contractVersion: 1,
    approvalCardVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'qa', channel: 'feishu' }],
    listTargets: async () => [],
    describeBot: async () => ({
      version: 1,
      channel: 'feishu',
      botId: 'qa',
      account: { fingerprint: 'a'.repeat(64), name: 'QA' },
      connected: true,
      capabilities: [
        'proactive-text-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'approval-card-checked',
        'approval-card-update-checked',
        'approval-action-consumer',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
      ],
    }),
    sendChecked: async () => ({ sent: true }),
    replyChecked: replies,
    qualifyReplyChecked: async (_bot, route) => {
      await qualify();
      return route;
    },
    approvalCardChecked: async (_bot, route) => ({
      sent: true,
      receipt: { version: 1, messageId: 'om_card', conversationId: route.conversationId },
    }),
    consumeInbound: async (_bot, input) => {
      receiver = input;
      return () => {};
    },
  };
  core.externalMessaging.register(createDshImProvider(service)!);
  const binding = await core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/feishu',
    accountRef: 'qa',
    fingerprint: 'a'.repeat(64),
  });
  await vi.waitFor(() => expect(receiver).toBeDefined());
  const event: MessagingInboundEvent = {
    version: 1,
    channel: 'feishu',
    botId: 'qa',
    fingerprint: 'a'.repeat(64),
    eventId: 'e_pair',
    messageId: 'om_pair',
    actor: { kind: 'user', id: 'ou_reviewer', name: 'Reviewer' },
    conversation: { kind: 'dm', id: 'oc_private' },
    mentions: [],
    mentionedAccount: false,
    at: new Date().toISOString(),
    text: '/pair',
    reply: { messageId: 'om_pair', conversationId: 'oc_private', actorId: 'ou_reviewer' },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  };
  await receiver!.onEvent(event, { signal: receiver!.signal });
  const pairing = core.externalMessaging.pairing.list('ada')[0]!;
  core.externalMessaging.pairing.review('ada', {
    kind: 'approve',
    id: pairing.id,
    expectedRevision: pairing.revision,
    capabilities: ['approve', 'reject'],
  });
  await core.externalMessaging.approvals.setRoute('ada', pairing.id, 0);
  const api = createBridgeMethods({ ...core });
  let input = 0;
  const fail = async () => {
    const admitted = core.runtime.admitDmMessage({
      channelId: 'dm-ada',
      messageId: `human_${++input}`,
      body: 'Start a failing task',
    });
    if (!admitted.admitted) throw Error(admitted.reason);
    await expect(admitted.settled).rejects.toThrow('private-token');
    return core.channels.readMessages('dm-ada').find((m) => m.sessionFailure)!;
  };
  const enable = () => api.failureAlertsSet({ slug: 'ada', enabled: true, expectedRevision: 0 });
  return {
    core,
    dshHome,
    agents,
    api,
    texts,
    replies,
    binding,
    pairing,
    fail,
    enable,
    setDisposition: (value: typeof disposition) => {
      disposition = value;
    },
    holdQualify: (value: () => Promise<void>) => {
      qualify = value;
    },
    holdReply: (value: () => Promise<void>) => {
      reply = value;
    },
    replaceProvider: () => core.externalMessaging.register(createDshImProvider(service)!),
  };
}

it('delivers an opt-in committed Runtime failure through the shared checked private route without copying private content', async () => {
  const f = await fixture();
  await f.fail();
  expect(f.core.externalMessaging.failureAlerts.snapshot('ada').deliveries).toEqual([]);
  expect(await f.enable()).toMatchObject({ ok: true });
  const failure = await f.fail();
  await vi.waitFor(() =>
    expect(f.core.externalMessaging.failureAlerts.snapshot('ada').deliveries[0]?.state).toBe(
      'provider-accepted',
    ),
  );
  const snapshot = f.core.externalMessaging.failureAlerts.snapshot('ada');
  expect(snapshot.deliveries[0]).toMatchObject({
    messageId: failure.id,
    channelId: 'dm-ada',
    attempts: 1,
  });
  expect(f.texts).toHaveLength(1);
  expect(f.texts[0]).toContain(failure.sessionFailure!.sessionId);
  expect(f.texts[0]).not.toMatch(/private-token|confidential|TRANSPORT/);
  f.core.externalMessaging.failureAlerts.committed({
    channelId: 'dm-ada',
    message: failure,
    revision: 2,
  });
  expect(f.core.externalMessaging.failureAlerts.snapshot('ada').deliveries).toHaveLength(1);
  expect(f.core.externalMessaging.pairing.list('ada')[0]?.capabilities).toEqual([
    'approve',
    'reject',
  ]);
  expect(f.core.toolRules.list('ada')).toEqual([]);
});

it('test-send is explicitly labelled and event settings are revision-checked through management RPC', async () => {
  const f = await fixture();
  expect(await f.api.failureAlertsTest({ slug: 'ada' })).toMatchObject({ ok: false });
  await f.enable();
  expect(
    await f.api.failureAlertsSet({ slug: 'ada', enabled: false, expectedRevision: 0 }),
  ).toMatchObject({ ok: false, error: { code: 'failure-alert-settings-stale' } });
  expect(await f.api.failureAlertsTest({ slug: 'ada' })).toMatchObject({
    ok: true,
    value: { delivery: { state: 'provider-accepted' } },
  });
  expect(f.texts[0]).toContain('No work failed');
  expect(f.core.channels.readMessages('dm-ada').some((m) => m.sessionFailure)).toBe(false);
});

it('ordinary failure-like output and a foreign Session do not create alerts', async () => {
  const f = await fixture();
  await f.enable();
  await f.core.channels.appendMessage('dm-ada', {
    id: 'ordinary-output',
    at: new Date().toISOString(),
    author: { kind: 'bot', slug: 'ada' },
    body: 'Work failed, says the model',
  });
  f.core.registry.create({ slug: 'bea', displayName: 'Bea' });
  f.core.ownership.claim({
    sessionId: 'foreign',
    botSlug: 'bea',
    rootRole: 'orchestrator',
    at: new Date().toISOString(),
  });
  await f.core.channels.appendMessage('dm-ada', {
    id: 'foreign-failure',
    at: new Date().toISOString(),
    author: { kind: 'bot', slug: 'ada' },
    body: 'Foreign failure',
    sessionFailure: { sessionId: 'foreign', role: 'orchestrator', detail: 'Private foreign error' },
  });
  expect(f.core.externalMessaging.failureAlerts.snapshot('ada').deliveries).toEqual([]);
  expect(f.texts).toEqual([]);
});

it('a missing destination is visible without inventing a route or sending to the source conversation', async () => {
  const f = await fixture();
  await f.enable();
  await f.core.externalMessaging.approvals.setRoute('ada', undefined, 1);
  await f.fail();
  expect(f.core.externalMessaging.failureAlerts.snapshot('ada')).toMatchObject({
    enabled: true,
    available: false,
    deliveries: [{ state: 'cancelled', attempts: 0, reason: 'destination-unavailable' }],
  });
  expect(f.texts).toEqual([]);
});

it.each(['disable-alert', 'disable-route', 'revoke-pairing', 'replace-provider'] as const)(
  'delayed qualification cannot send after %s',
  async (change) => {
    const f = await fixture();
    await f.enable();
    let release = () => {};
    let entered = false;
    f.holdQualify(() => {
      entered = true;
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    await f.fail();
    await vi.waitFor(() => expect(entered).toBe(true));
    if (change === 'disable-alert')
      await f.api.failureAlertsSet({ slug: 'ada', enabled: false, expectedRevision: 1 });
    if (change === 'disable-route')
      await f.core.externalMessaging.approvals.setRoute('ada', undefined, 1);
    if (change === 'revoke-pairing')
      f.core.externalMessaging.pairing.review('ada', {
        kind: 'revoke',
        id: f.pairing.id,
        expectedRevision: 2,
      });
    if (change === 'replace-provider') f.replaceProvider();
    release();
    await vi.waitFor(() =>
      expect(f.core.externalMessaging.failureAlerts.snapshot('ada').deliveries[0]?.state).toBe(
        'failed',
      ),
    );
    expect(f.texts).toEqual([]);
    expect(f.core.externalMessaging.failureAlerts.snapshot('ada').deliveries[0]?.attempts).toBe(1);
    if (change === 'replace-provider')
      await f.api.failureAlertsSet({ slug: 'ada', enabled: false, expectedRevision: 1 });
  },
);

it('qualification deadline expiry never permits the late result to dispatch', async () => {
  const f = await fixture();
  await f.enable();
  let release = () => {};
  let entered = false;
  f.holdQualify(() => {
    entered = true;
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  await f.fail();
  await vi.waitFor(() => expect(entered).toBe(true));
  await vi.waitFor(
    () =>
      expect(f.core.externalMessaging.failureAlerts.snapshot('ada').deliveries[0]?.state).toBe(
        'failed',
      ),
    { timeout: 17000, interval: 100 },
  );
  release();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(f.texts).toEqual([]);
  expect(f.core.externalMessaging.failureAlerts.snapshot('ada').deliveries[0]?.attempts).toBe(1);
  await f.api.failureAlertsSet({ slug: 'ada', enabled: false, expectedRevision: 1 });
}, 20000);

it.each(['pending', 'sending'] as const)(
  'restart reconciles persisted %s without replay',
  async (phase) => {
    const f = await fixture();
    await f.enable();
    const hold = () => new Promise<void>(() => {});
    if (phase === 'pending') f.holdQualify(hold);
    else f.holdReply(hold);
    await f.fail();
    await vi.waitFor(() =>
      expect(f.core.externalMessaging.failureAlerts.snapshot('ada').deliveries[0]?.state).toBe(
        phase,
      ),
    );
    f.core.externalMessaging.close();
    await f.core.runtime.close();
    f.core.operationalDatabase.close();
    cores.splice(cores.indexOf(f.core), 1);
    const restarted = createCore({ dshHome: f.dshHome, agents: f.agents });
    cores.push(restarted);
    expect(restarted.externalMessaging.failureAlerts.snapshot('ada').deliveries[0]).toMatchObject({
      state: phase === 'pending' ? 'cancelled' : 'unknown-outcome',
      reason: 'host-restart',
      attempts: 1,
    });
    expect(f.texts).toEqual([]);
    const row = restarted.externalMessaging.failureAlerts.snapshot('ada').deliveries[0]!;
    expect(
      await createBridgeMethods({ ...restarted }).failureAlertsRetry({ slug: 'ada', id: row.id }),
    ).toMatchObject({ ok: false });
  },
);

it('unknown outcomes cannot be automatically or manually replayed', async () => {
  const f = await fixture();
  await f.enable();
  f.setDisposition('unknown');
  await f.fail();
  await vi.waitFor(() =>
    expect(f.core.externalMessaging.failureAlerts.snapshot('ada').deliveries[0]?.state).toBe(
      'unknown-outcome',
    ),
  );
  const row = f.core.externalMessaging.failureAlerts.snapshot('ada').deliveries[0]!;
  expect(await f.api.failureAlertsRetry({ slug: 'ada', id: row.id })).toMatchObject({ ok: false });
  expect(row.attempts).toBe(1);
  expect(f.texts).toEqual([]);
});

it('known-unsent delivery has a finite three-attempt budget', async () => {
  const f = await fixture();
  await f.enable();
  f.setDisposition('known');
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await f.fail();
  await vi.advanceTimersByTimeAsync(3000);
  const row = f.core.externalMessaging.failureAlerts.snapshot('ada').deliveries[0]!;
  expect(row).toMatchObject({ state: 'failed', attempts: 3 });
  expect(await f.api.failureAlertsRetry({ slug: 'ada', id: row.id })).toMatchObject({ ok: false });
  await vi.advanceTimersByTimeAsync(30000);
  expect(f.core.externalMessaging.failureAlerts.snapshot('ada').deliveries[0]?.attempts).toBe(3);
});
