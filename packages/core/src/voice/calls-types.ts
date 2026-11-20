import type {
  VoiceCallBargeIn,
  VoiceCallDescription,
  VoiceCallEndReason,
  VoiceCallEvent,
  VoiceCallMediaStats,
  VoiceCallPhase,
  VoiceCallResult,
  VoiceCallZoom,
} from './call-contract.js';
import type { ChannelDraftEvent } from '../channels/draft.js';
import type { ChannelVoiceCallLifecycle } from '../channels/voice-call-record.js';
import type { CallPerf } from './call-perf.js';
import { createVad, type VadOptions } from './vad.js';
import type { AsrStream } from './soniox.js';
import type { AudioClip } from './speech.js';
import type { CallImaging, GridImage, PreparedFrame } from './call-frames.js';
import type { Harvest } from './harvest.js';
import type { CallVisualSource } from './keyframes.js';

export interface VoiceCallMedia {
  availability(signal?: AbortSignal): Promise<'ready' | 'unsupported-platform' | 'helper-missing'>;
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
      readonly fromMs: number;
      readonly toMs: number;
      readonly unseen?: true;
    }
  | {
      readonly source: CallVisualSource;
      readonly sameAs: string;
    };

export interface VoiceCallText {
  readonly callId: string;
  readonly atMs: number;
  readonly visual?: VoiceCallSentVisual;
  settle(sent: boolean): void;
}

export interface VoiceCallSpeechRange {
  readonly fromMs: number;
  readonly toMs: number;
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
    speech?: VoiceCallSpeechRange | undefined;
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

export type EventInput = VoiceCallEvent extends infer E
  ? E extends VoiceCallEvent
    ? Omit<E, 'seq' | 'at'>
    : never
  : never;

export interface VisualFrame {
  readonly at: number;
  readonly frame: PreparedFrame;
}

export interface GridJob {
  readonly id: number;
  readonly source: CallVisualSource;
  readonly session: number;
  readonly frames: VisualFrame[];
  readonly picked: readonly PreparedFrame[];
  readonly result: Promise<VoiceCallSentVisual | undefined>;
  readonly written: Promise<void>;
}

export interface KeptGrid {
  readonly callId: string;
  readonly slug: string;
  readonly source: CallVisualSource;
  readonly cells: readonly PreparedFrame[];
}

export interface Call {
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
  readonly harvest: Harvest<VisualFrame>;
  committing: number;
  commits: Promise<void>;
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
  interrupted: Reply[];
  settledDraft?: string | undefined;
  lastHeartbeat: number;
  tickedAt: number;
  mediaSeenAt: number;
  mediaCheck?: Promise<void> | undefined;
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
  text(input: {
    channelId: string;
    messageId: string;
    picture?: boolean | undefined;
  }): Promise<VoiceCallText | undefined>;
  revoke(deviceId: string): Promise<void>;
  dispose(): Promise<void>;
}

export const ended = (call: { phase: VoiceCallPhase }) => call.phase === 'ended';

export interface Spoken {
  readonly text: string;
  readonly clip: Promise<AudioClip>;
  state: 'queued' | 'playing' | 'played' | 'cut' | 'failed' | 'skipped';
  startedAt?: number;
  heardMs?: number;
}

export interface Reply {
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
