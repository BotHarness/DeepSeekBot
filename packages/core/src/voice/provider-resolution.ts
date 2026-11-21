import type { VoiceProviderKind } from './provider-types.js';

export interface VoiceDefaults {
  tts: { providerId: string; voiceId?: string } | null;
  asr: { providerId: string; language?: string } | null;
}

export interface VoiceBound {
  readonly asr?: { readonly providerId: string; readonly language?: string } | undefined;
  readonly voice?:
    | { readonly providerId: string; readonly voiceId?: string | undefined }
    | undefined;
}

export type VoiceResolveState = 'ready' | 'off' | 'missing';

export interface VoiceResolveTarget {
  readonly bot?: VoiceBound | undefined;
  readonly kind: VoiceProviderKind;
  readonly providerId?: string | undefined;
  readonly language?: string | undefined;
  readonly fallback?: 'bound' | 'any' | undefined;
}

export interface VoiceResolution {
  readonly providerId: string | null;
  readonly language: string | undefined;
  readonly voiceId: string | undefined;
  readonly source: 'explicit' | 'bot' | 'default' | 'fallback' | 'none';
  readonly state: VoiceResolveState;
}

export interface VoiceResolveSource {
  has(id: string, kind: VoiceProviderKind): boolean;
  defaults?(): VoiceDefaults;
  listAsr?(): readonly { readonly id: string; readonly streaming: boolean }[];
  localServiceOff?(id: string, kind: VoiceProviderKind): Promise<boolean>;
}

export function withHostDefaults<T extends VoiceBound>(
  bot: T | undefined,
  defaults: VoiceDefaults | undefined,
): T | undefined {
  if (bot === undefined || defaults === undefined) return bot;
  if (bot.asr !== undefined && bot.voice !== undefined) return bot;
  return {
    ...bot,
    ...(bot.asr === undefined && defaults.asr !== null ? { asr: defaults.asr } : {}),
    ...(bot.voice === undefined && defaults.tts !== null ? { voice: defaults.tts } : {}),
  };
}

export async function resolveVoice(
  source: VoiceResolveSource,
  target: VoiceResolveTarget,
): Promise<VoiceResolution> {
  const { kind } = target;
  const pick = (): Omit<VoiceResolution, 'state'> & { found: boolean } => {
    if (target.providerId !== undefined)
      return {
        providerId: target.providerId,
        language: target.language,
        voiceId: undefined,
        source: 'explicit',
        found: source.has(target.providerId, kind),
      };
    const defaults = source.defaults?.();
    const own = kind === 'asr' ? target.bot?.asr : target.bot?.voice;
    const fallback = kind === 'asr' ? defaults?.asr : defaults?.tts;
    const bound = own ?? fallback ?? undefined;
    if (bound !== undefined && (source.has(bound.providerId, kind) || target.fallback !== 'any'))
      return {
        providerId: bound.providerId,
        language:
          target.language ??
          ('language' in bound ? (bound.language as string | undefined) : undefined),
        voiceId: 'voiceId' in bound ? (bound.voiceId as string | undefined) : undefined,
        source: own === undefined ? 'default' : 'bot',
        found: source.has(bound.providerId, kind),
      };
    if (target.fallback === 'any' && kind === 'asr') {
      const all = source.listAsr?.() ?? [];
      const any = all.find((entry) => entry.streaming) ?? all[0];
      if (any !== undefined)
        return {
          providerId: any.id,
          language: target.language,
          voiceId: undefined,
          source: 'fallback',
          found: true,
        };
    }
    return {
      providerId: null,
      language: target.language,
      voiceId: undefined,
      source: 'none',
      found: false,
    };
  };
  const { found, ...picked } = pick();
  if (!found || picked.providerId === null) return { ...picked, state: 'missing' };
  const off = await (
    source.localServiceOff?.(picked.providerId, kind) ?? Promise.resolve(false)
  ).catch(() => false);
  return { ...picked, state: off ? 'off' : 'ready' };
}
