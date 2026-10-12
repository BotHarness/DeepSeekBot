import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { setImmediate as tick } from 'node:timers/promises';
import { createAttachmentHttp } from '../src/attachments/http.js';
import { createCore } from '../src/plugin.js';
import { encode } from 'silk-wasm';
import { createTempRoot } from './helpers.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';

it.each(['platform', 'unavailable', 'audio'])(
  'QQ native voice %s reaches canonical Inbox and the existing Orchestrator text reply',
  async (mode) => {
    const bytes = (await encode(Buffer.alloc(24000 * 2), 24000)).data;
    const transcript = mode === 'unavailable' ? 'unavailable' : 'platform';
    const text =
      mode === 'unavailable'
        ? '[QQ voice message: platform did not provide a transcript]'
        : 'What is seventeen times twenty three?';
    const answer = mode === 'unavailable' ? 'No transcript available' : '391';
    const fingerprint = 'a'.repeat(64);
    let receiver: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
    const replies = vi.fn(async (_account, route, _text, options) => {
      expect(options.beforeSend()).toBe(true);
      return {
        sent: true as const,
        receipt: {
          version: 1 as const,
          messageId: 'voice-answer',
          conversationId: route.conversationId,
        },
      };
    });
    const service: DshImOutboundService = {
      fileVersion: 1,
      readSourceFile: async () =>
        (async function* () {
          yield bytes;
        })(),
      replyFileChecked: async () => {
        throw new Error('Voice output is excluded');
      },
      contractVersion: 1,
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
          'source-voice-transcript-checked',
          'source-file-checked',
          ...(mode === 'audio' ? ['source-voice-audio-checked'] : []),
        ],
      }),
      sendChecked: async () => ({ sent: true }),
      replyChecked: replies,
      consumeInbound: async (_account, options) => {
        receiver = options;
        return () => {};
      },
      qualifyReplyChecked: async (_account, route) => route,
    };
    let runs = 0;
    let currentMessageId = 'voice-source';
    const handoffs: unknown[] = [];
    const core = createCore({
      dshHome: createTempRoot('bh-qq-voice-'),
      agents: {
        async runOrchestrator(run) {
          runs++;
          const item = core.attention
            .list({ botSlug: 'ada' })
            .items.find(
              (item) =>
                item.sourceKind === 'bridge-message' &&
                core.externalMessaging.inbound.read('ada', item.id).event.messageId ===
                  currentMessageId,
            )!;
          const source = run.externalMessaging!.read(item.id);
          handoffs.push({ voice: source.event.voice, text: source.body, inbox: run.inbox });
          await run.externalMessaging!.reply(item.id, answer);
        },
        runAssignment: async () => {},
        requestAssignment: () => ({ delivery: 'steer' }),
        stopAssignment: async () => {},
        close: async () => {},
      },
    });
    try {
      core.externalMessaging.register(createDshImProvider(service, 'qq')!);
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      await core.externalMessaging.identity('ada', {
        kind: 'bind',
        providerId: 'dsh-im/qq',
        accountRef: 'qq-app',
        fingerprint,
      });
      for (let i = 0; i < 4; i++) await tick();
      expect(receiver?.sourceVoiceTranscripts).toBe(true);
      expect(receiver?.sourceVoiceAudio).toBe(mode === 'audio' ? true : undefined);
      const event = {
        version: 1,
        channel: 'qq',
        botId: 'qq-app',
        fingerprint,
        eventId: 'voice-source',
        messageId: 'voice-source',
        actor: { kind: 'user', id: 'human' },
        conversation: { kind: 'group', id: 'qq-group' },
        mentions: [],
        mentionedAccount: true,
        at: new Date(Date.now() + 100).toISOString(),
        text,
        ...(mode === 'audio'
          ? {
              attachments: [
                {
                  id: 'b'.repeat(64),
                  messageId: 'voice-source',
                  resourceKey: 'private-voice-selector',
                  name: 'voice.silk',
                  mediaType: 'audio/unknown',
                  sizeBytes: bytes.length,
                },
              ],
            }
          : {}),
        voice: { transcript },
        reply: { messageId: 'voice-source', conversationId: 'qq-group', actorId: 'human' },
        replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
      };
      await receiver!.onEvent(event, { signal: receiver!.signal });
      await receiver!.onEvent(event, { signal: receiver!.signal });
      for (let i = 0; i < 4; i++) await tick();
      await core.runtime.whenIdle();
      expect(runs).toBe(1);
      expect(handoffs).toMatchObject([{ voice: { transcript }, text }]);
      expect(replies).toHaveBeenCalledTimes(1);
      expect(replies.mock.calls[0]?.slice(0, 3)).toEqual(['qq-app', event.reply, answer]);
      const source = core.attention.list({ botSlug: 'ada' }).items[0]!;
      expect(core.externalMessaging.inbound.read('ada', source.id).event.voice).toEqual({
        transcript,
      });
      if (mode === 'audio') {
        const wav = await core.externalMessaging.prepareAudio('ada', source.id, 'b'.repeat(64));
        expect(wav.mime).toBe('audio/wav');
        const wavBytes = readFileSync(core.attachments.fileTarget(wav.fileId!).path);
        expect(wavBytes.subarray(0, 4).toString()).toBe('RIFF');
        expect(wavBytes.readUInt32LE(24)).toBe(24000);
        const raw = await core.externalMessaging.acquireFile('ada', source.id, 'b'.repeat(64));
        expect(raw.fileId).not.toBe(wav.fileId);
        expect(readFileSync(core.attachments.fileTarget(raw.fileId!).path)).toEqual(
          Buffer.from(bytes),
        );
        expect(
          (await core.externalMessaging.prepareAudio('ada', source.id, 'b'.repeat(64))).fileId,
        ).toBe(wav.fileId);
        expect(runs).toBe(1);
        expect(core.attention.list({ botSlug: 'ada' }).items).toHaveLength(1);
        const room = core.channels.createGroup({ name: 'QQ voice', members: ['ada'] });
        const grant = (await core.externalMessaging.snapshot('ada')).grants[0]!;
        await core.externalMessaging.inbound.channelBridge(room.id, {
          kind: 'add',
          grantId: grant.id,
          expectedGrantRevision: grant.revision,
          name: 'QQ voice',
          enabled: true,
          collection: 'mentions',
          delivery: 'channel',
        });
        currentMessageId = 'channel-voice-source';
        await receiver!.onEvent(
          {
            ...event,
            at: new Date(Date.now() + 100).toISOString(),
            eventId: currentMessageId,
            messageId: currentMessageId,
            attachments: event.attachments!.map((file) => ({
              ...file,
              messageId: currentMessageId,
              id: 'c'.repeat(64),
            })),
            reply: { ...event.reply, messageId: currentMessageId },
          },
          { signal: receiver!.signal },
        );
        for (let i = 0; i < 4; i++) await tick();
        await core.runtime.whenIdle();
        const channelMessage = core.channels.readMessages(room.id)[0]!;
        expect(channelMessage.bridgeMedia).toMatchObject({
          voice: { transcript: 'platform' },
          items: [{ kind: 'audio', id: 'c'.repeat(64) }],
        });
        const http = createAttachmentHttp(
          core.attachments,
          core.channels,
          undefined,
          core.externalMessaging.readChannelMedia,
        );
        const query = new URLSearchParams({
          channelId: room.id,
          sourceEventId: channelMessage.id,
          attachmentId: 'c'.repeat(64),
        });
        const wakeCount = runs;
        const admissionCount = core.attention.list({ botSlug: 'ada' }).items.length;
        const originalResponse = await http(
          new Request('http://localhost/api/botharness/attachment?' + query),
        );
        expect(originalResponse.status).toBe(200);
        expect(originalResponse.headers.get('content-disposition')).toMatch(/^attachment;/);
        expect(Buffer.from(await originalResponse.arrayBuffer())).toEqual(Buffer.from(bytes));
        query.set('representation', 'playback');
        const playbackResponse = await http(
          new Request('http://localhost/api/botharness/attachment?' + query),
        );
        expect(playbackResponse.status).toBe(200);
        expect(playbackResponse.headers.get('content-type')).toBe('audio/wav');
        expect(playbackResponse.headers.get('content-disposition')).toMatch(/^inline;/);
        expect(
          Buffer.from(await playbackResponse.arrayBuffer())
            .subarray(0, 4)
            .toString(),
        ).toBe('RIFF');
        expect(runs).toBe(wakeCount);
        expect(core.attention.list({ botSlug: 'ada' }).items).toHaveLength(admissionCount);
        core.externalMessaging.revoke('ada', grant.id);
        expect(
          (await http(new Request('http://localhost/api/botharness/attachment?' + query))).status,
        ).toBe(403);
      }
    } finally {
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  },
);
