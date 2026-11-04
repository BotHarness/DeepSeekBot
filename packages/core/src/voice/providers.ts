import { randomUUID } from 'node:crypto';
import type WebSocket from 'ws';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';

import type { OperationalDatabaseModulePort } from '../database/owner.js';
import {
  warmSoniox,
  type WarmSoniox,
  openSonioxStream,
  sonioxLanguageHints,
  sonioxTranscribeFile,
  type AsrStream,
  type SonioxSocketFactory,
} from './soniox.js';
import {
  ASR_PRESETS,
  asrPreset,
  TTS_PRESETS,
  ttsPreset,
  type AsrPreset,
  type AsrWire,
  type TtsPreset,
  type TtsWire,
} from './presets.js';

type Credentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;

export const MAX_TTS_INPUT_CHARS = 4_000;
export const MAX_TTS_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_ASR_AUDIO_BYTES = 8 * 1024 * 1024;
export const MAX_TRANSCRIPT_CHARS = 4_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_PROVIDERS = 32;
const PROVIDER_ID = /^(?:tts|asr)-[a-f0-9]{12}$/u;
const LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/u;

export type VoiceProviderKind = 'tts' | 'asr';
const HEALTH_TEXT = 'Hello.';

export type VoiceErrorCode =
  | 'invalid-input'
  | 'unknown-provider'
  | 'provider-limit'
  | 'credential-unavailable'
  | 'key-required'
  | 'voice-required'
  | 'provider-unauthorized'
  | 'provider-rate-limited'
  | 'provider-rejected'
  | 'provider-unavailable'
  | 'provider-timeout'
  | 'provider-bad-response'
  | 'audio-too-large'
  | 'wrong-provider-kind';

export class VoiceError extends Error {
  constructor(
    readonly code: VoiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'VoiceError';
  }
}

export interface TtsProviderView {
  id: string;
  kind: 'tts';
  name: string;
  preset: TtsPreset['id'];
  wire: TtsWire;
  baseUrl: string;
  model?: string;
  defaultVoice?: string;
  keySet: boolean;
  createdAt: string;
}

export interface AsrProviderView {
  id: string;
  kind: 'asr';
  name: string;
  preset: AsrPreset['id'];
  wire: AsrWire;
  streaming: boolean;
  baseUrl: string;
  model?: string;
  language?: string;
  keySet: boolean;
  createdAt: string;
}

export type VoiceProviderView = TtsProviderView | AsrProviderView;

export interface TtsProviderInput {
  kind?: VoiceProviderKind;
  preset: string;
  name?: string;
  baseUrl?: string;
  model?: string;
  defaultVoice?: string;
  language?: string;
  key?: string;
}

export interface TranscriptionResult {
  text: string;
  latencyMs: number;
}

export interface SynthesisResult {
  audio: Uint8Array;
  mime: string;
  latencyMs: number;
}

export type ProviderHealth =
  | {
      ok: true;
      providerId: string;
      latencyMs: number;
      bytes: number;
      mime: string;
    }
  | { ok: false; providerId: string; code: VoiceErrorCode; message: string };

interface StoredProvider {
  id: string;
  kind?: 'asr';
  name: string;
  preset: string;
  baseUrl: string;
  model?: string;
  defaultVoice?: string;
  language?: string;
  credentialRevision?: string;
  createdAt: string;
}

function kindOf(stored: StoredProvider): VoiceProviderKind {
  return stored.kind === 'asr' ? 'asr' : 'tts';
}

function asrPresetOf(id: string): AsrPreset {
  const preset = asrPreset(id);
  if (preset === undefined)
    throw new VoiceError(
      'invalid-input',
      `Unknown ASR preset ${JSON.stringify(id)}; use one of ${ASR_PRESETS.map((entry) => entry.id).join(', ')}.`,
    );
  return preset;
}

function presetOf(id: string): TtsPreset {
  const preset = ttsPreset(id);
  if (preset === undefined)
    throw new VoiceError(
      'invalid-input',
      `Unknown TTS preset ${JSON.stringify(id)}; use one of ${TTS_PRESETS.map((entry) => entry.id).join(', ')}.`,
    );
  return preset;
}

function cleanText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new VoiceError('invalid-input', `${field} must be text.`);
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (trimmed.length > max || /[\u0000-\u001f\u007f]/u.test(trimmed))
    throw new VoiceError('invalid-input', `${field} is not valid.`);
  return trimmed;
}

export function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new VoiceError('invalid-input', 'Base URL must be an http(s) URL.');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  )
    throw new VoiceError(
      'invalid-input',
      'Base URL must be a plain http(s) URL without credentials or query.',
    );
  return url.href.replace(/\/+$/u, '');
}

function parseStored(body: string): StoredProvider | undefined {
  try {
    const value = JSON.parse(body) as Partial<StoredProvider>;
    if (
      typeof value.id !== 'string' ||
      !PROVIDER_ID.test(value.id) ||
      typeof value.name !== 'string' ||
      typeof value.baseUrl !== 'string' ||
      typeof value.createdAt !== 'string' ||
      (value.kind !== undefined && value.kind !== 'asr') ||
      value.id.startsWith(value.kind === 'asr' ? 'tts-' : 'asr-') ||
      (value.kind === 'asr' ? asrPreset(String(value.preset)) : ttsPreset(String(value.preset))) ===
        undefined
    )
      return undefined;
    return value as StoredProvider;
  } catch {
    return undefined;
  }
}

function asrView(stored: StoredProvider): AsrProviderView {
  const preset = asrPresetOf(stored.preset);
  return {
    id: stored.id,
    kind: 'asr',
    name: stored.name,
    preset: preset.id,
    wire: preset.wire,
    streaming: preset.capabilities.streaming,
    baseUrl: stored.baseUrl,
    ...(stored.model === undefined ? {} : { model: stored.model }),
    ...(stored.language === undefined ? {} : { language: stored.language }),
    keySet: stored.credentialRevision !== undefined,
    createdAt: stored.createdAt,
  };
}

function anyView(stored: StoredProvider): VoiceProviderView {
  return kindOf(stored) === 'asr' ? asrView(stored) : view(stored);
}

function view(stored: StoredProvider): TtsProviderView {
  const preset = presetOf(stored.preset);
  return {
    id: stored.id,
    kind: 'tts',
    name: stored.name,
    preset: preset.id,
    wire: preset.wire,
    baseUrl: stored.baseUrl,
    ...(stored.model === undefined ? {} : { model: stored.model }),
    ...(stored.defaultVoice === undefined ? {} : { defaultVoice: stored.defaultVoice }),
    keySet: stored.credentialRevision !== undefined,
    createdAt: stored.createdAt,
  };
}

function sniffAudio(bytes: Uint8Array, declared: string | null): string | undefined {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 3 && ascii(0, 3) === 'ID3') return 'audio/mpeg';
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return 'audio/mpeg';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'audio/wav';
  if (bytes.length >= 4 && ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (bytes.length >= 4 && ascii(0, 4) === 'fLaC') return 'audio/flac';
  const type = declared?.split(';')[0]?.trim().toLowerCase();
  if (type !== undefined && type.startsWith('audio/') && bytes.length > 0) return type;
  return undefined;
}

async function readBounded(response: Response, max: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max)
    throw new VoiceError('audio-too-large', 'The provider returned more audio than allowed.');
  if (response.body === null) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > max)
      throw new VoiceError('audio-too-large', 'The provider returned too much audio.');
    chunks.push(chunk);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function providerMessage(response: Response, key: string | undefined): Promise<string> {
  let text = '';
  try {
    text = new TextDecoder().decode(await readBounded(response, 4_096));
  } catch {
    text = '';
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const nested = parsed['error'] ?? parsed['detail'];
    const candidate =
      typeof parsed['message'] === 'string'
        ? parsed['message']
        : typeof nested === 'string'
          ? nested
          : typeof nested === 'object' && nested !== null
            ? ((nested as Record<string, unknown>)['message'] ??
              (nested as Record<string, unknown>)['status'])
            : undefined;
    if (typeof candidate === 'string') text = candidate;
  } catch {}
  let clean = text.replace(/\s+/gu, ' ').trim();
  if (key !== undefined && key.length >= 4) clean = clean.split(key).join('[redacted]');
  clean = clean.replace(/\b(sk|xi|fa)[-_][A-Za-z0-9_-]{8,}/gu, '[redacted]');
  return clean.slice(0, 200) || `HTTP ${response.status}`;
}

function statusError(status: number, detail: string): VoiceError {
  if (status === 401 || status === 403)
    return new VoiceError('provider-unauthorized', `The provider refused the key: ${detail}`);
  if (status === 402 || status === 429)
    return new VoiceError(
      'provider-rate-limited',
      `The provider is out of quota or rate limited: ${detail}`,
    );
  if (status >= 500)
    return new VoiceError('provider-unavailable', `The provider failed: ${detail}`);
  return new VoiceError('provider-rejected', `The provider rejected the request: ${detail}`);
}

export interface VoiceProvidersOptions {
  database: OperationalDatabaseModulePort;
  credentials: () => Credentials | undefined;
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
  log?: (phase: string, fields: Record<string, string | number>) => void;
  socket?: SonioxSocketFactory;
}

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
    const name = cleanText(input.name, 'Name', 80) ?? preset.name;
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
    return view(stored);
  }

  async #addAsr(input: TtsProviderInput): Promise<AsrProviderView> {
    const preset = asrPresetOf(String(input.preset ?? ''));
    if (input.defaultVoice !== undefined)
      throw new VoiceError('invalid-input', 'A speech recognition Provider has no voice.');
    const name = cleanText(input.name, 'Name', 80) ?? preset.name;
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
    return asrView(stored);
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
      (db) => db.prepare('DELETE FROM voice_providers WHERE id = ?').run(id),
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
          : `The provider cannot be reached (${error instanceof Error ? error.name : 'network error'}).`,
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
          : `The provider cannot be reached (${error instanceof Error ? error.name : 'network error'}).`,
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
        pending.socket = warmSoniox({ baseUrl: stored.baseUrl, key, socket: this.#socket });
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
      openSonioxStream({
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

export function audioExtension(mime: string): string {
  return (
    {
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/flac': 'flac',
    }[mime] ?? 'audio'
  );
}

export function chineseScript(language: string | undefined): string | undefined {
  if (language === undefined || !/^zh(?:$|-)/iu.test(language)) return undefined;
  return /^zh-(?:tw|hk|mo|hant)$/iu.test(language)
    ? '以下是普通話的句子，使用繁體中文。'
    : '以下是普通话的句子，使用简体中文。';
}

export function wavFromPcm16(samples: Int16Array, sampleRate: number): Uint8Array {
  const out = new Uint8Array(44 + samples.byteLength);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1)
      out[offset + index] = text.charCodeAt(index);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.byteLength, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.byteLength, true);
  for (let index = 0; index < samples.length; index += 1)
    view.setInt16(44 + index * 2, samples[index]!, true);
  return out;
}

function silenceWav(sampleRate: number, milliseconds: number): Uint8Array {
  return wavFromPcm16(new Int16Array(Math.round((sampleRate * milliseconds) / 1000)), sampleRate);
}
