import {
  createCallClient,
  readCallReadiness,
  type CallClient,
  type CallClientMedia,
  type CallClientState,
  type CallPost,
} from '../../../core/src/voice/call-client.js';
import {
  VOICE_CALL_PATH,
  type VoiceCallEvent,
  type VoiceCallMissing,
  type VoiceCallReadiness,
  type VoiceCallResult,
} from '../../../core/src/voice/call-contract.js';
import {
  CallCameraError,
  createBrowserCallCamera,
  type CallCamera,
  type CallCameraKeyframe,
} from './call-camera.js';
import { createBrowserCallMedia } from './call-media.js';

const CLIENT_KEY = 'botharness/call-client.v1';
const TRANSIENT_MS = 4_000;

export type DesktopCallBlock =
  | { readonly kind: 'missing'; readonly missing: readonly VoiceCallMissing[] }
  | { readonly kind: 'elsewhere' }
  | { readonly kind: 'error'; readonly code: string };

export interface DesktopCallVisual {
  readonly source: 'off' | 'camera';
  readonly save: boolean;
  readonly starting: boolean;
  readonly stream: MediaStream | undefined;
  readonly keyframes: number;
  readonly keyframeAt: number | undefined;
  readonly error: 'camera-denied' | 'camera-missing' | undefined;
}

export interface DesktopCallSnapshot {
  readonly slug: string | undefined;
  readonly checking: boolean;
  readonly block: DesktopCallBlock | undefined;
  readonly state: CallClientState;
  readonly visual: DesktopCallVisual;
}

export const DESKTOP_CALL_VISUAL_OFF: DesktopCallVisual = {
  source: 'off',
  save: true,
  starting: false,
  stream: undefined,
  keyframes: 0,
  keyframeAt: undefined,
  error: undefined,
};

export interface DesktopCall {
  subscribe(listener: () => void): () => void;
  snapshot(): DesktopCallSnapshot;
  start(slug: string): Promise<void>;
  mute(muted: boolean): Promise<void>;
  camera(on: boolean): Promise<void>;
  saveFrames(save: boolean): Promise<void>;
  hangup(): Promise<void>;
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, client }),
    });
    const result = (await response.json().catch(() => undefined)) as VoiceCallResult | undefined;
    if (result === undefined || typeof result.ok !== 'boolean')
      throw new Error(`The Host answered ${response.status}.`);
    return result;
  };
}

export function createDesktopCall(
  options: {
    post?: CallPost;
    media?: () => CallClientMedia;
    camera?: (onKeyframe: (frame: CallCameraKeyframe) => Promise<void>) => CallCamera;
    now?: () => number;
  } = {},
): DesktopCall {
  const post = options.post ?? createCallPost(windowClientId());
  const media = options.media ?? (() => createBrowserCallMedia());
  const makeCamera =
    options.camera ?? ((onKeyframe) => createBrowserCallCamera({ source: 'camera', onKeyframe }));
  const clock = options.now ?? Date.now;
  let camera: CallCamera | undefined;
  const listeners = new Set<() => void>();
  let client: CallClient | undefined;
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
  const setVisual = (next: Partial<DesktopCallVisual>) =>
    set({ visual: { ...current.visual, ...next } });
  const stopCamera = () => {
    camera?.stop();
    camera = undefined;
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => current,
    async start(slug) {
      if (current.checking || active()) return;
      client?.dispose();
      client = undefined;
      stopCamera();
      set({
        slug,
        checking: true,
        block: undefined,
        state: { status: 'idle' },
        visual: DESKTOP_CALL_VISUAL_OFF,
      });
      let readiness: Awaited<ReturnType<typeof readCallReadiness>>;
      try {
        readiness = await readCallReadiness(post, slug);
      } catch {
        set({ checking: false, block: { kind: 'error', code: 'unreachable' } });
        return;
      }
      if ('code' in readiness) {
        set({ checking: false, block: { kind: 'error', code: readiness.code } });
        return;
      }
      const ready: VoiceCallReadiness = readiness;
      if (!ready.ready) {
        set({ checking: false, block: { kind: 'missing', missing: ready.missing } });
        return;
      }
      if (ready.callElsewhere) {
        set({ checking: false, block: { kind: 'elsewhere' } });
        return;
      }
      const owned = createCallClient({
        post,
        media: media(),
        onChange: (state) => {
          if (client !== owned) return;
          if (state.status === 'ended' && camera !== undefined) {
            stopCamera();
            set({ state, visual: { ...current.visual, source: 'off', stream: undefined } });
            return;
          }
          set({ state });
        },
      });
      client = owned;
      set({ checking: false });
      await owned.open(slug);
    },
    async mute(muted) {
      await client?.mute(muted);
    },
    async camera(on) {
      const owned = client;
      if (owned === undefined || current.state.status !== 'live' || current.visual.starting) return;
      if (!on) {
        if (current.visual.source === 'off') return;
        stopCamera();
        setVisual({ source: 'off', stream: undefined });
        await owned.visual('off', current.visual.save);
        return;
      }
      if (current.visual.source === 'camera') return;
      setVisual({ starting: true, error: undefined });
      const started = makeCamera(async (frame) => {
        if (camera !== started || client !== owned) return;
        setVisual({ keyframes: current.visual.keyframes + 1, keyframeAt: clock() });
        await owned.frame(frame);
      });
      camera = started;
      const refused = await owned.visual('camera', current.visual.save);
      if (refused !== undefined && !refused.ok) {
        stopCamera();
        setVisual({ starting: false });
        return;
      }
      try {
        const stream = await started.start();
        if (camera !== started) {
          started.stop();
          return;
        }
        setVisual({ source: 'camera', starting: false, stream });
      } catch (error) {
        if (camera === started) camera = undefined;
        started.stop();
        setVisual({
          starting: false,
          source: 'off',
          stream: undefined,
          error: error instanceof CallCameraError ? error.code : 'camera-missing',
        });
        await owned.visual('off', current.visual.save);
      }
    },
    async saveFrames(save) {
      if (current.visual.save === save) return;
      setVisual({ save });
      const owned = client;
      if (owned !== undefined && current.state.status === 'live' && current.visual.source !== 'off')
        await owned.visual(current.visual.source, save);
    },
    async hangup() {
      stopCamera();
      await client?.hangup();
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
    globalThis.addEventListener?.('pagehide', () => void call.hangup());
  }
  return shared;
}

export type DesktopCallTone = 'live' | 'muted' | 'busy' | 'warning';

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

function transient(
  events: readonly VoiceCallEvent[],
  hostNow: number,
): DesktopCallStatusKey | undefined {
  const last = [...events]
    .reverse()
    .find((event) =>
      ['nothing-heard', 'asr-failed', 'send-failed', 'playback-failed', 'sent', 'played'].includes(
        event.type,
      ),
    );
  if (last === undefined || hostNow - last.at > TRANSIENT_MS) return undefined;
  switch (last.type) {
    case 'nothing-heard':
      return 'call.notHeard';
    case 'asr-failed':
      return 'call.asrFailed';
    case 'send-failed':
      return 'call.sendFailed';
    case 'playback-failed':
      return 'call.playFailed';
    default:
      return undefined;
  }
}

export function desktopCallView(state: CallClientState): DesktopCallView | undefined {
  if (state.status === 'opening')
    return { status: 'call.connecting', tone: 'live', durationMs: 0, muted: false };
  if (state.status !== 'live') return undefined;
  const { call, muted, reconnecting, events } = state;
  const base = { durationMs: call.phase === 'connecting' ? 0 : call.durationMs, muted };
  if (reconnecting) return { ...base, status: 'call.reconnecting', tone: 'warning' };
  if (call.phase === 'connecting') return { ...base, status: 'call.connecting', tone: 'live' };
  if (call.busy && call.phase !== 'bot-speaking')
    return { ...base, status: 'call.busy', tone: 'busy' };
  const problem = transient(events, call.durationMs);
  if (problem !== undefined && call.phase === 'listening')
    return { ...base, status: problem, tone: 'warning' };
  if (call.phase === 'user-speaking') return { ...base, status: 'call.hearing', tone: 'live' };
  if (call.phase === 'transcribing') return { ...base, status: 'call.thinking', tone: 'live' };
  if (call.phase === 'bot-speaking') return { ...base, status: 'call.speaking', tone: 'live' };
  if (muted) return { ...base, status: 'call.muted', tone: 'muted' };
  return { ...base, status: 'call.listening', tone: 'live' };
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
  | 'call.microphoneDenied'
  | 'call.microphoneMissing'
  | 'call.ended.connectionLost'
  | 'call.ended.connectTimeout'
  | 'call.ended.mediaFailed'
  | 'call.ended.replaced'
  | 'call.ended.botUnavailable'
  | 'call.ended.hostStopped'
  | 'call.ended.refused';

const MISSING: Record<VoiceCallMissing, DesktopCallNoticeKey> = {
  asr: 'call.missing.asr',
  tts: 'call.missing.tts',
  bot: 'call.missing.bot',
  'media-unsupported': 'call.missing.mediaUnsupported',
  'media-helper-missing': 'call.missing.mediaHelper',
  'media-unavailable': 'call.missing.mediaUnavailable',
  'local-voice-off': 'call.missing.localVoiceOff',
};

function refusal(code: string | undefined): DesktopCallNoticeKey {
  switch (code) {
    case 'asr-not-configured':
      return 'call.missing.asr';
    case 'tts-not-configured':
      return 'call.missing.tts';
    case 'unknown-bot':
      return 'call.missing.bot';
    case 'bot-paused':
      return 'call.ended.botUnavailable';
    case 'media-unsupported':
      return 'call.missing.mediaUnsupported';
    case 'media-helper-missing':
      return 'call.missing.mediaHelper';
    case 'media-failed':
    case 'not-ready':
    case 'queue-full':
    case 'operation-timeout':
      return 'call.missing.mediaUnavailable';
    case 'call-active':
      return 'call.elsewhere';
    case 'unreachable':
      return 'call.unreachable';
    default:
      return 'call.ended.refused';
  }
}

export function desktopCallNotice(
  snapshot: DesktopCallSnapshot,
): readonly DesktopCallNoticeKey[] | undefined {
  const { block, state } = snapshot;
  if (block?.kind === 'missing') return block.missing.map((missing) => MISSING[missing]);
  if (block?.kind === 'elsewhere') return ['call.elsewhere'];
  if (block?.kind === 'error') return [refusal(block.code)];
  if (state.status !== 'ended') return undefined;
  if (state.error === 'microphone-denied') return ['call.microphoneDenied'];
  if (state.error === 'microphone-missing') return ['call.microphoneMissing'];
  switch (state.reason) {
    case 'hangup':
      return undefined;
    case 'refused':
      return [refusal(state.code)];
    case 'connection-lost':
      return ['call.ended.connectionLost'];
    case 'connect-timeout':
      return ['call.ended.connectTimeout'];
    case 'media-failed':
      return ['call.ended.mediaFailed'];
    case 'replaced':
      return ['call.ended.replaced'];
    case 'bot-unavailable':
      return ['call.ended.botUnavailable'];
    case 'host-stopped':
      return ['call.ended.hostStopped'];
  }
}

export function formatCallDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}
