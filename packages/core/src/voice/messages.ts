import type { AttachmentStore } from '../attachments/store.js';
import { attachmentIdentity } from '../attachments/ref.js';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import type { ChannelMessageVoice } from '../channels/channel.js';
import type { ChannelStore } from '../channels/store.js';
import { audioExtension, VoiceError, type VoiceProviders } from './providers.js';
import { speakableText } from './speakable.js';

export type VoiceAttachOutcome =
  | {
      status: 'ready';
      attachment: string;
      mime: string;
      bytes: number;
      latencyMs: number;
    }
  | { status: 'failed'; code: string; message: string };

export interface VoiceMessagesDeps {
  providers: VoiceProviders;
  bot(slug: string): PersonaBotRecord | undefined;
  channels: Pick<ChannelStore, 'message' | 'setMessageVoice'>;
  attachments: () => AttachmentStore | undefined;
  onReady?: (input: {
    slug: string;
    channelId: string;
    messageId: string;
    at: string;
    audio: Uint8Array;
    mime: string;
  }) => void;
  log?: (phase: string, fields: Record<string, string | number>) => void;
}

const MESSAGES: Record<string, string> = {
  'voice-not-configured':
    'This Bot has no TTS Provider. Bind one in the Bot settings or with `deepseekbot voice-set`.',
  'nothing-to-say': 'The message has no text that can be spoken.',
  'unsupported-destination': 'Voice messages are available in local Channels only.',
  'storage-unavailable': 'The Host attachment store is unavailable.',
};

export function voiceFailureMessage(code: string): string {
  return MESSAGES[code] ?? 'Speech synthesis failed.';
}

export function createVoiceMessages(deps: VoiceMessagesDeps) {
  const log = deps.log ?? (() => undefined);
  const record = (
    channelId: string,
    messageId: string,
    voice: ChannelMessageVoice,
    attachment?: Parameters<NonNullable<ChannelStore['setMessageVoice']>>[3],
  ) => {
    if (deps.channels.setMessageVoice === undefined) return;
    try {
      deps.channels.setMessageVoice(channelId, messageId, voice, attachment);
    } catch (error) {
      log('voice-record-failed', {
        channel: channelId,
        message: messageId,
        error: String(error),
      });
    }
  };
  const fail = (
    channelId: string,
    messageId: string,
    code: string,
    message = voiceFailureMessage(code),
  ): VoiceAttachOutcome => {
    record(channelId, messageId, {
      state: 'failed',
      code,
      error: message.slice(0, 300),
    });
    log('voice-failed', { channel: channelId, message: messageId, code });
    return { status: 'failed', code, message };
  };
  return {
    async attach(input: {
      botSlug: string;
      channelId: string;
      messageId: string;
      signal?: AbortSignal;
    }): Promise<VoiceAttachOutcome> {
      const { botSlug, channelId, messageId } = input;
      const message = deps.channels.message(channelId, messageId);
      if (message === undefined || message.author.kind !== 'bot' || message.author.slug !== botSlug)
        return {
          status: 'failed',
          code: 'unknown-message',
          message: 'The message is unavailable.',
        };
      const binding = deps.bot(botSlug)?.voice;
      if (binding === undefined || !deps.providers.has(binding.providerId))
        return fail(channelId, messageId, 'voice-not-configured');
      const text = speakableText(message.body);
      if (text === '') return fail(channelId, messageId, 'nothing-to-say');
      const store = deps.attachments();
      if (store === undefined) return fail(channelId, messageId, 'storage-unavailable');
      if ((message.attachments?.length ?? 0) >= 10)
        return fail(
          channelId,
          messageId,
          'too-many-attachments',
          'The message already holds ten attachments.',
        );
      record(channelId, messageId, { state: 'pending' });
      try {
        const result = await deps.providers.synthesize({
          providerId: binding.providerId,
          voiceId: binding.voiceId,
          text,
          signal: input.signal,
        });
        const ref = await store.upload({
          data: (async function* () {
            yield result.audio;
          })(),
          name: `voice-${messageId.replace(/[^A-Za-z0-9-]/gu, '').slice(0, 40)}.${audioExtension(result.mime)}`,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        });
        const identity = attachmentIdentity(ref);
        record(channelId, messageId, { state: 'ready', attachment: identity }, ref);
        try {
          deps.onReady?.({
            slug: botSlug,
            channelId,
            messageId,
            at: message.at,
            audio: result.audio,
            mime: result.mime,
          });
        } catch {}
        log('voice-ready', {
          channel: channelId,
          message: messageId,
          bytes: result.audio.byteLength,
          ms: result.latencyMs,
        });
        return {
          status: 'ready',
          attachment: identity,
          mime: ref.mime,
          bytes: ref.size,
          latencyMs: result.latencyMs,
        };
      } catch (error) {
        if (error instanceof VoiceError)
          return fail(channelId, messageId, error.code, error.message);
        if (input.signal?.aborted)
          return fail(channelId, messageId, 'cancelled', 'Synthesis was cancelled.');
        return fail(channelId, messageId, 'synthesis-failed');
      }
    },
  };
}

export type VoiceMessages = ReturnType<typeof createVoiceMessages>;
