import type { DesktopInput } from './desktop-view.js';
import {
  LOCAL_VIDEO_LIMITS,
  LOCAL_VIDEO_PATH,
  type LocalVideoBinding,
  type LocalVideoCommand,
  type LocalVideoResult,
  type LocalVideoState,
} from './local-video-contract.js';

/** Structural adapter for the existing authenticated Host client. It owns credentials and routing. */
export interface LocalVideoTransport {
  api(path: string, init: {
    body: Record<string, unknown>;
    signal: AbortSignal;
    timeoutMs: number;
  }): Promise<{ status: number; body: unknown }>;
}

export interface LocalVideoClientState {
  readonly status: 'idle' | 'opening' | 'observing' | 'controlling' | 'unavailable' | 'unsupported';
  readonly host: LocalVideoState | undefined;
  readonly presenting: boolean;
  readonly busy: boolean;
  readonly code: string | undefined;
}

export interface LocalVideoClient {
  getState(): LocalVideoClientState;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  stop(): Promise<void>;
  reconnect(): Promise<void>;
  answer(attemptId: string, sdp: string): Promise<void>;
  playback(attemptId: string, presentedFrames: number, lastPresentedAgoMs: number): void;
  mediaFailed(attemptId: string, code: string): void;
  takeover(): Promise<void>;
  release(): Promise<void>;
  resume(): Promise<void>;
  input(input: DesktopInput): Promise<void>;
}

const HEARTBEAT_MS = 2_000;
// Reserve one request each for liveness and release/resume so input cannot starve safety commands.
const INPUT_QUEUE_LIMIT = LOCAL_VIDEO_LIMITS.pendingRequests - 2;

function resultOf(value: unknown): LocalVideoResult | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const valueRecord = value as Record<string, unknown>;
  if (valueRecord['ok'] === false && typeof valueRecord['code'] === 'string')
    return value as LocalVideoResult;
  if (valueRecord['ok'] !== true || typeof valueRecord['state'] !== 'object' || valueRecord['state'] === null)
    return undefined;
  const state = valueRecord['state'] as Record<string, unknown>;
  if (state['computerId'] !== 'local' || typeof state['runtimeId'] !== 'string' ||
      typeof state['paused'] !== 'boolean' || typeof state['controller'] !== 'boolean' ||
      typeof state['media'] !== 'object' || state['media'] === null) return undefined;
  return value as LocalVideoResult;
}

/** One selected Host, one foreground observation. There is deliberately no input retry/replay. */
export function createLocalVideoClient(transport: LocalVideoTransport, options: { mediaAvailable?: boolean } = {}): LocalVideoClient {
  const listeners = new Set<() => void>();
  let state: LocalVideoClientState = {
    status: 'idle', host: undefined, presenting: false, busy: false, code: undefined,
  };
  let lifetime = 0;
  let controlEpoch = 0;
  let run: AbortController | undefined;
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  let frameTimer: ReturnType<typeof setTimeout> | undefined;
  let presentedFrames = 0;
  let inputSequence = 0;
  let acceptedGrant: number | undefined;
  let queue = { pending: 0, serial: Promise.resolve() };
  let closing: Promise<void> = Promise.resolve();

  function update(next: Partial<LocalVideoClientState>): void {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  }
  function clearTimers(): void {
    clearTimeout(heartbeat);
    clearTimeout(frameTimer);
  }
  async function closeBinding(binding: LocalVideoBinding): Promise<void> {
    const close = new AbortController();
    const timer = setTimeout(() => close.abort(), LOCAL_VIDEO_LIMITS.cleanupTimeoutMs);
    try {
      await transport.api(LOCAL_VIDEO_PATH, {
        body: { kind: 'close', binding }, signal: close.signal,
        timeoutMs: LOCAL_VIDEO_LIMITS.cleanupTimeoutMs,
      });
    } catch { /* The Host's bounded loss expiry still preserves pause. Never replay input. */ }
    finally { clearTimeout(timer); }
  }
  function end(status: 'idle' | 'unavailable', code?: string): Promise<void> {
    const binding = state.host?.binding;
    lifetime++;
    controlEpoch++;
    acceptedGrant = undefined;
    run?.abort();
    run = undefined;
    queue = { pending: 0, serial: Promise.resolve() };
    clearTimers();
    // Keep the last runtime/pause fact for an explicit media-independent Resume command.
    // The retired binding, SDP and grant cannot be reused by callbacks or another receiver.
    let host = state.host;
    if (host !== undefined) {
      const { binding: _binding, offer: _offer, grant: _grant, ...facts } = host;
      host = { ...facts, controller: false };
    }
    update({ status, host, presenting: false, busy: false, code });
    if (binding !== undefined) closing = closeBinding(binding);
    return closing;
  }
  function adopt(host: LocalVideoState): void {
    // SDP is returned only by open. Keep it for the mounted receiver across control/heartbeat
    // snapshots, but never transfer it to another runtime, viewer, or media attempt.
    const previous = state.host;
    const sameAttempt = host.binding !== undefined && previous?.binding !== undefined &&
      host.binding.computerId === previous.binding.computerId &&
      host.binding.runtimeId === previous.binding.runtimeId &&
      host.binding.viewerId === previous.binding.viewerId &&
      host.binding.attemptId === previous.binding.attemptId;
    if (host.offer === undefined && sameAttempt && previous?.offer !== undefined)
      host = { ...host, offer: previous.offer };
    inputSequence = Math.max(inputSequence, host.lastInputSequence);
    if (!host.controller || host.grant?.generation !== acceptedGrant) acceptedGrant = undefined;
    update({ host, status: host.controller && acceptedGrant !== undefined && host.grant?.generation === acceptedGrant ? 'controlling' : 'observing', code: undefined });
  }
  async function request(command: LocalVideoCommand, generation: number): Promise<LocalVideoState | undefined> {
    const signal = run?.signal;
    if (generation !== lifetime || signal === undefined || signal.aborted) return undefined;
    try {
      const response = await transport.api(LOCAL_VIDEO_PATH, {
        body: { ...command }, signal, timeoutMs: LOCAL_VIDEO_LIMITS.operationTimeoutMs,
      });
      const result = resultOf(response.body);
      if (generation !== lifetime || signal.aborted) {
        if (command.kind === 'open' && result?.ok && result.state.binding !== undefined)
          await closeBinding(result.state.binding);
        return undefined;
      }
      if (result === undefined) {
        void end('unavailable', response.status === 404 ? 'update-required' : 'invalid-response');
        return undefined;
      }
      if (!result.ok) {
        if (result.code === 'unsupported-platform' && command.kind === 'status') {
          update({ status: 'unsupported', code: result.code });
        } else if (['control-conflict', 'confirmation-required', 'media-not-live', 'control-required', 'queue-full'].includes(result.code)) {
          controlEpoch++;
          acceptedGrant = undefined;
          update({ status: 'observing', code: result.code });
        } else void end('unavailable', result.code);
        return undefined;
      }
      return result.state;
    } catch {
      if (generation === lifetime && !signal.aborted)
        void end('unavailable', command.kind === 'input' ? 'input-result-unknown' : 'connection-lost');
      return undefined;
    }
  }
  function enqueue(action: () => Promise<void>): Promise<void> {
    const currentQueue = queue;
    if (currentQueue.pending >= INPUT_QUEUE_LIMIT) {
      update({ code: 'queue-full' });
      return Promise.resolve();
    }
    currentQueue.pending++;
    const next = currentQueue.serial.then(action).finally(() => { currentQueue.pending--; });
    currentQueue.serial = next.catch(() => {});
    return next;
  }
  function scheduleHeartbeat(generation: number): void {
    clearTimeout(heartbeat);
    if (generation !== lifetime || run === undefined) return;
    heartbeat = setTimeout(() => {
      const beat = async () => {
        const binding = state.host?.binding;
        if (binding === undefined || generation !== lifetime) return;
        const epoch = controlEpoch;
        const duringControl = state.busy;
        const host = await request({ kind: 'heartbeat', binding,
          playback: { presentedFrames, presenting: state.presenting } }, generation);
        if (host !== undefined && epoch === controlEpoch && !duringControl && !state.busy) adopt(host);
      };
      void beat().finally(() => scheduleHeartbeat(generation));
    }, HEARTBEAT_MS);
  }
  async function control(kind: 'takeover' | 'release' | 'resume'): Promise<void> {
    if (state.busy) return;
    const binding = state.host?.binding;
    const runtimeId = state.host?.runtimeId;
    if ((kind !== 'resume' && (binding === undefined || run === undefined)) || runtimeId === undefined ||
        (kind === 'takeover' && (!state.presenting || state.host?.media.status !== 'live' || !state.host.media.captureAlive))) return;
    const withoutMedia = run === undefined;
    if (withoutMedia) run = new AbortController();
    const generation = lifetime;
    controlEpoch++;
    acceptedGrant = undefined;
    update({ busy: true, ...(kind === 'takeover' ? {} : { status: 'observing' as const }) });
    const host = await request(kind === 'resume' ? { kind, runtimeId } : { kind, binding: binding! }, generation);
    if (host !== undefined) {
      if (kind === 'takeover') acceptedGrant = host.grant?.generation;
      adopt(host);
    }
    if (generation === lifetime) {
      if (withoutMedia) { run?.abort(); run = undefined; }
      update({ busy: false, ...(withoutMedia ? { status: 'unavailable' as const } : {}) });
    }
  }
  const client: LocalVideoClient = {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async start() {
      if (run !== undefined) return;
      const generation = ++lifetime;
      run = new AbortController();
      presentedFrames = 0;
      inputSequence = 0;
      update({ status: 'opening', host: undefined, presenting: false, busy: false, code: undefined });
      await closing;
      if (generation !== lifetime) return;
      const capability = await request({ kind: 'status' }, generation);
      if (capability === undefined) return;
      update({ host: capability });
      if (options.mediaAvailable === false) {
        void end('unavailable', 'native-module-unavailable');
        return;
      }
      const host = await request({ kind: 'open' }, generation);
      if (host === undefined) return;
      if (host.binding === undefined || host.offer?.type !== 'offer') {
        void end('unavailable', 'invalid-response');
        return;
      }
      adopt(host);
      scheduleHeartbeat(generation);
    },
    stop: () => end('idle'),
    async reconnect() {
      if (state.busy) return;
      const closed = end('idle');
      const generation = lifetime;
      update({ busy: true });
      await closed;
      // Background, exit, or a new foreground start supersedes this explicit reconnect.
      if (generation === lifetime) await client.start();
    },
    async answer(attemptId, sdp) {
      const binding = state.host?.binding;
      if (binding?.attemptId !== attemptId || sdp.length > LOCAL_VIDEO_LIMITS.signalBytes) return;
      const generation = lifetime;
      const epoch = controlEpoch;
      await enqueue(async () => {
        const host = await request({ kind: 'signal', binding, answer: { type: 'answer', sdp } }, generation);
        if (host !== undefined && epoch === controlEpoch && !state.busy) adopt(host);
      });
    },
    playback(attemptId, frames, lastPresentedAgoMs) {
      if (run === undefined || state.host?.binding?.attemptId !== attemptId ||
          !Number.isSafeInteger(frames) || frames < presentedFrames || !Number.isFinite(lastPresentedAgoMs)) return;
      presentedFrames = frames;
      const presenting = frames > 0 && lastPresentedAgoMs >= 0 && lastPresentedAgoMs < LOCAL_VIDEO_LIMITS.presentationStallMs;
      clearTimeout(frameTimer);
      update({ presenting });
      if (presenting) frameTimer = setTimeout(() => update({ presenting: false, code: 'media-not-live' }),
        LOCAL_VIDEO_LIMITS.presentationStallMs - lastPresentedAgoMs);
    },
    mediaFailed(attemptId, code) {
      if (state.host?.binding?.attemptId === attemptId) void end('unavailable', code);
    },
    takeover: () => control('takeover'),
    release: () => control('release'),
    resume: () => control('resume'),
    input(input) {
      const binding = state.host?.binding;
      const grant = state.host?.grant;
      if (state.status !== 'controlling' || state.busy || !state.presenting ||
          state.host?.media.status !== 'live' || !state.host.media.captureAlive || binding === undefined || grant === undefined)
        return Promise.resolve();
      const generation = lifetime;
      const epoch = controlEpoch;
      return enqueue(async () => {
        // Check again at execution. A queued tap cannot cross release, target change or media loss.
        if (generation !== lifetime || epoch !== controlEpoch || state.status !== 'controlling' ||
            !state.presenting || state.host?.media.status !== 'live' || !state.host.media.captureAlive ||
            state.host?.grant?.generation !== grant.generation) return;
        const host = await request({ kind: 'input', binding, generation: grant.generation,
          sequence: ++inputSequence, input }, generation);
        if (host !== undefined && epoch === controlEpoch) adopt(host);
      });
    },
  };
  return client;
}
