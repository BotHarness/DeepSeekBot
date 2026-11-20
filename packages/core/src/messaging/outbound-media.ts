import { decodeLarkVoice } from '../attachments/lark-audio.js';
import { decodeQqVoice } from '../attachments/qq-audio.js';
import { attachmentIdentity } from '../attachments/ref.js';
import { createChannelMediaAccess } from './channel-media.js';
import { sourceMediaUploadId } from './media-identity.js';
import { decodeWeChatVoice, MAX_VOICE_INPUT_BYTES } from '../attachments/wechat-audio.js';
import { createHash, randomUUID } from 'node:crypto';
import type { InboundMessaging } from './inbound.js';
import type { DatabaseSync } from 'node:sqlite';
import { MessagingError, type MessagingAccount, type MessagingTarget } from './provider.js';
import type {
  MessagingGrant,
  AccountReader,
  ProviderRegistration,
  OutboundMessaging,
} from './outbound-contract.js';
import type { OutboundMessagingOptions } from './outbound.js';

export function createOutboundMedia(context: {
  channelMedia: ReturnType<typeof createChannelMediaAccess> | undefined;
  options: OutboundMessagingOptions;
  inbound: InboundMessaging;
  grant: (slug: string, id: string) => MessagingGrant;
  check: (
    value: MessagingGrant,
    readAccount?: AccountReader,
  ) => Promise<
    ProviderRegistration & {
      inspected: { account: MessagingAccount; target: MessagingTarget };
      identityRevision: number;
    }
  >;
  inFlight: Map<
    string,
    { providerId: string; token: object; controller: AbortController; fileGrantId?: string }
  >;
  current: (id: string, token: object) => void;
  transaction: <T>(command: (db: DatabaseSync) => T, topics?: string[]) => T;
  service: OutboundMessaging;
}): Pick<OutboundMessaging, 'readChannelMedia' | 'acquireFile' | 'prepareAudio'> {
  const { channelMedia, options, inbound, grant, check, inFlight, current, transaction } = context;

  return {
    readChannelMedia(input) {
      if (!channelMedia) throw new MessagingError('capability-unavailable');
      return channelMedia(input);
    },
    async acquireFile(botSlug, sourceEventId, attachmentId, signal) {
      if (options.attachments === undefined || !inbound.available(botSlug, sourceEventId))
        throw new MessagingError('source-unavailable');
      const source = inbound.read(botSlug, sourceEventId);
      const attachment = source.event.attachments?.find((item) => item.id === attachmentId);
      if (attachment === undefined) throw new MessagingError('attachment-unavailable');
      const value = grant(botSlug, source.grantId);
      const entry = await check(value);
      if (entry.provider.readFile === undefined) throw new MessagingError('capability-unavailable');
      const controller = new AbortController();
      const combined = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(30000),
        inbound.sourceSignal(botSlug, sourceEventId),
        ...(signal === undefined ? [] : [signal]),
      ]);
      const key = 'file-' + randomUUID();
      inFlight.set(key, {
        providerId: value.providerId,
        token: entry.token,
        controller,
        fileGrantId: value.id,
      });
      const validate = () => {
        combined.throwIfAborted();
        current(value.providerId, entry.token);
        if (!inbound.available(botSlug, sourceEventId))
          throw new MessagingError('source-unavailable');
      };
      const startedAt = Date.now();
      options.warn?.(
        JSON.stringify({
          event: 'messaging-attachment',
          phase: 'starting',
          initiator: 'source-file-access',
          sourceEventId,
        }),
      );
      let abort: (() => void) | undefined;
      try {
        validate();
        const uploadId = sourceMediaUploadId(
          value.providerId,
          value.fingerprint,
          source.event.conversation.id,
          attachment.id,
        );
        const interrupted = new Promise<never>((_, reject) => {
          abort = () => reject(new MessagingError('transfer-cancelled'));
          combined.addEventListener('abort', abort, { once: true });
          if (combined.aborted) abort();
        });
        const ref = await Promise.race([
          options.attachments.acquire({
            uploadId,
            name: attachment.name,
            signal: combined,
            load: async () => {
              validate();
              const data = await entry.provider.readFile!({
                accountRef: value.accountRef,
                fingerprint: value.fingerprint,
                route: source.event.reply,
                attachment,
                signal: combined,
              });
              return (async function* () {
                for await (const chunk of data) {
                  validate();
                  yield chunk;
                }
                validate();
              })();
            },
          }),
          interrupted,
        ]);
        validate();
        transaction((db) =>
          db
            .prepare('INSERT OR IGNORE INTO messaging_managed_files VALUES (?, ?, ?)')
            .run(sourceEventId, ref.fileId!, 'original'),
        );
        options.warn?.(
          JSON.stringify({
            event: 'messaging-attachment',
            phase: 'completed',
            sourceEventId,
            durationMs: Date.now() - startedAt,
            size: ref.size,
          }),
        );
        return ref;
      } catch (error) {
        options.warn?.(
          JSON.stringify({
            event: 'messaging-attachment',
            phase: 'refused',
            sourceEventId,
            durationMs: Date.now() - startedAt,
            reason: error instanceof MessagingError ? error.code : 'transfer-unavailable',
          }),
        );
        throw error;
      } finally {
        if (abort !== undefined) combined.removeEventListener('abort', abort);
        inFlight.delete(key);
        controller.abort();
      }
    },
    async prepareAudio(botSlug, sourceEventId, attachmentId, signal) {
      if (options.attachments === undefined || !inbound.available(botSlug, sourceEventId))
        throw new MessagingError('source-unavailable');
      const source = inbound.read(botSlug, sourceEventId);
      if (
        (source.platform !== 'weixin' &&
          source.platform !== 'qq' &&
          source.platform !== 'feishu') ||
        !source.event.voice ||
        !source.event.attachments?.some(
          (file) => file.id === attachmentId && file.mediaType?.startsWith('audio/'),
        )
      )
        throw new MessagingError('audio-codec-unsupported');
      const combined = AbortSignal.any([
        inbound.sourceSignal(botSlug, sourceEventId),
        AbortSignal.timeout(15000),
        ...(signal ? [signal] : []),
      ]);
      const validate = (): void => {
        combined.throwIfAborted();
        if (!inbound.available(botSlug, sourceEventId))
          throw new MessagingError('source-unavailable');
      };
      const startedAt = Date.now();
      try {
        const original = await context.service.acquireFile(
          botSlug,
          sourceEventId,
          attachmentId,
          combined,
        );
        if (original.size > MAX_VOICE_INPUT_BYTES) throw new MessagingError('audio-too-large');
        const downloaded = await options.attachments.download(
          attachmentIdentity(original),
          original.name,
          combined,
        );
        const reader = downloaded.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            validate();
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.length;
            if (size > MAX_VOICE_INPUT_BYTES) throw new MessagingError('audio-too-large');
            chunks.push(chunk.value);
          }
        } finally {
          await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        validate();
        const digest = createHash('sha256')
          .update(bytes)
          .update(
            JSON.stringify([
              sourceEventId,
              attachmentId,
              source.event.voice,
              source.platform === 'qq'
                ? 'qq-silk-wav-v1'
                : source.platform === 'feishu'
                  ? 'lark-opus-wav-v1'
                  : 'silk-wav-v1',
            ]),
          )
          .digest('hex')
          .slice(0, 32);
        const uploadId = [
          digest.slice(0, 8),
          digest.slice(8, 12),
          '4' + digest.slice(13, 16),
          '8' + digest.slice(17, 20),
          digest.slice(20),
        ].join('-');
        const result = await options.attachments.acquire({
          uploadId,
          name: 'voice.wav',
          signal: combined,
          load: async () => {
            const wav =
              source.platform === 'qq'
                ? await decodeQqVoice(bytes, combined)
                : source.platform === 'feishu'
                  ? await decodeLarkVoice(bytes, combined)
                  : await decodeWeChatVoice(bytes, source.event.voice!, combined);
            validate();
            return (async function* () {
              validate();
              yield wav;
              validate();
            })();
          },
        });
        validate();
        transaction((db) =>
          db
            .prepare('INSERT OR IGNORE INTO messaging_managed_files VALUES (?, ?, ?)')
            .run(sourceEventId, result.fileId!, 'voice.wav'),
        );
        await check(grant(botSlug, source.grantId));
        validate();
        options.warn?.(
          JSON.stringify({
            event: 'messaging-audio',
            phase: 'completed',
            initiator: 'source-audio-access',
            sourceEventId,
            durationMs: Date.now() - startedAt,
            size: result.size,
          }),
        );
        return result;
      } catch (error) {
        options.warn?.(
          JSON.stringify({
            event: 'messaging-audio',
            phase: 'refused',
            initiator: 'source-audio-access',
            sourceEventId,
            durationMs: Date.now() - startedAt,
            reason: error instanceof MessagingError ? error.code : 'audio-unavailable',
          }),
        );
        throw error;
      }
    },
  };
}
