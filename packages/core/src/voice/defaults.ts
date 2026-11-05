import type { VoiceDefaults } from './providers.js';

interface VoiceBound {
  readonly asr?: { readonly providerId: string; readonly language?: string } | undefined;
  readonly voice?:
    | { readonly providerId: string; readonly voiceId?: string | undefined }
    | undefined;
}

export function withVoiceDefaults<T extends VoiceBound>(
  bot: T | undefined,
  defaults: (() => VoiceDefaults) | undefined,
): T | undefined {
  if (bot === undefined || defaults === undefined) return bot;
  if (bot.asr !== undefined && bot.voice !== undefined) return bot;
  const fallback = defaults();
  return {
    ...bot,
    ...(bot.asr === undefined && fallback.asr !== null ? { asr: fallback.asr } : {}),
    ...(bot.voice === undefined && fallback.tts !== null ? { voice: fallback.tts } : {}),
  };
}
