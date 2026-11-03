import { randomBytes, randomUUID } from 'node:crypto';

import { dmChannelId } from '../channels/channel.js';
import {
  VOICE_CALL_LIMITS,
  type VoiceCallCommand,
  type VoiceCallDescription,
  type VoiceCallEndReason,
  type VoiceCallEvent,
  type VoiceCallMissing,
  type VoiceCallPhase,
  type VoiceCallReadiness,
  type VoiceCallRefusal,
  type VoiceCallResult,
  type VoiceCallView,
} from './call-contract.js';
import { createVad, VAD_SAMPLE_RATE, type VadOptions } from './vad.js';
import { VoiceError, wavFromPcm16 } from './providers.js';

export interface VoiceCallMedia {
  availability(): Promise<'ready' | 'unsupported-platform' | 'helper-missing'>;
  open(options: {
    readonly callId: string;
    readonly signal: AbortSignal;
    readonly onPcm: (samples: Int16Array) => void;
    readonly onStatus: (status: 'connected' | 'failed' | 'closed') => void;
  }): Promise<VoiceCallMediaPeer>;
}

export interface VoiceCallMediaPeer {
  readonly offer?: VoiceCallDescription;
  answer(answer: VoiceCallDescription, signal?: AbortSignal): Promise<void>;
  play(audio: Uint8Array, mime: string, signal: AbortSignal): Promise<void>;
  close(): Promise<void>;
}

export interface VoiceCallBot {
  readonly slug: string;
  readonly paused?: boolean;
  readonly asr?: { readonly providerId: string; readonly language?: string };
  readonly voice?: { readonly providerId: string };
}

export interface VoiceCallsDeps {
  bot(slug: string): VoiceCallBot | undefined;
  providers: {
    has(id: string, kind: 'tts' | 'asr'): boolean;
    transcribe(input: {
      providerId: string;
      audio: Uint8Array;
      language?: string | undefined;
      signal?: AbortSignal | undefined;
    }): Promise<{ text: string; latencyMs: number }>;
  };
  media(): VoiceCallMedia | undefined;
  send(input: {
    slug: string;
    channelId: string;
    messageId: string;
    body: string;
    callId: string;
  }): Promise<void>;
  busy(slug: string): boolean;
  now?: () => number;
  vad?: VadOptions;
  log?: (phase: string, fields: Record<string, string | number>) => void;
}

export interface VoiceCaller {
  readonly deviceId: string;
}

class CallRefusal extends Error {
  constructor(
    readonly code: VoiceCallRefusal,
    message: string,
  ) {
    super(message);
  }
}

const CALL_ID = /^call-[a-f0-9]{16}$/u;

type EventInput = VoiceCallEvent extends infer E
  ? E extends VoiceCallEvent
    ? Omit<E, 'seq' | 'at'>
    : never
  : never;

interface Call {
  readonly id: string;
  readonly slug: string;
  readonly channelId: string;
  readonly caller: string;
  readonly media: 'webrtc' | 'synthetic';
  readonly startedAt: number;
  readonly abort: AbortController;
  readonly vad: ReturnType<typeof createVad>;
  phase: VoiceCallPhase;
  muted: boolean;
  busy: boolean;
  playing: boolean;
  deafUntil: number;
  lastHeartbeat: number;
  connected: boolean;
  endReason?: VoiceCallEndReason;
  endedAt?: number;
  offer?: VoiceCallDescription;
  peer?: VoiceCallMediaPeer;
  events: VoiceCallEvent[];
  seq: number;
  transcription: Promise<void>;
  playback: Promise<void>;
  lastHeardAt?: number | undefined;
  timer?: ReturnType<typeof setInterval>;
}

export interface VoiceCalls {
  handle(caller: VoiceCaller, command: unknown, signal?: AbortSignal): Promise<VoiceCallResult>;
  deliverVoice(input: {
    slug: string;
    channelId: string;
    messageId: string;
    at: string;
    audio: Uint8Array;
    mime: string;
  }): void;
  revoke(deviceId: string): Promise<void>;
  dispose(): Promise<void>;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function slugOf(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(value))
    throw new CallRefusal('invalid-input', 'A Bot id is required.');
  return value;
}

function pcmFromBase64(value: string): Int16Array {
  const bytes = Buffer.from(value, 'base64');
  if (bytes.byteLength % 2 !== 0)
    throw new CallRefusal('invalid-input', 'pcm must be 16-bit little-endian samples.');
  const out = new Int16Array(bytes.byteLength / 2);
  for (let index = 0; index < out.length; index += 1) out[index] = bytes.readInt16LE(index * 2);
  return out;
}

const ended = (call: { phase: VoiceCallPhase }) => call.phase === 'ended';

export function createVoiceCalls(deps: VoiceCallsDeps): VoiceCalls {
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? (() => undefined);
  const calls = new Map<string, Call>();
  let disposed = false;

  const live = (): Call | undefined => [...calls.values()].find((call) => call.phase !== 'ended');

  const push = (call: Call, event: EventInput) => {
    call.seq += 1;
    call.events.push({ ...event, seq: call.seq, at: now() - call.startedAt } as VoiceCallEvent);
    if (call.events.length > VOICE_CALL_LIMITS.events) call.events.shift();
  };

  const view = (call: Call, after = 0): VoiceCallView => ({
    callId: call.id,
    slug: call.slug,
    channelId: call.channelId,
    phase: call.phase,
    muted: call.muted,
    busy: call.busy,
    media: call.media,
    startedAt: call.startedAt,
    durationMs: (call.endedAt ?? now()) - call.startedAt,
    ...(call.endReason === undefined ? {} : { endReason: call.endReason }),
    ...(call.offer === undefined || call.connected ? {} : { offer: call.offer }),
    events: call.events.filter((event) => event.seq > after),
    lastSeq: call.seq,
  });

  const settle = (call: Call) => {
    if (call.phase === 'ended' || call.phase === 'connecting') return;
    call.phase = call.playing
      ? 'bot-speaking'
      : call.vad.speaking
        ? 'user-speaking'
        : call.phase === 'transcribing'
          ? 'transcribing'
          : 'listening';
  };

  const end = async (call: Call, reason: VoiceCallEndReason) => {
    if (call.phase === 'ended') return;
    call.phase = 'ended';
    call.endReason = reason;
    call.endedAt = now();
    clearInterval(call.timer);
    call.abort.abort();
    call.vad.reset();
    push(call, { type: 'ended', reason });
    log('call-ended', { call: call.id, bot: call.slug, reason, ms: call.endedAt - call.startedAt });
    await call.peer?.close().catch(() => undefined);
    setTimeout(() => {
      if (calls.get(call.id) === call) calls.delete(call.id);
    }, 60_000).unref?.();
  };

  const transcribe = (call: Call, pcm: Int16Array, audioMs: number) => {
    call.transcription = call.transcription.then(async () => {
      if (call.phase === 'ended') return;
      const bot = deps.bot(call.slug);
      call.phase = 'transcribing';
      push(call, { type: 'transcribing', audioMs });
      let wav: Uint8Array | undefined = wavFromPcm16(pcm, VAD_SAMPLE_RATE);
      pcm.fill(0);
      const started = now();
      let text: string;
      try {
        if (bot?.asr === undefined) throw new VoiceError('unknown-provider', 'No ASR Provider.');
        text = (
          await deps.providers.transcribe({
            providerId: bot.asr.providerId,
            audio: wav,
            language: bot.asr.language,
            signal: call.abort.signal,
          })
        ).text;
      } catch (error) {
        if (ended(call)) return;
        const code = error instanceof VoiceError ? error.code : 'asr-failed';
        const message = error instanceof VoiceError ? error.message : 'Speech recognition failed.';
        push(call, { type: 'asr-failed', code, message: message.slice(0, 200) });
        log('call-asr-failed', { call: call.id, code });
        return;
      } finally {
        wav?.fill(0);
        wav = undefined;
        if (call.phase === 'transcribing') call.phase = 'listening';
        settle(call);
      }
      const asrMs = now() - started;
      if (ended(call)) return;
      if (text.replace(/[\s\p{P}]/gu, '') === '') {
        push(call, { type: 'nothing-heard' });
        return;
      }
      const messageId = `human-${randomUUID()}`;
      try {
        await deps.send({
          slug: call.slug,
          channelId: call.channelId,
          messageId,
          body: text,
          callId: call.id,
        });
      } catch (error) {
        const failure = record(error);
        push(call, {
          type: 'send-failed',
          code: typeof failure['code'] === 'string' ? failure['code'] : 'send-failed',
          message: (error instanceof Error ? error.message : 'The message was not sent.').slice(
            0,
            200,
          ),
        });
        return;
      }
      call.lastHeardAt = now();
      push(call, { type: 'sent', messageId, text, asrMs });
      log('call-heard', { call: call.id, bot: call.slug, chars: text.length, asrMs });
    });
  };

  const hear = (call: Call, samples: Int16Array) => {
    if (call.phase === 'ended' || call.phase === 'connecting') return;
    if (call.muted || call.playing || now() < call.deafUntil) return;
    for (const event of call.vad.push(samples)) {
      if (event.type === 'speech-start') push(call, { type: 'speech-start' });
      else if (event.type === 'noise')
        push(call, { type: 'noise-discarded', durationMs: event.durationMs });
      else transcribe(call, event.pcm, event.endMs - event.startMs);
    }
    settle(call);
  };

  const tick = (call: Call) => {
    if (call.phase === 'ended') return;
    const at = now();
    if (
      call.media === 'webrtc' &&
      !call.connected &&
      at - call.startedAt > VOICE_CALL_LIMITS.connectTimeoutMs
    ) {
      void end(call, 'connect-timeout');
      return;
    }
    if (at - call.lastHeartbeat > VOICE_CALL_LIMITS.heartbeatLossMs) {
      void end(call, 'connection-lost');
      return;
    }
    const bot = deps.bot(call.slug);
    if (bot === undefined || bot.paused === true) {
      void end(call, 'bot-unavailable');
      return;
    }
    const busy = deps.busy(call.slug);
    if (busy !== call.busy) {
      call.busy = busy;
      push(call, { type: busy ? 'busy' : 'idle' });
    }
  };

  const readiness = async (slug: string): Promise<VoiceCallReadiness> => {
    const bot = deps.bot(slug);
    const missing: VoiceCallMissing[] = [];
    if (bot === undefined || bot.paused === true) missing.push('bot');
    const asr = bot?.asr?.providerId;
    const tts = bot?.voice?.providerId;
    if (asr === undefined || !deps.providers.has(asr, 'asr')) missing.push('asr');
    if (tts === undefined || !deps.providers.has(tts, 'tts')) missing.push('tts');
    const media = deps.media();
    const availability =
      media === undefined
        ? 'unavailable'
        : await media.availability().catch(() => 'unavailable' as const);
    if (availability === 'unsupported-platform') missing.push('media-unsupported');
    else if (availability === 'helper-missing') missing.push('media-helper-missing');
    else if (availability === 'unavailable') missing.push('media-unavailable');
    const active = live();
    return {
      slug,
      ready: missing.length === 0,
      missing,
      asrProviderId: asr ?? null,
      ttsProviderId: tts ?? null,
      media: availability,
      activeCallId: active?.slug === slug ? active.id : null,
    };
  };

  const own = (caller: VoiceCaller, value: unknown): Call => {
    if (typeof value !== 'string' || !CALL_ID.test(value))
      throw new CallRefusal('invalid-input', 'A call id is required.');
    const call = calls.get(value);
    if (call === undefined || call.caller !== caller.deviceId)
      throw new CallRefusal('call-not-found', 'That call does not exist.');
    return call;
  };

  const open = async (
    caller: VoiceCaller,
    slug: string,
    kind: 'webrtc' | 'synthetic',
    signal: AbortSignal | undefined,
  ): Promise<Call> => {
    const bot = deps.bot(slug);
    if (bot === undefined) throw new CallRefusal('unknown-bot', `unknown PersonaBot: ${slug}`);
    if (bot.paused === true) throw new CallRefusal('bot-paused', 'This Bot is paused.');
    if (bot.asr === undefined || !deps.providers.has(bot.asr.providerId, 'asr'))
      throw new CallRefusal(
        'asr-not-configured',
        'Bind a speech recognition (ASR) Provider to this Bot before calling it.',
      );
    if (bot.voice === undefined || !deps.providers.has(bot.voice.providerId, 'tts'))
      throw new CallRefusal(
        'tts-not-configured',
        'Bind a TTS Provider to this Bot before calling it.',
      );
    const media = kind === 'webrtc' ? deps.media() : undefined;
    if (kind === 'webrtc') {
      const availability =
        media === undefined ? 'unsupported-platform' : await media.availability();
      if (availability === 'unsupported-platform')
        throw new CallRefusal(
          'media-unsupported',
          'Calls need a Mac or Windows Host with the media helper.',
        );
      if (availability === 'helper-missing')
        throw new CallRefusal(
          'media-helper-missing',
          'Start Local Computer once on this Host to install its media helper, then call again.',
        );
    }
    const active = live();
    if (active !== undefined) {
      if (active.caller !== caller.deviceId)
        throw new CallRefusal('call-active', 'Another device is already on a call with this Host.');
      await end(active, 'replaced');
    }
    const startedAt = now();
    const call: Call = {
      id: `call-${randomBytes(8).toString('hex')}`,
      slug,
      channelId: dmChannelId(slug),
      caller: caller.deviceId,
      media: kind,
      startedAt,
      abort: new AbortController(),
      vad: createVad({ maxUtteranceMs: VOICE_CALL_LIMITS.maxUtteranceMs, ...deps.vad }),
      phase: 'connecting',
      muted: false,
      busy: deps.busy(slug),
      playing: false,
      deafUntil: 0,
      lastHeartbeat: startedAt,
      connected: false,
      events: [],
      seq: 0,
      transcription: Promise.resolve(),
      playback: Promise.resolve(),
    };
    calls.set(call.id, call);
    log('call-opening', { call: call.id, bot: slug, media: kind });
    const connected = () => {
      if (call.connected || call.phase === 'ended') return;
      call.connected = true;
      call.phase = 'listening';
      push(call, { type: 'connected' });
      if (call.busy) push(call, { type: 'busy' });
      log('call-connected', { call: call.id, ms: now() - call.startedAt });
    };
    if (kind === 'synthetic') {
      connected();
    } else {
      const abort = () => call.abort.abort();
      signal?.addEventListener('abort', abort, { once: true });
      try {
        call.peer = await media!.open({
          callId: call.id,
          signal: call.abort.signal,
          onPcm: (samples) => hear(call, samples),
          onStatus: (status) => {
            if (status === 'connected') connected();
            else void end(call, 'media-failed');
          },
        });
        if (call.peer.offer === undefined) throw new Error('offer');
        call.offer = call.peer.offer;
      } catch (error) {
        await end(call, 'media-failed');
        calls.delete(call.id);
        if (error instanceof CallRefusal) throw error;
        throw new CallRefusal(
          'media-failed',
          'The call media could not start on this Host. Check the media helper and retry.',
        );
      } finally {
        signal?.removeEventListener('abort', abort);
      }
    }
    call.timer = setInterval(() => tick(call), VOICE_CALL_LIMITS.heartbeatMs);
    call.timer.unref?.();
    return call;
  };

  const run = async (
    caller: VoiceCaller,
    raw: unknown,
    signal: AbortSignal | undefined,
  ): Promise<VoiceCallResult> => {
    if (disposed) throw new CallRefusal('not-ready', 'Calls are stopping on this Host.');
    const command = record(raw) as Partial<VoiceCallCommand> & Record<string, unknown>;
    switch (command.kind) {
      case 'readiness':
        return { ok: true, readiness: await readiness(slugOf(command['slug'])) };
      case 'status':
        return {
          ok: true,
          calls: [...calls.values()]
            .filter((call) => call.caller === caller.deviceId)
            .map((call) => view(call)),
        };
      case 'open': {
        const media = command['media'] ?? 'webrtc';
        if (media !== 'webrtc' && media !== 'synthetic')
          throw new CallRefusal('invalid-input', 'media must be webrtc or synthetic.');
        return { ok: true, call: view(await open(caller, slugOf(command['slug']), media, signal)) };
      }
      case 'signal': {
        const call = own(caller, command['callId']);
        const answer = record(command['answer']);
        if (
          answer['type'] !== 'answer' ||
          typeof answer['sdp'] !== 'string' ||
          Buffer.byteLength(answer['sdp']) > VOICE_CALL_LIMITS.signalBytes ||
          !answer['sdp'].startsWith('v=0')
        )
          throw new CallRefusal('invalid-input', 'A WebRTC answer is required.');
        if (call.phase === 'ended') throw new CallRefusal('call-ended', 'The call has ended.');
        if (call.peer === undefined || call.connected)
          throw new CallRefusal('signal-failed', 'The call does not expect an answer.');
        try {
          await call.peer.answer({ type: 'answer', sdp: answer['sdp'] }, signal);
        } catch {
          await end(call, 'media-failed');
          throw new CallRefusal('signal-failed', 'The Host could not apply the answer.');
        }
        call.lastHeartbeat = now();
        return { ok: true, call: view(call) };
      }
      case 'heartbeat': {
        const call = own(caller, command['callId']);
        const after = command['after'];
        if (after !== undefined && (!Number.isSafeInteger(after) || (after as number) < 0))
          throw new CallRefusal('invalid-input', 'after must be an event sequence number.');
        if (call.phase !== 'ended') {
          call.lastHeartbeat = now();
          tick(call);
        }
        return { ok: true, call: view(call, (after as number | undefined) ?? 0) };
      }
      case 'mute': {
        const call = own(caller, command['callId']);
        if (typeof command['muted'] !== 'boolean')
          throw new CallRefusal('invalid-input', 'muted must be true or false.');
        if (call.phase === 'ended') throw new CallRefusal('call-ended', 'The call has ended.');
        if (call.muted !== command['muted']) {
          call.muted = command['muted'];
          if (call.muted) call.vad.reset();
          push(call, { type: call.muted ? 'muted' : 'unmuted' });
          settle(call);
        }
        call.lastHeartbeat = now();
        return { ok: true, call: view(call) };
      }
      case 'inject': {
        const call = own(caller, command['callId']);
        if (call.media !== 'synthetic')
          throw new CallRefusal('synthetic-only', 'Only a synthetic call takes injected audio.');
        if (call.phase === 'ended') throw new CallRefusal('call-ended', 'The call has ended.');
        const pcm = command['pcm'];
        if (typeof pcm !== 'string' || pcm.length > VOICE_CALL_LIMITS.injectBytes)
          throw new CallRefusal(
            'invalid-input',
            'pcm must be base64 16 kHz mono 16-bit audio, at most 2 s per request.',
          );
        const after = command['after'];
        if (after !== undefined && (!Number.isSafeInteger(after) || (after as number) < 0))
          throw new CallRefusal('invalid-input', 'after must be an event sequence number.');
        const before = call.seq;
        call.lastHeartbeat = now();
        hear(call, pcmFromBase64(pcm));
        return { ok: true, call: view(call, (after as number | undefined) ?? before) };
      }
      case 'hangup': {
        const call = own(caller, command['callId']);
        await end(call, 'hangup');
        return { ok: true, call: view(call) };
      }
      default:
        throw new CallRefusal('invalid-input', 'Unknown call command.');
    }
  };

  return {
    async handle(caller, command, signal) {
      try {
        return await run(caller, command, signal);
      } catch (error) {
        if (error instanceof CallRefusal)
          return { ok: false, code: error.code, error: error.message };
        log('call-command-failed', { error: String(error).slice(0, 200) });
        return {
          ok: false,
          code: 'operation-timeout',
          error: 'The call command did not complete.',
        };
      }
    },
    deliverVoice(input) {
      const call = live();
      if (
        call === undefined ||
        call.slug !== input.slug ||
        call.channelId !== input.channelId ||
        !call.connected ||
        Date.parse(input.at) < call.startedAt - 1_000
      )
        return;
      const audio = input.audio.slice();
      call.playback = call.playback.then(async () => {
        if (call.phase === 'ended' || call.abort.signal.aborted) return;
        call.playing = true;
        call.vad.reset();
        settle(call);
        push(call, {
          type: 'playing',
          messageId: input.messageId,
          bytes: audio.byteLength,
          ...(call.lastHeardAt === undefined ? {} : { responseMs: now() - call.lastHeardAt }),
        });
        call.lastHeardAt = undefined;
        try {
          if (call.peer !== undefined) await call.peer.play(audio, input.mime, call.abort.signal);
          if (!ended(call)) push(call, { type: 'played', messageId: input.messageId });
        } catch {
          if (!ended(call))
            push(call, {
              type: 'playback-failed',
              messageId: input.messageId,
              code: 'playback-failed',
            });
        } finally {
          call.playing = false;
          call.deafUntil = now() + VOICE_CALL_LIMITS.playbackTailMs;
          settle(call);
        }
      });
    },
    async revoke(deviceId) {
      await Promise.all(
        [...calls.values()]
          .filter((call) => call.caller === deviceId)
          .map((call) => end(call, 'connection-lost')),
      );
    },
    async dispose() {
      disposed = true;
      await Promise.all([...calls.values()].map((call) => end(call, 'host-stopped')));
      calls.clear();
    },
  };
}
