import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent } from '../src/messaging/provider.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createAttachmentStore } from '../src/attachments/store.js';
import { createTempRoot } from './helpers.js';
import { encode } from 'silk-wasm';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
const fingerprint = 'a'.repeat(64);
const attachment = {
  id: 'b'.repeat(64),
  messageId: 'file-message',
  resourceKey: 'file-resource',
  name: 'source.zip',
};
const event: MessagingInboundEvent = {
  version: 1,
  channel: 'feishu',
  botId: 'account',
  fingerprint,
  eventId: 'event',
  messageId: 'mention',
  actor: { kind: 'user', id: 'human' },
  conversation: { kind: 'group', id: 'team' },
  mentions: [{ id: 'bot', key: '@_user_1' }],
  mentionedAccount: true,
  at: '2026-10-01T00:00:00.000Z',
  text: 'Process the attached ZIP',
  attachments: [attachment],
  reply: {
    messageId: 'mention',
    conversationId: 'team',
    actorId: 'human',
    threadId: 'topic',
    parentId: 'file-message',
  },
  replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
};
async function fixture(
  onRun?: (run: OrchestratorAgentRun) => Promise<void>,
  platform: 'feishu' | 'slack' | 'weixin' | 'discord' = 'feishu',
  image = false,
  voice = false,
  video = false,
) {
  const { parentId: _parentId, ...slackReply } = event.reply;
  const platformEvent: MessagingInboundEvent =
    platform === 'slack' || platform === 'discord'
      ? {
          ...event,
          channel: platform,
          attachments: [{ ...attachment, messageId: event.messageId }],
          reply: slackReply,
        }
      : platform === 'weixin'
        ? {
            ...event,
            channel: platform,
            attachments: [
              {
                ...attachment,
                messageId: event.messageId,
                ...(image ? { name: 'image', mediaType: 'image/unknown' } : {}),
                ...(voice ? { name: 'voice.silk', mediaType: 'audio/unknown' } : {}),
                ...(video ? { name: 'video.mp4', mediaType: 'video/unknown' } : {}),
              },
            ],
            ...(voice ? { voice: { transcript: 'unavailable' as const, encodeType: 6 } } : {}),
            ...(video
              ? { video: { playLength: 7000, reportedSizeBytes: 48, itemId: 'video-item' } }
              : {}),
            conversation: { kind: 'dm', id: 'team' },
            mentions: [],
            mentionedAccount: false,
            reply: { messageId: event.messageId, conversationId: 'team', actorId: 'human' },
          }
        : event;
  const home = realpathSync(createTempRoot('bh-bridge-files-'));
  const project = join(home, 'project');
  mkdirSync(project);
  const workspace = {
    id: 'project',
    path: project,
    title: 'Project',
    status: async () => 'ok' as const,
  };
  const makeCore = () =>
    createCore({
      dshHome: home,
      workspaces: () => ({
        get: (id) => (id === 'project' ? workspace : undefined),
        list: () => [workspace],
      }),
      agents: {
        runOrchestrator: async (run) => {
          await onRun?.(run);
        },
        runAssignment: async () => {},
        requestAssignment: () => ({ delivery: 'steer' }),
        stopAssignment: async () => {},
        close: async () => {},
      },
    });
  let core = makeCore();
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  let receive: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  const download = vi.fn(async function* () {
    yield Buffer.from('original bytes');
  });
  const observed: { state: string | undefined; body: string }[] = [];
  const reply = vi.fn(async (_bot: string, _route: unknown, file: { bytes: Uint8Array }) => {
    observed.push({
      state: core.externalMessaging.history('ada')[0]?.state,
      body: Buffer.from(file.bytes).toString(),
    });
    return { sent: true as const };
  });
  const service: DshImOutboundService = {
    contractVersion: 1,
    fileVersion: 1,
    listBots: async () => [{ botId: 'account', channel: platform }],
    listTargets: async () => [
      {
        targetId: 'team',
        kind:
          platform === 'weixin'
            ? 'user'
            : platform === 'slack'
              ? 'conversation'
              : platform === 'discord'
                ? 'channel'
                : 'group',
        route:
          platform === 'weixin'
            ? { toUserId: 'team' }
            : platform === 'slack' || platform === 'discord'
              ? { channelId: 'team' }
              : { chatId: 'team' },
      },
    ],
    describeBot: async () => ({
      version: 1,
      botId: 'account',
      channel: platform,
      account: { fingerprint },
      connected: true,
      capabilities: [
        'proactive-text-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'source-file-checked',
        'reply-file-checked',
        ...(platform === 'weixin' ? ['reply-file-fence-checked'] : []),
        ...(image ? ['source-image-checked', 'reply-image-fence-checked'] : []),
        ...(voice ? ['source-voice-transcript-checked', 'source-voice-audio-checked'] : []),
        ...(video ? ['source-video-checked', 'reply-video-fence-checked'] : []),
      ],
    }),
    sendChecked: async () => ({ sent: true }),
    replyChecked: async () => ({ sent: true }),
    consumeInbound: async (_id, input) => {
      expect(input.sourceFiles).toBe(true);
      expect(input.sourceImages).toBe(image ? true : undefined);
      expect(input.sourceVoiceAudio).toBe(voice ? true : undefined);
      expect(input.sourceVideos).toBe(video ? true : undefined);
      receive = input;
      return () => {};
    },
    readSourceFile: async () => download(),
    replyFileChecked: reply,
  };
  core.externalMessaging.register(createDshImProvider(service, platform)!);
  const target = (await core.externalMessaging.targets(`dsh-im/${platform}`, 'account'))[0]!;
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: `dsh-im/${platform}`,
    accountRef: 'account',
    targetRef: 'team',
    fingerprint,
    targetDigest: target.digest,
  });
  await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
  const source = async (value = platformEvent) => {
    await receive!.onEvent(value, { signal: receive!.signal });
    await tick();
    await core.runtime.whenIdle();
    return core.attention
      .list({ botSlug: 'ada' })
      .items.find((item) => item.sourceKind === 'bridge-message')!.id;
  };
  return {
    get core() {
      return core;
    },
    project,
    platformEvent,
    grant,
    service,
    source,
    download,
    reply,
    observed,
    async restart() {
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
      cores.splice(cores.indexOf(core), 1);
      core = makeCore();
      cores.push(core);
      core.externalMessaging.register(createDshImProvider(service, platform)!);
      await tick();
      await tick();
      expect(core.externalMessaging.inbound.status(grant.id)).toBe('receiving');
    },
  };
}

it.each(['feishu', 'slack', 'weixin', 'discord'] as const)(
  '%s trusted source reaches writable native files and a selected same-topic file reply without creating a Channel',
  async (platform) => {
    let grantId = '';
    let resultId = '';
    const fx = await fixture(async (run) => {
      const items = fx.core.attention.list({ botSlug: 'ada' }).items;
      const id = items.find((item) => item.sourceKind === 'bridge-message')!.id;
      const saved = await run.externalMessaging!.saveFile({
        sourceEventId: id,
        attachmentId: attachment.id,
        grantId,
        destinationPath: 'work.zip',
      });
      expect(readFileSync(saved.path, 'utf8')).toBe('original bytes');
      writeFileSync(saved.path, 'processed bytes');
      const imported = await run.channels.importAttachment!({ filePath: saved.path });
      resultId = imported.fileId!;
      expect(imported.fileId).not.toBe(saved.source.fileId);
      expect(() => run.externalMessaging!.replyFile(id, saved.source.fileId!)).toThrow(
        'Select a result',
      );
      expect((await run.externalMessaging!.replyFile(id, imported.fileId!)).state).toBe(
        'provider-accepted',
      );
      expect(readFileSync(fx.core.attachments.fileTarget(saved.source.fileId!).path, 'utf8')).toBe(
        'original bytes',
      );
    }, platform);
    const workspaceGrant = await fx.core.grants.create('ada', 'project');
    grantId = workspaceGrant.id;
    fx.core.grants.setOrchestratorWrite('ada', grantId, true);
    await fx.source();
    expect(fx.observed).toEqual([{ state: 'in-flight', body: 'processed bytes' }]);
    expect(fx.core.externalMessaging.history('ada')[0]?.state).toBe('provider-accepted');
    expect(fx.reply).toHaveBeenCalledTimes(1);
    expect(fx.reply.mock.calls[0]?.[1]).toEqual(fx.platformEvent.reply);
    expect(fx.core.externalMessaging.history('ada')[0]?.file?.fileId).toBe(resultId);
    expect(fx.core.channels.list()).toEqual([]);
  },
);

it('receipt and restart use the same file identity without fetching again; missing originals fail instead of reappearing', async () => {
  const fx = await fixture();
  const id = await fx.source();
  expect(fx.download).not.toHaveBeenCalled();
  const original = await fx.core.externalMessaging.acquireFile('ada', id, attachment.id);
  const reopened = createAttachmentStore({ rootDir: fx.core.attachments.rootDir });
  const duplicate = await reopened.acquire({
    uploadId: original.fileId!.slice(5),
    name: attachment.name,
    signal: new AbortController().signal,
    load: async () => {
      throw new Error('Must not refetch');
    },
  });
  expect(duplicate.fileId).toBe(original.fileId);
  await fx.core.externalMessaging.acquireFile('ada', id, attachment.id);
  expect(fx.download).toHaveBeenCalledTimes(1);
  rmSync(fx.core.attachments.fileTarget(original.fileId!).path);
  await expect(fx.core.externalMessaging.acquireFile('ada', id, attachment.id)).rejects.toThrow(
    'unavailable',
  );
  expect(fx.download).toHaveBeenCalledTimes(1);
});

it('wrong Bot, provider account, parent or attachment id and changed replay metadata cannot select remote bytes', async () => {
  const fx = await fixture();
  const id = await fx.source();
  await expect(fx.core.externalMessaging.acquireFile('other', id, attachment.id)).rejects.toThrow();
  await expect(fx.core.externalMessaging.acquireFile('ada', id, 'other')).rejects.toThrow(
    'attachment-unavailable',
  );
  await expect(
    fx.source({ ...event, attachments: [{ ...attachment, messageId: 'other' }] }),
  ).rejects.toThrow('untrusted-source');
  await expect(fx.source({ ...event, fingerprint: 'c'.repeat(64) })).rejects.toThrow(
    'untrusted-source',
  );
  await expect(
    fx.source({ ...event, attachments: [{ ...attachment, resourceKey: 'other' }] }),
  ).rejects.toThrow('source-conflict');
  expect(fx.download).not.toHaveBeenCalled();
});

it('revocation interrupts a stalled transfer and blocks subsequent provider access', async () => {
  const fx = await fixture();
  const id = await fx.source();
  let entered: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  fx.service.readSourceFile = async (_id, _route, _attachment, options) => {
    entered();
    return (async function* () {
      await new Promise<void>((_resolve, reject) =>
        options.signal.addEventListener('abort', () => reject(new Error('cancelled')), {
          once: true,
        }),
      );
      yield Buffer.from('late');
    })();
  };
  const pending = fx.core.externalMessaging.acquireFile('ada', id, attachment.id);
  await started;
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  await expect(pending).rejects.toThrow('transfer-cancelled');
  await expect(fx.core.externalMessaging.acquireFile('ada', id, attachment.id)).rejects.toThrow(
    'source-unavailable',
  );
});

it('unknown file send outcome is durable and never blindly retried', async () => {
  const fx = await fixture();
  const id = await fx.source();
  const file = await fx.core.attachments.upload({
    name: 'result.zip',
    data: (async function* () {
      yield Buffer.from('processed bytes');
    })(),
  });
  fx.service.replyFileChecked = async () => {
    throw Object.assign(new Error('uncertain'), { code: 'reply-result-unknown' });
  };
  const first = await fx.core.externalMessaging.replyFile('ada', id, file);
  expect(first.state).toBe('unknown-outcome');
  expect(await fx.core.externalMessaging.replyFile('ada', id, file)).toEqual(first);
  await expect(fx.core.externalMessaging.reply('ada', id, 'Different reply')).rejects.toThrow(
    'request-conflict',
  );
});

it.each(['file-upload-failed', 'file-provider-rejected'])(
  'records %s as a definite failure without retrying the file effect',
  async (code) => {
    const fx = await fixture();
    const id = await fx.source();
    const file = await fx.core.attachments.upload({
      name: 'result.zip',
      data: (async function* () {
        yield Buffer.from('processed bytes');
      })(),
    });
    const send = vi.fn(async () => {
      throw Object.assign(new Error('rejected'), { code });
    });
    fx.service.replyFileChecked = send;
    const result = await fx.core.externalMessaging.replyFile('ada', id, file);
    expect(result).toMatchObject({ state: 'failed', reason: code });
    expect(await fx.core.externalMessaging.replyFile('ada', id, file)).toEqual(result);
    expect(send).toHaveBeenCalledTimes(1);
  },
);

it('a missing selected result settles before any provider file effect', async () => {
  const fx = await fixture();
  const id = await fx.source();
  const file = await fx.core.attachments.upload({
    name: 'result.zip',
    data: (async function* () {
      yield Buffer.from('processed bytes');
    })(),
  });
  rmSync(fx.core.attachments.fileTarget(file.fileId!).path);
  expect(await fx.core.externalMessaging.replyFile('ada', id, file)).toMatchObject({
    state: 'failed',
    reason: 'file-unavailable',
  });
  expect(fx.reply).not.toHaveBeenCalled();
});

it.each(['provider-accepted', 'unknown-outcome'])(
  'preserves the %s file intent over a real owner restart and redelivery without another file send',
  async (state) => {
    const fx = await fixture();
    const id = await fx.source();
    const file = await fx.core.attachments.upload({
      name: 'result.zip',
      data: (async function* () {
        yield Buffer.from('processed bytes');
      })(),
    });
    const send = vi.fn(async () => {
      if (state === 'unknown-outcome')
        throw Object.assign(new Error('uncertain'), { code: 'reply-result-unknown' });
      return { sent: true as const };
    });
    fx.service.replyFileChecked = send;
    const result = await fx.core.externalMessaging.replyFile('ada', id, file);
    expect(result.state).toBe(state);
    await fx.restart();
    expect(await fx.source()).toBe(id);
    expect(fx.core.externalMessaging.history('ada')[0]?.file?.fileId).toBe(file.fileId);
    expect(await fx.core.externalMessaging.replyFile('ada', id, file)).toEqual(result);
    expect(send).toHaveBeenCalledTimes(1);
  },
);

it('Slack source metadata survives canonical intake and refuses unrelated message attachments', async () => {
  const fx = await fixture(undefined, 'slack');
  const source = {
    ...fx.platformEvent,
    attachments: [
      { ...attachment, messageId: event.messageId, sizeBytes: 14, mediaType: 'application/zip' },
    ],
  };
  const id = await fx.source(source);
  const detail = fx.core.externalMessaging.inbound.read('ada', id);
  expect(detail.event.attachments).toEqual(source.attachments);
  await expect(
    fx.source({
      ...source,
      eventId: 'unrelated',
      messageId: 'other',
      reply: { ...source.reply, messageId: 'other' },
    }),
  ).rejects.toThrow('untrusted-source');
  expect(fx.download).not.toHaveBeenCalled();
});

it('WeChat carries a current-authorization fence through upload and refuses a revoked final send', async () => {
  const fx = await fixture(undefined, 'weixin');
  const id = await fx.source();
  const file = await fx.core.attachments.upload({
    name: 'result.zip',
    data: (async function* () {
      yield Buffer.from('processed bytes');
    })(),
  });
  let finalSends = 0;
  fx.service.replyFileChecked = async (_bot, _route, _file, options) => {
    expect(options.beforeSend?.()).toBe(true);
    fx.core.externalMessaging.revoke('ada', fx.grant.id);
    expect(options.beforeSend?.()).toBe(false);
    if (options.beforeSend?.()) finalSends++;
    throw Object.assign(new Error('revoked'), { code: 'stale-route' });
  };
  const result = await fx.core.externalMessaging.replyFile('ada', id, file);
  expect(result.state).not.toBe('provider-accepted');
  expect(finalSends).toBe(0);
  await expect(fx.core.externalMessaging.replyFile('ada', id, file)).rejects.toThrow(
    'source-unavailable',
  );
});

it('WeChat preserves large-file metadata for inspection without treating it as an acquired artifact', async () => {
  const fx = await fixture(undefined, 'weixin');
  const incoming = {
    ...fx.platformEvent,
    attachments: [{ ...attachment, messageId: event.messageId, sizeBytes: 30 * 1024 * 1024 }],
  };
  const id = await fx.source(incoming);
  expect(fx.core.externalMessaging.inbound.read('ada', id).event.attachments).toEqual(
    incoming.attachments,
  );
  expect(fx.download).not.toHaveBeenCalled();
  expect(fx.core.channels.list()).toEqual([]);
});

it('WeChat image input is capability-opted-in and native result MIME comes from canonical bytes', async () => {
  const fx = await fixture(undefined, 'weixin', true);
  const sourceId = await fx.source();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4S8AAAAASUVORK5CYII=',
    'base64',
  );
  const result = await fx.core.attachments.upload({
    name: 'result.png',
    data: (async function* () {
      yield png;
    })(),
  });
  expect(await fx.core.externalMessaging.replyFile('ada', sourceId, result)).toMatchObject({
    state: 'provider-accepted',
  });
  expect(fx.reply.mock.calls[0]?.[2]).toMatchObject({ mediaType: 'image/png' });
  expect(Buffer.from(fx.reply.mock.calls[0]![2].bytes)).toEqual(png);
});

it('WeChat raw audio and playback preserve separate file identities and the original source authority', async () => {
  const fx = await fixture(undefined, 'weixin', false, true);
  const silk = (await encode(Buffer.alloc(48000), 24000)).data;
  fx.download.mockImplementation(async function* () {
    yield Buffer.from(silk);
  });
  const id = await fx.source();
  const raw = await fx.core.externalMessaging.acquireFile('ada', id, attachment.id);
  expect(raw.mime).toBe('audio/silk');
  expect(readFileSync(fx.core.attachments.fileTarget(raw.fileId!).path)).toEqual(Buffer.from(silk));
  const playback = await fx.core.externalMessaging.prepareAudio('ada', id, attachment.id);
  expect(playback.mime).toBe('audio/wav');
  expect(playback.fileId).not.toBe(raw.fileId);
  const wav = readFileSync(fx.core.attachments.fileTarget(playback.fileId!).path);
  expect(wav.readUInt32LE(24)).toBe(24000);
  expect(wav.readUInt16LE(22)).toBe(1);
  expect(fx.download).toHaveBeenCalledTimes(1);
  await fx.restart();
  const cached = await fx.core.externalMessaging.prepareAudio('ada', id, attachment.id);
  expect(cached.fileId).toBe(playback.fileId);
  expect(fx.download).toHaveBeenCalledTimes(1);
  fx.core.registry.create({ slug: 'other', displayName: 'Other' });
  await expect(
    fx.core.externalMessaging.prepareAudio('other', id, attachment.id),
  ).rejects.toThrow();
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  await expect(fx.core.externalMessaging.prepareAudio('ada', id, attachment.id)).rejects.toThrow();
  expect(fx.reply).not.toHaveBeenCalled();
});

it('unsupported native codec preserves original download and does not pretend to provide playable audio', async () => {
  const fx = await fixture(undefined, 'weixin', false, true);
  const id = await fx.source({
    ...fx.platformEvent,
    voice: { transcript: 'unavailable', encodeType: 5 },
  });
  await expect(
    fx.core.externalMessaging.prepareAudio('ada', id, attachment.id),
  ).rejects.toMatchObject({ code: 'audio-codec-unsupported' });
  const raw = await fx.core.externalMessaging.acquireFile('ada', id, attachment.id);
  expect(readFileSync(fx.core.attachments.fileTarget(raw.fileId!).path, 'utf8')).toBe(
    'original bytes',
  );
  expect(fx.reply).not.toHaveBeenCalled();
});

it('the Orchestrator saves decoded audio as an independent writable working copy through the existing tool seam', async () => {
  let destinationGrant = '';
  let savedPath = '';
  const fx = await fixture(
    async (run) => {
      const sourceId = fx.core.attention
        .list({ botSlug: 'ada' })
        .items.find((item) => item.sourceKind === 'bridge-message')!.id;
      const saved = await run.externalMessaging!.saveFile({
        sourceEventId: sourceId,
        attachmentId: attachment.id,
        grantId: destinationGrant,
        destinationPath: 'voice.wav',
        representation: 'playback',
      });
      savedPath = saved.path;
      const working = readFileSync(saved.path);
      expect(working.subarray(8, 12).toString()).toBe('WAVE');
      expect(working.readUInt32LE(24)).toBe(24000);
      expect(saved.source.mime).toBe('audio/wav');
    },
    'weixin',
    false,
    true,
  );
  const raw = Buffer.from((await encode(Buffer.alloc(48000), 24000)).data);
  fx.download.mockImplementation(async function* () {
    yield raw;
  });
  const grant = await fx.core.grants.create('ada', 'project');
  destinationGrant = grant.id;
  fx.core.grants.setOrchestratorWrite('ada', grant.id, true);
  const sourceId = await fx.source();
  expect(savedPath).toBe(join(fx.project, 'voice.wav'));
  const original = await fx.core.externalMessaging.acquireFile('ada', sourceId, attachment.id);
  expect(readFileSync(fx.core.attachments.fileTarget(original.fileId!).path)).toEqual(raw);
  expect(fx.reply).not.toHaveBeenCalled();
});

it('WeChat video retains native metadata, acquires actual MP4 bytes, refuses changed-source metadata and fences native send capability', async () => {
  const fx = await fixture(undefined, 'weixin', false, false, true);
  const bytes = Buffer.from(
    '000000186674797069736f6d0000020069736f6d6d703432000000086d646174',
    'hex',
  );
  fx.download.mockImplementation(async function* () {
    yield bytes;
  });
  const id = await fx.source();
  expect(fx.core.externalMessaging.inbound.read('ada', id).event.video).toEqual(
    fx.platformEvent.video,
  );
  const original = await fx.core.externalMessaging.acquireFile('ada', id, attachment.id);
  expect(original.mime).toBe('video/mp4');
  expect(original.size).toBe(bytes.length);
  const result = await fx.core.attachments.upload({
    name: 'result.mp4',
    data: (async function* () {
      yield bytes;
    })(),
  });
  expect((await fx.core.externalMessaging.replyFile('ada', id, result)).state).toBe(
    'provider-accepted',
  );
  expect(fx.reply.mock.calls[0]?.[1]).toEqual(fx.platformEvent.reply);
  const describe = fx.service.describeBot;
  fx.service.describeBot = async (account) => {
    const value = await describe(account);
    return {
      ...value,
      capabilities: value.capabilities.filter(
        (capability) => capability !== 'reply-video-fence-checked',
      ),
    };
  };
  const alternate = await fx.core.attachments.upload({
    name: 'alternate.mp4',
    data: (async function* () {
      yield Buffer.concat([bytes, Buffer.from('different')]);
    })(),
  });
  expect(
    (
      await fx.core.externalMessaging.send(
        'ada',
        fx.grant.id,
        'video-capability-refused',
        'File reply: alternate.mp4',
        id,
        alternate,
      )
    ).state,
  ).not.toBe('provider-accepted');
  expect(fx.reply).toHaveBeenCalledTimes(1);
  fx.service.describeBot = describe;
  await expect(
    fx.source({ ...fx.platformEvent, video: { ...fx.platformEvent.video, playLength: 8000 } }),
  ).rejects.toThrow('source-conflict');
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  await expect(fx.core.externalMessaging.acquireFile('ada', id, attachment.id)).rejects.toThrow(
    'source-unavailable',
  );
});
