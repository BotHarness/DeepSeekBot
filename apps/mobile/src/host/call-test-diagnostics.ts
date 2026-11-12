import {
  CALL_MEDIA_CODES,
  type CallClientMedia,
  type CallClientState,
  type CallPost,
} from '../../../../packages/core/src/voice/call-client';
import { isConnectRoute, isLanRoute, isLoopbackRoute } from './route';

const PHASES = [
  'connecting',
  'listening',
  'user-speaking',
  'transcribing',
  'bot-speaking',
  'ended',
];
const REASONS = [
  'hangup',
  'connection-lost',
  'connect-timeout',
  'media-failed',
  'replaced',
  'bot-unavailable',
  'host-stopped',
  'refused',
];
const CODES = [
  'invalid-input',
  'not-ready',
  'unknown-bot',
  'bot-paused',
  'asr-not-configured',
  'tts-not-configured',
  'media-unsupported',
  'media-helper-missing',
  'media-failed',
  'call-active',
  'call-not-found',
  'call-ended',
  'signal-failed',
  'synthetic-only',
  'request-too-large',
  'queue-full',
  'operation-timeout',
  'connect-carrier-required',
  'device-revoked',
  'visual-off',
  'frame-invalid',
  'cell-invalid',
  'unreachable',
];
const ACTIONS = ['open', 'signal', 'heartbeat', 'hangup', 'mute'];
type Row = Readonly<Record<string, string | number | boolean | undefined>>;
const known = (value: unknown, values: readonly string[]): string | undefined =>
  typeof value === 'string' && values.includes(value) ? value : undefined;
const callId = (value: unknown): string | undefined =>
  typeof value === 'string' && /^call-[a-f0-9]{1,64}$/u.test(value) ? value : undefined;

export function callTestStateFields(state: CallClientState): Row {
  return {
    status: known(state.status, ['idle', 'opening', 'live', 'ended']),
    callId:
      state.status === 'live' || state.status === 'ended' ? callId(state.call?.callId) : undefined,
    phase: state.status === 'live' ? known(state.call.phase, PHASES) : undefined,
    reconnecting: state.status === 'live' ? state.reconnecting : undefined,
    reason: state.status === 'ended' ? known(state.reason, REASONS) : undefined,
    code: state.status === 'ended' ? known(state.code, CODES) : undefined,
    mediaCode: state.status === 'ended' ? known(state.mediaCode, CALL_MEDIA_CODES) : undefined,
  };
}

export function createCallTestDiagnostics(options: {
  post: CallPost;
  media: CallClientMedia;
  route: () => string | undefined;
  encryptedLoopback: boolean;
  now?: () => number;
}) {
  const rows: Row[] = [];
  let dropped = 0;
  let sequence = 0;
  let request = 0;
  let mediaCallId: string | undefined;
  const clock = options.now ?? (() => performance.now());
  const time = () => {
    try {
      const value = clock();
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  };
  const started = time();
  const note = (detail: Row) => {
    try {
      const route = options.route() ?? '';
      const category = isLoopbackRoute(route)
        ? 'loopback'
        : isLanRoute(route)
          ? 'lan'
          : isConnectRoute(route)
            ? 'connect'
            : 'other';
      rows.push({
        ...detail,
        seq: ++sequence,
        at: Date.now(),
        elapsedMs: Math.max(0, time() - started),
        route: category,
        encryptedLoopback: options.encryptedLoopback,
      });
      if (rows.length > 512) {
        rows.shift();
        dropped++;
      }
    } catch {}
  };
  const post: CallPost = async (body) => {
    const action = known(body.kind, ACTIONS);
    if (action === undefined) return options.post(body);
    const id = ++request;
    const at = time();
    note({ kind: 'control', stage: 'dispatch', request: id, action, callId: callId(body.callId) });
    try {
      const result = await options.post(body);
      note({
        kind: 'control',
        stage: 'resolved',
        request: id,
        action,
        callId: callId(result.ok ? (result.call?.callId ?? body.callId) : body.callId),
        durationMs: Math.max(0, time() - at),
        ok: result.ok,
        code: result.ok ? undefined : known(result.code, CODES),
        phase: result.ok ? known(result.call?.phase, PHASES) : undefined,
        reason: result.ok ? known(result.call?.endReason, REASONS) : undefined,
      });
      return result;
    } catch (error) {
      note({
        kind: 'control',
        stage: 'exception',
        request: id,
        action,
        callId: callId(body.callId),
        durationMs: Math.max(0, time() - at),
      });
      throw error;
    }
  };
  const media: CallClientMedia = {
    start: (input) => {
      mediaCallId = callId(input.callId);
      return options.media.start(input);
    },
    mute: (muted) => options.media.mute(muted),
    stop: () => options.media.stop(),
    onState: (listener) =>
      options.media.onState((state, code) => {
        note({
          kind: 'media',
          callId: mediaCallId,
          state: known(state, ['connected', 'failed', 'closed']),
          code: known(code, CALL_MEDIA_CODES),
        });
        listener(state, code);
      }),
  };
  return {
    post,
    media,
    state: (state: CallClientState) => note({ kind: 'state', ...callTestStateFields(state) }),
    snapshot: () => ({ events: [...rows], dropped }),
  };
}
