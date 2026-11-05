import {
  VOICE_CALL_LIMITS,
  type CallVisualSource,
  type VoiceCallEndReason,
  type VoiceCallEvent,
  type VoiceCallReadiness,
  type VoiceCallRefusal,
  type VoiceCallResult,
  type VoiceCallView,
} from './call-contract.js';

export type CallPost = (body: Record<string, unknown>) => Promise<VoiceCallResult>;

export type CallMediaState = 'connected' | 'failed' | 'closed';

export interface CallClientMedia {
  start(input: { callId: string; offer: string }): Promise<string>;
  mute(muted: boolean): void;
  stop(): void;
  onState(listener: (state: CallMediaState, code?: string) => void): () => void;
}

export type CallClientState =
  | { readonly status: 'idle' }
  | { readonly status: 'opening' }
  | {
      readonly status: 'live';
      readonly call: VoiceCallView;
      readonly events: readonly VoiceCallEvent[];
      readonly muted: boolean;
      readonly reconnecting: boolean;
    }
  | {
      readonly status: 'ended';
      readonly reason: VoiceCallEndReason | 'refused';
      readonly code?: VoiceCallRefusal | 'unreachable';
      readonly error?: string;
      readonly call?: VoiceCallView;
      readonly events: readonly VoiceCallEvent[];
    };

export interface CallClient {
  readonly state: () => CallClientState;
  open(slug: string): Promise<void>;
  mute(muted: boolean): Promise<void>;
  visual(source: CallVisualSource | 'off', save?: boolean): Promise<VoiceCallResult | undefined>;
  frame(input: CallClientFrame): Promise<VoiceCallResult | undefined>;
  hangup(): Promise<void>;
  dispose(): void;
}

export interface CallClientFrame {
  readonly source: CallVisualSource;
  readonly jpeg: string;
  readonly score: number;
  readonly skipped: number;
}

export interface CallClientOptions {
  readonly post: CallPost;
  readonly media: CallClientMedia;
  readonly onChange: (state: CallClientState) => void;
  readonly now?: () => number;
  readonly setInterval?: (run: () => void, ms: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
}

export async function readCallReadiness(
  post: CallPost,
  slug: string,
): Promise<VoiceCallReadiness | { readonly code: string; readonly error: string }> {
  const result = await post({ kind: 'readiness', slug });
  if (!result.ok) return { code: result.code, error: result.error };
  if (result.readiness === undefined)
    return { code: 'invalid-input', error: 'The Host did not report call readiness.' };
  return result.readiness;
}

const EVENT_LIMIT = VOICE_CALL_LIMITS.events;

export function createCallClient(options: CallClientOptions): CallClient {
  const now = options.now ?? Date.now;
  const every = options.setInterval ?? ((run, ms) => setInterval(run, ms));
  const stopEvery =
    options.clearInterval ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
  let state: CallClientState = { status: 'idle' };
  let call: VoiceCallView | undefined;
  let events: VoiceCallEvent[] = [];
  let seq = 0;
  let muted = false;
  let lastAnswer = 0;
  let timer: unknown;
  let beating = false;
  let unsubscribe: (() => void) | undefined;
  let disposed = false;

  const status = (): CallClientState['status'] => state.status;
  const set = (next: CallClientState) => {
    state = next;
    if (!disposed) options.onChange(next);
  };
  const absorb = (view: VoiceCallView | undefined) => {
    if (view === undefined) return;
    call = view;
    for (const event of view.events) if (event.seq > seq) events.push(event);
    if (events.length > EVENT_LIMIT) events = events.slice(-EVENT_LIMIT);
    seq = Math.max(seq, view.lastSeq);
  };
  const live = (reconnecting = false) => {
    if (call === undefined) return;
    set({ status: 'live', call, events: [...events], muted, reconnecting });
  };
  const finish = (
    reason: VoiceCallEndReason | 'refused',
    extra: { code?: VoiceCallRefusal | 'unreachable'; error?: string } = {},
  ) => {
    if (state.status === 'ended') return;
    if (timer !== undefined) stopEvery(timer);
    timer = undefined;
    unsubscribe?.();
    unsubscribe = undefined;
    options.media.stop();
    set({
      status: 'ended',
      reason,
      ...extra,
      ...(call === undefined ? {} : { call }),
      events: [...events],
    });
  };
  const endedReason = (view: VoiceCallView | undefined) =>
    view?.phase === 'ended' ? (view.endReason ?? 'hangup') : undefined;

  const heartbeat = async () => {
    if (beating || call === undefined || status() !== 'live') return;
    beating = true;
    try {
      const result = await options.post({ kind: 'heartbeat', callId: call.callId, after: seq });
      if (status() !== 'live') return;
      if (!result.ok) {
        finish(result.code === 'device-revoked' ? 'host-stopped' : 'connection-lost', {
          code: result.code,
          error: result.error,
        });
        return;
      }
      lastAnswer = now();
      absorb(result.call);
      const reason = endedReason(result.call);
      if (reason !== undefined) finish(reason);
      else live();
    } catch {
      if (status() !== 'live') return;
      if (now() - lastAnswer >= VOICE_CALL_LIMITS.heartbeatLossMs)
        finish('connection-lost', { code: 'unreachable' });
      else live(true);
    } finally {
      beating = false;
    }
  };

  return {
    state: () => state,
    async open(slug) {
      if (status() === 'opening' || status() === 'live') return;
      call = undefined;
      events = [];
      seq = 0;
      muted = false;
      set({ status: 'opening' });
      let result: VoiceCallResult;
      try {
        result = await options.post({ kind: 'open', slug, media: 'webrtc' });
      } catch (error) {
        finish('refused', {
          code: 'unreachable',
          error: error instanceof Error ? error.message : 'The Host did not answer.',
        });
        return;
      }
      if (!result.ok) {
        finish('refused', { code: result.code, error: result.error });
        return;
      }
      const opened = result.call;
      if (status() === 'ended') {
        if (opened !== undefined)
          await options.post({ kind: 'hangup', callId: opened.callId }).catch(() => undefined);
        return;
      }
      absorb(opened);
      if (opened?.offer === undefined || disposed) {
        if (opened !== undefined)
          await options.post({ kind: 'hangup', callId: opened.callId }).catch(() => undefined);
        finish('media-failed', { code: 'signal-failed' });
        return;
      }
      unsubscribe = options.media.onState((media, code) => {
        if (media === 'connected') return;
        if (status() === 'ended' || call === undefined) return;
        const callId = call.callId;
        void options.post({ kind: 'hangup', callId }).catch(() => undefined);
        finish(media === 'closed' && code === 'background' ? 'hangup' : 'media-failed', {
          ...(code === undefined ? {} : { error: code }),
        });
      });
      let answer: string;
      try {
        answer = await options.media.start({ callId: opened.callId, offer: opened.offer.sdp });
      } catch (error) {
        await options.post({ kind: 'hangup', callId: opened.callId }).catch(() => undefined);
        finish('media-failed', {
          error: error instanceof Error ? error.message : 'The microphone could not start.',
        });
        return;
      }
      if (status() === 'ended') {
        options.media.stop();
        await options.post({ kind: 'hangup', callId: opened.callId }).catch(() => undefined);
        return;
      }
      let signalled: VoiceCallResult;
      try {
        signalled = await options.post({
          kind: 'signal',
          callId: opened.callId,
          answer: { type: 'answer', sdp: answer },
        });
      } catch (error) {
        finish('connection-lost', {
          code: 'unreachable',
          error: error instanceof Error ? error.message : 'The Host did not answer.',
        });
        return;
      }
      if (status() === 'ended') {
        await options.post({ kind: 'hangup', callId: opened.callId }).catch(() => undefined);
        return;
      }
      if (!signalled.ok) {
        finish('media-failed', { code: signalled.code, error: signalled.error });
        return;
      }
      absorb(signalled.call);
      lastAnswer = now();
      timer = every(() => void heartbeat(), VOICE_CALL_LIMITS.heartbeatMs);
      live();
    },
    async mute(next) {
      if (status() !== 'live' || call === undefined || next === muted) return;
      muted = next;
      options.media.mute(next);
      live();
      try {
        const result = await options.post({ kind: 'mute', callId: call.callId, muted: next });
        if (result.ok) absorb(result.call);
      } catch {}
      if (status() === 'live') live();
    },
    async visual(source, save = true) {
      if (status() !== 'live' || call === undefined) return undefined;
      try {
        const result = await options.post({ kind: 'visual', callId: call.callId, source, save });
        if (result.ok) absorb(result.call);
        if (status() === 'live') live();
        return result;
      } catch {
        return undefined;
      }
    },
    async frame(input) {
      if (status() !== 'live' || call === undefined) return undefined;
      try {
        const result = await options.post({
          kind: 'frame',
          callId: call.callId,
          source: input.source,
          jpeg: input.jpeg,
          score: input.score,
          skipped: input.skipped,
          after: seq,
        });
        if (result.ok) absorb(result.call);
        if (status() === 'live') live();
        return result;
      } catch {
        return undefined;
      }
    },
    async hangup() {
      if (status() === 'ended' || status() === 'idle') return;
      const current = call;
      if (current === undefined) {
        finish('hangup');
        return;
      }
      options.media.stop();
      try {
        const result = await options.post({ kind: 'hangup', callId: current.callId });
        if (result.ok) absorb(result.call);
      } catch {}
      finish('hangup');
    },
    dispose() {
      if (status() !== 'ended' && call !== undefined)
        void options.post({ kind: 'hangup', callId: call.callId }).catch(() => undefined);
      finish('hangup');
      disposed = true;
    },
  };
}
