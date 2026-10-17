import { rmSync } from 'node:fs';
import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import { recordReceptionPath } from '../src/messaging/reception-paths.js';
import { channelBridgeRoutes } from '../src/messaging/channel-bridge.js';
import type { MessagingGrant } from '../src/messaging/outbound.js';
import type { MessagingInboundEvent } from '../src/messaging/provider.js';
import { createAttachmentHttp } from '../src/attachments/http.js';
import { createTempRoot } from './helpers.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4S8AAAAASUVORK5CYII=',
  'base64',
);
const fingerprint = 'a'.repeat(64);
const image = {
  id: 'b'.repeat(64),
  messageId: 'image-message',
  resourceKey: 'private-key',
  name: 'image',
  mediaType: 'image/unknown',
};
const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

async function fixture(inboxOnly = false, twoPaths = false, file = false, video = false) {
  const mp4 = Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex');
  const bytes = video ? mp4 : file ? Buffer.from('name,quantity\nalpha,17\n') : png;
  const attachment =
    file || video
      ? {
          id: 'c'.repeat(64),
          messageId: 'file-parent-message',
          resourceKey: 'private-key',
          name: video ? 'qa-video.mp4' : 'qa-source.csv',
          ...(video ? { mediaType: 'video/unknown' } : {}),
        }
      : image;
  const home = createTempRoot('bh-channel-media-');
  let consumer: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  const run = vi.fn(async () => {});
  const make = () =>
    createCore({
      dshHome: home,
      agents: {
        runOrchestrator: run,
        runAssignment: async () => {},
        requestAssignment: () => ({ delivery: 'steer' }),
        stopAssignment: async () => {},
        close: async () => {},
      },
    });
  let core = make();
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const download = vi.fn(async function* () {
    yield bytes;
  });
  const service: DshImOutboundService = {
    contractVersion: 1,
    fileVersion: 1,
    listBots: async () => [{ botId: 'account', channel: 'feishu' }],
    listTargets: async () => [
      ...(twoPaths
        ? [
            {
              targetId: 'independent',
              kind: 'group',
              name: 'Independent target',
              route: { chatId: 'team' },
            },
          ]
        : []),
      { targetId: 'team', kind: 'group', name: 'Lark QA', route: { chatId: 'team' } },
    ],
    describeBot: async () => ({
      version: 1,
      botId: 'account',
      channel: 'feishu',
      account: { fingerprint },
      connected: true,
      capabilities: [
        'proactive-text-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'source-file-checked',
        'reply-file-checked',
        'source-image-checked',
        ...(video ? ['source-video-checked'] : []),
      ],
    }),
    sendChecked: async () => ({ sent: true }),
    replyChecked: async () => ({ sent: true }),
    consumeInbound: async (_id, input) => {
      consumer = input;
      return () => {};
    },
    readSourceFile: async (_id, _route, item) =>
      item.id === image.id && video
        ? (async function* () {
            yield png;
          })()
        : download(),
    replyFileChecked: async () => ({ sent: true }),
  };
  core.externalMessaging.register(createDshImProvider(service)!);
  const targets = await core.externalMessaging.targets('dsh-im/feishu', 'account');
  const target = targets.find((item) => item.ref === 'team')!;
  let independentGrant: MessagingGrant | undefined;
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: 'dsh-im/feishu',
    accountRef: 'account',
    targetRef: 'team',
    fingerprint,
    targetDigest: target.digest,
  });
  const created = createBridgeMethods({ ...core }).channelCreate({
    name: 'Media QA',
    members: ['ada'],
  });
  if (!created.ok) throw new Error(created.error.message);
  const channelId = inboxOnly
    ? core.channels.getOrCreateDm('ada', 'Ada')!.id
    : created.value.channel.id;
  await core.externalMessaging.inbound.channelBridge(channelId, {
    kind: 'add',
    grantId: grant.id,
    expectedGrantRevision: grant.revision,
    name: 'Lark QA',
    enabled: true,
    collection: 'mentions',
    delivery: inboxOnly ? 'inbox' : 'channel',
  });
  if (twoPaths) {
    const independent = await core.externalMessaging.authorize({
      botSlug: 'ada',
      providerId: 'dsh-im/feishu',
      accountRef: 'account',
      targetRef: 'independent',
      fingerprint,
      targetDigest: targets.find((item) => item.ref === 'independent')!.digest,
    });
    independentGrant = independent;
    await core.externalMessaging.inbound.channelBridge(channelId, {
      kind: 'add',
      grantId: independent.id,
      expectedGrantRevision: independent.revision,
      name: 'Independent Lark QA',
      enabled: true,
      collection: 'mentions',
      delivery: 'channel',
    });
  }
  const event: MessagingInboundEvent = {
    version: 1,
    channel: 'feishu',
    botId: 'account',
    fingerprint,
    eventId: 'image-event',
    messageId: image.messageId,
    actor: { kind: 'user', id: 'human', name: 'Alex' },
    conversation: { kind: 'group', id: 'team' },
    mentions: [{ id: 'bot', key: '@bot' }],
    mentionedAccount: true,
    at: new Date(Date.now() + 100).toISOString(),
    text: 'Before\nAfter',
    attachments: [attachment, ...(video ? [{ ...image, messageId: attachment.messageId }] : [])],
    ...(video
      ? { video: { itemId: attachment.id, durationMs: 4000, posterAttachmentId: image.id } }
      : {}),
    ...(file || video
      ? {}
      : {
          contentParts: [
            { kind: 'text' as const, text: 'Before\n' },
            { kind: 'attachment' as const, id: attachment.id },
            { kind: 'text' as const, text: 'After' },
          ],
        }),
    reply: {
      messageId: image.messageId,
      conversationId: 'team',
      actorId: 'human',
      ...(file || video ? { parentId: attachment.messageId } : {}),
    },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  };
  await consumer!.onEvent(event, { signal: consumer!.signal });
  await tick();
  await core.runtime.whenIdle();
  const sourceEventId = core.attention
    .list({ botSlug: 'ada' })
    .items.find((item) => item.sourceKind === 'bridge-message')!.id;
  if (independentGrant) {
    const snapshot = await core.externalMessaging.snapshot('ada');
    const recorded = snapshot.grants.find((item) => item.id === independentGrant!.id)!;
    attachOperationalModule(core.operationalDatabase, 'media-test').transaction((db) => {
      recordReceptionPath(db, sourceEventId, 'ada', recorded, channelBridgeRoutes(recorded)[0]!, {
        reason: 'group-mention',
        mode: 'immediate',
        count: 1,
        intervalMs: 0,
        policyRevision: 1,
        sourceRevision: 1,
        defaultRevision: 1,
      });
    });
  }
  const read = (attachmentId = attachment.id, id = channelId) =>
    core.externalMessaging.readChannelMedia({
      channelId: id,
      sourceEventId,
      attachmentId,
      signal: new AbortController().signal,
    });
  const counts = () =>
    attachOperationalModule(core.operationalDatabase, 'media-test').read((db) =>
      ['source_events', 'inbox_admissions', 'channel_placements'].map((table) =>
        db.prepare(`SELECT count(*) AS n FROM ${table}`).get(),
      ),
    );
  const stop = async () => {
    const row = (await core.externalMessaging.channelBridges(channelId)).bridges[0]!;
    await core.externalMessaging.inbound.channelBridge(channelId, {
      kind: 'update',
      grantId: row.grantId,
      expectedGrantRevision: row.grantRevision,
      expectedRevision: row.revision,
      name: row.name,
      collection: row.collection,
      enabled: false,
    });
  };
  return {
    get core() {
      return core;
    },
    service,
    grant,
    event,
    consumer,
    channelId,
    sourceEventId,
    download,
    attachment,
    bytes,
    read,
    playback: () =>
      core.externalMessaging.readChannelMedia({
        channelId,
        sourceEventId,
        attachmentId: attachment.id,
        representation: 'playback',
        signal: new AbortController().signal,
      }),
    counts,
    run,
    stop,
    async restart() {
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
      cores.splice(cores.indexOf(core), 1);
      core = make();
      cores.push(core);
      core.externalMessaging.register(createDshImProvider(service)!);
      await tick();
      await tick();
    },
  };
}

it('projects a checked Lark native video and platform cover once; explicit playback shares original bytes without attention or transcoding', async () => {
  const fx = await fixture(false, false, false, true);
  expect(fx.consumer?.sourceVideos).toBe(true);
  const messages = fx.core.channels.readMessages(fx.channelId);
  expect(messages).toHaveLength(1);
  expect(messages[0]?.bridgeMedia).toMatchObject({
    video: { attachmentId: fx.attachment.id, durationMs: 4000, posterAttachmentId: image.id },
    items: [{ kind: 'video', name: 'qa-video.mp4' }, { kind: 'image' }],
  });
  expect(JSON.stringify(messages)).not.toContain('private-key');
  expect(fx.download).not.toHaveBeenCalled();
  const before = fx.counts();
  const runs = fx.run.mock.calls.length;
  const playback = await fx.playback();
  expect(playback.inline).toBe(true);
  expect(playback.ref.mime).toBe('video/mp4');
  expect(Buffer.from(await new Response(playback.body).arrayBuffer())).toEqual(fx.bytes);
  const original = await fx.read();
  expect(original.inline).toBe(false);
  expect(Buffer.from(await new Response(original.body).arrayBuffer())).toEqual(fx.bytes);
  const cover = await fx.read(image.id);
  expect(cover.ref.mime).toBe('image/png');
  expect(Buffer.from(await new Response(cover.body).arrayBuffer())).toEqual(png);
  expect(fx.download).toHaveBeenCalledTimes(1);
  await fx.restart();
  expect(fx.core.channels.readMessages(fx.channelId)[0]?.bridgeMedia).toEqual(
    messages[0]?.bridgeMedia,
  );
  const cached = await fx.playback();
  await cached.body.cancel();
  expect(fx.download).toHaveBeenCalledTimes(1);
  expect(fx.counts()).toEqual(before);
  expect(fx.run).toHaveBeenCalledTimes(runs);
});

it('refuses a Lark video association changed to another parent, primary resource, poster or unsupported content', async () => {
  const fx = await fixture(false, false, false, true);
  for (const event of [
    { ...fx.event, video: { ...fx.event.video!, itemId: image.id } },
    { ...fx.event, video: { ...fx.event.video!, posterAttachmentId: fx.attachment.id } },
    { ...fx.event, reply: { ...fx.event.reply, parentId: 'other-parent' } },
    { ...fx.event, mentionedAccount: false },
  ]) {
    await expect(fx.consumer!.onEvent(event, { signal: fx.consumer!.signal })).rejects.toThrow(
      'untrusted-source',
    );
  }
  fx.download.mockImplementation(async function* () {
    yield Buffer.from('not a video');
  });
  await expect(fx.playback()).rejects.toThrow('media-format-unsupported');
  const original = await fx.read();
  expect(Buffer.from(await new Response(original.body).arrayBuffer()).toString()).toBe(
    'not a video',
  );
  expect(fx.download).toHaveBeenCalledTimes(1);
});

it('video playback follows stop-before-acquire, stopped cache and identity revocation rules', async () => {
  const fx = await fixture(false, false, false, true);
  await fx.stop();
  await expect(fx.playback()).rejects.toThrow('source-unavailable');
  expect(fx.download).not.toHaveBeenCalled();
  const second = await fixture(false, false, false, true);
  const first = await second.playback();
  await first.body.cancel();
  await second.stop();
  const cached = await second.playback();
  await cached.body.cancel();
  const identity = (await second.core.externalMessaging.snapshot('ada')).identities![0]!;
  await second.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: identity.id,
    expectedRevision: identity.revision,
  });
  await expect(second.playback()).rejects.toThrow('source-unavailable');
  expect(second.download).toHaveBeenCalledTimes(1);
});

it('requires the Lark video capability instead of borrowing file or image qualification', async () => {
  const fx = await fixture(false, false, false, true);
  const info = await fx.service.describeBot('account');
  let input: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  const provider = createDshImProvider({
    ...fx.service,
    describeBot: async () => ({
      ...info,
      capabilities: info.capabilities.filter((cap) => cap !== 'source-video-checked'),
    }),
    consumeInbound: async (
      _id: string,
      options: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1],
    ) => {
      input = options;
      return () => {};
    },
  })!;
  await provider.consume!({
    accountRef: 'account',
    fingerprint,
    signal: new AbortController().signal,
    onEvent: async () => ({ accepted: true }),
  });
  expect(input?.sourceVideos).toBeUndefined();
  await expect(input!.onEvent(fx.event, { signal: input!.signal })).rejects.toThrow(
    'untrusted-source',
  );
  fx.service.describeBot = async () => ({
    ...info,
    capabilities: info.capabilities.filter((cap) => cap !== 'source-video-checked'),
  });
  await expect(fx.playback()).rejects.toThrow('provider-incompatible');
  expect(fx.download).not.toHaveBeenCalled();
});

it('retains an independently valid video path but does not resurrect missing original bytes', async () => {
  const fx = await fixture(false, true, false, true);
  const first = await fx.playback();
  await first.body.cancel();
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  const independent = await fx.playback();
  await independent.body.cancel();
  expect(independent.ref.fileId).toBe(first.ref.fileId);
  rmSync(fx.core.attachments.fileTarget(first.ref.fileId!).path);
  await expect(fx.playback()).rejects.toThrow('unavailable');
  expect(fx.download).toHaveBeenCalledTimes(1);
});

it('projects a Lark source file in its original bubble and downloads its exact original without new attention', async () => {
  const fx = await fixture(false, false, true);
  const message = fx.core.channels.readMessages(fx.channelId)[0]!;
  expect(message.bridgeMedia?.items).toEqual([
    { id: fx.attachment.id, kind: 'file', name: 'qa-source.csv' },
  ]);
  expect(message.bridgeMedia?.parts).toEqual(fx.event.contentParts);
  expect(JSON.stringify(message)).not.toContain(image.resourceKey);
  const before = fx.counts();
  const runs = fx.run.mock.calls.length;
  const result = await fx.read();
  expect(Buffer.from(await new Response(result.body).arrayBuffer())).toEqual(fx.bytes);
  expect(result.inline).toBe(false);
  const methods = createBridgeMethods({ ...fx.core });
  const target = await methods.channelMediaTarget({
    channelId: fx.channelId,
    sourceEventId: fx.sourceEventId,
    attachmentId: fx.attachment.id,
  });
  expect(target).toMatchObject({ ok: true, value: { target: { kind: 'file' } } });
  expect(fx.download).toHaveBeenCalledTimes(1);
  await fx.restart();
  expect(fx.core.channels.readMessages(fx.channelId)[0]?.bridgeMedia).toEqual(message.bridgeMedia);
  const retained = await fx.read();
  expect(Buffer.from(await new Response(retained.body).arrayBuffer())).toEqual(fx.bytes);
  expect(fx.download).toHaveBeenCalledTimes(1);
  expect(fx.counts()).toEqual(before);
  expect(fx.run).toHaveBeenCalledTimes(runs);
});

it('projects one ordered native message, hides resource keys, and acquires without new Inbox/model activity', async () => {
  const fx = await fixture();
  const messages = fx.core.channels.readMessages(fx.channelId);
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({
    author: { kind: 'bridged', source: 'Alex' },
    bridgeMedia: {
      items: [{ id: image.id, kind: 'image', name: 'image' }],
      parts: fx.event.contentParts,
    },
  });
  expect(JSON.stringify(messages)).not.toContain(image.resourceKey);
  await expect(
    fx.consumer!.onEvent(
      { ...fx.event, contentParts: [...fx.event.contentParts!].reverse() },
      { signal: fx.consumer!.signal },
    ),
  ).rejects.toThrow('source-conflict');
  expect(fx.core.channels.readMessages(fx.channelId)).toHaveLength(1);
  const before = fx.counts();
  const runs = fx.run.mock.calls.length;
  const first = await fx.read();
  expect(Buffer.from(await new Response(first.body).arrayBuffer())).toEqual(png);
  const second = await fx.read();
  await second.body.cancel();
  expect(first.ref.fileId).toBe(second.ref.fileId);
  expect(fx.download).toHaveBeenCalledTimes(1);
  expect(fx.counts()).toEqual(before);
  expect(fx.run).toHaveBeenCalledTimes(runs);
  await fx.restart();
  const cached = await fx.read();
  await cached.body.cancel();
  expect(cached.ref.fileId).toBe(first.ref.fileId);
  expect(fx.download).toHaveBeenCalledTimes(1);
  expect(fx.core.channels.readMessages(fx.channelId)[0]?.bridgeMedia).toEqual(
    messages[0]?.bridgeMedia,
  );
});

it.each([false, true])(
  'stopping reception forbids new acquisition but retains acquired bytes; identity unbind forbids cached serving (file=%s)',
  async (file) => {
    const fx = await fixture(false, false, file);
    await fx.stop();
    await expect(fx.read()).rejects.toThrow('source-unavailable');
    expect(fx.download).not.toHaveBeenCalled();
    const second = await fixture(false, false, file);
    const first = await second.read();
    await first.body.cancel();
    await second.stop();
    const cached = await second.read();
    await cached.body.cancel();
    expect(second.download).toHaveBeenCalledTimes(1);
    const identity = (await second.core.externalMessaging.snapshot('ada')).identities![0]!;
    await second.core.externalMessaging.identity('ada', {
      kind: 'unbind',
      id: identity.id,
      expectedRevision: identity.revision,
    });
    await expect(second.read()).rejects.toThrow('source-unavailable');
    expect(
      await createBridgeMethods({ ...second.core }).channelMediaTarget({
        channelId: second.channelId,
        sourceEventId: second.sourceEventId,
        attachmentId: second.attachment.id,
      }),
    ).toMatchObject({ ok: false, error: { code: 'source-unavailable' } });
  },
);

it('rejects wrong media/Channel, Inbox-only placement and purged bytes without resurrection', async () => {
  const fx = await fixture();
  await expect(fx.read('c'.repeat(64))).rejects.toThrow('source-unavailable');
  await expect(fx.read(image.id, 'wrong-channel')).rejects.toThrow('channel-unavailable');
  const first = await fx.read();
  await first.body.cancel();
  rmSync(fx.core.attachments.fileTarget(first.ref.fileId!).path);
  await expect(fx.read()).rejects.toThrow('unavailable');
  expect(fx.download).toHaveBeenCalledTimes(1);
  const inbox = await fixture(true);
  expect(inbox.core.channels.readMessages(inbox.channelId)).toHaveLength(0);
  await expect(inbox.read()).rejects.toThrow('source-unavailable');
  expect(inbox.download).not.toHaveBeenCalled();
});

it('revocation cancels a stalled checked acquisition', async () => {
  const fx = await fixture();
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  fx.service.readSourceFile = async (_id, _route, _attachment, options) => {
    entered();
    return (async function* () {
      await new Promise<void>((_resolve, reject) =>
        options.signal.addEventListener('abort', () => reject(options.signal.reason), {
          once: true,
        }),
      );
      yield png;
    })();
  };
  const pending = fx.read();
  await started;
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  await expect(pending).rejects.toThrow();
  await expect(fx.read()).rejects.toThrow('source-unavailable');
});

it('HTTP uses Channel authority with no Bot selector, rejects mixed selectors, and returns sniffed inline MIME', async () => {
  const fx = await fixture();
  const http = createAttachmentHttp(fx.core.attachments, fx.core.channels, undefined, (input) =>
    fx.core.externalMessaging.readChannelMedia(input),
  );
  const url =
    'http://localhost/api/botharness/attachment?' +
    new URLSearchParams({
      channelId: fx.channelId,
      sourceEventId: fx.sourceEventId,
      attachmentId: image.id,
    });
  expect((await http(new Request(url + '&slug=ada'))).status).toBe(400);
  const response = await http(new Request(url));
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/png');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('content-disposition')).toMatch(/^inline;/);
  await response.arrayBuffer();
});

it.each([false, true])(
  'a separately recorded valid reception path retains access after the first is revoked (file=%s)',
  async (file) => {
    const fx = await fixture(false, true, file);
    expect(fx.core.channels.readMessages(fx.channelId)).toHaveLength(1);
    const first = await fx.read();
    await first.body.cancel();
    fx.core.externalMessaging.revoke('ada', fx.grant.id);
    const independent = await fx.read();
    await independent.body.cancel();
    expect(independent.ref.fileId).toBe(first.ref.fileId);
    expect(fx.download).toHaveBeenCalledTimes(1);
    const remaining = (await fx.core.externalMessaging.snapshot('ada')).grants.find(
      (item) => item.id !== fx.grant.id,
    )!;
    fx.core.externalMessaging.revoke('ada', remaining.id);
    await expect(fx.read()).rejects.toThrow('source-unavailable');
  },
);

it.each([false, true])(
  'a lost Human membership refuses serving previously acquired bytes (file=%s)',
  async (file) => {
    const fx = await fixture(false, false, file);
    const first = await fx.read();
    await first.body.cancel();
    attachOperationalModule(fx.core.operationalDatabase, 'media-test').transaction((db) =>
      db
        .prepare(
          "UPDATE channel_human_members SET left_at = ? WHERE channel_id = ? AND human_id = 'local-human'",
        )
        .run(new Date().toISOString(), fx.channelId),
    );
    await expect(fx.read()).rejects.toThrow('channel-unavailable');
    expect(fx.download).toHaveBeenCalledTimes(1);
  },
);

it('unsupported sniffed content returns 422 and an over-limit checked Provider returns 413', async () => {
  const fx = await fixture();
  fx.download.mockImplementation(async function* () {
    yield Buffer.from('<svg>unsafe preview</svg>');
  });
  const http = createAttachmentHttp(fx.core.attachments, fx.core.channels, undefined, (input) =>
    fx.core.externalMessaging.readChannelMedia(input),
  );
  const request = () =>
    new Request(
      'http://localhost/api/botharness/attachment?' +
        new URLSearchParams({
          channelId: fx.channelId,
          sourceEventId: fx.sourceEventId,
          attachmentId: image.id,
        }),
    );
  expect((await http(request())).status).toBe(422);
  const second = await fixture();
  second.service.readSourceFile = async () => {
    throw Object.assign(new Error('bounded'), { code: 'artifact-too-large' });
  };
  const limited = createAttachmentHttp(
    second.core.attachments,
    second.core.channels,
    undefined,
    (input) => second.core.externalMessaging.readChannelMedia(input),
  );
  expect(
    (
      await limited(
        new Request(
          'http://localhost/api/botharness/attachment?' +
            new URLSearchParams({
              channelId: second.channelId,
              sourceEventId: second.sourceEventId,
              attachmentId: image.id,
            }),
        ),
      )
    ).status,
  ).toBe(413);
});
