import type { CallClientState } from './call-client.js';
import type {
  VoiceCallEndReason,
  VoiceCallEvent,
  VoiceCallMissing,
  VoiceCallReadiness,
} from './call-contract.js';

export const CALL_TRANSIENT_MS = 4_000;

export type CallActivity =
  | 'connecting'
  | 'reconnecting'
  | 'listening'
  | 'hearing'
  | 'thinking'
  | 'speaking'
  | 'muted';

export type CallProblem = 'not-heard' | 'asr-failed' | 'send-failed' | 'play-failed';

export type CallHint = 'busy' | CallProblem;

export type CallTone = 'live' | 'muted' | 'busy' | 'warning';

export interface CallHeard {
  readonly text: string;
  readonly final: boolean;
}

export interface CallLiveView {
  readonly activity: CallActivity;
  readonly hint: CallHint | undefined;
  readonly tone: CallTone;
  readonly heard: CallHeard | undefined;
  readonly muted: boolean;
  readonly connected: boolean;
  readonly durationMs: number;
}

export type CallNotice =
  | `missing.${VoiceCallMissing}`
  | 'elsewhere'
  | 'unreachable'
  | 'connect-only'
  | 'microphone-denied'
  | 'microphone-missing'
  | `ended.${Exclude<VoiceCallEndReason, 'hangup'>}`
  | 'refused';

export const CALL_NOTICES = [
  'missing.bot',
  'missing.asr',
  'missing.tts',
  'missing.media-unsupported',
  'missing.media-helper-missing',
  'missing.media-unavailable',
  'missing.local-voice-off',
  'elsewhere',
  'unreachable',
  'connect-only',
  'microphone-denied',
  'microphone-missing',
  'ended.connection-lost',
  'ended.connect-timeout',
  'ended.media-failed',
  'ended.replaced',
  'ended.bot-unavailable',
  'ended.host-stopped',
  'refused',
] as const satisfies readonly CallNotice[];

const PROBLEMS: Partial<Record<VoiceCallEvent['type'], CallProblem | null>> = {
  'nothing-heard': 'not-heard',
  'asr-failed': 'asr-failed',
  'send-failed': 'send-failed',
  'playback-failed': 'play-failed',
  sent: null,
  played: null,
};

function recentProblem(
  events: readonly VoiceCallEvent[],
  hostNow: number,
): CallProblem | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    const problem = PROBLEMS[event.type];
    if (problem === undefined) continue;
    if (problem === null || hostNow - event.at > CALL_TRANSIENT_MS) return undefined;
    return problem;
  }
  return undefined;
}

const MISSED = new Set<VoiceCallEvent['type']>([
  'asr-failed',
  'nothing-heard',
  'noise-discarded',
  'send-failed',
]);

function heardText(events: readonly VoiceCallEvent[], hostNow: number): CallHeard | undefined {
  let start = -1;
  for (let index = events.length - 1; index >= 0; index -= 1)
    if (events[index]!.type === 'speech-start') {
      start = index;
      break;
    }
  if (start < 0) return undefined;
  let live: string | undefined;
  for (const event of events.slice(start + 1)) {
    if (event.type === 'hearing') live = event.text;
    else if (event.type === 'sent')
      return hostNow - event.at <= CALL_TRANSIENT_MS
        ? { text: event.text, final: true }
        : undefined;
    else if (MISSED.has(event.type)) return undefined;
  }
  return live === undefined ? undefined : { text: live, final: false };
}

export function callLiveView(state: CallClientState): CallLiveView | undefined {
  if (state.status === 'opening')
    return {
      activity: 'connecting',
      hint: undefined,
      tone: 'live',
      heard: undefined,
      muted: false,
      connected: false,
      durationMs: 0,
    };
  if (state.status !== 'live') return undefined;
  const { call, muted, reconnecting, events } = state;
  const connected = call.phase !== 'connecting';
  const base = {
    muted,
    connected,
    durationMs: connected ? call.durationMs : 0,
    heard: heardText(events, call.durationMs),
  };
  if (reconnecting) return { ...base, activity: 'reconnecting', hint: undefined, tone: 'warning' };
  if (!connected) return { ...base, activity: 'connecting', hint: undefined, tone: 'live' };
  const activity: CallActivity =
    call.phase === 'user-speaking'
      ? 'hearing'
      : call.phase === 'transcribing'
        ? 'thinking'
        : call.phase === 'bot-speaking'
          ? 'speaking'
          : muted
            ? 'muted'
            : 'listening';
  if (call.busy && call.phase !== 'bot-speaking')
    return { ...base, activity, hint: 'busy', tone: 'busy' };
  const problem = call.phase === 'listening' ? recentProblem(events, call.durationMs) : undefined;
  if (problem !== undefined) return { ...base, activity, hint: problem, tone: 'warning' };
  return { ...base, activity, hint: undefined, tone: activity === 'muted' ? 'muted' : 'live' };
}

export function callRefusalNotice(code: string | undefined): CallNotice {
  switch (code) {
    case 'connect-carrier-required':
      return 'connect-only';
    case 'asr-not-configured':
      return 'missing.asr';
    case 'tts-not-configured':
      return 'missing.tts';
    case 'unknown-bot':
      return 'missing.bot';
    case 'bot-paused':
      return 'ended.bot-unavailable';
    case 'media-unsupported':
      return 'missing.media-unsupported';
    case 'media-helper-missing':
      return 'missing.media-helper-missing';
    case 'media-failed':
    case 'not-ready':
    case 'queue-full':
    case 'operation-timeout':
      return 'missing.media-unavailable';
    case 'call-active':
      return 'elsewhere';
    case 'unreachable':
      return 'unreachable';
    default:
      return 'refused';
  }
}

export type CallReadinessAnswer =
  | VoiceCallReadiness
  | { readonly code: string; readonly error: string };

export interface CallReadinessVerdict {
  readonly dial: boolean;
  readonly offered: boolean;
  readonly blocked: 'missing' | 'elsewhere' | 'refused' | undefined;
  readonly notices: readonly CallNotice[];
}

const SETUP: ReadonlySet<VoiceCallMissing> = new Set(['bot', 'asr', 'tts']);

export function callReadinessVerdict(readiness: CallReadinessAnswer): CallReadinessVerdict {
  if ('code' in readiness)
    return {
      dial: false,
      offered: readiness.code === 'connect-carrier-required',
      blocked: 'refused',
      notices: [callRefusalNotice(readiness.code)],
    };
  if (!readiness.ready)
    return {
      dial: false,
      offered: !readiness.missing.some((missing) => SETUP.has(missing)),
      blocked: 'missing',
      notices: readiness.missing.map((missing) => `missing.${missing}` as const),
    };
  if (readiness.callElsewhere)
    return { dial: false, offered: true, blocked: 'elsewhere', notices: ['elsewhere'] };
  return { dial: true, offered: true, blocked: undefined, notices: [] };
}

export interface CallEndView {
  readonly refused: boolean;
  readonly notice: CallNotice | undefined;
  readonly retry: boolean;
}

export function callEndView(state: CallClientState): CallEndView | undefined {
  if (state.status !== 'ended') return undefined;
  const refused = state.reason === 'refused';
  const retry = state.reason !== 'replaced';
  if (state.error === 'microphone-denied') return { refused, retry, notice: 'microphone-denied' };
  if (state.error === 'microphone-missing') return { refused, retry, notice: 'microphone-missing' };
  if (state.reason === 'refused') return { refused, retry, notice: callRefusalNotice(state.code) };
  if (state.reason === 'hangup') return { refused, retry, notice: undefined };
  return { refused, retry, notice: `ended.${state.reason}` };
}

export function formatCallDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}
