import { randomBytes } from 'node:crypto';

import { joinTranscripts } from './calls.js';
import { VoiceError, wavFromPcm16 } from './providers.js';
import type { AsrStream } from './soniox.js';
import { createVad, VAD_SAMPLE_RATE, type Vad, type VadOptions } from './vad.js';

export const VOICE_DICTATION_LIMITS = {
  sessions: 4,
  pushBytes: 64 * 1024,
  maxMs: 120_000,
  idleMs: 15_000,
  finishMs: 15_000,
} as const;

export type VoiceDictationMode = 'stream' | 'segments';
export type VoiceDictationState = 'listening' | 'done' | 'failed' | 'cancelled';

export interface VoiceDictationView {
  readonly id: string;
  readonly providerId: string;
  readonly mode: VoiceDictationMode;
  readonly state: VoiceDictationState;
  readonly text: string;
  readonly audioMs: number;
  readonly truncated?: true;
  readonly error?: { readonly code: string; readonly message: string };
}

export interface VoiceDictationReadiness {
  readonly ready: boolean;
  readonly providerId: string | null;
  readonly mode: VoiceDictationMode | null;
  readonly sampleRate: number;
}

export type VoiceDictationRefusal =
  | 'invalid-input'
  | 'asr-not-configured'
  | 'unknown-provider'
  | 'dictation-not-found'
  | 'too-many-dictations'
  | 'request-too-large';

export class VoiceDictationError extends Error {
  constructor(
    readonly code: VoiceDictationRefusal,
    message: string,
  ) {
    super(message);
  }
}

export interface VoiceDictationProviders {
  has(id: string, kind: 'asr'): boolean;
  listAsr(): readonly { id: string; streaming: boolean }[];
  streams(id: string): boolean;
  openStream(input: {
    providerId: string;
    language?: string | undefined;
    signal?: AbortSignal | undefined;
    onText?: ((text: string) => void) | undefined;
  }): AsrStream | undefined;
  transcribe(input: {
    providerId: string;
    audio: Uint8Array;
    language?: string | undefined;
    signal?: AbortSignal | undefined;
  }): Promise<{ text: string; latencyMs: number }>;
}

export interface VoiceDictationDeps {
  providers(): VoiceDictationProviders | undefined;
  botAsr(slug: string): { providerId: string; language?: string } | null | undefined;
  defaultAsr?: (() => { providerId: string; language?: string } | null) | undefined;
  speechDbfs?: (() => number) | undefined;
  now?: () => number;
  vad?: VadOptions | undefined;
  log?: ((phase: string, fields: Record<string, string | number>) => void) | undefined;
}

export interface VoiceDictationTarget {
  readonly slug?: string | undefined;
  readonly providerId?: string | undefined;
  readonly language?: string | undefined;
}

export interface VoiceDictations {
  readiness(target: VoiceDictationTarget): VoiceDictationReadiness;
  open(target: VoiceDictationTarget): VoiceDictationView;
  push(id: string, pcm: Int16Array): VoiceDictationView;
  stop(id: string): Promise<VoiceDictationView>;
  cancel(id: string): VoiceDictationView;
  active(): number;
}

const SEGMENT_VAD: VadOptions = { segmentSilenceMs: 300, endSilenceMs: 700 };
const FLUSH_SAMPLES = VAD_SAMPLE_RATE;
const DICTATION_ID = /^dict-[a-f0-9]{16}$/u;

interface Session {
  readonly id: string;
  readonly providerId: string;
  readonly language: string | undefined;
  readonly mode: VoiceDictationMode;
  readonly abort: AbortController;
  readonly startedAt: number;
  readonly stream: AsrStream | undefined;
  readonly vad: Vad | undefined;
  readonly parts: Promise<string>[];
  readonly texts: (string | undefined)[];
  streamed: string;
  state: VoiceDictationState;
  samples: number;
  truncated: boolean;
  error: { code: string; message: string } | undefined;
  idle: ReturnType<typeof setTimeout> | undefined;
  finished: Promise<VoiceDictationView> | undefined;
}

export function createVoiceDictations(deps: VoiceDictationDeps): VoiceDictations {
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? (() => undefined);
  const sessions = new Map<string, Session>();

  const resolve = (target: VoiceDictationTarget) => {
    const providers = deps.providers();
    if (providers === undefined)
      throw new VoiceDictationError('asr-not-configured', 'Voice Providers are unavailable.');
    if (target.providerId !== undefined) {
      if (!providers.has(target.providerId, 'asr'))
        throw new VoiceDictationError('unknown-provider', 'No ASR Provider has that id.');
      return { providers, providerId: target.providerId, language: target.language };
    }
    const bound = target.slug === undefined ? deps.defaultAsr?.() : deps.botAsr(target.slug);
    if (bound !== undefined && bound !== null && providers.has(bound.providerId, 'asr'))
      return {
        providers,
        providerId: bound.providerId,
        language: target.language ?? bound.language,
      };
    const all = providers.listAsr();
    const pick = all.find((entry) => entry.streaming) ?? all[0];
    if (pick === undefined)
      throw new VoiceDictationError(
        'asr-not-configured',
        'Add a speech recognition (ASR) Provider to dictate.',
      );
    return { providers, providerId: pick.id, language: target.language };
  };

  const text = (session: Session): string => {
    if (session.mode === 'stream') return session.streamed;
    const done: string[] = [];
    for (const piece of session.texts) {
      if (piece === undefined) break;
      done.push(piece);
    }
    return joinTranscripts(done);
  };

  const view = (session: Session): VoiceDictationView => ({
    id: session.id,
    providerId: session.providerId,
    mode: session.mode,
    state: session.state,
    text: text(session),
    audioMs: Math.round((session.samples / VAD_SAMPLE_RATE) * 1000),
    ...(session.truncated ? { truncated: true as const } : {}),
    ...(session.error === undefined ? {} : { error: session.error }),
  });

  const release = (session: Session) => {
    clearTimeout(session.idle);
    session.idle = undefined;
    session.vad?.reset();
    const timer = setTimeout(() => {
      if (sessions.get(session.id) === session) sessions.delete(session.id);
    }, 30_000);
    timer.unref?.();
  };

  const fail = (session: Session, error: unknown) => {
    if (session.state !== 'listening') return;
    session.state = 'failed';
    session.error =
      error instanceof VoiceError
        ? { code: error.code, message: error.message.slice(0, 200) }
        : { code: 'asr-failed', message: 'Speech recognition failed.' };
    session.stream?.cancel();
    session.abort.abort();
    log('dictation-failed', { dictation: session.id, code: session.error.code });
    release(session);
  };

  const touch = (session: Session) => {
    clearTimeout(session.idle);
    session.idle = setTimeout(() => cancel(session.id), VOICE_DICTATION_LIMITS.idleMs);
    session.idle.unref?.();
  };

  const get = (id: string): Session => {
    const session = typeof id === 'string' && DICTATION_ID.test(id) ? sessions.get(id) : undefined;
    if (session === undefined)
      throw new VoiceDictationError('dictation-not-found', 'That dictation has ended.');
    return session;
  };

  const recognize = (session: Session, pcm: Int16Array) => {
    const providers = deps.providers();
    const index = session.parts.length;
    let wav: Uint8Array | undefined = wavFromPcm16(pcm, VAD_SAMPLE_RATE);
    pcm.fill(0);
    const part = (
      providers === undefined
        ? Promise.reject(new VoiceError('unknown-provider', 'No ASR Provider.'))
        : providers.transcribe({
            providerId: session.providerId,
            audio: wav,
            language: session.language,
            signal: session.abort.signal,
          })
    )
      .then((result) => {
        session.texts[index] = result.text;
        return result.text;
      })
      .finally(() => {
        wav?.fill(0);
        wav = undefined;
      });
    part.catch((error: unknown) => fail(session, error));
    session.parts.push(part);
  };

  const feed = (session: Session, pcm: Int16Array) => {
    if (session.stream !== undefined) {
      session.stream.push(pcm);
      return;
    }
    for (const event of session.vad?.push(pcm) ?? []) {
      if (event.type === 'segment') recognize(session, event.pcm);
      else if (event.type === 'utterance') {
        const rest = event.pcm.slice(Math.min(event.segmentedSamples, event.pcm.length));
        event.pcm.fill(0);
        if (rest.length >= VAD_SAMPLE_RATE / 5) recognize(session, rest);
        else rest.fill(0);
      }
    }
  };

  function cancel(id: string): VoiceDictationView {
    const session = get(id);
    if (session.state === 'listening') {
      session.state = 'cancelled';
      session.stream?.cancel();
      session.abort.abort();
      log('dictation-cancelled', { dictation: session.id, ms: now() - session.startedAt });
      release(session);
    }
    return view(session);
  }

  return {
    readiness(target) {
      try {
        const resolved = resolve(target);
        return {
          ready: true,
          providerId: resolved.providerId,
          mode: resolved.providers.streams(resolved.providerId) ? 'stream' : 'segments',
          sampleRate: VAD_SAMPLE_RATE,
        };
      } catch (error) {
        if (error instanceof VoiceDictationError && error.code === 'asr-not-configured')
          return { ready: false, providerId: null, mode: null, sampleRate: VAD_SAMPLE_RATE };
        throw error;
      }
    },
    open(target) {
      const resolved = resolve(target);
      const live = [...sessions.values()].filter((entry) => entry.state === 'listening');
      if (live.length >= VOICE_DICTATION_LIMITS.sessions)
        throw new VoiceDictationError(
          'too-many-dictations',
          'Too many dictations are running on this Host; finish one first.',
        );
      const id = `dict-${randomBytes(8).toString('hex')}`;
      const abort = new AbortController();
      const streaming = resolved.providers.streams(resolved.providerId);
      const holder: { session?: Session } = {};
      let stream: AsrStream | undefined;
      if (streaming) {
        stream = resolved.providers.openStream({
          providerId: resolved.providerId,
          language: resolved.language,
          signal: abort.signal,
          onText: (heard) => {
            const session = holder.session;
            if (session !== undefined && session.state === 'listening') session.streamed = heard;
          },
        });
      }
      const mode: VoiceDictationMode = stream === undefined ? 'segments' : 'stream';
      const session: Session = {
        id,
        providerId: resolved.providerId,
        language: resolved.language,
        mode,
        abort,
        startedAt: now(),
        stream,
        vad:
          mode === 'segments'
            ? createVad({
                ...SEGMENT_VAD,
                ...(deps.speechDbfs === undefined ? {} : { minActiveDbfs: deps.speechDbfs() }),
                ...deps.vad,
              })
            : undefined,
        parts: [],
        texts: [],
        streamed: '',
        state: 'listening',
        samples: 0,
        truncated: false,
        error: undefined,
        idle: undefined,
        finished: undefined,
      };
      holder.session = session;
      sessions.set(id, session);
      touch(session);
      log('dictation-opened', { dictation: id, provider: resolved.providerId, mode });
      return view(session);
    },
    push(id, pcm) {
      const session = get(id);
      if (session.state !== 'listening' || session.finished !== undefined) return view(session);
      const room = (VOICE_DICTATION_LIMITS.maxMs / 1000) * VAD_SAMPLE_RATE - session.samples;
      const accepted = room <= 0 ? new Int16Array(0) : pcm.subarray(0, room);
      if (accepted.length < pcm.length && !session.truncated) {
        session.truncated = true;
        log('dictation-truncated', { dictation: session.id });
      }
      if (accepted.length > 0) {
        touch(session);
        session.samples += accepted.length;
        try {
          feed(session, accepted.slice());
        } catch (error) {
          fail(session, error);
        }
      }
      pcm.fill(0);
      return view(session);
    },
    stop(id) {
      const session = get(id);
      if (session.finished !== undefined) return session.finished;
      if (session.state !== 'listening') return Promise.resolve(view(session));
      clearTimeout(session.idle);
      const finishing = (async (): Promise<VoiceDictationView> => {
        const limit = AbortSignal.timeout(VOICE_DICTATION_LIMITS.finishMs);
        const deadline = new Promise<never>((_, reject) =>
          limit.addEventListener(
            'abort',
            () => reject(new VoiceError('provider-timeout', 'Dictation took too long to finish.')),
            { once: true },
          ),
        );
        deadline.catch(() => undefined);
        try {
          if (session.stream !== undefined) {
            const result = await Promise.race([session.stream.finish(), deadline]);
            if (session.state === 'listening') session.streamed = result.text;
          } else {
            feed(session, new Int16Array(FLUSH_SAMPLES));
            await Promise.race([Promise.all(session.parts), deadline]);
          }
          if (session.state === 'listening') session.state = 'done';
        } catch (error) {
          fail(session, error);
        }
        if (session.state === 'done') {
          log('dictation-done', {
            dictation: session.id,
            mode: session.mode,
            chars: text(session).length,
            ms: now() - session.startedAt,
          });
          release(session);
        }
        return view(session);
      })();
      session.finished = finishing;
      return finishing;
    },
    cancel,
    active: () => [...sessions.values()].filter((entry) => entry.state === 'listening').length,
  };
}

export function pcmFromBase64(value: unknown): Int16Array {
  if (typeof value !== 'string' || value.length === 0)
    throw new VoiceDictationError('invalid-input', 'pcm must be base64 16-bit PCM.');
  if (value.length > (VOICE_DICTATION_LIMITS.pushBytes * 4) / 3 + 4)
    throw new VoiceDictationError('request-too-large', 'The audio chunk is too large.');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.byteLength % 2 !== 0)
    throw new VoiceDictationError('invalid-input', 'pcm must be base64 16-bit PCM.');
  const out = new Int16Array(bytes.byteLength / 2);
  for (let index = 0; index < out.length; index += 1) out[index] = bytes.readInt16LE(index * 2);
  bytes.fill(0);
  return out;
}
