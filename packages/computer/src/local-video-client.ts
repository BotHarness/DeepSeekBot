import type { LocalVideoInput } from './local-video-contract.js';
import {
  LOCAL_VIDEO_LIMITS,
  LOCAL_VIDEO_PATH,
  type LocalVideoBinding,
  type LocalVideoCommand,
  type LocalVideoResult,
  type LocalVideoState,
} from './local-video-contract.js';

export interface LocalVideoTransport {
  api(
    path: string,
    init: {
      body: Record<string, unknown>;
      signal: AbortSignal;
      timeoutMs: number;
    },
  ): Promise<{ status: number; body: unknown }>;
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
  input(input: LocalVideoInput): Promise<boolean>;
}

const HEARTBEAT_MS = 2_000;

const INPUT_QUEUE_LIMIT = LOCAL_VIDEO_LIMITS.pendingRequests - 2;

function sameBinding(
  left: LocalVideoBinding | undefined,
  right: LocalVideoBinding | undefined,
): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.computerId === right.computerId &&
    left.runtimeId === right.runtimeId &&
    left.viewerId === right.viewerId &&
    left.attemptId === right.attemptId
  );
}

function withoutAttempt(host: LocalVideoState): LocalVideoState {
  const { binding: _binding, offer: _offer, grant: _grant, ...facts } = host;
  return { ...facts, controller: false };
}

function resultOf(value: unknown): LocalVideoResult | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const valueRecord = value as Record<string, unknown>;
  if (valueRecord['ok'] === false && typeof valueRecord['code'] === 'string')
    return value as LocalVideoResult;
  if (
    valueRecord['ok'] !== true ||
    typeof valueRecord['state'] !== 'object' ||
    valueRecord['state'] === null
  )
    return undefined;
  const state = valueRecord['state'] as Record<string, unknown>;
  if (
    state['computerId'] !== 'local' ||
    typeof state['runtimeId'] !== 'string' ||
    typeof state['paused'] !== 'boolean' ||
    typeof state['controller'] !== 'boolean' ||
    typeof state['media'] !== 'object' ||
    state['media'] === null
  )
    return undefined;
  return value as LocalVideoResult;
}

export function createLocalVideoClient(
  transport: LocalVideoTransport,
  options: { mediaAvailable?: boolean } = {},
): LocalVideoClient {
  const listeners = new Set<() => void>();
  let state: LocalVideoClientState = {
    status: 'idle',
    host: undefined,
    presenting: false,
    busy: false,
    code: undefined,
  };
  let lifetime = 0;
  let controlEpoch = 0;
  let run: AbortController | undefined;
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  let frameTimer: ReturnType<typeof setTimeout> | undefined;
  let presentedFrames = 0;
  let inputSequence = 0;
  let acceptedGrant: number | undefined;

  let ownedBinding: LocalVideoBinding | undefined;
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
  function currentBinding(): LocalVideoBinding | undefined {
    return sameBinding(ownedBinding, state.host?.binding) &&
      state.host?.runtimeId === ownedBinding?.runtimeId
      ? ownedBinding
      : undefined;
  }
  async function closeBinding(binding: LocalVideoBinding): Promise<void> {
    const close = new AbortController();
    const timer = setTimeout(() => close.abort(), LOCAL_VIDEO_LIMITS.cleanupTimeoutMs);
    try {
      await transport.api(LOCAL_VIDEO_PATH, {
        body: { kind: 'close', binding },
        signal: close.signal,
        timeoutMs: LOCAL_VIDEO_LIMITS.cleanupTimeoutMs,
      });
    } catch {
    } finally {
      clearTimeout(timer);
    }
  }
  function end(status: 'idle' | 'unavailable', code?: string): Promise<void> {
    const binding = ownedBinding;
    ownedBinding = undefined;
    lifetime++;
    controlEpoch++;
    acceptedGrant = undefined;
    run?.abort();
    run = undefined;
    queue = { pending: 0, serial: Promise.resolve() };
    clearTimers();

    const host = state.host === undefined ? undefined : withoutAttempt(state.host);
    update({ status, host, presenting: false, busy: false, code });
    if (binding !== undefined) closing = closeBinding(binding);
    return closing;
  }
  function adopt(host: LocalVideoState): void {
    if (!sameBinding(ownedBinding, host.binding) || host.runtimeId !== ownedBinding?.runtimeId)
      host = withoutAttempt(host);

    const previous = state.host;
    const sameAttempt =
      sameBinding(ownedBinding, host.binding) && sameBinding(host.binding, previous?.binding);
    if (host.offer === undefined && sameAttempt && previous?.offer !== undefined)
      host = { ...host, offer: previous.offer };
    inputSequence = Math.max(inputSequence, host.lastInputSequence);
    if (!host.controller || host.grant?.generation !== acceptedGrant) acceptedGrant = undefined;
    update({
      host,
      status:
        host.controller && acceptedGrant !== undefined && host.grant?.generation === acceptedGrant
          ? 'controlling'
          : 'observing',
      code: undefined,
    });
  }
  let scrollEpoch = 0;
  async function request(
    command: LocalVideoCommand,
    generation: number,
    relevant: () => boolean = () => true,
  ): Promise<LocalVideoState | undefined> {
    const signal = run?.signal;
    if (generation !== lifetime || signal === undefined || signal.aborted) return undefined;
    try {
      const response = await transport.api(LOCAL_VIDEO_PATH, {
        body: { ...command },
        signal,
        timeoutMs: LOCAL_VIDEO_LIMITS.operationTimeoutMs,
      });
      if (!relevant()) return undefined;
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
        } else if (
          [
            'control-conflict',
            'confirmation-required',
            'media-not-live',
            'control-required',
            'queue-full',
          ].includes(result.code)
        ) {
          controlEpoch++;
          acceptedGrant = undefined;
          update({ status: 'observing', code: result.code });
        } else void end('unavailable', result.code);
        return undefined;
      }
      if (command.kind === 'open' && result.state.binding !== undefined)
        ownedBinding = { ...result.state.binding };
      return result.state;
    } catch {
      if (relevant() && generation === lifetime && !signal.aborted)
        void end(
          'unavailable',
          command.kind === 'input' ? 'input-result-unknown' : 'connection-lost',
        );
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
    const next = currentQueue.serial.then(action).finally(() => {
      currentQueue.pending--;
    });
    currentQueue.serial = next.catch(() => {});
    return next;
  }
  function scheduleHeartbeat(generation: number): void {
    clearTimeout(heartbeat);
    if (generation !== lifetime || run === undefined) return;
    heartbeat = setTimeout(() => {
      const beat = async () => {
        const binding = currentBinding();
        if (binding === undefined || generation !== lifetime) return;
        const epoch = controlEpoch;
        const duringControl = state.busy;
        const host = await request(
          {
            kind: 'heartbeat',
            binding,
            playback: { presentedFrames, presenting: state.presenting },
          },
          generation,
        );
        if (host !== undefined && epoch === controlEpoch && !duringControl && !state.busy)
          adopt(host);
      };
      void beat().finally(() => scheduleHeartbeat(generation));
    }, HEARTBEAT_MS);
  }
  async function control(kind: 'takeover' | 'release' | 'resume'): Promise<void> {
    if (state.busy) return;
    const binding = currentBinding();
    const runtimeId = state.host?.runtimeId;
    if (
      (kind !== 'resume' && (binding === undefined || run === undefined)) ||
      runtimeId === undefined ||
      (kind === 'takeover' &&
        (!state.presenting ||
          state.host?.media.status !== 'live' ||
          !state.host.media.captureAlive))
    )
      return;
    const withoutMedia = run === undefined;
    if (withoutMedia) run = new AbortController();
    const generation = lifetime;
    controlEpoch++;
    acceptedGrant = undefined;
    update({ busy: true, ...(kind === 'takeover' ? {} : { status: 'observing' as const }) });
    const host = await request(
      kind === 'resume' ? { kind, runtimeId } : { kind, binding: binding! },
      generation,
    );
    if (host !== undefined) {
      if (kind === 'takeover') acceptedGrant = host.grant?.generation;
      adopt(host);
    }
    if (generation === lifetime) {
      if (withoutMedia) {
        run?.abort();
        run = undefined;
      }
      update({ busy: false, ...(withoutMedia ? { status: 'unavailable' as const } : {}) });
    }
  }
  const client: LocalVideoClient = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start() {
      if (run !== undefined) return;
      const generation = ++lifetime;
      run = new AbortController();
      presentedFrames = 0;
      inputSequence = 0;
      update({
        status: 'opening',
        host: undefined,
        presenting: false,
        busy: false,
        code: undefined,
      });
      await closing;
      if (generation !== lifetime) return;
      const capability = await request({ kind: 'status' }, generation);
      if (capability === undefined) return;
      if (generation !== lifetime) return;
      update({ host: withoutAttempt(capability) });
      if (generation !== lifetime) return;
      if (options.mediaAvailable === false) {
        void end('unavailable', 'native-module-unavailable');
        return;
      }
      const host = await request({ kind: 'open' }, generation);
      if (host === undefined || generation !== lifetime) return;
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

      if (generation === lifetime) await client.start();
    },
    async answer(attemptId, sdp) {
      const binding = currentBinding();
      if (binding?.attemptId !== attemptId || sdp.length > LOCAL_VIDEO_LIMITS.signalBytes) return;
      const generation = lifetime;
      const epoch = controlEpoch;
      await enqueue(async () => {
        const host = await request(
          { kind: 'signal', binding, answer: { type: 'answer', sdp } },
          generation,
        );
        if (host !== undefined && epoch === controlEpoch && !state.busy) adopt(host);
      });
    },
    playback(attemptId, frames, lastPresentedAgoMs) {
      if (
        run === undefined ||
        currentBinding()?.attemptId !== attemptId ||
        !Number.isSafeInteger(frames) ||
        frames < presentedFrames ||
        !Number.isFinite(lastPresentedAgoMs)
      )
        return;
      presentedFrames = frames;
      const presenting =
        frames > 0 &&
        lastPresentedAgoMs >= 0 &&
        lastPresentedAgoMs < LOCAL_VIDEO_LIMITS.presentationStallMs;
      clearTimeout(frameTimer);
      update({ presenting });
      if (presenting)
        frameTimer = setTimeout(
          () => update({ presenting: false, code: 'media-not-live' }),
          LOCAL_VIDEO_LIMITS.presentationStallMs - lastPresentedAgoMs,
        );
    },
    mediaFailed(attemptId, code) {
      if (currentBinding()?.attemptId === attemptId) void end('unavailable', code);
    },
    takeover: () => control('takeover'),
    release: () => control('release'),
    resume: () => control('resume'),
    async input(input) {
      const isMotion = input.kind === 'scroll-motion';
      const isStop = isMotion && input.vx === 0 && input.vy === 0;
      if (isStop) scrollEpoch++;
      const motionEpoch = scrollEpoch;
      const relevant = () => !isMotion || motionEpoch === scrollEpoch;
      const binding = currentBinding();
      const grant = state.host?.grant;
      if (
        state.status !== 'controlling' ||
        state.busy ||
        !state.presenting ||
        state.host?.media.status !== 'live' ||
        !state.host.media.captureAlive ||
        binding === undefined ||
        grant === undefined
      )
        return false;
      const generation = lifetime;
      const epoch = controlEpoch;
      let delivered = false;
      const action = async () => {
        if (!relevant()) return;
        if (
          generation !== lifetime ||
          epoch !== controlEpoch ||
          state.status !== 'controlling' ||
          !sameBinding(binding, currentBinding()) ||
          !state.presenting ||
          state.host?.media.status !== 'live' ||
          !state.host.media.captureAlive ||
          state.host?.grant?.generation !== grant.generation
        )
          return;
        const host = await request(
          {
            kind: 'input',
            binding,
            generation: grant.generation,
            sequence: ++inputSequence,
            input,
          },
          generation,
          relevant,
        );
        if (host !== undefined && epoch === controlEpoch) {
          delivered = true;
          adopt(host);
        }
      };
      if (isStop) await action();
      else await enqueue(action);
      return delivered;
    },
  };
  return client;
}
