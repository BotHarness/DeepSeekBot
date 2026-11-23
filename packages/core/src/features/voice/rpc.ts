import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';
import type {
  VoiceProvidersView,
  VoiceSynthesisView,
  VoiceTranscriptionView,
} from '../../voice/bridge.js';
import type { VoiceDictationReadiness, VoiceDictationView } from '../../voice/dictation.js';
import type {
  ProviderHealth,
  VoiceDefaults,
  VoiceProviderView,
  VoiceSpeechThreshold,
} from '../../voice/providers.js';
import type { PersonaBotAsr, PersonaBotVoice } from '../../bots/persona-bot.js';
import type { VoiceBridgeMethods } from './methods.js';

export function voiceCatalog(
  methods: VoiceBridgeMethods,
  kind: string,
  preset: string,
  collection: string,
  key: string,
  query?: string,
  cursor?: string,
) {
  return unwrapAsync(methods.voiceCatalog({ kind, preset, collection, key, query, cursor }));
}

export function voiceCatalogImport(
  methods: VoiceBridgeMethods,
  preset: string,
  ownerId: string,
  voiceId: string,
  name: string,
  key: string,
  confirmed: boolean,
) {
  return unwrapAsync(
    methods.voiceCatalogImport({ preset, ownerId, voiceId, name, key, confirmed }),
  );
}

export function voiceProviders(methods: VoiceBridgeMethods, slug?: string): VoiceProvidersView {
  return unwrap(methods.voiceProviders(slug === undefined ? {} : { slug }));
}

export function voiceProviderAdd(
  methods: VoiceBridgeMethods,
  preset: string,
  name?: string,
  baseUrl?: string,
  model?: string,
  defaultVoice?: string,
  key?: string,
  kind?: string,
  language?: string,
): Promise<{ provider: VoiceProviderView }> {
  return unwrapAsync(
    methods.voiceProviderAdd({
      preset,
      name,
      baseUrl,
      model,
      defaultVoice,
      key,
      kind,
      language,
    }),
  );
}

export function voiceProviderRemove(
  methods: VoiceBridgeMethods,
  id: string,
): Promise<{ provider: VoiceProviderView; clearedBots: string[] }> {
  return unwrapAsync(methods.voiceProviderRemove({ id }));
}

export function voiceProviderTest(
  methods: VoiceBridgeMethods,
  id: string,
  voiceId?: string,
): Promise<ProviderHealth> {
  return unwrapAsync(methods.voiceProviderTest({ id, voiceId }));
}

export function voiceSynthesize(
  methods: VoiceBridgeMethods,
  text: string,
  slug?: string,
  providerId?: string,
  voiceId?: string,
  markdown?: boolean,
): Promise<VoiceSynthesisView> {
  return unwrapAsync(methods.voiceSynthesize({ text, slug, providerId, voiceId, markdown }));
}

export function botVoiceSet(
  methods: VoiceBridgeMethods,
  slug: string,
  providerId: string | null,
  voiceId?: string,
): { slug: string; voice: PersonaBotVoice | null } {
  return unwrap(methods.botVoiceSet({ slug, providerId, voiceId }));
}

export function voiceTranscribe(
  methods: VoiceBridgeMethods,
  audio: string,
  slug?: string,
  providerId?: string,
  language?: string,
): Promise<VoiceTranscriptionView> {
  return unwrapAsync(methods.voiceTranscribe({ audio, slug, providerId, language }));
}

export function botAsrSet(
  methods: VoiceBridgeMethods,
  slug: string,
  providerId: string | null,
  language?: string,
): { slug: string; asr: PersonaBotAsr | null } {
  return unwrap(methods.botAsrSet({ slug, providerId, language }));
}

export function voiceDefaultSet(
  methods: VoiceBridgeMethods,
  kind: string,
  providerId: string | null,
  voiceId?: string,
  language?: string,
): { defaults: VoiceDefaults } {
  return unwrap(methods.voiceDefaultSet({ kind, providerId, voiceId, language }));
}

export function voiceSpeechThresholdSet(
  methods: VoiceBridgeMethods,
  dbfs: number | null,
): { speechThreshold: VoiceSpeechThreshold } {
  return unwrap(methods.voiceSpeechThresholdSet({ dbfs }));
}

export function voiceDictation(
  methods: VoiceBridgeMethods,
  kind: string,
  id?: string,
  pcm?: string,
  slug?: string,
  providerId?: string,
  language?: string,
): Promise<{ readiness: VoiceDictationReadiness } | { dictation: VoiceDictationView }> {
  return unwrapAsync(methods.voiceDictation({ kind, id, pcm, slug, providerId, language }));
}

export const voiceProviderRpc = {
  voiceProviders(slug?: string): VoiceProvidersView {
    return voiceProviders(this.methods, slug);
  },

  voiceCatalog(
    kind: string,
    preset: string,
    collection: string,
    key: string,
    query?: string,
    cursor?: string,
  ) {
    return voiceCatalog(this.methods, kind, preset, collection, key, query, cursor);
  },

  voiceCatalogImport(
    preset: string,
    ownerId: string,
    voiceId: string,
    name: string,
    key: string,
    confirmed: boolean,
  ) {
    return voiceCatalogImport(this.methods, preset, ownerId, voiceId, name, key, confirmed);
  },

  voiceProviderAdd(
    preset: string,
    name?: string,
    baseUrl?: string,
    model?: string,
    defaultVoice?: string,
    key?: string,
    kind?: string,
    language?: string,
  ): Promise<{ provider: VoiceProviderView }> {
    return voiceProviderAdd(
      this.methods,
      preset,
      name,
      baseUrl,
      model,
      defaultVoice,
      key,
      kind,
      language,
    );
  },

  voiceProviderRemove(id: string): Promise<{ provider: VoiceProviderView; clearedBots: string[] }> {
    return voiceProviderRemove(this.methods, id);
  },

  voiceProviderTest(id: string, voiceId?: string): Promise<ProviderHealth> {
    return voiceProviderTest(this.methods, id, voiceId);
  },

  voiceSynthesize(
    text: string,
    slug?: string,
    providerId?: string,
    voiceId?: string,
    markdown?: boolean,
  ): Promise<VoiceSynthesisView> {
    return voiceSynthesize(this.methods, text, slug, providerId, voiceId, markdown);
  },

  botVoiceSet(
    slug: string,
    providerId: string | null,
    voiceId?: string,
  ): { slug: string; voice: PersonaBotVoice | null } {
    return botVoiceSet(this.methods, slug, providerId, voiceId);
  },

  voiceTranscribe(
    audio: string,
    slug?: string,
    providerId?: string,
    language?: string,
  ): Promise<VoiceTranscriptionView> {
    return voiceTranscribe(this.methods, audio, slug, providerId, language);
  },

  botAsrSet(
    slug: string,
    providerId: string | null,
    language?: string,
  ): { slug: string; asr: PersonaBotAsr | null } {
    return botAsrSet(this.methods, slug, providerId, language);
  },

  voiceDefaultSet(
    kind: string,
    providerId: string | null,
    voiceId?: string,
    language?: string,
  ): { defaults: VoiceDefaults } {
    return voiceDefaultSet(this.methods, kind, providerId, voiceId, language);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const voiceSettingsRpc = {
  voiceSpeechThresholdSet(dbfs: number | null): { speechThreshold: VoiceSpeechThreshold } {
    return voiceSpeechThresholdSet(this.methods, dbfs);
  },

  voiceDictation(
    kind: string,
    id?: string,
    pcm?: string,
    slug?: string,
    providerId?: string,
    language?: string,
  ): Promise<{ readiness: VoiceDictationReadiness } | { dictation: VoiceDictationView }> {
    return voiceDictation(this.methods, kind, id, pcm, slug, providerId, language);
  },
} satisfies ThisType<BridgeRpcReceiver>;
