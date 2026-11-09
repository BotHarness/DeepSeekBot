import {
  readCallReadiness,
  type CallClientMedia,
  type CallClientState,
  type CallPost,
} from '../../../core/src/voice/call-client.js';
import { VOICE_CALL_PATH, type VoiceCallResult } from '../../../core/src/voice/call-contract.js';
import {
  callEndView,
  callLiveView,
  callReadinessVerdict,
  formatCallDuration,
  type CallActivity,
  type CallHint,
  type CallNotice,
  type CallReadinessVerdict,
  type CallTone,
} from '../../../core/src/voice/call-view.js';
import type { CallVisualSource } from '../../../core/src/voice/keyframes.js';
import {
  createCallSession,
  type CallCapture,
  type CallHangupOptions,
  type CallSession,
  type CallVisualState,
} from '../../../core/src/voice/call-session.js';
import {
  createBrowserCallCamera,
  type CallCamera,
  type CallCameraKeyframe,
  type CallCaptureErrorCode,
} from './call-camera.js';
import { createBrowserCallMedia } from './call-media.js';
import { watchCallPresence } from './call-presence.js';

const CLIENT_KEY = 'botharness/call-client.v1';

export interface DesktopCallBlock {
  readonly kind: NonNullable<CallReadinessVerdict['blocked']>;
  readonly notices: readonly CallNotice[];
}

export type DesktopCallVisualError =
  | Exclude<CallCaptureErrorCode, 'screen-cancelled'>
  | 'camera-stopped'
  | 'screen-stopped';

export interface DesktopCallVisual {
  readonly source: 'off' | CallVisualSource;
  readonly starting: boolean;
  readonly stream: MediaStream | undefined;
  readonly label: string | undefined;
  readonly keyframes: number;
  readonly keyframeAt: number | undefined;
  readonly error: DesktopCallVisualError | undefined;
}

export interface DesktopCallCaptureHandlers {
  readonly onKeyframe: (frame: CallCameraKeyframe) => Promise<void>;
  readonly onEnded: () => void;
}

export interface DesktopCallPlace {
  readonly title: string;
  readonly body: string;
  readonly open: () => void;
}

export interface DesktopCallSnapshot {
  readonly slug: string | undefined;
  readonly place?: DesktopCallPlace | undefined;
  readonly checking: boolean;
  readonly block: DesktopCallBlock | undefined;
  readonly state: CallClientState;
  readonly visual: DesktopCallVisual;
}

export const DESKTOP_CALL_VISUAL_OFF: DesktopCallVisual = {
  source: 'off',
  starting: false,
  stream: undefined,
  label: undefined,
  keyframes: 0,
  keyframeAt: undefined,
  error: undefined,
};

export interface DesktopCall {
  subscribe(listener: () => void): () => void;
  snapshot(): DesktopCallSnapshot;
  start(slug: string, place?: DesktopCallPlace): Promise<void>;
  mute(muted: boolean): Promise<void>;
  camera(on: boolean): Promise<void>;
  screen(on: boolean): Promise<void>;
  dismissVisual(): void;
  hangup(options?: CallHangupOptions): Promise<void>;
  dismiss(): void;
}

function windowClientId(): string {
  const fresh = () =>
    globalThis.crypto?.randomUUID?.().replaceAll('-', '') ??
    Math.random().toString(36).slice(2).padEnd(12, '0');
  try {
    const saved = sessionStorage.getItem(CLIENT_KEY);
    if (saved !== null && /^[A-Za-z0-9_-]{8,64}$/u.test(saved)) return saved;
    const created = fresh();
    sessionStorage.setItem(CLIENT_KEY, created);
    return created;
  } catch {
    return fresh();
  }
}

export function createCallPost(
  client: string,
  fetcher: typeof fetch = (...args) => fetch(...args),
): CallPost {
  return async (body) => {
    const response = await fetcher(`.${VOICE_CALL_PATH}`, {
      method: 'POST',
      credentials: 'same-origin',
      ...(body.kind === 'hangup' ? { keepalive: true } : {}),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, client }),
    });
    const result = (await response.json().catch(() => undefined)) as VoiceCallResult | undefined;
    if (result === undefined || typeof result.ok !== 'boolean')
      throw new Error(`The Host answered ${response.status}.`);
    return result;
  };
}

interface DesktopCapture extends CallCapture {
  readonly camera: CallCamera;
}

function desktopCapture(camera: CallCamera): DesktopCapture {
  return {
    camera,
    async acquire() {
      await camera.start();
    },
    run: () => camera.run(),
    stop: () => camera.stop(),
  };
}

export function createDesktopCall(
  options: {
    post?: CallPost;
    media?: () => CallClientMedia;
    capture?: (source: CallVisualSource, handlers: DesktopCallCaptureHandlers) => CallCamera;
    now?: () => number;
  } = {},
): DesktopCall {
  const post = options.post ?? createCallPost(windowClientId());
  const media = options.media ?? (() => createBrowserCallMedia());
  const makeCapture =
    options.capture ?? ((source, handlers) => createBrowserCallCamera({ source, ...handlers }));
  const listeners = new Set<() => void>();
  let session: CallSession<DesktopCapture, CallCaptureErrorCode> | undefined;
  let current: DesktopCallSnapshot = {
    slug: undefined,
    checking: false,
    block: undefined,
    state: { status: 'idle' },
    visual: DESKTOP_CALL_VISUAL_OFF,
  };
  const set = (next: Partial<DesktopCallSnapshot>) => {
    current = { ...current, ...next };
    for (const listener of [...listeners]) listener();
  };
  const active = () => current.state.status === 'opening' || current.state.status === 'live';
  const visualOf = (
    owned: CallSession<DesktopCapture, CallCaptureErrorCode>,
    visual: CallVisualState<CallCaptureErrorCode>,
  ): DesktopCallVisual => {
    const camera = visual.source === 'off' ? undefined : owned.capture()?.camera;
    return {
      source: visual.source,
      starting: visual.starting,
      stream: camera?.stream(),
      label: camera?.label(),
      keyframes: visual.keyframes,
      keyframeAt: visual.keyframeAt,
      error: visual.error as DesktopCallVisualError | undefined,
    };
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => current,
    async start(slug, place) {
      if (current.checking || active()) return;
      session?.dispose();
      session = undefined;
      set({
        slug,
        place,
        checking: true,
        block: undefined,
        state: { status: 'idle' },
        visual: DESKTOP_CALL_VISUAL_OFF,
      });
      let verdict: CallReadinessVerdict;
      try {
        verdict = callReadinessVerdict(await readCallReadiness(post, slug));
      } catch {
        verdict = callReadinessVerdict({ code: 'unreachable', error: '' });
      }
      if (!verdict.dial) {
        set({
          checking: false,
          block: { kind: verdict.blocked ?? 'refused', notices: verdict.notices },
        });
        return;
      }
      const owned: CallSession<DesktopCapture, CallCaptureErrorCode> = createCallSession<
        DesktopCapture,
        CallCaptureErrorCode
      >({
        post,
        media: media(),
        ...(options.now === undefined ? {} : { now: options.now }),
        capture: (source, events) =>
          desktopCapture(
            makeCapture(source, { onKeyframe: events.keyframe, onEnded: events.ended }),
          ),
        onChange: (state) => {
          if (session !== owned) return;
          set({
            state: state.call,
            visual: visualOf(owned, state.visual as CallVisualState<CallCaptureErrorCode>),
          });
        },
      });
      session = owned;
      set({ checking: false });
      await owned.client.open(slug);
    },
    async mute(muted) {
      await session?.client.mute(muted);
    },
    camera: async (on) => {
      if (on) await session?.share('camera');
      else await session?.unshare('camera');
    },
    screen: async (on) => {
      if (on) await session?.share('screen');
      else await session?.unshare('screen');
    },
    dismissVisual() {
      session?.dismissVisual();
    },
    async hangup(options) {
      await session?.hangup(options);
      set({ block: undefined, state: { status: 'idle' }, visual: DESKTOP_CALL_VISUAL_OFF });
    },
    dismiss() {
      if (active()) return;
      set({ block: undefined, state: { status: 'idle' } });
    },
  };
}

let shared: DesktopCall | undefined;

export function desktopCall(): DesktopCall {
  if (shared === undefined) {
    const call = createDesktopCall();
    shared = call;
    globalThis.addEventListener?.('pagehide', () => void call.hangup({ now: true }));
    if (globalThis.document !== undefined) watchCallPresence({ call });
  }
  return shared;
}

export type DesktopCallTone = CallTone;

export type DesktopCallStatusKey =
  | 'call.connecting'
  | 'call.reconnecting'
  | 'call.listening'
  | 'call.hearing'
  | 'call.thinking'
  | 'call.speaking'
  | 'call.muted'
  | 'call.busy'
  | 'call.notHeard'
  | 'call.asrFailed'
  | 'call.sendFailed'
  | 'call.playFailed';

export interface DesktopCallView {
  readonly status: DesktopCallStatusKey;
  readonly tone: DesktopCallTone;
  readonly durationMs: number;
  readonly muted: boolean;
}

const STATUS: Record<CallActivity | CallHint, DesktopCallStatusKey> = {
  connecting: 'call.connecting',
  reconnecting: 'call.reconnecting',
  listening: 'call.listening',
  hearing: 'call.hearing',
  thinking: 'call.thinking',
  speaking: 'call.speaking',
  muted: 'call.muted',
  busy: 'call.busy',
  'not-heard': 'call.notHeard',
  'asr-failed': 'call.asrFailed',
  'send-failed': 'call.sendFailed',
  'play-failed': 'call.playFailed',
};

export function desktopCallView(state: CallClientState): DesktopCallView | undefined {
  const view = callLiveView(state);
  if (view === undefined) return undefined;
  return {
    status: STATUS[view.hint ?? view.activity],
    tone: view.tone,
    durationMs: view.durationMs,
    muted: view.muted,
  };
}

export type DesktopCallNoticeKey =
  | 'call.missing.asr'
  | 'call.missing.tts'
  | 'call.missing.bot'
  | 'call.missing.mediaUnsupported'
  | 'call.missing.mediaHelper'
  | 'call.missing.mediaUnavailable'
  | 'call.missing.localVoiceOff'
  | 'call.elsewhere'
  | 'call.unreachable'
  | 'call.connectOnly'
  | 'call.microphoneDenied'
  | 'call.microphoneMissing'
  | 'call.ended.connectionLost'
  | 'call.ended.connectTimeout'
  | 'call.ended.mediaFailed'
  | 'call.ended.replaced'
  | 'call.ended.botUnavailable'
  | 'call.ended.hostStopped'
  | 'call.ended.refused';

const NOTICE: Record<CallNotice, DesktopCallNoticeKey> = {
  'missing.asr': 'call.missing.asr',
  'missing.tts': 'call.missing.tts',
  'missing.bot': 'call.missing.bot',
  'missing.media-unsupported': 'call.missing.mediaUnsupported',
  'missing.media-helper-missing': 'call.missing.mediaHelper',
  'missing.media-unavailable': 'call.missing.mediaUnavailable',
  'missing.local-voice-off': 'call.missing.localVoiceOff',
  elsewhere: 'call.elsewhere',
  unreachable: 'call.unreachable',
  'connect-only': 'call.connectOnly',
  'microphone-denied': 'call.microphoneDenied',
  'microphone-missing': 'call.microphoneMissing',
  'ended.connection-lost': 'call.ended.connectionLost',
  'ended.connect-timeout': 'call.ended.connectTimeout',
  'ended.media-failed': 'call.ended.mediaFailed',
  'ended.replaced': 'call.ended.replaced',
  'ended.bot-unavailable': 'call.ended.botUnavailable',
  'ended.host-stopped': 'call.ended.hostStopped',
  refused: 'call.ended.refused',
};

export function desktopCallNotice(
  snapshot: DesktopCallSnapshot,
): readonly DesktopCallNoticeKey[] | undefined {
  if (snapshot.block !== undefined) return snapshot.block.notices.map((notice) => NOTICE[notice]);
  const notice = callEndView(snapshot.state)?.notice;
  return notice === undefined ? undefined : [NOTICE[notice]];
}

export { formatCallDuration };
