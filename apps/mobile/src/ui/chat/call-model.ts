import type { CallClientState } from '../../../../../packages/core/src/voice/call-client';
import type {
  VoiceCallEvent,
  VoiceCallMissing,
  VoiceCallReadiness,
} from '../../../../../packages/core/src/voice/call-contract';
import type { callStrings } from '../strings';

type Strings = { readonly call: (typeof callStrings)['en'] };

export type CallScreenModel = {
  status: string;
  hint?: string;
  heard?: { text: string; final: boolean };
  live: boolean;
  muted: boolean;
  ended?: string;
  retry: boolean;
};

const TRANSIENT_MS = 4_000;

function transient(
  t: Strings,
  events: readonly VoiceCallEvent[],
  hostNow: number | undefined,
): string | undefined {
  const last = [...events]
    .reverse()
    .find((event) =>
      ['nothing-heard', 'asr-failed', 'send-failed', 'playback-failed', 'sent', 'played'].includes(
        event.type,
      ),
    );
  if (last === undefined || hostNow === undefined || hostNow - last.at > TRANSIENT_MS)
    return undefined;
  switch (last.type) {
    case 'nothing-heard':
      return t.call.notHeard;
    case 'asr-failed':
      return t.call.asrFailed;
    case 'send-failed':
      return t.call.sendFailed;
    case 'playback-failed':
      return t.call.playFailed;
    default:
      return undefined;
  }
}

function heardText(
  events: readonly VoiceCallEvent[],
  hostNow: number | undefined,
): CallScreenModel['heard'] {
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
      return hostNow !== undefined && hostNow - event.at <= TRANSIENT_MS
        ? { text: event.text, final: true }
        : undefined;
    else if (['asr-failed', 'nothing-heard', 'noise-discarded', 'send-failed'].includes(event.type))
      return undefined;
  }
  return live === undefined ? undefined : { text: live, final: false };
}

export function callScreenModel(t: Strings, state: CallClientState): CallScreenModel {
  if (state.status === 'idle' || state.status === 'opening')
    return { status: t.call.connecting, live: false, muted: false, retry: false };
  if (state.status === 'ended') {
    const reason = state.reason;
    const detail = reason === 'refused' ? refusalMessage(t, state.code) : t.call.ended[reason];
    return {
      status: reason === 'refused' ? t.call.ended.refused : t.call.ended.hangup,
      live: false,
      muted: false,
      ended: detail,
      retry: reason !== 'replaced',
    };
  }
  const { call, muted, reconnecting, events } = state;
  const status = reconnecting
    ? t.call.reconnecting
    : call.phase === 'connecting'
      ? t.call.connecting
      : call.phase === 'user-speaking'
        ? t.call.hearing
        : call.phase === 'transcribing'
          ? t.call.thinking
          : call.phase === 'bot-speaking'
            ? t.call.speaking
            : muted
              ? t.call.muted
              : t.call.listening;
  const hint = call.busy ? t.call.busy : transient(t, events, call.durationMs);
  const heard = heardText(events, call.durationMs);
  return {
    status,
    live: true,
    muted,
    retry: false,
    ...(hint === undefined ? {} : { hint }),
    ...(heard === undefined ? {} : { heard }),
  };
}

function refusalMessage(t: Strings, code: string | undefined): string {
  switch (code) {
    case 'connect-carrier-required':
      return t.call.connectOnly;
    case 'asr-not-configured':
      return t.call.missing.asr;
    case 'tts-not-configured':
      return t.call.missing.tts;
    case 'unknown-bot':
      return t.call.missing.bot;
    case 'bot-paused':
      return t.call.ended['bot-unavailable'];
    case 'media-unsupported':
      return t.call.missing['media-unsupported'];
    case 'media-helper-missing':
      return t.call.missing['media-helper-missing'];
    case 'media-failed':
    case 'not-ready':
    case 'queue-full':
    case 'operation-timeout':
      return t.call.missing['media-unavailable'];
    case 'call-active':
      return t.call.busyElsewhere;
    case 'unreachable':
      return t.call.unreachable;
    default:
      return t.call.ended.refused;
  }
}

export function readinessMessage(
  t: Strings,
  readiness: VoiceCallReadiness | { readonly code: string; readonly error: string },
): string | undefined {
  if ('code' in readiness) return refusalMessage(t, readiness.code);
  if (readiness.ready) return undefined;
  return readiness.missing.map((missing: VoiceCallMissing) => t.call.missing[missing]).join('\n');
}

export function formatCallDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}
