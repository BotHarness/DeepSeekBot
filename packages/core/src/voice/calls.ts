import { randomBytes, randomUUID } from 'node:crypto';

import { dmChannelId } from '../channels/channel.js';
import {
  VOICE_CALL_HOST_OWNER,
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
import type { ChannelDraftEvent } from '../channels/draft.js';
import { createVad, VAD_SAMPLE_RATE, type VadOptions } from './vad.js';
import { VoiceError, wavFromPcm16 } from './providers.js';
import type { AsrStream } from './soniox.js';
import { joinAudio, speakableSentences, type AudioClip } from './speech.js';

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
  readonly voice?: { readonly providerId: string; readonly voiceId?: string | undefined };
}

export interface VoiceCallsDeps {
  bot(slug: string): VoiceCallBot | undefined;
  providers: {
    has(id: string, kind: 'tts' | 'asr'): boolean;
    localServiceOff?(id: string, kind: 'tts' | 'asr'): Promise<boolean>;
    transcribe(input: {
      providerId: string;
      audio: Uint8Array;
      language?: string | undefined;
      signal?: AbortSignal | undefined;
    }): Promise<{ text: string; latencyMs: number }>;
    openStream?(input: {
      providerId: string;
      language?: string | undefined;
      signal?: AbortSignal | undefined;
      onText?: ((text: string) => void) | undefined;
    }): AsrStream | undefined;
    synthesize(input: {
      providerId: string;
      voiceId?: string | undefined;
      text: string;
      signal?: AbortSignal | undefined;
    }): Promise<AudioClip>;
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
  readonly client?: string | undefined;
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
const HEARING_EVENT_MS = 250;
const MAX_HEARING_CHARS = 500;
const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/u;

export function voiceCallClientId(command: unknown): string | undefined {
  const value =
    typeof command === 'object' && command !== null
      ? (command as Record<string, unknown>)['client']
      : undefined;
  return typeof value === 'string' && CLIENT_ID.test(value) ? value : undefined;
}

const sameCaller = (call: { caller: string; client: string | undefined }, caller: VoiceCaller) =>
  call.caller === caller.deviceId && call.client === caller.client;

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
  readonly client: string | undefined;
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
  stream?: AsrStream | undefined;
  hearing?:
    | {
        text: string;
        pushedAt: number;
        timer?: ReturnType<typeof setTimeout> | undefined;
      }
    | undefined;
  replies: Reply[];
  replyCount: number;
  stoppedDrafts: Set<string>;
  ack?: AudioClip | undefined;
}

export interface VoiceCalls {
  handle(caller: VoiceCaller, command: unknown, signal?: AbortSignal): Promise<VoiceCallResult>;
  draft(event: ChannelDraftEvent): void;
  speak(input: {
    slug: string;
    channelId: string;
    messageId: string;
    at: string;
    body: string;
    signal?: AbortSignal | undefined;
  }): Promise<AudioClip | undefined>;
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

const SETTLED_CLAIM_MS = 15_000;

export function ackText(language: string | undefined): string {
  return language === undefined || /^(zh|yue|ja)/iu.test(language) ? '嗯。' : 'Mm-hm.';
}

interface Spoken {
  readonly text: string;
  readonly clip: Promise<AudioClip>;
  state: 'queued' | 'playing' | 'played' | 'failed' | 'skipped';
}

interface Reply {
  readonly id: string;
  readonly draftId?: string;
  readonly heardAt?: number | undefined;
  readonly sentences: Spoken[];
  readonly stop: AbortController;
  readonly synth: AbortController;
  synthChain: Promise<unknown>;
  messageId?: string;
  claimed: boolean;
  started: boolean;
  finished: number;
  done: boolean;
}

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
    for (const reply of call.replies) {
      reply.stop.abort();
      if (!reply.claimed) reply.synth.abort();
    }
    call.replies = [];
    call.vad.reset();
    dropStream(call);
    push(call, { type: 'ended', reason });
    log('call-ended', { call: call.id, bot: call.slug, reason, ms: call.endedAt - call.startedAt });
    await call.peer?.close().catch(() => undefined);
    setTimeout(() => {
      if (calls.get(call.id) === call) calls.delete(call.id);
    }, 60_000).unref?.();
  };

  const dropStream = (call: Call) => {
    call.stream?.cancel();
    call.stream = undefined;
    clearTimeout(call.hearing?.timer);
    call.hearing = undefined;
  };

  const startStream = (call: Call) => {
    dropStream(call);
    const bot = deps.bot(call.slug);
    if (bot?.asr === undefined || deps.providers.openStream === undefined) return;
    let stream: AsrStream | undefined;
    try {
      stream = deps.providers.openStream({
        providerId: bot.asr.providerId,
        language: bot.asr.language,
        signal: call.abort.signal,
        onText: (text) => {
          if (call.stream !== stream || ended(call)) return;
          hearing(call, text);
        },
      });
    } catch {
      stream = undefined;
    }
    call.stream = stream;
  };

  const flushHearing = (call: Call) => {
    const state = call.hearing;
    if (state === undefined) return;
    clearTimeout(state.timer);
    state.timer = undefined;
    state.pushedAt = now();
    push(call, {
      type: 'hearing',
      text: state.text.slice(0, MAX_HEARING_CHARS),
    });
  };

  const hearing = (call: Call, text: string) => {
    if (text === '' || text === call.hearing?.text) return;
    const state = (call.hearing ??= { text, pushedAt: 0 });
    state.text = text;
    const wait = state.pushedAt + HEARING_EVENT_MS - now();
    if (wait <= 0) flushHearing(call);
    else if (state.timer === undefined) {
      state.timer = setTimeout(() => {
        if (call.hearing === state && !ended(call)) flushHearing(call);
      }, wait);
      state.timer.unref?.();
    }
  };

  const transcribe = (call: Call, pcm: Int16Array, audioMs: number) => {
    const stream = call.stream;
    call.stream = undefined;
    clearTimeout(call.hearing?.timer);
    call.hearing = undefined;
    const started = now();
    const streamed = stream?.finish();
    streamed?.catch(() => undefined);
    call.transcription = call.transcription.then(async () => {
      if (call.phase === 'ended') return;
      const bot = deps.bot(call.slug);
      call.phase = 'transcribing';
      push(call, { type: 'transcribing', audioMs });
      let wav: Uint8Array | undefined =
        streamed === undefined ? wavFromPcm16(pcm, VAD_SAMPLE_RATE) : undefined;
      pcm.fill(0);
      let text: string;
      try {
        if (streamed !== undefined) text = (await streamed).text;
        else {
          if (bot?.asr === undefined) throw new VoiceError('unknown-provider', 'No ASR Provider.');
          text = (
            await deps.providers.transcribe({
              providerId: bot.asr.providerId,
              audio: wav!,
              language: bot.asr.language,
              signal: call.abort.signal,
            })
          ).text;
        }
      } catch (error) {
        if (ended(call)) return;
        const code = error instanceof VoiceError ? error.code : 'asr-failed';
        const message = error instanceof VoiceError ? error.message : 'Speech recognition failed.';
        push(call, {
          type: 'asr-failed',
          code,
          message: message.slice(0, 200),
        });
        log('call-asr-failed', {
          call: call.id,
          code,
          mode: streamed === undefined ? 'batch' : 'stream',
        });
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
      prune(call);
      push(call, {
        type: 'sent',
        messageId,
        text,
        asrMs,
        ...(streamed === undefined ? {} : { streamed: true }),
      });
      log('call-heard', {
        call: call.id,
        bot: call.slug,
        chars: text.length,
        asrMs,
        mode: streamed === undefined ? 'batch' : 'stream',
      });
    });
  };

  const synthesize = (call: Call, text: string, signal: AbortSignal): Promise<AudioClip> => {
    const voice = deps.bot(call.slug)?.voice;
    if (voice === undefined)
      return Promise.reject(new VoiceError('unknown-provider', 'No TTS Provider.'));
    return Promise.resolve().then(() =>
      deps.providers.synthesize({
        providerId: voice.providerId,
        voiceId: voice.voiceId,
        text,
        signal,
      }),
    );
  };

  const forget = (call: Call, reply: Reply) => {
    call.replies = call.replies.filter((other) => other !== reply);
  };

  const maybeDone = (call: Call, reply: Reply) => {
    if (
      reply.done ||
      !reply.claimed ||
      reply.messageId === undefined ||
      reply.finished < reply.sentences.length
    )
      return;
    reply.done = true;
    forget(call, reply);
    if (!ended(call))
      push(call, {
        type: 'reply-done',
        replyId: reply.id,
        messageId: reply.messageId,
        sentences: reply.sentences.filter((spoken) => spoken.state === 'played').length,
      });
  };

  const finishSentence = (call: Call, reply: Reply) => {
    reply.finished += 1;
    maybeDone(call, reply);
  };

  const pending = (reply: Reply) =>
    reply.sentences.some((spoken) => spoken.state === 'queued' || spoken.state === 'playing');

  const prune = (call: Call) => {
    for (const reply of [...call.replies])
      if (!reply.claimed && !pending(reply)) {
        reply.synth.abort();
        forget(call, reply);
      }
  };

  const playSentence = async (call: Call, reply: Reply, spoken: Spoken, index: number) => {
    const skip = () => {
      if (spoken.state === 'queued') spoken.state = 'skipped';
      finishSentence(call, reply);
    };
    if (ended(call) || reply.stop.signal.aborted || spoken.state !== 'queued') return skip();
    let clip: AudioClip;
    try {
      clip = await spoken.clip;
    } catch (error) {
      if (ended(call) || reply.stop.signal.aborted || spoken.state !== 'queued') return skip();
      spoken.state = 'failed';
      push(call, {
        type: 'playback-failed',
        replyId: reply.id,
        sentence: index,
        ...(reply.messageId === undefined ? {} : { messageId: reply.messageId }),
        code: error instanceof VoiceError ? error.code : 'synthesis-failed',
      });
      finishSentence(call, reply);
      return;
    }
    if (ended(call) || reply.stop.signal.aborted || spoken.state !== 'queued') return skip();
    spoken.state = 'playing';
    call.playing = true;
    call.vad.reset();
    dropStream(call);
    settle(call);
    const first = !reply.started;
    reply.started = true;
    push(call, {
      type: 'playing',
      replyId: reply.id,
      sentence: index,
      ...(reply.messageId === undefined ? {} : { messageId: reply.messageId }),
      bytes: clip.audio.byteLength,
      ...(first && reply.heardAt !== undefined ? { responseMs: now() - reply.heardAt } : {}),
    });
    if (first)
      log('call-first-audio', {
        call: call.id,
        reply: reply.id,
        ...(reply.heardAt === undefined ? {} : { ms: now() - reply.heardAt }),
        committed: reply.messageId === undefined ? 0 : 1,
      });
    try {
      if (call.peer !== undefined)
        await call.peer.play(
          clip.audio,
          clip.mime,
          AbortSignal.any([call.abort.signal, reply.stop.signal]),
        );
      if (ended(call) || reply.stop.signal.aborted) {
        spoken.state = 'skipped';
      } else {
        spoken.state = 'played';
        push(call, {
          type: 'played',
          replyId: reply.id,
          sentence: index,
          ...(reply.messageId === undefined ? {} : { messageId: reply.messageId }),
        });
      }
    } catch {
      spoken.state = 'failed';
      if (!ended(call) && !reply.stop.signal.aborted)
        push(call, {
          type: 'playback-failed',
          replyId: reply.id,
          sentence: index,
          ...(reply.messageId === undefined ? {} : { messageId: reply.messageId }),
          code: 'playback-failed',
        });
    } finally {
      call.playing = false;
      call.deafUntil = now() + VOICE_CALL_LIMITS.playbackTailMs;
      settle(call);
      finishSentence(call, reply);
    }
  };

  const enqueue = (call: Call, reply: Reply, text: string): Spoken => {
    const clip = reply.synthChain.then(() => synthesize(call, text, reply.synth.signal));
    clip.catch(() => undefined);
    reply.synthChain = clip.catch(() => undefined);
    const spoken: Spoken = { text, clip, state: 'queued' };
    const index = reply.sentences.push(spoken) - 1;
    call.playback = call.playback.then(() => playSentence(call, reply, spoken, index));
    return spoken;
  };

  const newReply = (call: Call, draftId?: string): Reply => {
    call.replyCount += 1;
    const reply: Reply = {
      id: `reply-${call.replyCount}`,
      ...(draftId === undefined ? {} : { draftId }),
      heardAt: call.lastHeardAt,
      sentences: [],
      stop: new AbortController(),
      synth: new AbortController(),
      synthChain: Promise.resolve(),
      claimed: false,
      started: false,
      finished: 0,
      done: false,
    };
    call.replies.push(reply);
    return reply;
  };

  const stopReply = (call: Call, reply: Reply, reason: 'abandoned' | 'revised' | 'replaced') => {
    reply.stop.abort();
    reply.synth.abort();
    if (reply.draftId !== undefined) call.stoppedDrafts.add(reply.draftId);
    for (const spoken of reply.sentences) if (spoken.state === 'queued') spoken.state = 'skipped';
    forget(call, reply);
    push(call, { type: 'reply-stopped', replyId: reply.id, reason });
    log('call-reply-stopped', { call: call.id, reply: reply.id, reason });
    settle(call);
  };

  const acknowledge = (call: Call) => {
    const clip = call.ack;
    if (clip === undefined) return;
    const heardAt = now();
    call.playback = call.playback.then(async () => {
      if (ended(call) || call.replies.some(pending)) return;
      call.playing = true;
      settle(call);
      push(call, { type: 'ack', ms: now() - heardAt });
      await call.peer?.play(clip.audio, clip.mime, call.abort.signal).catch(() => undefined);
      call.playing = false;
      call.deafUntil = now() + VOICE_CALL_LIMITS.playbackTailMs;
      settle(call);
    });
  };

  const prepareAck = (call: Call) => {
    const bot = deps.bot(call.slug);
    void synthesize(call, ackText(bot?.asr?.language), call.abort.signal).then(
      (clip) => {
        if (!ended(call)) call.ack = clip;
      },
      (error: unknown) => {
        if (!ended(call))
          log('call-ack-unavailable', {
            call: call.id,
            code: error instanceof VoiceError ? error.code : 'synthesis-failed',
          });
      },
    );
  };

  const onDraft = (event: ChannelDraftEvent) => {
    const call = live();
    if (call === undefined || !call.connected) return;
    if (event.type === 'settled') {
      const draftId = event.draftId;
      const timer = setTimeout(() => {
        const reply = call.replies.find((item) => item.draftId === draftId && !item.claimed);
        if (reply !== undefined && !ended(call)) stopReply(call, reply, 'abandoned');
      }, SETTLED_CLAIM_MS);
      timer.unref?.();
      return;
    }
    if (event.type === 'abandoned') {
      if (event.channelId !== call.channelId) return;
      const draftId = event.draftId;
      const reply = call.replies.find((item) => item.draftId === draftId && !item.claimed);
      if (reply !== undefined) stopReply(call, reply, 'abandoned');
      return;
    }
    const draft = event.draft;
    if (draft.channelId !== call.channelId || draft.botSlug !== call.slug || draft.voice !== true)
      return;
    if (call.stoppedDrafts.has(draft.draftId)) return;
    if (call.replies.some((item) => item.draftId === draft.draftId && item.claimed)) return;
    let reply = call.replies.find((item) => item.draftId === draft.draftId);
    const sentences = speakableSentences(draft.body, draft.bodyComplete === true);
    if (reply === undefined) {
      if (sentences.length === 0 && draft.body.trim() === '') return;
      reply = newReply(call, draft.draftId);
      push(call, {
        type: 'reply-text',
        replyId: reply.id,
        ...(reply.heardAt === undefined ? {} : { responseMs: now() - reply.heardAt }),
      });
      log('call-reply-text', {
        call: call.id,
        reply: reply.id,
        ...(reply.heardAt === undefined ? {} : { ms: now() - reply.heardAt }),
      });
    }
    const known = reply.sentences;
    const diverged =
      known.length > sentences.length ||
      known.some((spoken, index) => sentences[index] !== spoken.text);
    if (diverged) {
      stopReply(call, reply, 'revised');
      return;
    }
    for (const text of sentences.slice(known.length)) enqueue(call, reply, text);
  };

  const speak = async (input: {
    slug: string;
    channelId: string;
    messageId: string;
    at: string;
    body: string;
    signal?: AbortSignal | undefined;
  }): Promise<AudioClip | undefined> => {
    const call = live();
    if (
      call === undefined ||
      !call.connected ||
      call.slug !== input.slug ||
      call.channelId !== input.channelId ||
      Date.parse(input.at) < call.startedAt - 1_000
    )
      return undefined;
    const final = speakableSentences(input.body, true);
    if (final.length === 0) return undefined;
    const prefix = (reply: Reply) => {
      let count = 0;
      while (
        count < reply.sentences.length &&
        count < final.length &&
        reply.sentences[count]!.text === final[count]
      )
        count += 1;
      return count;
    };
    let reply: Reply | undefined;
    let matched = 0;
    for (const candidate of call.replies) {
      if (candidate.claimed || candidate.draftId === undefined) continue;
      const count = prefix(candidate);
      if (count > 0 && count >= matched) {
        reply = candidate;
        matched = count;
      }
    }
    for (const other of [...call.replies])
      if (!other.claimed && other !== reply && other.draftId !== undefined)
        stopReply(call, other, 'replaced');
    if (reply === undefined) reply = newReply(call);
    const claimed = reply;
    claimed.claimed = true;
    claimed.messageId = input.messageId;
    for (const spoken of claimed.sentences.slice(matched))
      if (spoken.state === 'queued') spoken.state = 'skipped';
    const abortSynth = () => claimed.synth.abort();
    input.signal?.addEventListener('abort', abortSynth, { once: true });
    const archive: Promise<AudioClip>[] = claimed.sentences
      .slice(0, matched)
      .map((spoken) =>
        spoken.clip.catch(() =>
          synthesize(call, spoken.text, input.signal ?? claimed.synth.signal),
        ),
      );
    const tail = final.slice(matched);
    push(call, {
      type: 'committed',
      replyId: claimed.id,
      messageId: input.messageId,
      reused: matched,
      synthesized: tail.length,
    });
    log('call-reply-committed', {
      call: call.id,
      reply: claimed.id,
      reused: matched,
      synthesized: tail.length,
      dropped: claimed.sentences.length - matched,
    });
    for (const text of tail) archive.push(enqueue(call, claimed, text).clip);
    maybeDone(call, claimed);
    call.lastHeardAt = undefined;
    try {
      const clips = await Promise.all(archive);
      return joinAudio(clips);
    } finally {
      input.signal?.removeEventListener('abort', abortSynth);
    }
  };

  const hear = (call: Call, samples: Int16Array) => {
    if (call.phase === 'ended' || call.phase === 'connecting') return;
    if (call.muted || call.playing || now() < call.deafUntil) return;
    for (const event of call.vad.push(samples)) {
      if (event.type === 'speech-start') {
        push(call, { type: 'speech-start' });
        startStream(call);
      } else if (event.type === 'audio') call.stream?.push(event.pcm);
      else if (event.type === 'noise') {
        dropStream(call);
        push(call, { type: 'noise-discarded', durationMs: event.durationMs });
      } else {
        acknowledge(call);
        transcribe(call, event.pcm, event.endMs - event.startMs);
      }
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

  const readiness = async (caller: VoiceCaller, slug: string): Promise<VoiceCallReadiness> => {
    const bot = deps.bot(slug);
    const missing: VoiceCallMissing[] = [];
    if (bot === undefined || bot.paused === true) missing.push('bot');
    const asr = bot?.asr?.providerId;
    const tts = bot?.voice?.providerId;
    if (asr === undefined || !deps.providers.has(asr, 'asr')) missing.push('asr');
    if (tts === undefined || !deps.providers.has(tts, 'tts')) missing.push('tts');
    const off = deps.providers.localServiceOff?.bind(deps.providers);
    if (off !== undefined) {
      const checks = [
        ...(asr !== undefined && !missing.includes('asr') ? [off(asr, 'asr')] : []),
        ...(tts !== undefined && !missing.includes('tts') ? [off(tts, 'tts')] : []),
      ];
      const results = await Promise.all(checks.map((check) => check.catch(() => false)));
      if (results.includes(true)) missing.push('local-voice-off');
    }
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
      activeCallId:
        active !== undefined && active.slug === slug && sameCaller(active, caller)
          ? active.id
          : null,
      callElsewhere: active !== undefined && !sameCaller(active, caller),
    };
  };

  const own = (caller: VoiceCaller, value: unknown, admin = false): Call => {
    if (typeof value !== 'string' || !CALL_ID.test(value))
      throw new CallRefusal('invalid-input', 'A call id is required.');
    const call = calls.get(value);
    if (
      call === undefined ||
      (!sameCaller(call, caller) && !(admin && caller.deviceId === VOICE_CALL_HOST_OWNER))
    )
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
      if (!sameCaller(active, caller))
        throw new CallRefusal('call-active', 'Another device is already on a call with this Host.');
      await end(active, 'replaced');
    }
    const startedAt = now();
    const call: Call = {
      id: `call-${randomBytes(8).toString('hex')}`,
      slug,
      channelId: dmChannelId(slug),
      caller: caller.deviceId,
      client: caller.client,
      media: kind,
      startedAt,
      abort: new AbortController(),
      vad: createVad({
        maxUtteranceMs: VOICE_CALL_LIMITS.maxUtteranceMs,
        stream: deps.providers.openStream !== undefined,
        ...deps.vad,
      }),
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
      replies: [],
      replyCount: 0,
      stoppedDrafts: new Set(),
    };
    calls.set(call.id, call);
    log('call-opening', { call: call.id, bot: slug, media: kind });
    const connected = () => {
      if (call.connected || call.phase === 'ended') return;
      call.connected = true;
      call.phase = 'listening';
      push(call, { type: 'connected' });
      if (call.busy) push(call, { type: 'busy' });
      prepareAck(call);
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
        return { ok: true, readiness: await readiness(caller, slugOf(command['slug'])) };
      case 'status':
        return {
          ok: true,
          calls: [...calls.values()]
            .filter(
              (call) =>
                caller.deviceId === VOICE_CALL_HOST_OWNER || call.caller === caller.deviceId,
            )
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
          if (call.muted) {
            call.vad.reset();
            dropStream(call);
          }
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
        const call = own(caller, command['callId'], true);
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
    draft: onDraft,
    speak,
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
