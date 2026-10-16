import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type {
  MessagingInboundEvent,
  MessagingReplyRoute,
  MessagingVoice,
} from '../src/messaging/provider.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTempRoot } from './helpers.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it.each<{ voice?: MessagingVoice }>([
  {},
  { voice: { transcript: 'platform', itemId: 'voice-item', durationMs: 2500 } },
  { voice: { transcript: 'unavailable' } },
])(
  'WeChat paired-owner DM retains source provenance and canonical Inbox without opt-in local DM mirrors (%j)',
  async ({ voice }) => {
    const fingerprint = 'd'.repeat(64);
    let consumer: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
    let runs = 0;
    let core: BotHarnessCore;
    const replies: { account: string; route: MessagingReplyRoute; text: string }[] = [];
    core = createCore({
      dshHome: createTempRoot('botharness-weixin-'),
      agents: {
        async runOrchestrator(run) {
          runs++;
          const source = core.attention
            .list({ botSlug: 'ada' })
            .items.find((item) => item.sourceKind === 'bridge-message');
          expect(source).toBeDefined();
          expect(run.externalMessaging!.read(source!.id).event.voice).toEqual(voice);
          if (voice) expect(run.inbox).toContain(JSON.stringify(voice));
          await run.externalMessaging!.reply(source!.id, 'WECHAT-QA-OK');
        },
        async runAssignment() {},
        requestAssignment() {
          return { delivery: 'steer' };
        },
        async stopAssignment() {},
        async close() {},
      },
    });
    cores.push(core);
    expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const transport: DshImOutboundService = {
      contractVersion: 1,
      replyContextVersion: 1,
      replyReceiptVersion: 1,
      replyFenceVersion: 1,
      listBots: async () => [{ botId: 'weixin-qa', channel: 'weixin' }],
      listTargets: async () => [
        {
          targetId: 'qa',
          name: 'QR paired owner',
          kind: 'user',
          route: { toUserId: 'owner' },
        },
      ],
      describeBot: async (botId) => ({
        version: 1,
        botId,
        channel: 'weixin',
        connected: true,
        account: { fingerprint, name: 'WeChat QA Bot' },
        capabilities: [
          'proactive-text-checked',
          'exclusive-text-consumer',
          'reply-text-checked',
          'reply-context-checked',
          'reply-receipt-checked',
          'reply-fence-checked',
          ...(voice ? ['source-voice-transcript-checked'] : []),
        ],
      }),
      sendChecked: vi.fn(async (): Promise<{ sent: true }> => ({ sent: true })),
      consumeInbound: async (_account, options) => {
        expect(options.ordinaryText).toBeUndefined();
        expect(options.sourceFiles).toBeUndefined();
        expect(options.sourceVoiceTranscripts).toBe(voice ? true : undefined);
        consumer = options;
        return () => {};
      },
      qualifyReplyChecked: async (_account, route) => route,
      replyChecked: async (account, route, text, options) => {
        expect(options.beforeSend?.()).toBe(true);
        replies.push({ account, route, text });
        return {
          sent: true,
          receipt: {
            version: 1,
            messageId: 'dsh-weixin-qa-client',
            conversationId: route.conversationId,
            identityKind: 'client-acknowledgement',
          },
        };
      },
    };
    const provider = createDshImProvider(transport, 'weixin')!;
    core.externalMessaging.register(provider);
    expect(await createDshImProvider(transport, 'slack')!.accounts()).toEqual([]);
    expect(provider.post).toBeUndefined();
    expect(provider.readFile).toBeUndefined();
    const target = (await core.externalMessaging.targets(provider.id, 'weixin-qa'))[0]!;
    expect(target.receiveScope).toEqual({ kind: 'dm', conversationId: 'owner' });
    const grant = await core.externalMessaging.authorize({
      botSlug: 'ada',
      providerId: provider.id,
      accountRef: 'weixin-qa',
      targetRef: 'qa',
      fingerprint,
      targetDigest: target.digest,
    });
    await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
    const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
    expect(await core.externalMessaging.channelBridges(dm.id)).toMatchObject({
      bridges: [expect.objectContaining({ delivery: 'inbox', collection: 'all' })],
      sources: [expect.objectContaining({ platform: 'weixin' })],
    });
    await expect(
      core.externalMessaging.inbound.channelBridge(dm.id, {
        kind: 'add',
        grantId: grant.id,
        expectedGrantRevision: grant.revision,
        delivery: 'inbox',
        name: 'unsupported route',
        enabled: true,
        collection: 'mentions',
      }),
    ).rejects.toThrow('capability-unavailable');
    const source: MessagingInboundEvent = {
      version: 1,
      channel: 'weixin',
      botId: 'weixin-qa',
      fingerprint,
      eventId: 'gateway:qa:42',
      messageId: '777777777777777777',
      actor: { kind: 'user', id: 'owner' },
      conversation: { kind: 'dm', id: 'owner' },
      mentions: [],
      mentionedAccount: false,
      at: new Date().toISOString(),
      text:
        voice?.transcript === 'unavailable'
          ? '[WeChat voice message: platform did not provide a transcript]'
          : 'Reply in my WeChat DM',
      ...(voice ? { voice } : {}),
      reply: {
        messageId: '777777777777777777',
        actorId: 'owner',
        conversationId: 'owner',
      },
      replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    };
    await expect(
      consumer!.onEvent(
        { ...source, channel: 'slack', voice: undefined },
        { signal: consumer!.signal },
      ),
    ).rejects.toThrow('untrusted-source');
    await expect(
      consumer!.onEvent({ ...source, botId: 'wrong-account' }, { signal: consumer!.signal }),
    ).rejects.toThrow('untrusted-source');
    await consumer!.onEvent(
      { ...source, conversation: { kind: 'group', id: 'owner' } },
      { signal: consumer!.signal },
    );
    await consumer!.onEvent(
      {
        ...source,
        conversation: { kind: 'dm', id: 'stranger' },
        reply: { ...source.reply, conversationId: 'stranger' },
      },
      { signal: consumer!.signal },
    );
    if (!voice)
      await expect(
        consumer!.onEvent(
          { ...source, voice: { transcript: 'platform' } },
          { signal: consumer!.signal },
        ),
      ).rejects.toThrow('untrusted-source');
    await consumer!.onEvent(source, { signal: consumer!.signal });
    if (voice)
      await expect(
        consumer!.onEvent(
          { ...source, voice: { ...voice, durationMs: 9999 } },
          { signal: consumer!.signal },
        ),
      ).rejects.toThrow('source-conflict');
    await consumer!.onEvent({ ...source, eventId: 'gateway:qa:43' }, { signal: consumer!.signal });
    await tick();
    await core.runtime.whenIdle();
    await tick();
    expect(runs).toBe(1);
    expect(replies).toEqual([{ account: 'weixin-qa', route: source.reply, text: 'WECHAT-QA-OK' }]);
    expect(core.attention.list({ botSlug: 'ada' }).items[0]).toMatchObject({
      externalOrigin: {
        platform: 'weixin',
        conversationName: 'QR paired owner',
        senderId: 'owner',
      },
    });
    const db = attachOperationalModule(core.operationalDatabase, 'test');
    expect(
      db.read((database) =>
        database.prepare("SELECT * FROM source_events WHERE source_kind = 'bridge-message'").all(),
      ),
    ).toHaveLength(1);
    expect(
      db.read((database) => database.prepare('SELECT * FROM inbox_admissions').all()),
    ).toMatchObject([{ reason: 'human-dm', attempt_state: 'handled' }]);
    expect(
      db.read((database) => database.prepare('SELECT * FROM channel_placements').all()),
    ).toHaveLength(0);
    expect(core.channels.readMessages(dm.id)).toEqual([]);
    await core.externalMessaging.revoke('ada', grant.id);
    await expect(consumer!.onEvent(source, { signal: consumer!.signal })).rejects.toThrow();
    expect(replies).toHaveLength(1);
    expect(core.externalMessaging.history('ada')[0]?.receipt).toMatchObject({
      identityKind: 'client-acknowledgement',
      messageId: 'dsh-weixin-qa-client',
    });
  },
);
