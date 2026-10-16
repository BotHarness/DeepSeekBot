import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTempRoot } from './helpers.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

async function fixture() {
  const core = createCore({ dshHome: createTempRoot('wechat-post-') });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.registry.create({ slug: 'bea', displayName: 'Bea' });
  const fingerprint = 'd'.repeat(64);
  const transport: DshImOutboundService = {
    contractVersion: 1,
    receiptVersion: 1,
    listBots: async () => [{ botId: 'wechat-own', channel: 'weixin' }],
    listTargets: async () => [
      { targetId: 'owner', name: 'Paired owner', kind: 'user', route: { toUserId: 'owner' } },
    ],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'weixin',
      connected: true,
      account: { fingerprint, name: 'Own WeChat' },
      capabilities: [
        'proactive-text-checked',
        'proactive-receipt-checked',
        'proactive-fence-checked',
      ],
    }),
    sendChecked: vi.fn<DshImOutboundService['sendChecked']>(
      async (_account, _target, _text, options) => {
        expect(options.beforeSend?.()).toBe(true);
        return {
          sent: true,
          receipt: {
            version: 1,
            identityKind: 'client-acknowledgement',
            messageId: 'dsh-weixin-client',
            serverMessageId: '18446744073709551615',
            conversationId: 'owner',
          },
        };
      },
    ),
  };
  const provider = createDshImProvider(transport, 'weixin')!;
  core.externalMessaging.register(provider);
  const target = (await provider.targets('wechat-own'))[0]!;
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: provider.id,
    accountRef: 'wechat-own',
    fingerprint,
    targetRef: 'owner',
    targetDigest: target.digest,
  });
  return { core, transport, provider, grant };
}

it('qualified WeChat post is external-only, current-own-authorized and idempotent through the Profile RPC', async () => {
  const { core, transport, grant } = await fixture();
  const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
  const before = core.channels.readMessages(dm.id);
  expect((await core.externalMessaging.snapshot('ada')).grants[0]?.canPost).toBe(true);
  const bridge = createBridgeMethods(core);
  const input = {
    slug: 'ada',
    grantId: grant.id,
    requestId: 'unique_report_910',
    text: 'ONE unsolicited report',
  };
  const result = await bridge.messagingSend(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('post failed');
  expect(result.value.intent).toMatchObject({
    state: 'provider-accepted',
    report: { platform: 'weixin' },
    receipt: { identityKind: 'client-acknowledgement', serverMessageId: '18446744073709551615' },
  });
  expect((await core.externalMessaging.post('ada', grant.id, input.requestId, input.text)).id).toBe(
    result.value.intent.id,
  );
  expect(transport.sendChecked).toHaveBeenCalledTimes(1);
  expect(core.channels.readMessages(dm.id)).toEqual(before);
  await expect(
    core.externalMessaging.post('bea', grant.id, 'borrowed_report', 'refuse'),
  ).rejects.toThrow('grant-unavailable');
  core.externalMessaging.revoke('ada', grant.id);
  expect(core.externalMessaging.inspectIntent('ada', result.value.intent.id).text).toBe(input.text);
  await expect(
    core.externalMessaging.post('ada', grant.id, 'revoked_report', 'refuse'),
  ).rejects.toThrow('grant-revoked');
});

it.each(['grant', 'identity', 'provider'] as const)(
  'final WeChat post fence refuses a concurrent %s change',
  async (change) => {
    const { core, transport, provider, grant } = await fixture();
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let nativeSends = 0;
    transport.sendChecked = async (_account, _target, _text, options) => {
      entered();
      await gate;
      if (options.beforeSend?.() !== true)
        throw Object.assign(new Error('refused'), { code: 'send-permission-denied' });
      nativeSends++;
      return { sent: true };
    };
    const pending = core.externalMessaging.post('ada', grant.id, `race_${change}_910`, 'report');
    await started;
    if (change === 'grant') core.externalMessaging.revoke('ada', grant.id);
    else if (change === 'identity')
      await core.externalMessaging.identity('ada', {
        kind: 'update',
        id: grant.bindingId,
        expectedRevision: 1,
        name: 'Own WeChat',
        enabled: false,
      });
    else core.externalMessaging.register(provider);
    release();
    const result = await pending;
    expect(result.state).not.toBe('provider-accepted');
    expect(nativeSends).toBe(0);
  },
);

it.each([
  ['private-context-unavailable', 'failed'],
  ['private-context-rejected', 'failed'],
  ['network-error', 'unknown-outcome'],
] as const)('WeChat %s retains an honest %s without retries', async (code, state) => {
  const { core, transport, grant } = await fixture();
  let calls = 0;
  transport.sendChecked = async () => {
    calls++;
    throw Object.assign(new Error('private detail'), { code });
  };
  const result = await core.externalMessaging.post('ada', grant.id, 'context_report_910', 'report');
  expect(result.state).toBe(state);
  expect(result.reason).toBe(code === 'network-error' ? 'provider-result-unknown' : code);
  expect(
    (await core.externalMessaging.post('ada', grant.id, 'context_report_910', 'report')).id,
  ).toBe(result.id);
  expect(calls).toBe(1);
});

it('WeChat rejects a borrowed correspondence or falsely native receipt', async () => {
  const { core, transport, grant } = await fixture();
  for (const [requestId, receipt] of [
    [
      'foreign_receipt',
      {
        version: 1 as const,
        identityKind: 'client-acknowledgement' as const,
        messageId: 'ack',
        conversationId: 'stranger',
      },
    ],
    ['false_native', { version: 1 as const, messageId: 'client', conversationId: 'owner' }],
  ] as const) {
    transport.sendChecked = async () => ({ sent: true, receipt });
    expect((await core.externalMessaging.post('ada', grant.id, requestId, 'report')).state).toBe(
      'unknown-outcome',
    );
  }
});

it.each(['proactive-text-checked', 'proactive-receipt-checked', 'proactive-fence-checked'])(
  'a WeChat account without %s stays unavailable even with the legacy global fence version',
  async (missing) => {
    const { core, transport, grant } = await fixture();
    transport.postFenceVersion = 1;
    const describe = transport.describeBot;
    transport.describeBot = async (ref) => {
      const info = await describe(ref);
      return { ...info, capabilities: info.capabilities.filter((cap) => cap !== missing) };
    };
    core.externalMessaging.register(createDshImProvider(transport, 'weixin')!);
    expect((await core.externalMessaging.snapshot('ada')).grants[0]?.canPost).toBe(false);
    const pending = core.externalMessaging.post('ada', grant.id, 'unqualified_1988', 'Result');
    if (missing === 'proactive-text-checked')
      await expect(pending).rejects.toThrow('provider-incompatible');
    else
      await expect(pending).resolves.toMatchObject({
        state: 'failed',
        reason: 'capability-unavailable',
      });
    expect(transport.sendChecked).not.toHaveBeenCalled();
  },
);
