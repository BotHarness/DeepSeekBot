import { randomBytes, randomUUID } from 'node:crypto';

import { dmChannelId, MAX_CALL_VISUAL_RECORDS } from '../channels/channel.js';
import {
  VOICE_CALL_BARGE_IN,
  VOICE_CALL_HOST_OWNER,
  VOICE_CALL_LIMITS,
  type VoiceCallBargeIn,
  type VoiceCallCommand,
  type VoiceCallDescription,
  type VoiceCallEndReason,
  type VoiceCallEvent,
  type VoiceCallMediaStats,
  type VoiceCallMissing,
  type VoiceCallPhase,
  type VoiceCallReadiness,
  type VoiceCallRefusal,
  type VoiceCallResult,
  type VoiceCallView,
  type VoiceCallZoom,
} from './call-contract.js';
import type { ChannelDraftEvent } from '../channels/draft.js';
import type {
  ChannelVoiceCallLifecycle,
  ChannelVoiceCallShareChange,
} from '../channels/voice-call-record.js';
import { createCallPerf, perfFields, type CallPerf } from './call-perf.js';
import { createVad, VAD_SAMPLE_RATE, type VadOptions } from './vad.js';
import { VoiceError, wavFromPcm16 } from './providers.js';
import type { AsrStream } from './soniox.js';
import {
  clipDurationMs,
  joinAudio,
  speakableSentences,
  trimAudio,
  type AudioClip,
} from './speech.js';
import {
  CallFrameError,
  createCallImaging,
  frameLabel,
  isJpeg,
  type CallImaging,
  type GridImage,
  type PreparedFrame,
} from './call-frames.js';
import { MAX_GRID_FRAMES, pickGridFrames, type CallVisualSource } from './keyframes.js';

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
  stats?(): Promise<VoiceCallMediaStats | undefined>;
  setGain?(gain: number): Promise<void>;
  close(): Promise<void>;
}

export interface CallSpeech {
  readonly archive: Promise<{ clip?: AudioClip | undefined; interrupted: boolean }>;
}

export type VoiceCallSentVisual =
  | {
      readonly source: CallVisualSource;
      readonly image: GridImage;
      readonly frames: number;
      readonly saved: boolean;
      readonly unseen?: true;
      readonly records?: readonly string[];
    }
  | {
      readonly source: CallVisualSource;
      readonly sameAs: string;
      readonly records?: readonly string[];
    };

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
    streams?(id: string): boolean;
    warm?(id: string): void;
    cool?(id: string): void;
  };
  media(): VoiceCallMedia | undefined;
  send(input: {
    slug: string;
    channelId: string;
    messageId: string;
    body: string;
    callId: string;
    visual?: VoiceCallSentVisual | undefined;
  }): Promise<void>;
  busy(slug: string): boolean;
  seesImages?(slug: string): Promise<boolean>;
  imaging?: CallImaging;
  record?(input: {
    slug: string;
    channelId: string;
    record: ChannelVoiceCallLifecycle;
  }): Promise<string | undefined>;
  recordFrames?(input: {
    slug: string;
    channelId: string;
    callId: string;
    startedAt: string;
    source: CallVisualSource;
    image: GridImage;
    frames: number;
    fromMs: number;
    toMs: number;
  }): Promise<string | undefined>;
  now?: () => number;
  cpuMs?: () => number;
  vad?: VadOptions;
  speechDbfs?: () => number;
  bargeIn?: Partial<VoiceCallBargeIn>;
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
const SEGMENT_VAD = { segmentSilenceMs: 250, endSilenceMs: 600 } as const;
const MIN_TAIL_SAMPLES = VAD_SAMPLE_RATE / 5;

const TIGHT =
  '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Thai}\\u3000-\\u303F\\uFF00-\\uFFEF';
const TIGHT_END = new RegExp(`[${TIGHT}]$`, 'u');
const TIGHT_START = new RegExp(`^[${TIGHT}]`, 'u');

export function joinTranscripts(parts: readonly string[]): string {
  let out = '';
  for (const raw of parts) {
    const part = raw.trim();
    if (part === '') continue;
    const tight = TIGHT_END.test(out) || TIGHT_START.test(part);
    out += out === '' || tight ? part : ` ${part}`;
  }
  return out;
}
const MAX_HEARING_CHARS = 500;
const OWN_TURN_START_MS = 10_000;
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

interface VisualFrame {
  readonly at: number;
  readonly score: number;
  readonly frame: PreparedFrame;
}

interface GridJob {
  readonly id: number;
  readonly source: CallVisualSource;
  readonly session: number;
  readonly frames: VisualFrame[];
  readonly picked: readonly PreparedFrame[];
  readonly result: Promise<VoiceCallSentVisual | undefined>;
}

interface KeptGrid {
  readonly callId: string;
  readonly slug: string;
  readonly source: CallVisualSource;
  readonly cells: readonly PreparedFrame[];
  readonly grid?: GridImage;
}

interface Call {
  readonly id: string;
  readonly slug: string;
  readonly channelId: string;
  readonly caller: string;
  readonly client: string | undefined;
  readonly media: 'webrtc' | 'synthetic';
  readonly startedAt: number;
  readonly abort: AbortController;
  visual: CallVisualSource | 'off';
  visualSession: number;
  saveFrames: boolean;
  records: string[];
  recording: boolean;
  frames: VisualFrame[];
  grids: number;
  lastGrid?:
    | { readonly source: CallVisualSource; readonly session: number; readonly messageId: string }
    | undefined;
  readonly vad: ReturnType<typeof createVad>;
  phase: VoiceCallPhase;
  muted: boolean;
  busy: boolean;
  ownTurn: 'none' | 'sent' | 'running';
  ownTurnAt: number;
  playing: boolean;
  guardUntil: number;
  gain: number | undefined;
  barge?: { state: 'suspected' | 'confirmed' } | undefined;
  ackStop?: AbortController | undefined;
  interrupted: Reply[];
  settledDraft?: string | undefined;
  lastHeartbeat: number;
  connected: boolean;
  connectedAt?: number;
  recorded?: Promise<string | undefined>;
  heard: number;
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
  readonly segmented: boolean;
  warmed?: string | undefined;
  segments?: { parts: Promise<string>[]; texts: (string | undefined)[] } | undefined;
  hearing?:
    | {
        text: string;
        pushedAt: number;
        timer?: ReturnType<typeof setTimeout> | undefined;
      }
    | undefined;
  replies: Reply[];
  replyCount: number;
  perf: CallPerf;
  perfAt: number;
  sampling: boolean;
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
  }): Promise<CallSpeech | undefined>;
  zoom(input: { slug?: string; messageId: string; cell: number }): VoiceCallZoom;
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
  state: 'queued' | 'playing' | 'played' | 'cut' | 'failed' | 'skipped';
  startedAt?: number;
  heardMs?: number;
}

const FILLERS = new Set([
  '嗯',
  '嗯哼',
  '啊',
  '呃',
  '额',
  '哦',
  '噢',
  '喔',
  '唔',
  '哈',
  '嘿',
  '诶',
  '欸',
  '哎',
  '呀',
  '咳',
  '那个',
  'um',
  'umm',
  'uh',
  'uhh',
  'uh-huh',
  'er',
  'erm',
  'ah',
  'oh',
  'hmm',
  'hm',
  'mm',
  'mhm',
  'huh',
  'eh',
]);
const FILLER_CHARS = /^[嗯啊呃额哦噢喔唔哈嘿诶欸哎呀咳]+$/u;

export function contentWords(text: string, language?: string): number {
  let segmenter: Intl.Segmenter;
  try {
    segmenter = new Intl.Segmenter(language?.split(/[-_]/u)[0] || 'zh', { granularity: 'word' });
  } catch {
    segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
  }
  let count = 0;
  for (const part of segmenter.segment(text)) {
    if (!part.isWordLike) continue;
    const word = part.segment.toLowerCase();
    if (FILLERS.has(word) || FILLER_CHARS.test(word)) continue;
    count += 1;
  }
  return count;
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

function syntheticPeer(): VoiceCallMediaPeer {
  return {
    async answer() {
      throw new Error('A synthetic call takes no answer.');
    },
    play: (audio, mime, signal) => pause(clipDurationMs({ audio, mime }), signal),
    async setGain() {},
    async close() {},
  };
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
  interrupted: boolean;
  archived: Spoken[];
  settleArchive?: (archive: Promise<{ clip?: AudioClip; interrupted: boolean }>) => void;
}

export function createVoiceCalls(deps: VoiceCallsDeps): VoiceCalls {
  const now = deps.now ?? (() => Date.now());
  const barge: VoiceCallBargeIn = { ...VOICE_CALL_BARGE_IN, ...deps.bargeIn };
  const log = deps.log ?? (() => undefined);
  const cpuMs =
    deps.cpuMs ??
    (() => {
      const usage = process.cpuUsage();
      return (usage.user + usage.system) / 1000;
    });
  let imaging = deps.imaging;
  const images = () => (imaging ??= createCallImaging());
  const calls = new Map<string, Call>();
  const kept = new Map<string, KeptGrid>();
  let keptCells = 0;

  const keep = (
    call: Call,
    messageId: string,
    source: CallVisualSource,
    cells: readonly PreparedFrame[],
    grid?: GridImage,
  ) => {
    if (cells.length === 0) return;
    kept.set(messageId, {
      callId: call.id,
      slug: call.slug,
      source,
      cells,
      ...(grid === undefined ? {} : { grid }),
    });
    keptCells += cells.length;
    for (const [id, grid] of kept) {
      if (keptCells <= VOICE_CALL_LIMITS.keptFrames) break;
      kept.delete(id);
      keptCells -= grid.cells.length;
    }
  };

  const release = (callId: string) => {
    for (const [id, grid] of kept)
      if (grid.callId === callId) {
        kept.delete(id);
        keptCells -= grid.cells.length;
      }
  };

  const zoom = (input: { slug?: string; messageId: string; cell: number }): VoiceCallZoom => {
    const started = now();
    const grid = kept.get(input.messageId);
    if (grid === undefined || (input.slug !== undefined && grid.slug !== input.slug))
      return { released: true, messageId: input.messageId, cell: input.cell };
    const frame =
      input.cell === 0
        ? grid.grid === undefined
          ? undefined
          : { jpeg: grid.grid.jpeg, width: grid.grid.width, height: grid.grid.height }
        : grid.cells[input.cell - 1];
    if (frame === undefined)
      throw new CallRefusal(
        'cell-invalid',
        `That grid has ${grid.cells.length} cell${grid.cells.length === 1 ? '' : 's'}; pick 1 to ${grid.cells.length}${grid.grid === undefined ? '' : ', or 0 for the whole unsaved grid'}.`,
      );
    const call = calls.get(grid.callId);
    if (call !== undefined && !ended(call))
      push(call, {
        type: 'frame-zoomed',
        messageId: input.messageId,
        cell: input.cell,
        ms: now() - started,
      });
    log('call-frame-zoomed', { call: grid.callId, cell: input.cell, cells: grid.cells.length });
    return {
      released: false,
      messageId: input.messageId,
      cell: input.cell,
      cells: grid.cells.length,
      source: grid.source,
      jpeg: frame.jpeg,
      width: frame.width,
      height: frame.height,
    };
  };
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
    visual: call.visual,
    startedAt: call.startedAt,
    durationMs: (call.endedAt ?? now()) - call.startedAt,
    ...(call.endReason === undefined ? {} : { endReason: call.endReason }),
    ...(call.offer === undefined || call.connected ? {} : { offer: call.offer }),
    events: call.events.filter((event) => event.seq > after),
    lastSeq: call.seq,
    ...perfView(call),
  });

  const perfView = (call: Call) => {
    const perf = call.perf.view();
    return perf === undefined ? {} : { perf };
  };

  const samplePerf = async (call: Call, at: number) => {
    const peer = call.peer;
    if (peer?.stats === undefined || call.sampling) return;
    call.sampling = true;
    call.perfAt = at;
    try {
      const stats = await peer.stats();
      if (stats === undefined || call.phase === 'ended') return;
      const sample = call.perf.sample(stats, now() - call.startedAt, cpuMs());
      if (sample !== undefined) log('call-media-stats', { call: call.id, ...perfFields(sample) });
    } catch {
      log('call-media-stats-failed', { call: call.id });
    } finally {
      call.sampling = false;
    }
  };

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
    call.interrupted = [];
    call.barge = undefined;
    call.frames = [];
    release(call.id);
    call.vad.reset();
    dropStream(call);
    if (call.warmed !== undefined) deps.providers.cool?.(call.warmed);
    call.warmed = undefined;
    push(call, { type: 'ended', reason });
    log('call-ended', { call: call.id, bot: call.slug, reason, ms: call.endedAt - call.startedAt });
    recordEnd(call, reason);
    const perf = call.perf.view();
    if (perf === undefined && call.connected && call.peer?.stats !== undefined)
      log('call-media-summary', { call: call.id, samples: 0 });
    else if (perf !== undefined)
      log('call-media-summary', {
        call: call.id,
        samples: perf.samples,
        uplinkPpsAvg: perf.uplinkPps.avg,
        uplinkPpsMax: perf.uplinkPps.max,
        downlinkPpsAvg: perf.downlinkPps.avg,
        downlinkPpsMax: perf.downlinkPps.max,
        uplinkKbpsAvg: perf.uplinkKbps.avg,
        downlinkKbpsAvg: perf.downlinkKbps.avg,
        uplinkLossPct: perf.uplinkLossPct,
        hostCpuPctAvg: perf.hostCpuPct.avg,
        ...(perf.helperCpuPct === undefined ? {} : { helperCpuPctAvg: perf.helperCpuPct.avg }),
        ...(perf.rttMs === undefined ? {} : { rttMsAvg: perf.rttMs.avg }),
        ...(perf.disconnects === undefined ? {} : { disconnects: perf.disconnects }),
      });
    await call.peer?.close().catch(() => undefined);
    setTimeout(() => {
      if (calls.get(call.id) === call) calls.delete(call.id);
    }, 60_000).unref?.();
  };

  const iso = (ms: number) => new Date(ms).toISOString();

  const writeRecord = async (call: Call, record: ChannelVoiceCallLifecycle) => {
    if (deps.record === undefined) return undefined;
    try {
      return await deps.record({ slug: call.slug, channelId: call.channelId, record });
    } catch (error) {
      log('call-record-failed', {
        call: call.id,
        state: record.state,
        message: (error instanceof Error ? error.message : 'unknown').slice(0, 200),
      });
      return undefined;
    }
  };

  let recordTail: Promise<unknown> = Promise.resolve();

  const recordStart = (call: Call) => {
    if (deps.record === undefined || call.connectedAt === undefined) return;
    const before = recordTail;
    const connectedAt = call.connectedAt;
    call.recorded = before.then(() =>
      writeRecord(call, {
        callId: call.id,
        botSlug: call.slug,
        state: 'started',
        startedAt: iso(connectedAt),
      }),
    );
    recordTail = call.recorded;
  };

  const recordShare = (
    call: Call,
    state: ChannelVoiceCallShareChange,
    source: CallVisualSource,
  ) => {
    const started = call.recorded;
    const connectedAt = call.connectedAt;
    if (started === undefined || connectedAt === undefined) return;
    const atMs = Math.max(0, now() - connectedAt);
    log(`call-${state}`, { call: call.id, source, atMs });
    const before = recordTail;
    call.recorded = before.then(async () => {
      const startMessageId = await started;
      await writeRecord(call, {
        callId: call.id,
        botSlug: call.slug,
        state,
        startedAt: iso(connectedAt),
        source,
        atMs,
      });
      return startMessageId;
    });
    recordTail = call.recorded;
  };

  const recordEnd = (call: Call, reason: VoiceCallEndReason) => {
    const started = call.recorded;
    const connectedAt = call.connectedAt;
    if (started === undefined || connectedAt === undefined) return;
    const endedAt = call.endedAt ?? now();
    const pending = call.transcription.catch(() => undefined);
    call.recorded = (async () => {
      const startMessageId = await started;
      await pending;
      return writeRecord(call, {
        callId: call.id,
        botSlug: call.slug,
        state: 'ended',
        startedAt: iso(connectedAt),
        endedAt: iso(endedAt),
        durationMs: Math.max(0, endedAt - connectedAt),
        reason,
        heard: call.heard,
        ...(startMessageId === undefined ? {} : { startMessageId }),
      });
    })();
    recordTail = call.recorded;
  };

  const dropStream = (call: Call) => {
    call.stream?.cancel();
    call.stream = undefined;
    call.segments = undefined;
    clearTimeout(call.hearing?.timer);
    call.hearing = undefined;
  };

  const recognize = async (call: Call, pcm: Int16Array): Promise<string> => {
    const bot = deps.bot(call.slug);
    if (bot?.asr === undefined) throw new VoiceError('unknown-provider', 'No ASR Provider.');
    let wav: Uint8Array | undefined = wavFromPcm16(pcm, VAD_SAMPLE_RATE);
    pcm.fill(0);
    try {
      return (
        await deps.providers.transcribe({
          providerId: bot.asr.providerId,
          audio: wav,
          language: bot.asr.language,
          signal: call.abort.signal,
        })
      ).text;
    } finally {
      wav.fill(0);
      wav = undefined;
    }
  };

  const segment = (call: Call, pcm: Int16Array) => {
    const segments = call.segments;
    if (segments === undefined) return;
    const index = segments.parts.length;
    const part = recognize(call, pcm).then((text) => {
      segments.texts[index] = text;
      if (call.segments === segments && !ended(call)) {
        const done: string[] = [];
        for (const piece of segments.texts) {
          if (piece === undefined) break;
          done.push(piece);
        }
        hearing(call, joinTranscripts(done));
      }
      return text;
    });
    part.catch(() => undefined);
    segments.parts.push(part);
  };

  const startStream = (call: Call) => {
    dropStream(call);
    if (call.segmented) {
      call.segments = { parts: [], texts: [] };
      return;
    }
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

  const trimFrames = (call: Call) => {
    while (call.frames.length > VOICE_CALL_LIMITS.pendingFrames) {
      let lowest = 1;
      for (let index = 2; index < call.frames.length; index += 1)
        if (call.frames[index]!.score < call.frames[lowest]!.score) lowest = index;
      call.frames.splice(lowest, 1);
    }
  };

  const recordSilence = (call: Call) => {
    if (
      deps.recordFrames === undefined ||
      call.visual === 'off' ||
      !call.saveFrames ||
      call.recording ||
      call.vad.speaking ||
      call.frames.length < MAX_GRID_FRAMES
    )
      return;
    const source = call.visual;
    const session = call.visualSession;
    const taken = call.frames.splice(0, MAX_GRID_FRAMES);
    const base = call.connectedAt ?? call.startedAt;
    const endAt = now();
    const started = now();
    call.recording = true;
    void images()
      .compose(
        taken.map((entry) => entry.frame),
        taken.map((entry, index) => frameLabel(index, (endAt - entry.at) / 1000)),
      )
      .then(async (image) => {
        const composeMs = now() - started;
        if (ended(call)) return;
        const fromMs = Math.max(0, taken[0]!.at - base);
        const toMs = Math.max(fromMs, taken.at(-1)!.at - base);
        const messageId = await deps.recordFrames!({
          slug: call.slug,
          channelId: call.channelId,
          callId: call.id,
          startedAt: iso(base),
          source,
          image,
          frames: taken.length,
          fromMs,
          toMs,
        });
        if (messageId === undefined || ended(call)) return;
        keep(
          call,
          messageId,
          source,
          taken.map((entry) => entry.frame),
        );
        call.records.push(messageId);
        if (call.visualSession === session) call.lastGrid = { source, session, messageId };
        if (call.records.length > MAX_CALL_VISUAL_RECORDS) call.records.shift();
        push(call, {
          type: 'frame-record',
          messageId,
          source,
          frames: taken.length,
          layout: image.layout,
          bytes: image.jpeg.byteLength,
          composeMs,
          fromMs,
          toMs,
        });
        log('call-frame-record', { call: call.id, source, frames: taken.length, ms: composeMs });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'The frame record could not be saved.';
        if (!ended(call)) push(call, { type: 'grid-failed', message: message.slice(0, 200) });
        log('call-frame-record-failed', { call: call.id, message: message.slice(0, 200) });
      })
      .finally(() => {
        call.recording = false;
      });
  };

  const takeGrid = (call: Call): GridJob | undefined => {
    if (call.visual === 'off') return undefined;
    const source = call.visual;
    const session = call.visualSession;
    const frames = call.frames;
    call.frames = [];
    const endAt = now();
    const id = (call.grids += 1);
    if (frames.length === 0)
      return { id, source, session, frames, picked: [], result: Promise.resolve(undefined) };
    const saved = call.saveFrames;
    const picked = pickGridFrames(frames);
    const started = now();
    const result = images()
      .compose(
        picked.map((entry) => entry.frame),
        picked.map((entry, index) => frameLabel(index, (endAt - entry.at) / 1000)),
      )
      .then((image) => {
        const composeMs = now() - started;
        if (!ended(call))
          push(call, {
            type: 'grid-built',
            grid: id,
            source,
            frames: picked.length,
            dropped: frames.length - picked.length,
            layout: image.layout,
            bytes: image.jpeg.byteLength,
            composeMs,
          });
        log('call-grid-built', {
          call: call.id,
          source,
          frames: picked.length,
          layout: image.layout,
          bytes: image.jpeg.byteLength,
          ms: composeMs,
        });
        return { source, image, frames: picked.length, saved } as const;
      });
    result.catch(() => undefined);
    return { id, source, session, frames, picked: picked.map((entry) => entry.frame), result };
  };

  const restoreGrid = (call: Call, grid: GridJob | undefined) => {
    if (grid === undefined || grid.frames.length === 0 || call.visualSession !== grid.session)
      return;
    call.frames = [...grid.frames, ...call.frames];
    trimFrames(call);
  };

  const transcribe = (
    call: Call,
    pcm: Int16Array,
    audioMs: number,
    segmentedSamples: number,
    grid: GridJob | undefined,
    gate: 'words' | 'filler' | undefined = undefined,
  ) => {
    const gated = gate === 'words';
    const stream = call.stream;
    const segments = call.segments;
    call.stream = undefined;
    call.segments = undefined;
    clearTimeout(call.hearing?.timer);
    call.hearing = undefined;
    const started = now();
    let early: Promise<string> | undefined;
    let mode: 'batch' | 'stream' | 'segments' = 'batch';
    let pieces = 0;
    if (stream !== undefined) {
      mode = 'stream';
      early = stream.finish().then((result) => result.text);
    } else if (segments !== undefined && segments.parts.length > 0) {
      mode = 'segments';
      const rest = pcm.slice(Math.min(segmentedSamples, pcm.length));
      const parts = [...segments.parts];
      if (rest.length >= MIN_TAIL_SAMPLES) parts.push(recognize(call, rest));
      else rest.fill(0);
      pieces = parts.length;
      early = Promise.all(parts).then(joinTranscripts);
    }
    early?.catch(() => undefined);
    if (early !== undefined) pcm.fill(0);
    call.transcription = call.transcription.then(async () => {
      if (call.phase === 'ended') return;
      if (!gated) call.phase = 'transcribing';
      push(call, { type: 'transcribing', audioMs });
      let text: string;
      try {
        text = early !== undefined ? await early : await recognize(call, pcm);
      } catch (error) {
        if (ended(call)) return;
        const code = error instanceof VoiceError ? error.code : 'asr-failed';
        const message = error instanceof VoiceError ? error.message : 'Speech recognition failed.';
        push(call, {
          type: 'asr-failed',
          code,
          message: message.slice(0, 200),
        });
        log('call-asr-failed', { call: call.id, code, mode });
        restoreGrid(call, grid);
        if (gated) dismiss(call, 'filler');
        return;
      } finally {
        if (call.phase === 'transcribing') call.phase = 'listening';
        settle(call);
      }
      const asrMs = now() - started;
      if (ended(call)) return;
      if (gate === 'filler' && contentWords(text, deps.bot(call.slug)?.asr?.language) === 0) {
        restoreGrid(call, grid);
        dismiss(call, 'filler');
        return;
      }
      if (gated) {
        if (contentWords(text, deps.bot(call.slug)?.asr?.language) < barge.confirmWords) {
          restoreGrid(call, grid);
          dismiss(call, 'filler');
          return;
        }
        confirm(call, 'words');
      }
      if (text.replace(/[\s\p{P}]/gu, '') === '') {
        push(call, { type: 'nothing-heard' });
        restoreGrid(call, grid);
        return;
      }
      const messageId = `human-${randomUUID()}`;
      await call.recorded;
      if (ended(call)) return;
      let visual: VoiceCallSentVisual | undefined;
      let waitedMs = 0;
      const unseen =
        grid !== undefined &&
        deps.seesImages !== undefined &&
        !(await deps.seesImages(call.slug).catch(() => true));
      if (ended(call)) return;
      if (grid !== undefined && grid.frames.length === 0) {
        const last = call.lastGrid;
        if (last !== undefined && last.session === grid.session)
          visual = { source: grid.source, sameAs: last.messageId };
      } else if (grid !== undefined) {
        const waitFrom = now();
        try {
          visual = await grid.result;
        } catch (error) {
          const message =
            error instanceof CallFrameError ? error.message : 'The grid image could not be built.';
          if (!ended(call)) push(call, { type: 'grid-failed', message: message.slice(0, 200) });
          log('call-grid-failed', { call: call.id, message: message.slice(0, 200) });
        }
        waitedMs = now() - waitFrom;
        if (ended(call)) return;
      }
      if (unseen && visual !== undefined && 'image' in visual) {
        visual = { ...visual, unseen: true };
        log('call-grid-unseen', { call: call.id, source: visual.source });
      }
      const records = visual === undefined ? [] : call.records.splice(0);
      if (records.length > 0) visual = { ...visual!, records };
      try {
        await deps.send({
          slug: call.slug,
          channelId: call.channelId,
          messageId,
          body: text,
          callId: call.id,
          ...(visual === undefined ? {} : { visual }),
        });
      } catch (error) {
        call.records.unshift(...records);
        restoreGrid(call, grid);
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
      if (visual !== undefined && 'image' in visual) {
        if (grid !== undefined && call.visualSession === grid.session)
          call.lastGrid = { source: visual.source, session: grid.session, messageId };
        keep(
          call,
          messageId,
          visual.source,
          grid?.picked ?? [],
          visual.saved ? undefined : visual.image,
        );
        push(call, {
          type: 'grid-sent',
          grid: grid?.id ?? 0,
          messageId,
          layout: visual.image.layout,
          waitedMs,
        });
      } else if (visual !== undefined && 'sameAs' in visual)
        push(call, { type: 'grid-unchanged', messageId, sameAs: visual.sameAs });
      call.lastHeardAt = now();
      call.heard += 1;
      if (!call.busy && call.ownTurn === 'none') {
        call.ownTurn = 'sent';
        call.ownTurnAt = now();
      }
      prune(call);
      push(call, {
        type: 'sent',
        messageId,
        text,
        asrMs,
        ...(mode === 'stream' ? { streamed: true } : {}),
        ...(mode === 'segments' ? { segments: pieces } : {}),
      });
      log('call-heard', {
        call: call.id,
        bot: call.slug,
        chars: text.length,
        asrMs,
        mode,
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
    reply.settleArchive?.(
      archiveOf(call, reply).catch((error: unknown) => {
        if (reply.interrupted) return { interrupted: true };
        throw error;
      }),
    );
    if (!ended(call))
      push(call, {
        type: 'reply-done',
        replyId: reply.id,
        messageId: reply.messageId,
        sentences: reply.sentences.filter((spoken) => spoken.state === 'played').length,
      });
  };

  const archiveOf = async (
    call: Call,
    reply: Reply,
  ): Promise<{ clip?: AudioClip; interrupted: boolean }> => {
    const heard = reply.interrupted
      ? reply.archived.filter((spoken) => spoken.state === 'played' || spoken.state === 'cut')
      : reply.archived;
    if (heard.length === 0) return { interrupted: reply.interrupted };
    const clips = await Promise.all(
      heard.map(async (spoken) => {
        const clip = await spoken.clip.catch(() =>
          synthesize(
            call,
            spoken.text,
            AbortSignal.timeout(VOICE_CALL_LIMITS.operationTimeoutMs * 6),
          ),
        );
        return spoken.state === 'cut' ? trimAudio(clip, spoken.heardMs ?? 0) : clip;
      }),
    );
    const clip = joinAudio(clips.filter((item) => item !== undefined));
    return clip === undefined
      ? { interrupted: reply.interrupted }
      : { clip, interrupted: reply.interrupted };
  };

  const startPlaying = (call: Call) => {
    call.playing = true;
    call.guardUntil = Math.max(call.guardUntil, now() + barge.echoDelayMs + barge.echoGuardMs);
    settle(call);
  };

  const stopPlaying = (call: Call) => {
    call.playing = false;
    call.guardUntil = Math.max(call.guardUntil, now() + VOICE_CALL_LIMITS.playbackTailMs);
    settle(call);
  };

  const setGain = (call: Call, gain: number) => {
    if (call.gain === gain || ended(call)) return;
    call.gain = gain;
    void call.peer?.setGain?.(gain).catch(() => {
      if (call.gain === gain) call.gain = undefined;
      log('call-gain-failed', { call: call.id, gain });
    });
  };

  const talking = (call: Call) => call.playing || call.replies.some(pending);

  const suspect = (call: Call) => {
    call.barge = { state: 'suspected' };
    setGain(call, barge.duckGain);
    push(call, { type: 'barge-suspected' });
    log('call-barge-suspected', { call: call.id });
  };

  const interrupt = (call: Call, reply: Reply) => {
    reply.interrupted = true;
    for (const spoken of reply.sentences)
      if (spoken.state === 'playing' && spoken.startedAt !== undefined)
        spoken.heardMs = now() - spoken.startedAt;
    reply.stop.abort();
    reply.synth.abort();
    if (reply.draftId !== undefined) call.stoppedDrafts.add(reply.draftId);
    for (const spoken of reply.sentences) if (spoken.state === 'queued') spoken.state = 'skipped';
    forget(call, reply);
    if (!reply.claimed) {
      call.interrupted.push(reply);
      if (call.interrupted.length > 8) call.interrupted.shift();
    }
    push(call, { type: 'reply-stopped', replyId: reply.id, reason: 'interrupted' });
  };

  const confirm = (call: Call, by: 'duration' | 'words') => {
    if (by === 'duration') {
      call.barge = { state: 'confirmed' };
      call.vad.linger(barge.pauseMs);
    }
    const stopped = [...call.replies];
    call.ackStop?.abort();
    for (const reply of stopped) interrupt(call, reply);
    setGain(call, 1);
    push(call, { type: 'barge-in', by, replyIds: stopped.map((reply) => reply.id) });
    log('call-barge-in', { call: call.id, by, replies: stopped.length });
    settle(call);
  };

  const dismiss = (call: Call, reason: 'ended' | 'filler') => {
    if (call.barge === undefined) setGain(call, 1);
    push(call, { type: 'barge-dismissed', reason });
    log('call-barge-dismissed', { call: call.id, reason });
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
    spoken.startedAt = now();
    startPlaying(call);
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
      if (reply.interrupted) {
        spoken.state = 'cut';
      } else if (ended(call) || reply.stop.signal.aborted) {
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
      spoken.state = reply.interrupted ? 'cut' : 'failed';
      if (!ended(call) && !reply.stop.signal.aborted)
        push(call, {
          type: 'playback-failed',
          replyId: reply.id,
          sentence: index,
          ...(reply.messageId === undefined ? {} : { messageId: reply.messageId }),
          code: 'playback-failed',
        });
    } finally {
      stopPlaying(call);
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
      interrupted: false,
      archived: [],
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
      const stop = new AbortController();
      call.ackStop = stop;
      startPlaying(call);
      push(call, { type: 'ack', ms: now() - heardAt });
      await call.peer
        ?.play(clip.audio, clip.mime, AbortSignal.any([call.abort.signal, stop.signal]))
        .catch(() => undefined);
      if (call.ackStop === stop) call.ackStop = undefined;
      stopPlaying(call);
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
      if (event.channelId === call.channelId) call.settledDraft = draftId;
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
      call.interrupted = call.interrupted.filter((item) => item.draftId !== draftId);
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

  const claim = (reply: Reply, messageId: string): CallSpeech => {
    reply.claimed = true;
    reply.messageId = messageId;
    const archive = new Promise<{ clip?: AudioClip; interrupted: boolean }>((resolve) => {
      reply.settleArchive = (settled) => resolve(settled);
    });
    archive.catch(() => undefined);
    return { archive };
  };

  const speak = async (input: {
    slug: string;
    channelId: string;
    messageId: string;
    at: string;
    body: string;
    signal?: AbortSignal | undefined;
  }): Promise<CallSpeech | undefined> => {
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
    const settledDraft = call.settledDraft;
    call.settledDraft = undefined;
    const cut =
      call.interrupted.find((item) => item.draftId === settledDraft) ??
      call.interrupted.find((item) => prefix(item) > 0);
    if (cut !== undefined) {
      call.interrupted = call.interrupted.filter((item) => item !== cut);
      const speech = claim(cut, input.messageId);
      cut.archived = [...cut.sentences];
      const heard = cut.sentences.filter(
        (spoken) => spoken.state === 'played' || spoken.state === 'cut',
      ).length;
      push(call, {
        type: 'committed',
        replyId: cut.id,
        messageId: input.messageId,
        reused: heard,
        synthesized: 0,
        interrupted: true,
      });
      log('call-reply-committed', {
        call: call.id,
        reply: cut.id,
        reused: heard,
        synthesized: 0,
        dropped: final.length - heard,
        interrupted: 1,
      });
      maybeDone(call, cut);
      return speech;
    }
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
    const speech = claim(claimed, input.messageId);
    for (const spoken of claimed.sentences.slice(matched))
      if (spoken.state === 'queued') spoken.state = 'skipped';
    claimed.archived = claimed.sentences.slice(0, matched);
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
    for (const text of tail) claimed.archived.push(enqueue(call, claimed, text));
    maybeDone(call, claimed);
    call.lastHeardAt = undefined;
    return speech;
  };

  const hear = (call: Call, samples: Int16Array) => {
    if (call.phase === 'ended' || call.phase === 'connecting') return;
    if (call.muted) return;
    call.vad.raise(!call.vad.speaking && now() < call.guardUntil ? barge.echoGuardDb : 0);
    for (const event of call.vad.push(samples)) {
      if (event.type === 'speech-start') {
        push(call, { type: 'speech-start' });
        startStream(call);
      } else if (event.type === 'audio') call.stream?.push(event.pcm);
      else if (event.type === 'segment') segment(call, event.pcm);
      else if (event.type === 'voiced') {
        if (event.voicedMs >= barge.confirmMs) {
          if (call.barge?.state === 'suspected' || (call.barge === undefined && talking(call)))
            confirm(call, 'duration');
        } else if (event.voicedMs >= barge.suspectMs) {
          if (call.barge === undefined && talking(call)) suspect(call);
        }
      } else if (event.type === 'noise') {
        dropStream(call);
        push(call, { type: 'noise-discarded', durationMs: event.durationMs });
        const suspected = call.barge?.state === 'suspected';
        call.barge = undefined;
        if (suspected) dismiss(call, 'ended');
      } else {
        const suspected = call.barge?.state === 'suspected';
        const confirmed = call.barge?.state === 'confirmed';
        const gated = suspected && talking(call);
        call.barge = undefined;
        if (suspected && !gated) setGain(call, 1);
        if (!gated && !confirmed) acknowledge(call);
        transcribe(
          call,
          event.pcm,
          event.endMs - event.startMs,
          event.segmentedSamples,
          takeGrid(call),
          gated ? 'words' : suspected ? 'filler' : undefined,
        );
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
    if (call.connected && at - call.perfAt >= VOICE_CALL_LIMITS.perfSampleMs)
      void samplePerf(call, at);
    const running = deps.busy(call.slug);
    if (call.ownTurn === 'sent' && at - call.ownTurnAt > OWN_TURN_START_MS) call.ownTurn = 'none';
    else if (call.ownTurn === 'sent' && running) call.ownTurn = 'running';
    else if (call.ownTurn === 'running' && !running) call.ownTurn = 'none';
    const busy = running && call.ownTurn === 'none';
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
    const segmented = deps.providers.streams?.(bot.asr.providerId) !== true;
    const call: Call = {
      id: `call-${randomBytes(8).toString('hex')}`,
      slug,
      channelId: dmChannelId(slug),
      caller: caller.deviceId,
      client: caller.client,
      media: kind,
      startedAt,
      abort: new AbortController(),
      visual: 'off',
      visualSession: 0,
      saveFrames: true,
      records: [],
      recording: false,
      frames: [],
      grids: 0,
      vad: createVad({
        maxUtteranceMs: VOICE_CALL_LIMITS.maxUtteranceMs,
        stream: !segmented,
        ...(segmented ? SEGMENT_VAD : {}),
        ...(deps.speechDbfs === undefined ? {} : { minActiveDbfs: deps.speechDbfs() }),
        ...deps.vad,
        voicedMarksMs: [barge.suspectMs, barge.confirmMs],
      }),
      segmented,
      phase: 'connecting',
      muted: false,
      busy: deps.busy(slug),
      ownTurn: 'none',
      ownTurnAt: 0,
      playing: false,
      guardUntil: 0,
      gain: 1,
      interrupted: [],
      lastHeartbeat: startedAt,
      connected: false,
      heard: 0,
      events: [],
      seq: 0,
      transcription: Promise.resolve(),
      playback: Promise.resolve(),
      replies: [],
      replyCount: 0,
      stoppedDrafts: new Set(),
      perf: createCallPerf(VOICE_CALL_LIMITS.perfSampleMs),
      perfAt: 0,
      sampling: false,
    };
    calls.set(call.id, call);
    if (!segmented && deps.providers.warm !== undefined) {
      call.warmed = bot.asr.providerId;
      deps.providers.warm(call.warmed);
    }
    log('call-opening', { call: call.id, bot: slug, media: kind });
    const connected = () => {
      if (call.connected || call.phase === 'ended') return;
      call.connected = true;
      call.connectedAt = now();
      call.phase = 'listening';
      recordStart(call);
      push(call, { type: 'connected' });
      if (call.busy) push(call, { type: 'busy' });
      prepareAck(call);
      log('call-connected', { call: call.id, ms: now() - call.startedAt });
      void samplePerf(call, now());
    };
    if (kind === 'synthetic') {
      call.peer = syntheticPeer();
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
            if (call.barge !== undefined) {
              call.barge = undefined;
              setGain(call, 1);
            }
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
      case 'visual': {
        const call = own(caller, command['callId']);
        const source = command['source'];
        if (source !== 'camera' && source !== 'screen' && source !== 'off')
          throw new CallRefusal('invalid-input', 'source must be camera, screen or off.');
        const save = command['save'] ?? true;
        if (typeof save !== 'boolean')
          throw new CallRefusal('invalid-input', 'save must be true or false.');
        const flags = (['stopped', 'paused', 'resumed'] as const).filter((flag) => {
          const value = command[flag] ?? false;
          if (typeof value !== 'boolean')
            throw new CallRefusal('invalid-input', `${flag} must be true or false.`);
          return value;
        });
        const change = flags[0];
        if (
          flags.length > 1 ||
          ((change === 'stopped' || change === 'paused') && source !== 'off') ||
          (change === 'resumed' && source === 'off')
        )
          throw new CallRefusal(
            'invalid-input',
            'stopped and paused go with source off, resumed with camera or screen, one at a time.',
          );
        if (call.phase === 'ended') throw new CallRefusal('call-ended', 'The call has ended.');
        if (change === 'resumed' && source !== 'off' && call.visual !== source)
          recordShare(call, 'share-resumed', source);
        else if (change !== undefined && change !== 'resumed' && call.visual !== 'off')
          recordShare(call, `share-${change}`, call.visual);
        if (call.visual !== source || call.saveFrames !== save) {
          if (call.visual !== source) {
            call.frames = [];
            call.lastGrid = undefined;
            call.visualSession += 1;
          }
          call.visual = source;
          call.saveFrames = save;
          push(call, { type: 'visual', source, ...(save ? {} : { unsaved: true }) });
          log('call-visual', { call: call.id, source, save: save ? 1 : 0 });
        }
        call.lastHeartbeat = now();
        return { ok: true, call: view(call) };
      }
      case 'frame': {
        const call = own(caller, command['callId']);
        if (call.phase === 'ended') throw new CallRefusal('call-ended', 'The call has ended.');
        const source = command['source'];
        if (source !== 'camera' && source !== 'screen')
          throw new CallRefusal('invalid-input', 'source must be camera or screen.');
        if (call.visual !== source)
          throw new CallRefusal('visual-off', `The call is not sharing the ${source} now.`);
        const jpeg = command['jpeg'];
        if (
          typeof jpeg !== 'string' ||
          jpeg.length === 0 ||
          jpeg.length > Math.ceil(VOICE_CALL_LIMITS.frameBytes / 3) * 4
        )
          throw new CallRefusal(
            'frame-invalid',
            'jpeg must be a base64 JPEG keyframe of at most 512 KB.',
          );
        const score = command['score'] ?? 1;
        const skipped = command['skipped'];
        const after = command['after'];
        if (typeof score !== 'number' || !(score >= 0 && score <= 1))
          throw new CallRefusal('invalid-input', 'score must be a number from 0 to 1.');
        if (skipped !== undefined && (!Number.isSafeInteger(skipped) || (skipped as number) < 0))
          throw new CallRefusal('invalid-input', 'skipped must be a count of samples.');
        if (after !== undefined && (!Number.isSafeInteger(after) || (after as number) < 0))
          throw new CallRefusal('invalid-input', 'after must be an event sequence number.');
        const bytes = new Uint8Array(Buffer.from(jpeg, 'base64'));
        if (!isJpeg(bytes) || bytes.byteLength > VOICE_CALL_LIMITS.frameBytes)
          throw new CallRefusal('frame-invalid', 'The keyframe must be a JPEG image.');
        const before = call.seq;
        const session = call.visualSession;
        call.lastHeartbeat = now();
        const started = now();
        let frame: PreparedFrame;
        try {
          frame = await images().prepare(bytes);
        } catch (error) {
          throw new CallRefusal(
            'frame-invalid',
            error instanceof CallFrameError ? error.message : 'The keyframe could not be read.',
          );
        }
        if (!ended(call) && call.visualSession === session) {
          call.frames.push({ at: now(), score, frame });
          trimFrames(call);
          push(call, {
            type: 'frame-received',
            source,
            bytes: bytes.byteLength,
            width: frame.width,
            height: frame.height,
            score: Math.round(score * 1000) / 1000,
            prepareMs: now() - started,
            ...(skipped === undefined ? {} : { skipped: skipped as number }),
          });
          recordSilence(call);
        }
        return { ok: true, call: view(call, (after as number | undefined) ?? before) };
      }
      case 'hangup': {
        const call = own(caller, command['callId'], true);
        await end(call, 'hangup');
        await Promise.race([call.recorded, new Promise((resolve) => setTimeout(resolve, 3_000))]);
        return { ok: true, call: view(call) };
      }
      case 'zoom': {
        const messageId = command['messageId'];
        const cell = command['cell'];
        if (typeof messageId !== 'string' || messageId.length === 0 || messageId.length > 150)
          throw new CallRefusal('invalid-input', 'messageId must name the message with the grid.');
        if (
          !Number.isSafeInteger(cell) ||
          (cell as number) < 0 ||
          (cell as number) > MAX_GRID_FRAMES
        )
          throw new CallRefusal(
            'cell-invalid',
            `cell must be a grid cell number from 1 to ${MAX_GRID_FRAMES}.`,
          );
        const result = zoom({ messageId, cell: cell as number });
        return {
          ok: true,
          zoom: result.released
            ? result
            : {
                released: false,
                messageId: result.messageId,
                cell: result.cell,
                cells: result.cells,
                source: result.source,
                width: result.width,
                height: result.height,
                bytes: result.jpeg.byteLength,
                jpeg: Buffer.from(result.jpeg).toString('base64'),
              },
        };
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
    zoom,
    async revoke(deviceId) {
      await Promise.all(
        [...calls.values()]
          .filter((call) => call.caller === deviceId)
          .map((call) => end(call, 'connection-lost')),
      );
    },
    async dispose() {
      disposed = true;
      const open = [...calls.values()];
      await Promise.all(open.map((call) => end(call, 'host-stopped')));
      await Promise.race([
        Promise.all(open.map((call) => call.recorded)),
        new Promise((resolve) => setTimeout(resolve, 2_000).unref?.()),
      ]);
      calls.clear();
      kept.clear();
      keptCells = 0;
    },
  };
}
