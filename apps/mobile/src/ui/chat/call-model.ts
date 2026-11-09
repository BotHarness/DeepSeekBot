import type { CallClientState } from '../../../../../packages/core/src/voice/call-client';
import type {
  VoiceCallEndReason,
  VoiceCallMissing,
} from '../../../../../packages/core/src/voice/call-contract';
import {
  callEndView,
  callLiveView,
  callReadinessVerdict,
  formatCallDuration,
  type CallHint,
  type CallNotice,
  type CallReadinessAnswer,
} from '../../../../../packages/core/src/voice/call-view';
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

function noticeText(t: Strings, notice: CallNotice): string {
  switch (notice) {
    case 'elsewhere':
      return t.call.busyElsewhere;
    case 'unreachable':
      return t.call.unreachable;
    case 'connect-only':
      return t.call.connectOnly;
    case 'microphone-denied':
      return t.call.noMicrophone;
    case 'microphone-missing':
      return t.call.microphoneMissing;
    case 'refused':
      return t.call.ended.refused;
    default:
      return notice.startsWith('missing.')
        ? t.call.missing[notice.slice('missing.'.length) as VoiceCallMissing]
        : t.call.ended[notice.slice('ended.'.length) as Exclude<VoiceCallEndReason, 'hangup'>];
  }
}

function hintText(t: Strings, hint: CallHint): string {
  switch (hint) {
    case 'busy':
      return t.call.busy;
    case 'not-heard':
      return t.call.notHeard;
    case 'asr-failed':
      return t.call.asrFailed;
    case 'send-failed':
      return t.call.sendFailed;
    case 'play-failed':
      return t.call.playFailed;
  }
}

export function callScreenModel(
  t: Strings,
  state: CallClientState,
  options: { interrupted?: boolean } = {},
): CallScreenModel {
  const ended = callEndView(state);
  if (ended !== undefined)
    return {
      status: ended.refused ? t.call.ended.refused : t.call.ended.hangup,
      live: false,
      muted: false,
      ended: ended.notice === undefined ? t.call.ended.hangup : noticeText(t, ended.notice),
      retry: ended.retry,
    };
  const view = callLiveView(state);
  if (view === undefined || state.status !== 'live')
    return { status: t.call.connecting, live: false, muted: false, retry: false };
  const hint =
    options.interrupted === true
      ? t.call.interrupted
      : view.hint === undefined
        ? undefined
        : hintText(t, view.hint);
  return {
    status: t.call[view.activity],
    live: true,
    muted: view.muted,
    retry: false,
    ...(hint === undefined ? {} : { hint }),
    ...(view.heard === undefined ? {} : { heard: view.heard }),
  };
}

export function callConfigured(readiness: CallReadinessAnswer): boolean {
  return callReadinessVerdict(readiness).offered;
}

export function readinessMessage(t: Strings, readiness: CallReadinessAnswer): string | undefined {
  const verdict = callReadinessVerdict(readiness);
  if (verdict.dial) return undefined;
  return verdict.notices.map((notice) => noticeText(t, notice)).join('\n');
}

export type MicrophoneRecovery = {
  message: string;
  action: 'ask' | 'settings';
};

export function microphoneRecovery(
  t: Strings,
  access: 'granted' | 'denied' | 'blocked' | undefined,
): MicrophoneRecovery | undefined {
  if (access === 'denied') return { message: t.call.microphoneNeeded, action: 'ask' };
  if (access === 'blocked') return { message: t.call.noMicrophone, action: 'settings' };
  return undefined;
}

export { formatCallDuration };

export type CallActivityPhase =
  | 'connecting'
  | 'listening'
  | 'hearing'
  | 'thinking'
  | 'speaking'
  | 'muted'
  | 'interrupted'
  | 'reconnecting';

export function callActivityPhase(
  state: CallClientState,
  interrupted: boolean,
): CallActivityPhase | undefined {
  const view = callLiveView(state);
  if (view === undefined) return undefined;
  if (state.status === 'opening') return 'connecting';
  return interrupted ? 'interrupted' : view.activity;
}

export type CallBubbleTone =
  | 'connecting'
  | 'listening'
  | 'hearing'
  | 'thinking'
  | 'speaking'
  | 'muted'
  | 'paused'
  | 'ended';

export type CallBubbleModel = {
  tone: CallBubbleTone;
  status: string;
  muted: boolean;
  duration?: string;
};

export function callBubbleModel(
  t: Strings,
  input: { state: CallClientState; interrupted: boolean; startedAt?: number | undefined },
  now: number,
): CallBubbleModel {
  const { state, interrupted } = input;
  if (state.status === 'ended') return { tone: 'ended', status: t.call.ended.hangup, muted: false };
  const phase = callActivityPhase(state, interrupted);
  const muted = state.status === 'live' && state.muted;
  const duration =
    state.status === 'live' && input.startedAt !== undefined
      ? formatCallDuration(now - input.startedAt)
      : undefined;
  const tone: CallBubbleTone =
    phase === undefined || phase === 'connecting' || phase === 'reconnecting'
      ? 'connecting'
      : phase === 'interrupted'
        ? 'paused'
        : phase;
  const status =
    tone === 'paused' ? t.call.paused : callScreenModel(t, state, { interrupted }).status;
  return { tone, status, muted, ...(duration === undefined ? {} : { duration }) };
}
