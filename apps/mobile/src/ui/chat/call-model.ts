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

export function callScreenModel(t: Strings, state: CallClientState): CallScreenModel {
  if (state.status === 'idle' || state.status === 'opening')
    return { status: t.call.connecting, live: false, muted: false, retry: false };
  if (state.status === 'ended') {
    const reason = state.reason;
    const detail =
      state.code === 'connect-carrier-required'
        ? t.call.connectOnly
        : reason === 'refused'
          ? (state.error ?? t.call.ended.refused)
          : t.call.ended[reason];
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
  return { status, live: true, muted, retry: false, ...(hint === undefined ? {} : { hint }) };
}

export function readinessMessage(
  t: Strings,
  readiness: VoiceCallReadiness | { readonly code: string; readonly error: string },
): string | undefined {
  if ('code' in readiness)
    return readiness.code === 'connect-carrier-required' ? t.call.connectOnly : readiness.error;
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
