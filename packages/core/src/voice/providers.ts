import { randomUUID } from 'node:crypto';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';

import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { LOCAL_VOICE_SCRIPT_NAME } from './local-kit.js';
import { TTS_PRESETS, ttsPreset, type TtsPreset, type TtsWire } from './presets.js';

type Credentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;

export const MAX_TTS_INPUT_CHARS = 4_000;
export const MAX_TTS_AUDIO_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_PROVIDERS = 32;
const PROVIDER_ID = /^tts-[a-f0-9]{12}$/u;
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
  | 'audio-too-large';

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
  name: string;
  preset: TtsPreset['id'];
  wire: TtsWire;
  baseUrl: string;
  model?: string;
  defaultVoice?: string;
  keySet: boolean;
  createdAt: string;
}

export interface TtsProviderInput {
  preset: string;
  name?: string;
  baseUrl?: string;
  model?: string;
  defaultVoice?: string;
  key?: string;
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
  name: string;
  preset: TtsPreset['id'];
  baseUrl: string;
  model?: string;
  defaultVoice?: string;
  credentialRevision?: string;
  createdAt: string;
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
      ttsPreset(String(value.preset)) === undefined
    )
      return undefined;
    return value as StoredProvider;
  } catch {
    return undefined;
  }
}

function view(stored: StoredProvider): TtsProviderView {
  const preset = presetOf(stored.preset);
  return {
    id: stored.id,
    name: stored.name,
    preset: stored.preset,
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

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '0.0.0.0']);

function causeCode(error: unknown): string | undefined {
  for (let current = error, depth = 0; current && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function unreachableMessage(baseUrl: string, error: unknown, preset?: string): string {
  const url = new URL(baseUrl);
  const code = causeCode(error);
  if (preset === 'local' && LOOPBACK_HOSTS.has(url.hostname) && code === 'ECONNREFUSED')
    return `The local speech service at ${url.origin} is not running. Start it on the Host computer (python ${LOCAL_VOICE_SCRIPT_NAME} start in its folder) and try again.`;
  if (code === 'ECONNREFUSED')
    return `Nothing is listening at ${url.origin}. Check that the speech service is running.`;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN')
    return `The provider host ${url.hostname} cannot be found.`;
  return `The provider cannot be reached (${code ?? (error instanceof Error ? error.name : 'network error')}).`;
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
}

export class VoiceProviders {
  readonly #db: OperationalDatabaseModulePort;
  readonly #credentials: () => Credentials | undefined;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;
  readonly #timeoutMs: number;
  readonly #log: NonNullable<VoiceProvidersOptions['log']>;

  constructor(options: VoiceProvidersOptions) {
    this.#db = options.database;
    this.#credentials = options.credentials;
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? (() => new Date());
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#log = options.log ?? (() => undefined);
  }

  presets(): readonly TtsPreset[] {
    return TTS_PRESETS;
  }

  #stored(id: string): StoredProvider {
    if (typeof id !== 'string' || !PROVIDER_ID.test(id))
      throw new VoiceError('unknown-provider', 'No TTS Provider has that id.');
    const row = this.#db.read((db) =>
      db.prepare('SELECT body FROM voice_providers WHERE id = ?').get(id),
    ) as { body: string } | undefined;
    const stored = row === undefined ? undefined : parseStored(row.body);
    if (stored === undefined)
      throw new VoiceError('unknown-provider', 'No TTS Provider has that id.');
    return stored;
  }

  list(): TtsProviderView[] {
    const rows = this.#db.read((db) =>
      db.prepare('SELECT body FROM voice_providers ORDER BY created_at, id').all(),
    ) as { body: string }[];
    return rows.flatMap((row) => {
      const stored = parseStored(row.body);
      return stored === undefined ? [] : [view(stored)];
    });
  }

  get(id: string): TtsProviderView {
    return view(this.#stored(id));
  }

  has(id: string): boolean {
    try {
      this.#stored(id);
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

  async add(input: TtsProviderInput): Promise<TtsProviderView> {
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
    this.#log('provider-added', { provider: id, preset: preset.id });
    return view(stored);
  }

  async remove(id: string): Promise<TtsProviderView> {
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
    return view(stored);
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
    const stored = this.#stored(input.providerId);
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

  async test(id: string, voiceId?: string, signal?: AbortSignal): Promise<ProviderHealth> {
    const stored = this.#stored(id);
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
