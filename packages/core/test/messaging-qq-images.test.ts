import { expect, it, vi } from 'vitest';
import { setImmediate as tick } from 'node:timers/promises';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent } from '../src/messaging/provider.js';

it('accepts negotiated QQ mention images with ordered content and original message provenance', async () => {
  const fingerprint = 'a'.repeat(64);
  type Consumer = Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];
  let consumer: Consumer | undefined;
  const service: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    fileVersion: 1,
    listBots: async () => [{ botId: 'qq-app', channel: 'qq' }],
    listTargets: async () => [],
    describeBot: async () => ({
      version: 1,
      botId: 'qq-app',
      channel: 'qq',
      connected: true,
      account: { fingerprint },
      capabilities: [
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
        'source-file-checked',
        'reply-file-checked',
        'source-image-checked',
        'reply-image-fence-checked',
      ],
    }),
    sendChecked: async () => ({ sent: true }),
    replyChecked: async () => ({ sent: true }),
    consumeInbound: async (_account, options) => {
      consumer = options;
      return () => {};
    },
    readSourceFile: async () =>
      (async function* () {
        yield new Uint8Array([1]);
      })(),
    replyFileChecked: async () => ({ sent: true }),
  };
  const provider = createDshImProvider(service, 'qq');
  if (!provider?.consume) throw new Error('QQ public consumer unavailable');
  const accepted = vi.fn(async (_event: MessagingInboundEvent, _signal: AbortSignal) => ({
    accepted: true as const,
  }));
  const stop = await provider.consume({
    accountRef: 'qq-app',
    fingerprint,
    signal: new AbortController().signal,
    onEvent: accepted,
  });
  if (!consumer) throw new Error('QQ native consumer unavailable');
  const attachment = {
    id: 'b'.repeat(64),
    messageId: 'native-image-message',
    resourceKey: 'opaque-private-selector',
    name: 'image',
    mediaType: 'image/unknown',
  };
  const event: MessagingInboundEvent = {
    version: 1,
    channel: 'qq',
    botId: 'qq-app',
    fingerprint,
    eventId: 'native-image-message',
    messageId: 'native-image-message',
    actor: { kind: 'user', id: 'app-scoped-human', name: 'QA Human' },
    conversation: { kind: 'group', id: 'app-scoped-group' },
    mentions: [],
    mentionedAccount: true,
    at: '2026-10-08T00:00:00.000Z',
    text: 'Count the shapes',
    attachments: [attachment],
    contentParts: [
      { kind: 'text', text: 'Count the shapes' },
      { kind: 'attachment', id: attachment.id },
    ],
    reply: {
      messageId: 'native-image-message',
      conversationId: 'app-scoped-group',
      actorId: 'app-scoped-human',
    },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  };
  await expect(consumer.onEvent(event, { signal: consumer.signal })).resolves.toEqual({
    accepted: true,
  });
  expect(consumer.sourceImages).toBe(true);
  expect(accepted).toHaveBeenCalledExactlyOnceWith(event, consumer.signal);
  stop();
});

it.each(['native', 'missing', 'wrong-group', 'client-ack', 'no-capability'] as const)(
  'validates a checked QQ image receipt and MIME: %s',
  async (outcome) => {
    const fingerprint = 'a'.repeat(64);
    const sent: Parameters<NonNullable<DshImOutboundService['replyFileChecked']>>[2][] = [];
    const service: DshImOutboundService = {
      contractVersion: 1,
      fileVersion: 1,
      replyContextVersion: 1,
      replyReceiptVersion: 1,
      replyFenceVersion: 1,
      listBots: async () => [{ botId: 'qq-app', channel: 'qq' }],
      listTargets: async () => [],
      describeBot: async () => ({
        version: 1,
        botId: 'qq-app',
        channel: 'qq',
        connected: true,
        account: { fingerprint },
        capabilities: [
          'exclusive-text-consumer',
          'reply-text-checked',
          'source-file-checked',
          'reply-file-checked',
          'source-image-checked',
          'reply-image-fence-checked',
          ...(outcome === 'no-capability' ? [] : ['reply-file-receipt-checked']),
        ],
      }),
      consumeInbound: async () => () => {},
      sendChecked: async () => ({ sent: true }),
      replyChecked: async () => ({ sent: true }),
      readSourceFile: async () =>
        (async function* () {
          yield new Uint8Array([1]);
        })(),
      replyFileChecked: async (_account, _route, file) => {
        sent.push(file);
        return {
          sent: true,
          ...(outcome === 'missing'
            ? {}
            : {
                receipt: {
                  version: 1,
                  messageId: 'native-image-result',
                  conversationId: outcome === 'wrong-group' ? 'another-group' : 'app-scoped-group',
                  ...(outcome === 'client-ack'
                    ? { identityKind: 'client-acknowledgement' as const }
                    : {}),
                },
              }),
        };
      },
    };
    const provider = createDshImProvider(service, 'qq');
    if (!provider?.replyFile) throw new Error('QQ checked image output unavailable');
    const file = {
      id: 'result',
      name: 'result.png',
      bytes: new Uint8Array([1]),
      mediaType: 'image/png',
    };
    const pending = provider.replyFile({
      accountRef: 'qq-app',
      fingerprint,
      route: {
        messageId: 'source',
        conversationId: 'app-scoped-group',
        actorId: 'app-scoped-human',
      },
      file,
      signal: new AbortController().signal,
      beforeSend: () => true,
    });
    if (outcome !== 'native') {
      await expect(pending).rejects.toMatchObject({
        code: outcome === 'no-capability' ? 'capability-unavailable' : 'provider-result-unknown',
      });
      expect(sent).toHaveLength(outcome === 'no-capability' ? 0 : 1);
      return;
    }
    expect(await pending).toEqual({
      accepted: true,
      receipt: { version: 1, messageId: 'native-image-result', conversationId: 'app-scoped-group' },
    });
    expect(sent).toEqual([file]);
  },
);

it('QQ image preview reuses canonical intake, adds no Bot wake, and preserves its checked result receipt across restart', async () => {
  const home = createTempRoot('bh-qq-image-canonical-');
  const fingerprint = 'a'.repeat(64);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4S8AAAAASUVORK5CYII=',
    'base64',
  );
  let receiver: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  const runs = vi.fn(async () => {});
  const download = vi.fn(async function* () {
    yield png;
  });
  const nativeReply = vi.fn(async (_account, route, _file, options) => {
    if (!options.beforeSend?.()) throw new Error('stale-route');
    return {
      sent: true as const,
      receipt: {
        version: 1 as const,
        messageId: 'qq-image-result',
        conversationId: route.conversationId,
      },
    };
  });
  const service: DshImOutboundService = {
    contractVersion: 1,
    fileVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'qq-app', channel: 'qq' }],
    listTargets: async () => [],
    describeBot: async () => ({
      version: 1,
      botId: 'qq-app',
      channel: 'qq',
      connected: true,
      account: { fingerprint },
      capabilities: [
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
        'source-file-checked',
        'reply-file-checked',
        'source-image-checked',
        'reply-image-fence-checked',
        'reply-file-receipt-checked',
      ],
    }),
    sendChecked: async () => ({ sent: true }),
    replyChecked: async () => ({ sent: true }),
    consumeInbound: async (_account, options) => {
      receiver = options;
      return () => {};
    },
    readSourceFile: async () => download(),
    replyFileChecked: nativeReply,
    qualifyReplyChecked: async (_account, route) => route,
  };
  const boot = () => {
    const core = createCore({
      dshHome: home,
      agents: {
        runOrchestrator: runs,
        runAssignment: async () => {},
        requestAssignment: () => ({ delivery: 'steer' }),
        stopAssignment: async () => {},
        close: async () => {},
      },
    });
    core.externalMessaging.register(createDshImProvider(service, 'qq')!);
    return core;
  };
  let core = boot();
  const idle = async () => {
    for (let index = 0; index < 4; index++) await tick();
    await core.runtime.whenIdle();
  };
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.registry.create({ slug: 'bea', displayName: 'Bea' });
    await core.externalMessaging.identity('ada', {
      kind: 'bind',
      providerId: 'dsh-im/qq',
      accountRef: 'qq-app',
      fingerprint,
    });
    await idle();
    const attachment = {
      id: 'b'.repeat(64),
      messageId: 'qq-image-source',
      resourceKey: 'private-selector',
      name: 'image',
      mediaType: 'image/png',
    };
    const receive = async (messageId: string) => {
      if (!receiver) throw new Error('QQ receiver unavailable');
      const image = { ...attachment, messageId };
      await receiver.onEvent(
        {
          version: 1,
          channel: 'qq',
          botId: 'qq-app',
          fingerprint,
          eventId: messageId,
          messageId,
          actor: { kind: 'user', id: 'human' },
          conversation: { kind: 'group', id: 'qq-group' },
          mentions: [],
          mentionedAccount: true,
          at: new Date(Date.now() + 100).toISOString(),
          text: 'Count the shapes',
          attachments: [image],
          contentParts: [
            { kind: 'text', text: 'Count the shapes' },
            { kind: 'attachment', id: image.id },
          ],
          reply: { messageId, conversationId: 'qq-group', actorId: 'human' },
          replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
        },
        { signal: receiver.signal },
      );
      await idle();
      return core.attention
        .list({ botSlug: 'ada' })
        .items.find(
          (item) =>
            core.externalMessaging.inbound.read('ada', item.id).event.messageId === messageId,
        )!.id;
    };
    await receive('discovery');
    const room = core.channels.createGroup({ name: 'QQ Images', members: ['ada', 'bea'] });
    const grant = (await core.externalMessaging.snapshot('ada')).grants[0]!;
    await core.externalMessaging.inbound.channelBridge(room.id, {
      kind: 'add',
      grantId: grant.id,
      expectedGrantRevision: grant.revision,
      name: 'QQ QA',
      enabled: true,
      collection: 'mentions',
      delivery: 'channel',
    });
    const sourceId = await receive(attachment.messageId);
    expect(core.channels.readMessages(room.id)).toHaveLength(1);
    expect(core.channels.readMessages(room.id)[0]?.bridgeMedia?.items).toMatchObject([
      { id: attachment.id, kind: 'image' },
    ]);
    expect(JSON.stringify(core.channels.readMessages(room.id))).not.toContain('private-selector');
    const wakeCount = runs.mock.calls.length;
    const admissionCount = core.attention.list({ botSlug: 'ada' }).items.length;
    const preview = await core.externalMessaging.readChannelMedia({
      channelId: room.id,
      sourceEventId: sourceId,
      attachmentId: attachment.id,
      signal: new AbortController().signal,
    });
    expect(Buffer.from(await new Response(preview.body).arrayBuffer())).toEqual(png);
    expect(runs).toHaveBeenCalledTimes(wakeCount);
    expect(core.attention.list({ botSlug: 'ada' }).items).toHaveLength(admissionCount);
    expect(download).toHaveBeenCalledTimes(1);
    await expect(
      core.externalMessaging.acquireFile('bea', sourceId, attachment.id),
    ).rejects.toThrow();
    const acquired = await core.externalMessaging.acquireFile('ada', sourceId, attachment.id);
    expect(acquired.fileId).toBe(preview.ref.fileId);
    expect(download).toHaveBeenCalledTimes(1);
    const result = await core.attachments.upload({
      name: 'result.png',
      data: (async function* () {
        yield png;
      })(),
    });
    await expect(core.externalMessaging.replyFile('bea', sourceId, result)).rejects.toThrow();
    const sent = await core.externalMessaging.replyFile('ada', sourceId, result);
    expect(sent).toMatchObject({
      state: 'provider-accepted',
      receipt: {
        version: 1,
        messageId: 'qq-image-result',
        conversationId: 'qq-group',
      },
    });
    expect(nativeReply).toHaveBeenCalledTimes(1);
    expect(nativeReply.mock.calls[0]?.[2]).toMatchObject({ mediaType: 'image/png' });
    await expect(core.externalMessaging.replyFile('ada', sourceId, result)).resolves.toEqual(sent);
    await expect(
      core.externalMessaging.reply('ada', sourceId, 'Another payload'),
    ).rejects.toMatchObject({
      code: 'request-conflict',
    });
    expect(nativeReply).toHaveBeenCalledTimes(1);
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
    core = boot();
    await idle();
    expect(core.externalMessaging.history('ada')[0]?.receipt).toEqual(sent.receipt);
    expect(core.channels.readMessages(room.id)).toHaveLength(1);
    const restored = await core.externalMessaging.readChannelMedia({
      channelId: room.id,
      sourceEventId: sourceId,
      attachmentId: attachment.id,
      signal: new AbortController().signal,
    });
    expect(restored.ref.fileId).toBe(preview.ref.fileId);
    await restored.body.cancel();
    expect(download).toHaveBeenCalledTimes(1);
    const identity = (await core.externalMessaging.snapshot('ada')).identities![0]!;
    await core.externalMessaging.identity('ada', {
      kind: 'unbind',
      id: identity.id,
      expectedRevision: identity.revision,
    });
    await expect(
      core.externalMessaging.readChannelMedia({
        channelId: room.id,
        sourceEventId: sourceId,
        attachmentId: attachment.id,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();
  } finally {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
