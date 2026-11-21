import { randomUUID } from 'node:crypto';
import type WebSocket from 'ws';
import { credentialKey } from '@deepseek-ai/dsh-credentials';

import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { clampSpeechDbfs, DEFAULT_SPEECH_DBFS, SPEECH_DBFS_RANGE } from './vad.js';
import {
  warmSoniox,
  type WarmSoniox,
  openSonioxUtterance,
  sonioxLanguageHints,
  sonioxTranscribeFile,
  type AsrStream,
  type SonioxSocketFactory,
} from './soniox.js';
import {
  ASR_PRESETS,
  TTS_PRESETS,
  uniqueProviderName,
  type AsrPreset,
  type TtsPreset,
} from './presets.js';
import { audioExtension, chineseScript, silenceWav, sniffAudio } from './provider-audio.js';
import {
  anyView,
  asrPresetOf,
  asrView,
  cleanText,
  kindOf,
  normalizeBaseUrl,
  parseStored,
  presetOf,
  PROVIDER_ID,
  view,
} from './provider-config.js';
import {
  causeCode,
  providerMessage,
  readBounded,
  statusError,
  unreachableMessage,
} from './provider-http.js';
import {
  resolveVoice,
  withHostDefaults,
  type VoiceBound,
  type VoiceDefaults,
  type VoiceResolution,
  type VoiceResolveTarget,
} from './provider-resolution.js';
import {
  MAX_ASR_AUDIO_BYTES,
  MAX_TRANSCRIPT_CHARS,
  MAX_TTS_AUDIO_BYTES,
  MAX_TTS_INPUT_CHARS,
  VoiceError,
  type AsrProviderView,
  type Credentials,
  type ProviderHealth,
  type StoredProvider,
  type SynthesisResult,
  type TranscriptionResult,
  type TtsProviderInput,
  type TtsProviderView,
  type VoiceProviderKind,
  type VoiceProvidersOptions,
  type VoiceProviderView,
  type VoiceSpeechThreshold,
} from './provider-types.js';

export { audioExtension, chineseScript, wavFromPcm16 } from './provider-audio.js';
export { normalizeBaseUrl } from './provider-config.js';
export { unreachableMessage } from './provider-http.js';
export {
  resolveVoice,
  withHostDefaults,
  type VoiceBound,
  type VoiceDefaults,
  type VoiceResolution,
  type VoiceResolveSource,
  type VoiceResolveState,
  type VoiceResolveTarget,
} from './provider-resolution.js';
export {
  MAX_ASR_AUDIO_BYTES,
  MAX_TRANSCRIPT_CHARS,
  MAX_TTS_AUDIO_BYTES,
  MAX_TTS_INPUT_CHARS,
  VoiceError,
  type AsrProviderView,
  type ProviderHealth,
  type SynthesisResult,
  type TranscriptionResult,
  type TtsProviderInput,
  type TtsProviderView,
  type VoiceErrorCode,
  type VoiceProviderKind,
  type VoiceProvidersOptions,
  type VoiceProviderView,
  type VoiceSpeechThreshold,
} from './provider-types.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_PROVIDERS = 32;
const LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/u;
const HEALTH_TEXT = 'Hello.';

export class VoiceProviders {
  readonly #db: OperationalDatabaseModulePort;
  readonly #credentials: () => Credentials | undefined;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;
  readonly #timeoutMs: number;
  readonly #log: NonNullable<VoiceProvidersOptions['log']>;
  readonly #socket: SonioxSocketFactory | undefined;
  readonly #warm = new Map<string, { users: number; socket?: WarmSoniox | undefined }>();

  constructor(options: VoiceProvidersOptions) {
    this.#db = options.database;
    this.#credentials = options.credentials;
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? (() => new Date());
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#log = options.log ?? (() => undefined);
    this.#socket = options.socket;
  }

  presets(): readonly TtsPreset[] {
    return TTS_PRESETS;
  }

  asrPresets(): readonly AsrPreset[] {
    return ASR_PRESETS;
  }

  #stored(id: string, kind?: VoiceProviderKind): StoredProvider {
    const label = kind === 'asr' ? 'ASR' : kind === 'tts' ? 'TTS' : 'Voice';
    if (typeof id !== 'string' || !PROVIDER_ID.test(id))
      throw new VoiceError('unknown-provider', `No ${label} Provider has that id.`);
    const row = this.#db.read((db) =>
      db.prepare('SELECT body FROM voice_providers WHERE id = ?').get(id),
    ) as { body: string } | undefined;
    const stored = row === undefined ? undefined : parseStored(row.body);
    if (stored === undefined)
      throw new VoiceError('unknown-provider', `No ${label} Provider has that id.`);
    if (kind !== undefined && kindOf(stored) !== kind)
      throw new VoiceError(
        'wrong-provider-kind',
        kind === 'asr'
          ? 'That is a TTS Provider; choose a speech recognition (ASR) Provider.'
          : 'That is a speech recognition (ASR) Provider; choose a TTS Provider.',
      );
    return stored;
  }

  #all(): StoredProvider[] {
    const rows = this.#db.read((db) =>
      db.prepare('SELECT body FROM voice_providers ORDER BY created_at, id').all(),
    ) as { body: string }[];
    return rows.flatMap((row) => {
      const stored = parseStored(row.body);
      return stored === undefined ? [] : [stored];
    });
  }

  list(): TtsProviderView[] {
    return this.#all()
      .filter((stored) => kindOf(stored) === 'tts')
      .map(view);
  }

  listAsr(): AsrProviderView[] {
    return this.#all()
      .filter((stored) => kindOf(stored) === 'asr')
      .map(asrView);
  }

  get(id: string): TtsProviderView {
    return view(this.#stored(id, 'tts'));
  }

  getAsr(id: string): AsrProviderView {
    return asrView(this.#stored(id, 'asr'));
  }

  async localServiceOff(id: string, kind: VoiceProviderKind = 'tts'): Promise<boolean> {
    if (!this.has(id, kind)) return false;
    const stored = this.#stored(id, kind);
    if (stored.preset !== 'local') return false;
    try {
      await this.#fetch(`${new URL(stored.baseUrl).origin}/health`, {
        signal: AbortSignal.timeout(1_500),
        redirect: 'error',
      });
      return false;
    } catch (error) {
      return causeCode(error) === 'ECONNREFUSED';
    }
  }

  has(id: string, kind: VoiceProviderKind = 'tts'): boolean {
    try {
      this.#stored(id, kind);
      return true;
    } catch {
      return false;
    }
  }

  #native(): Credentials {
    const credentials = this.#credentials();
    if (credentials === undefined)
      throw new VoiceError('credential-unavailable', 'The Host credential store is unavailable.');
    return credentials;
  }

  async add(input: TtsProviderInput & { kind: 'asr' }): Promise<AsrProviderView>;
  async add(input: TtsProviderInput): Promise<VoiceProviderView>;
  async add(input: TtsProviderInput): Promise<VoiceProviderView> {
    if (input.kind !== undefined && input.kind !== 'tts' && input.kind !== 'asr')
      throw new VoiceError('invalid-input', 'kind must be tts or asr.');
    if (input.kind === 'asr') return this.#addAsr(input);
    const preset = presetOf(String(input.preset ?? ''));
    const name = cleanText(input.name, 'Name', 80) ?? this.#defaultName(preset.name);
    const rawBase = cleanText(input.baseUrl, 'Base URL', 500);
    if (preset.baseUrl === undefined && rawBase === undefined)
      throw new VoiceError('invalid-input', 'A custom TTS Provider needs a base URL.');
    const baseUrl = normalizeBaseUrl(rawBase ?? preset.baseUrl!);
    const model = cleanText(input.model, 'Model', 120) ?? preset.defaultModel;
    const defaultVoice = cleanText(input.defaultVoice, 'Voice', 200) ?? preset.defaultVoice;
    const key = input.key === undefined ? undefined : cleanText(input.key, 'Key', 4_096);
    if (preset.keyRequired && key === undefined)
      throw new VoiceError('key-required', `${preset.name} needs an API key.`);
    if (this.list().length >= MAX_PROVIDERS)
      throw new VoiceError('provider-limit', `At most ${MAX_PROVIDERS} TTS Providers are allowed.`);
    const id = `tts-${randomUUID().replace(/-/gu, '').slice(0, 12)}`;
    const stored: StoredProvider = {
      id,
      name,
      preset: preset.id,
      baseUrl,
      ...(model === undefined ? {} : { model }),
      ...(defaultVoice === undefined ? {} : { defaultVoice }),
      createdAt: this.#now().toISOString(),
    };
    await this.#insert(stored, key);
    this.#log('provider-added', { provider: id, preset: preset.id });
    if (this.defaults().tts === null) this.setDefault('tts', { providerId: id });
    return view(stored);
  }

  async #addAsr(input: TtsProviderInput): Promise<AsrProviderView> {
    const preset = asrPresetOf(String(input.preset ?? ''));
    if (input.defaultVoice !== undefined)
      throw new VoiceError('invalid-input', 'A speech recognition Provider has no voice.');
    const name = cleanText(input.name, 'Name', 80) ?? this.#defaultName(preset.name);
    const rawBase = cleanText(input.baseUrl, 'Base URL', 500);
    if (preset.baseUrl === undefined && rawBase === undefined)
      throw new VoiceError('invalid-input', 'A custom ASR Provider needs a base URL.');
    const baseUrl = normalizeBaseUrl(rawBase ?? preset.baseUrl!);
    const model = cleanText(input.model, 'Model', 120) ?? preset.defaultModel;
    const language = cleanText(input.language, 'Language', 16);
    if (language !== undefined && !LANGUAGE.test(language))
      throw new VoiceError('invalid-input', 'Language must be a code such as en or zh.');
    const key = input.key === undefined ? undefined : cleanText(input.key, 'Key', 4_096);
    if (preset.keyRequired && key === undefined)
      throw new VoiceError('key-required', `${preset.name} needs an API key.`);
    if (this.listAsr().length >= MAX_PROVIDERS)
      throw new VoiceError('provider-limit', `At most ${MAX_PROVIDERS} ASR Providers are allowed.`);
    const id = `asr-${randomUUID().replace(/-/gu, '').slice(0, 12)}`;
    const stored: StoredProvider = {
      id,
      kind: 'asr',
      name,
      preset: preset.id,
      baseUrl,
      ...(model === undefined ? {} : { model }),
      ...(language === undefined ? {} : { language }),
      createdAt: this.#now().toISOString(),
    };
    await this.#insert(stored, key);
    this.#log('provider-added', { provider: id, preset: preset.id, kind: 'asr' });
    if (this.defaults().asr === null) this.setDefault('asr', { providerId: id });
    return asrView(stored);
  }

  #defaultName(base: string): string {
    return uniqueProviderName(
      base,
      this.#all().map((stored) => stored.name),
    );
  }

  speechThreshold(): VoiceSpeechThreshold {
    const row = this.#db.read((db) =>
      db.prepare("SELECT value FROM voice_settings WHERE key = 'speech-dbfs'").get(),
    ) as { value: string } | undefined;
    let stored: unknown;
    try {
      stored = row === undefined ? undefined : JSON.parse(row.value);
    } catch {
      stored = undefined;
    }
    const custom = typeof stored === 'number' && Number.isFinite(stored);
    return {
      dbfs: custom ? clampSpeechDbfs(stored as number) : DEFAULT_SPEECH_DBFS,
      custom,
      defaultDbfs: DEFAULT_SPEECH_DBFS,
      min: SPEECH_DBFS_RANGE.min,
      max: SPEECH_DBFS_RANGE.max,
    };
  }

  setSpeechThreshold(dbfs: number | null): VoiceSpeechThreshold {
    if (dbfs !== null && (typeof dbfs !== 'number' || !Number.isFinite(dbfs)))
      throw new VoiceError(
        'invalid-input',
        'The speech threshold is a number in dBFS, such as -50.',
      );
    this.#db.transaction(
      (db) =>
        dbfs === null
          ? db.prepare("DELETE FROM voice_settings WHERE key = 'speech-dbfs'").run()
          : db
              .prepare(
                "INSERT INTO voice_settings (key, value) VALUES ('speech-dbfs', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
              )
              .run(JSON.stringify(clampSpeechDbfs(dbfs))),
      ['voice'],
    );
    const result = this.speechThreshold();
    this.#log('speech-threshold-set', { dbfs: result.dbfs });
    return result;
  }

  effective<T extends VoiceBound>(bot: T | undefined): T | undefined {
    return bot === undefined ? undefined : withHostDefaults(bot, this.defaults());
  }

  resolve(target: VoiceResolveTarget): Promise<VoiceResolution> {
    return resolveVoice(this, target);
  }

  defaults(): VoiceDefaults {
    const rows = this.#db.read((db) =>
      db.prepare('SELECT kind, body FROM voice_defaults').all(),
    ) as { kind: string; body: string }[];
    const result: VoiceDefaults = { tts: null, asr: null };
    for (const row of rows) {
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(row.body) as Record<string, unknown>;
      } catch {
        continue;
      }
      const providerId = body['providerId'];
      if (typeof providerId !== 'string') continue;
      if (row.kind === 'tts' && this.has(providerId, 'tts'))
        result.tts = {
          providerId,
          ...(typeof body['voiceId'] === 'string' ? { voiceId: body['voiceId'] } : {}),
        };
      if (row.kind === 'asr' && this.has(providerId, 'asr'))
        result.asr = {
          providerId,
          ...(typeof body['language'] === 'string' ? { language: body['language'] } : {}),
        };
    }
    return result;
  }

  setDefault(
    kind: VoiceProviderKind,
    binding: { providerId: string; voiceId?: string; language?: string } | null,
  ): VoiceDefaults {
    if (kind !== 'tts' && kind !== 'asr')
      throw new VoiceError('invalid-input', 'kind must be tts or asr.');
    if (binding === null) {
      this.#db.transaction(
        (db) => db.prepare('DELETE FROM voice_defaults WHERE kind = ?').run(kind),
        ['voice'],
      );
      this.#log('default-cleared', { kind });
      return this.defaults();
    }
    this.#stored(binding.providerId, kind);
    const body: Record<string, string> = { providerId: binding.providerId };
    if (kind === 'tts') {
      if (binding.language !== undefined)
        throw new VoiceError('invalid-input', 'A TTS default has no language.');
      const voiceId = cleanText(binding.voiceId, 'Voice', 200);
      if (voiceId !== undefined) body['voiceId'] = voiceId;
    } else {
      if (binding.voiceId !== undefined)
        throw new VoiceError('invalid-input', 'A speech recognition default has no voice.');
      const language = cleanText(binding.language, 'Language', 16);
      if (language !== undefined && !LANGUAGE.test(language))
        throw new VoiceError('invalid-input', 'Language must be a code such as en or zh.');
      if (language !== undefined) body['language'] = language;
    }
    this.#db.transaction(
      (db) =>
        db
          .prepare(
            'INSERT INTO voice_defaults (kind, body) VALUES (?, ?) ON CONFLICT(kind) DO UPDATE SET body = excluded.body',
          )
          .run(kind, JSON.stringify(body)),
      ['voice'],
    );
    this.#log('default-set', { kind, provider: binding.providerId });
    return this.defaults();
  }

  async #insert(stored: StoredProvider, key: string | undefined): Promise<void> {
    const id = stored.id;
    if (key !== undefined) {
      const revision = randomUUID();
      await this.#native().modifyRecord(credentialKey('botharness-core', id), async () => ({
        kind: 'grant',
        payload: { id, revision, key },
      }));
      stored.credentialRevision = revision;
    }
    this.#db.transaction(
      (db) =>
        db
          .prepare('INSERT INTO voice_providers (id, body, created_at) VALUES (?, ?, ?)')
          .run(id, JSON.stringify(stored), stored.createdAt),
      ['voice'],
    );
  }

  async remove(id: string): Promise<VoiceProviderView> {
    const stored = this.#stored(id);
    this.#db.transaction(
      (db) => {
        db.prepare('DELETE FROM voice_providers WHERE id = ?').run(id);
        db.prepare("DELETE FROM voice_defaults WHERE json_extract(body, '$.providerId') = ?").run(
          id,
        );
      },
      ['voice'],
    );
    if (stored.credentialRevision !== undefined)
      await this.#native()
        .deleteRecord(credentialKey('botharness-core', id))
        .catch(() => undefined);
    this.#log('provider-removed', { provider: id });
    return anyView(stored);
  }

  async #key(stored: StoredProvider): Promise<string | undefined> {
    if (stored.credentialRevision === undefined) return undefined;
    let record;
    try {
      record = await this.#native().readRecord(credentialKey('botharness-core', stored.id));
    } catch {
      throw new VoiceError('credential-unavailable', 'The provider key cannot be read.');
    }
    const payload = record?.kind === 'grant' ? (record.payload as Record<string, unknown>) : {};
    if (
      payload['id'] !== stored.id ||
      payload['revision'] !== stored.credentialRevision ||
      typeof payload['key'] !== 'string'
    )
      throw new VoiceError('credential-unavailable', 'The provider key is missing; add it again.');
    return payload['key'];
  }

  #request(
    stored: StoredProvider,
    key: string | undefined,
    text: string,
    voice: string | undefined,
  ): { url: string; init: RequestInit } {
    const wire = presetOf(stored.preset).wire;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (wire === 'elevenlabs') {
      if (voice === undefined) throw new VoiceError('voice-required', 'Choose a voice id.');
      if (key !== undefined) headers['xi-api-key'] = key;
      return {
        url: `${stored.baseUrl}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
        init: {
          method: 'POST',
          headers: { ...headers, Accept: 'audio/mpeg' },
          body: JSON.stringify({
            text,
            ...(stored.model === undefined ? {} : { model_id: stored.model }),
          }),
        },
      };
    }
    if (key !== undefined) headers['Authorization'] = `Bearer ${key}`;
    if (wire === 'fish') {
      if (stored.model !== undefined) headers['model'] = stored.model;
      return {
        url: `${stored.baseUrl}/v1/tts`,
        init: {
          method: 'POST',
          headers,
          body: JSON.stringify({
            text,
            format: 'mp3',
            ...(voice === undefined ? {} : { reference_id: voice }),
          }),
        },
      };
    }
    if (voice === undefined) throw new VoiceError('voice-required', 'Choose a voice id.');
    return {
      url: `${stored.baseUrl}/audio/speech`,
      init: {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: stored.model ?? 'tts-1',
          input: text,
          voice,
          response_format: 'mp3',
        }),
      },
    };
  }

  async synthesize(input: {
    providerId: string;
    voiceId?: string | undefined;
    text: string;
    signal?: AbortSignal | undefined;
  }): Promise<SynthesisResult> {
    const stored = this.#stored(input.providerId, 'tts');
    const text = input.text.trim();
    if (text === '' || text.length > MAX_TTS_INPUT_CHARS)
      throw new VoiceError('invalid-input', `Text must be 1–${MAX_TTS_INPUT_CHARS} characters.`);
    const voice = input.voiceId?.trim() || stored.defaultVoice;
    const key = await this.#key(stored);
    const { url, init } = this.#request(stored, key, text, voice);
    const timeout = AbortSignal.timeout(this.#timeoutMs);
    const signal = input.signal === undefined ? timeout : AbortSignal.any([input.signal, timeout]);
    const started = performance.now();
    let response: Response;
    try {
      response = await this.#fetch(url, { ...init, signal, redirect: 'error' });
    } catch (error) {
      input.signal?.throwIfAborted();
      const code = timeout.aborted ? 'provider-timeout' : 'provider-unavailable';
      this.#log('synthesize-failed', { provider: stored.id, code });
      throw new VoiceError(
        code,
        timeout.aborted
          ? `The provider did not answer within ${Math.round(this.#timeoutMs / 1000)} s.`
          : unreachableMessage(stored.baseUrl, error, stored.preset),
      );
    }
    if (!response.ok) {
      const failure = statusError(response.status, await providerMessage(response, key));
      this.#log('synthesize-failed', {
        provider: stored.id,
        code: failure.code,
        status: response.status,
      });
      throw failure;
    }
    let audio: Uint8Array;
    try {
      audio = await readBounded(response, MAX_TTS_AUDIO_BYTES);
    } catch (error) {
      if (error instanceof VoiceError) throw error;
      input.signal?.throwIfAborted();
      throw new VoiceError(
        timeout.aborted ? 'provider-timeout' : 'provider-unavailable',
        'The provider stopped while sending audio.',
      );
    }
    const mime = sniffAudio(audio, response.headers.get('content-type'));
    if (mime === undefined)
      throw new VoiceError('provider-bad-response', 'The provider did not return audio.');
    const latencyMs = Math.round(performance.now() - started);
    this.#log('synthesized', {
      provider: stored.id,
      chars: text.length,
      bytes: audio.byteLength,
      ms: latencyMs,
    });
    return { audio, mime, latencyMs };
  }

  async transcribe(input: {
    providerId: string;
    audio: Uint8Array;
    language?: string | undefined;
    signal?: AbortSignal | undefined;
  }): Promise<TranscriptionResult> {
    const stored = this.#stored(input.providerId, 'asr');
    if (input.audio.byteLength === 0 || input.audio.byteLength > MAX_ASR_AUDIO_BYTES)
      throw new VoiceError('invalid-input', 'The audio is empty or too large to transcribe.');
    const mime = sniffAudio(input.audio, null);
    if (mime === undefined)
      throw new VoiceError('invalid-input', 'The audio must be WAV, MP3, OGG or FLAC.');
    const language = input.language?.trim() || stored.language;
    if (language !== undefined && !LANGUAGE.test(language))
      throw new VoiceError('invalid-input', 'Language must be a code such as en or zh.');
    const key = await this.#key(stored);
    if (asrPresetOf(stored.preset).wire === 'soniox')
      return this.#sonioxFile(stored, key, input.audio, language, input.signal);
    const form = new FormData();
    form.append(
      'file',
      new Blob([input.audio as Uint8Array<ArrayBuffer>], { type: mime }),
      `speech.${audioExtension(mime)}`,
    );
    form.append('model', stored.model ?? 'whisper-1');
    form.append('response_format', 'json');
    if (language !== undefined) form.append('language', language.split('-')[0]!);
    const script = chineseScript(language);
    if (script !== undefined) form.append('prompt', script);
    const timeout = AbortSignal.timeout(this.#timeoutMs);
    const signal = input.signal === undefined ? timeout : AbortSignal.any([input.signal, timeout]);
    const started = performance.now();
    let response: Response;
    try {
      response = await this.#fetch(`${stored.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: key === undefined ? {} : { Authorization: `Bearer ${key}` },
        body: form,
        signal,
        redirect: 'error',
      });
    } catch (error) {
      input.signal?.throwIfAborted();
      const code = timeout.aborted ? 'provider-timeout' : 'provider-unavailable';
      this.#log('transcribe-failed', { provider: stored.id, code });
      throw new VoiceError(
        code,
        timeout.aborted
          ? `The provider did not answer within ${Math.round(this.#timeoutMs / 1000)} s.`
          : unreachableMessage(stored.baseUrl, error, stored.preset),
      );
    }
    if (!response.ok) {
      const failure = statusError(response.status, await providerMessage(response, key));
      this.#log('transcribe-failed', {
        provider: stored.id,
        code: failure.code,
        status: response.status,
      });
      throw failure;
    }
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(await readBounded(response, 256 * 1024)));
    } catch (error) {
      if (error instanceof VoiceError) throw error;
      input.signal?.throwIfAborted();
      throw new VoiceError('provider-bad-response', 'The provider did not return a transcript.');
    }
    const raw =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['text'] : '';
    if (typeof raw !== 'string')
      throw new VoiceError('provider-bad-response', 'The provider did not return a transcript.');
    const text = raw
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim()
      .slice(0, MAX_TRANSCRIPT_CHARS);
    const latencyMs = Math.round(performance.now() - started);
    this.#log('transcribed', {
      provider: stored.id,
      bytes: input.audio.byteLength,
      chars: text.length,
      ms: latencyMs,
    });
    return { text, latencyMs };
  }

  async #sonioxFile(
    stored: StoredProvider,
    key: string | undefined,
    audio: Uint8Array,
    language: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<TranscriptionResult> {
    try {
      const result = await sonioxTranscribeFile({
        baseUrl: stored.baseUrl,
        key,
        model: stored.model ?? 'stt-rt-v6',
        languageHints: sonioxLanguageHints(language),
        audio,
        timeoutMs: this.#timeoutMs,
        signal,
        socket: this.#socket,
      });
      this.#log('transcribed', {
        provider: stored.id,
        bytes: audio.byteLength,
        chars: result.text.length,
        ms: result.latencyMs,
      });
      return result;
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof VoiceError)
        this.#log('transcribe-failed', {
          provider: stored.id,
          code: error.code,
        });
      throw error;
    }
  }

  streams(id: string): boolean {
    try {
      return asrPresetOf(this.#stored(id, 'asr').preset).capabilities.streaming;
    } catch {
      return false;
    }
  }

  warm(id: string): void {
    if (!this.streams(id)) return;
    const entry = this.#warm.get(id) ?? { users: 0 };
    entry.users += 1;
    this.#warm.set(id, entry);
    this.#rewarm(id);
  }

  cool(id: string): void {
    const entry = this.#warm.get(id);
    if (entry === undefined) return;
    entry.users -= 1;
    if (entry.users > 0) return;
    this.#warm.delete(id);
    entry.socket?.close();
  }

  #rewarm(id: string): void {
    const entry = this.#warm.get(id);
    if (entry === undefined || entry.users <= 0 || entry.socket !== undefined) return;
    let stored: StoredProvider;
    try {
      stored = this.#stored(id, 'asr');
    } catch {
      return;
    }
    const pending: { socket?: WarmSoniox | undefined } = {};
    const holder: WarmSoniox = {
      take: () => pending.socket?.take(),
      close: () => {
        pending.socket?.close();
        pending.socket = undefined;
        if (entry.socket === holder) entry.socket = undefined;
      },
    };
    entry.socket = holder;
    this.#key(stored).then(
      (key) => {
        if (entry.socket !== holder) return;
        try {
          pending.socket = warmSoniox({ baseUrl: stored.baseUrl, key, socket: this.#socket });
        } catch {
          if (entry.socket === holder) entry.socket = undefined;
        }
      },
      () => {
        if (entry.socket === holder) entry.socket = undefined;
      },
    );
  }

  #takeWarm(id: string): WebSocket | undefined {
    const entry = this.#warm.get(id);
    const held = entry?.socket;
    if (entry === undefined || held === undefined) return undefined;
    entry.socket = undefined;
    const socket = held.take();
    if (socket === undefined) held.close();
    this.#rewarm(id);
    return socket;
  }

  openStream(input: {
    providerId: string;
    language?: string | undefined;
    signal?: AbortSignal | undefined;
    onText?: ((text: string) => void) | undefined;
  }): AsrStream | undefined {
    if (!this.streams(input.providerId)) return undefined;
    const stored = this.#stored(input.providerId, 'asr');
    const language = input.language?.trim() || stored.language;
    const opened = this.#key(stored).then((key) =>
      openSonioxUtterance({
        baseUrl: stored.baseUrl,
        key,
        model: stored.model ?? 'stt-rt-v6',
        languageHints: sonioxLanguageHints(language),
        audio: 'pcm',
        timeoutMs: Math.min(this.#timeoutMs, 10_000),
        signal: input.signal,
        onText: input.onText,
        socket: this.#socket,
        warm: this.#takeWarm(input.providerId),
        onReconnect: () =>
          this.#log('transcribe-retry', {
            provider: stored.id,
            mode: 'stream',
            closeCode: 1006,
            attempt: 1,
          }),
      }),
    );
    const log = this.#log;
    let stream: AsrStream | undefined;
    let early: Int16Array[] = [];
    let cancelled = false;
    opened.then(
      (ready) => {
        if (cancelled) {
          ready.cancel();
          return;
        }
        stream = ready;
        for (const pcm of early) ready.push(pcm);
        early = [];
      },
      () => undefined,
    );
    return {
      push(pcm) {
        if (cancelled) return;
        if (stream !== undefined) stream.push(pcm);
        else early.push(pcm.slice());
      },
      async finish() {
        const ready = stream ?? (await opened);
        const result = await ready.finish().catch((error: unknown) => {
          if (error instanceof VoiceError)
            log('transcribe-failed', {
              provider: stored.id,
              code: error.code,
              mode: 'stream',
            });
          throw error;
        });
        log('transcribed', {
          provider: stored.id,
          chars: result.text.length,
          ms: result.latencyMs,
          mode: 'stream',
        });
        return result;
      },
      cancel() {
        cancelled = true;
        early = [];
        stream?.cancel();
      },
    };
  }

  async test(id: string, voiceId?: string, signal?: AbortSignal): Promise<ProviderHealth> {
    const stored = this.#stored(id);
    if (kindOf(stored) === 'asr') {
      try {
        const result = await this.transcribe({
          providerId: id,
          audio: silenceWav(16_000, 500),
          signal,
        });
        return {
          ok: true,
          providerId: stored.id,
          latencyMs: result.latencyMs,
          bytes: 0,
          mime: 'text/plain',
        };
      } catch (error) {
        if (!(error instanceof VoiceError)) throw error;
        return { ok: false, providerId: stored.id, code: error.code, message: error.message };
      }
    }
    try {
      const result = await this.synthesize({
        providerId: id,
        voiceId,
        text: HEALTH_TEXT,
        signal,
      });
      return {
        ok: true,
        providerId: stored.id,
        latencyMs: result.latencyMs,
        bytes: result.audio.byteLength,
        mime: result.mime,
      };
    } catch (error) {
      if (!(error instanceof VoiceError)) throw error;
      return {
        ok: false,
        providerId: stored.id,
        code: error.code,
        message: error.message,
      };
    }
  }
}
