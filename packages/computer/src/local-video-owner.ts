import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { desktopInputCall, parseDesktopInput } from './desktop-view.js';
import type { CuaDriver } from './tool/driver.js';
import {
  LOCAL_VIDEO_LIMITS,
  LocalVideoError,
  type LocalVideoBinding,
  type LocalVideoCaller,
  type LocalVideoCommand,
  type LocalVideoMedia,
  type LocalVideoMediaPeer,
  type LocalVideoMediaStatus,
  type LocalVideoOwner,
  type LocalVideoRefusal,
  type LocalVideoState,
} from './local-video-contract.js';

/** The only durable viewer fact. Controller and media lifetimes are never restored. */
export interface ComputerPauseStore {
  read(): boolean;
  write(paused: boolean): void;
}

export function createComputerPauseStore(path: string): ComputerPauseStore {
  return {
    read() {
      let source: string;
      try {
        source = readFileSync(path, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
      }
      const value: unknown = JSON.parse(source);
      if (
        typeof value !== 'object' || value === null ||
        !('version' in value) || value.version !== 1 ||
        !('paused' in value) || typeof value.paused !== 'boolean'
      ) throw new Error('Computer pause record is invalid');
      return value.paused;
    },
    write(paused) {
      mkdirSync(dirname(path), { recursive: true });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporary, `${JSON.stringify({ version: 1, paused })}\n`, {
          encoding: 'utf8', mode: 0o600, flush: true,
        });
        renameSync(temporary, path);
      } catch (error) {
        try { rmSync(temporary, { force: true }); } catch { /* Preserve the write failure. */ }
        throw error;
      }
    },
  };
}

interface Viewer {
  readonly binding: LocalVideoBinding;
  readonly deviceId: string;
  readonly abort: AbortController;
  peer?: LocalVideoMediaPeer;
  opening?: Promise<LocalVideoMediaPeer>;
  media: LocalVideoMediaStatus;
  lastHeartbeat: number;
  lastCapture: number;
  lastPresentation: number;
  presentedFrames: number;
  presenting: boolean;
  answered: boolean;
  disconnected: boolean;
  closing?: Promise<void>;
}

interface Grant {
  readonly viewer: Viewer;
  readonly generation: number;
  expiresAt: number;
  sequence: number;
}

const closedMedia = (): LocalVideoMediaStatus => ({
  status: 'closed', captureAlive: false, width: 0, height: 0,
});

function refuse(code: LocalVideoRefusal, message: string): never {
  throw new LocalVideoError(code, message);
}

async function bounded<T>(work: Promise<T>, ms: number, code: LocalVideoRefusal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new LocalVideoError(code, 'The Computer operation timed out.')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Application-defined authority, owned by the Computer Plugin/Fiber. */
export function createLocalVideoOwner(options: {
  readonly pause: ComputerPauseStore;
  readonly driver: Pick<CuaDriver, 'call'>;
  readonly media: LocalVideoMedia;
  readonly isRunning: () => boolean;
  readonly supported?: () => boolean;
  readonly now?: () => number;
  readonly onEvent?: (detail: string) => void;
  readonly operationTimeoutMs?: number;
  readonly cleanupTimeoutMs?: number;
}): LocalVideoOwner {
  const now = options.now ?? Date.now;
  const operationTimeout = options.operationTimeoutMs ?? LOCAL_VIDEO_LIMITS.operationTimeoutMs;
  const cleanupTimeout = options.cleanupTimeoutMs ?? LOCAL_VIDEO_LIMITS.cleanupTimeoutMs;
  const note = (phase: string, code?: LocalVideoRefusal): void =>
    options.onEvent?.(`phase=local-video-${phase}${code === undefined ? '' : ` refusal=${code}`}`);
  let paused = true;
  try {
    // Synchronous restore occurs before the owner can be exposed to any Consumer.
    paused = options.pause.read();
  } catch {
    note('pause-restore-refused', 'pause-write-failed');
  }
  let runtimeId = randomUUID();
  let botEpoch = 0;
  let generation = 0;
  let viewer: Viewer | undefined;
  let grant: Grant | undefined;
  let disposed = false;
  let requests = 0;
  let pendingInputs = 0;
  let cleanupPending = 0;
  let cleanupFailed = false;
  let transitions: Promise<unknown> = Promise.resolve();
  let inputs: Promise<unknown> = Promise.resolve();
  const bots = new Set<Promise<unknown>>();
  const humans = new Set<Promise<unknown>>();
  const peerClosures = new WeakMap<LocalVideoMediaPeer, Promise<void>>();
  const closePeer = (peer: LocalVideoMediaPeer): Promise<void> => {
    let closing = peerClosures.get(peer);
    if (closing === undefined) {
      closing = bounded(peer.close(), cleanupTimeout, 'operation-timeout');
      peerClosures.set(peer, closing);
    }
    return closing;
  };

  const invalidate = (): void => {
    generation += 1;
    grant = undefined;
  };
  const blockBots = (): void => {
    paused = true;
    botEpoch += 1;
  };
  const persist = (value: boolean): void => {
    try {
      // The file replacement is the linearization point. No asynchronous write can
      // commit an old resume after a later release/revocation/runtime change.
      options.pause.write(value);
    } catch {
      blockBots();
      note('pause-write-refused', 'pause-write-failed');
      refuse('pause-write-failed', 'The Computer pause could not be saved. Bots remain paused.');
    }
  };
  const drain = async (operations: Set<Promise<unknown>>): Promise<void> => {
    await bounded(Promise.allSettled([...operations]), operationTimeout, 'drain-timeout');
  };
  const transition = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = transitions.then(operation, operation);
    transitions = next.catch(() => undefined);
    return next;
  };
  const requireActive = (): void => {
    if (disposed) refuse('disposed', 'The Computer owner has stopped.');
  };
  const requireRunning = (): void => {
    requireActive();
    if (options.supported?.() === false)
      refuse('unsupported-platform', 'Local Computer video currently requires Windows.');
    if (!options.isRunning()) refuse('not-running', 'Start the Local Computer first.');
  };
  const requireRuntime = (value: string): void => {
    requireActive();
    if (value !== runtimeId) refuse('stale-attempt', 'The Computer runtime changed. Refresh its state.');
  };
  const checkViewer = (caller: LocalVideoCaller, binding: LocalVideoBinding): Viewer => {
    requireActive();
    if (binding === null || typeof binding !== 'object' || binding.computerId !== 'local' || binding.runtimeId !== runtimeId)
      refuse('stale-attempt', 'The Computer runtime changed. Open a new viewer.');
    const current = viewer;
    if (current === undefined || current.deviceId !== caller.deviceId)
      refuse('viewer-not-found', 'This viewer does not belong to the authenticated device.');
    if (current.binding.viewerId !== binding.viewerId || current.binding.attemptId !== binding.attemptId || current.abort.signal.aborted)
      refuse('stale-attempt', 'This video attempt has ended. Open a new viewer.');
    return current;
  };
  const live = (current: Viewer): boolean =>
    current.answered && current.media.width > 0 && current.media.height > 0 &&
    current.media.status === 'live' && current.media.captureAlive &&
    now() - current.lastCapture <= LOCAL_VIDEO_LIMITS.presentationStallMs &&
    current.presenting && now() - current.lastPresentation <= LOCAL_VIDEO_LIMITS.presentationStallMs;

  const closeViewer = (current: Viewer): Promise<void> => {
    if (current.closing !== undefined) return current.closing;
    current.abort.abort();
    if (viewer === current) viewer = undefined;
    if (grant?.viewer === current) invalidate();
    cleanupPending += 1;
    current.closing = (async () => {
      try {
        await bounded((async () => {
          const peer = current.peer ?? await current.opening?.catch(() => undefined);
          if (peer !== undefined) await closePeer(peer);
        })(), cleanupTimeout, 'operation-timeout');
        note('peer-closed');
      } catch (error) {
        cleanupFailed = true;
        note('cleanup-refused', 'helper-failed');
        throw error;
      } finally {
        cleanupPending -= 1;
      }
    })();
    return current.closing;
  };

  const sweep = (): void => {
    const current = viewer;
    if (current === undefined) return;
    const silence = now() - current.lastHeartbeat;
    if (silence >= LOCAL_VIDEO_LIMITS.controlLossMs) current.disconnected = true;
    if (grant?.viewer === current && silence >= LOCAL_VIDEO_LIMITS.controlExpiryMs) {
      invalidate();
      note('control-expired');
    }
    if (silence >= LOCAL_VIDEO_LIMITS.controlExpiryMs) {
      void closeViewer(current).catch(() => undefined);
      return;
    }
    if (!live(current) && grant?.viewer === current && current.media.status !== 'starting') {
      // Picture loss gates execution; it does not resume Bots or transfer authority.
      note('input-gated', 'media-not-live');
    }
  };
  const timer = setInterval(sweep, 1_000);
  timer.unref();

  const state = (caller: LocalVideoCaller, offer = false): LocalVideoState => {
    sweep();
    const current = viewer?.deviceId === caller.deviceId ? viewer : undefined;
    const ownGrant = grant?.viewer === current ? grant : undefined;
    const mediaViewer = viewer;
    return {
      computerId: 'local', runtimeId, paused,
      viewerCount: viewer === undefined ? 0 : 1,
      controlHeld: grant !== undefined,
      controller: ownGrant !== undefined && current?.disconnected !== true && live(current!),
      ...(current === undefined ? {} : { binding: current.binding }),
      ...(ownGrant === undefined ? {} : { grant: { generation: ownGrant.generation, expiresAt: ownGrant.expiresAt } }),
      lastInputSequence: ownGrant?.sequence ?? 0,
      media: mediaViewer === undefined ? closedMedia() : {
        ...mediaViewer.media,
        ...(mediaViewer.media.status === 'live' && !live(mediaViewer) ? { status: 'stalled' as const } : {}),
      },
      ...(offer && current?.peer !== undefined ? { offer: current.peer.offer } : {}),
    };
  };

  const open = async (caller: LocalVideoCaller, signal?: AbortSignal): Promise<LocalVideoState> => {
    requireRunning();
    if (signal?.aborted) refuse('stale-attempt', 'The viewer request was cancelled.');
    if (viewer !== undefined) refuse('viewer-limit', 'This slice supports one viewer. Close the existing viewer first.');
    if (cleanupPending !== 0 || cleanupFailed)
      refuse('not-ready', 'The previous video resources have not finished stopping.');
    const current: Viewer = {
      binding: { computerId: 'local', runtimeId, viewerId: randomUUID(), attemptId: randomUUID() },
      deviceId: caller.deviceId, abort: new AbortController(),
      media: { ...closedMedia(), status: 'starting' },
      lastHeartbeat: now(), lastCapture: 0, lastPresentation: 0,
      presentedFrames: 0, presenting: false, answered: false, disconnected: false,
    };
    // Admission and cleanup ownership precede asynchronous helper startup.
    viewer = current;
    const abort = (): void => { void closeViewer(current).catch(() => undefined); };
    signal?.addEventListener('abort', abort, { once: true });
    const opening = Promise.resolve().then(() => options.media.open({
      binding: current.binding,
      signal: current.abort.signal,
      onStatus: (status) => {
        if (viewer !== current || current.abort.signal.aborted) return;
        if (current.peer !== undefined && status.status === 'live' &&
          (status.width !== current.peer.display.width || status.height !== current.peer.display.height)) {
          invalidate();
          note('display-changed', 'media-not-live');
          void closeViewer(current).catch(() => undefined);
          return;
        }
        current.media = status;
        if (status.captureAlive) current.lastCapture = now();
        if (status.status === 'failed' || status.status === 'closed') {
          invalidate();
          note('media-stopped', 'helper-failed');
          void closeViewer(current).catch(() => undefined);
        }
      },
    }));
    current.opening = opening;
    try {
      const peer = await bounded(opening, operationTimeout, 'operation-timeout');
      current.peer = peer;
      if (viewer !== current || current.abort.signal.aborted || disposed || current.binding.runtimeId !== runtimeId) {
        await closePeer(peer);
        refuse('stale-attempt', 'The video attempt ended before the helper became ready.');
      }
      if (!Number.isSafeInteger(peer.display.width) || !Number.isSafeInteger(peer.display.height) ||
        peer.display.width <= 0 || peer.display.height <= 0 ||
        peer.display.width > 8192 || peer.display.height > 8192)
        refuse('helper-start-failed', 'The helper did not report supported native desktop dimensions.');
      current.media = { ...current.media, ...peer.display };
      note('admitted');
      return state(caller, true);
    } catch (error) {
      // A provider that completes after cancellation still owns real native resources.
      void opening.then(async (peer) => {
        if (current.peer !== peer) await closePeer(peer);
      }).catch(() => undefined);
      await closeViewer(current).catch(() => undefined);
      throw error instanceof LocalVideoError ? error : new LocalVideoError('helper-start-failed', 'The video helper could not start.');
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  };

  const checkGrant = (current: Viewer, value: number): Grant => {
    sweep();
    requireRunning();
    if (viewer !== current || current.abort.signal.aborted) refuse('stale-attempt', 'The viewer has ended.');
    const active = grant;
    if (active === undefined) refuse('control-required', 'Choose Take control before sending input.');
    if (active.viewer !== current || active.generation !== value)
      refuse('stale-grant', 'Control changed. This input was not sent.');
    if (current.disconnected) refuse('control-disconnected', 'The control connection was lost.');
    if (!live(current)) refuse('media-not-live', 'Wait for live video before sending input.');
    return active;
  };

  const requireGeometry = async (current: Viewer): Promise<void> => {
    // Pinned Windows Driver 0.31.0 uses physical primary-display pixels for
    // get_screen_size and desktop clicks; scale_factor is descriptive, not a
    // multiplier. Its per-session capped-screenshot mapping never applies to
    // this fresh viewer session, which does not request screenshots.
    // https://github.com/trycua/cua/blob/5272e492d61b96caf08e3bf434d91126c1f3dccc/libs/cua-driver/rust/crates/platform-windows/src/tools/impl_.rs
    // https://github.com/trycua/cua/blob/5272e492d61b96caf08e3bf434d91126c1f3dccc/libs/cua-driver/rust/crates/cua-driver-core/src/desktop_capture_scale.rs
    const probe = options.driver.call('get_screen_size', {
      session: `local-video:${current.binding.viewerId}`,
    });
    humans.add(probe);
    // A timed-out or disconnected request must not erase underlying native work.
    void probe.finally(() => humans.delete(probe)).catch(() => undefined);
    const result = await bounded(probe, operationTimeout, 'operation-timeout');
    const value = result as { isError?: unknown; structuredContent?: { width?: unknown; height?: unknown } } | null;
    const geometry = value?.structuredContent;
    if (value?.isError === true || geometry?.width !== current.peer?.display.width ||
      geometry?.height !== current.peer?.display.height || geometry?.width === undefined)
      refuse('media-not-live', 'The Windows input display does not match the video. Reconnect the viewer.');
  };

  const handle = async (caller: LocalVideoCaller, command: LocalVideoCommand, signal?: AbortSignal): Promise<LocalVideoState> => {
    requireActive();
    if (typeof caller.deviceId !== 'string' || caller.deviceId.length === 0)
      refuse('device-revoked', 'An authenticated device is required.');
    if (command === null || typeof command !== 'object') refuse('invalid-input', 'A video command is required.');
    if (requests >= LOCAL_VIDEO_LIMITS.pendingRequests) refuse('queue-full', 'Too many Computer requests are pending.');
    requests += 1;
    try {
      sweep();
      if (command.kind === 'status') {
        if (options.supported?.() === false)
          refuse('unsupported-platform', 'Local Computer video currently requires Windows Local Computer.');
        return state(caller);
      }
      if (command.kind === 'open') return await open(caller, signal);
      if (command.kind === 'resume') {
        if (signal?.aborted) refuse('stale-attempt', 'The resume request was cancelled.');
        requireRuntime(command.runtimeId);
        if (command.binding !== undefined) checkViewer(caller, command.binding);
        if (grant !== undefined && grant.viewer.deviceId !== caller.deviceId)
          refuse('control-conflict', 'Release the current controller before resuming Bots.');
        if (command.generation !== undefined && command.generation !== grant?.generation)
          refuse('stale-grant', 'The control grant changed.');
        invalidate();
        const expectedGeneration = generation;
        return await transition(async () => {
          if (signal?.aborted) refuse('stale-attempt', 'The resume request was cancelled. Bots remain paused.');
          requireRuntime(command.runtimeId);
          if (generation !== expectedGeneration) refuse('stale-grant', 'Control changed before resume.');
          await drain(humans);
          requireRuntime(command.runtimeId);
          if (generation !== expectedGeneration) refuse('stale-grant', 'Control changed during resume.');
          if (signal?.aborted) refuse('stale-attempt', 'The resume request was cancelled. Bots remain paused.');
          persist(false);
          if (disposed || runtimeId !== command.runtimeId || generation !== expectedGeneration) {
            blockBots();
            persist(true);
            refuse('stale-grant', 'Resume was interrupted. Bots remain paused.');
          }
          paused = false;
          botEpoch += 1;
          note('bots-resumed');
          return state(caller);
        });
      }
      const current = checkViewer(caller, command.binding);
      if (command.kind === 'heartbeat') {
        const playback = command.playback;
        if (playback === null || typeof playback !== 'object' || !Number.isSafeInteger(playback.presentedFrames) || playback.presentedFrames < 0 || typeof playback.presenting !== 'boolean')
          refuse('invalid-input', 'Valid video presentation counters are required.');
        if (playback.presentedFrames < current.presentedFrames)
          refuse('stale-attempt', 'The receiver presentation counter moved backwards.');
        if (playback.presentedFrames > current.presentedFrames) current.lastPresentation = now();
        current.presentedFrames = playback.presentedFrames;
        current.presenting = playback.presenting;
        current.lastHeartbeat = now();
        current.disconnected = false;
        if (grant?.viewer === current) grant.expiresAt = now() + LOCAL_VIDEO_LIMITS.controlExpiryMs;
        return state(caller);
      }
      if (command.kind === 'signal') {
        if (command.answer?.type !== 'answer' || typeof command.answer.sdp !== 'string' || command.answer.sdp.length === 0)
          refuse('invalid-input', 'A video answer is required.');
        if (Buffer.byteLength(command.answer.sdp) > LOCAL_VIDEO_LIMITS.signalBytes)
          refuse('request-too-large', 'The video answer is too large.');
        if (current.peer === undefined || current.answered) refuse('not-ready', 'This viewer is not awaiting an answer.');
        current.answered = true;
        try {
          await bounded(current.peer.answer(command.answer, current.abort.signal), operationTimeout, 'operation-timeout');
          checkViewer(caller, command.binding);
          return state(caller);
        } catch {
          await closeViewer(current).catch(() => undefined);
          refuse('signal-failed', 'The video answer could not be applied.');
        }
      }
      if (command.kind === 'takeover') {
        return await transition(async () => {
          if (signal?.aborted) refuse('stale-attempt', 'The takeover request was cancelled.');
          checkViewer(caller, command.binding);
          requireRunning();
          if (current.disconnected) refuse('control-disconnected', 'Reconnect the control connection first.');
          if (!live(current)) refuse('media-not-live', 'Wait for live video before taking control.');
          if (grant?.viewer === current) return state(caller);
          if (grant !== undefined && command.force !== true) refuse('control-conflict', 'Another viewer controls this Computer.');
          if (grant !== undefined && command.confirm !== true) refuse('confirmation-required', 'Confirm replacing the current controller.');
          invalidate();
          const expectedGeneration = generation;
          blockBots();
          persist(true);
          await drain(bots);
          await drain(humans);
          await requireGeometry(current);
          checkViewer(caller, command.binding);
          requireRunning();
          if (generation !== expectedGeneration) refuse('stale-grant', 'Takeover was interrupted. Bots remain paused.');
          if (signal?.aborted) refuse('stale-attempt', 'The takeover request was cancelled. Bots remain paused.');
          if (!live(current) || current.disconnected) refuse('media-not-live', 'Video or control was lost during takeover.');
          grant = { viewer: current, generation: ++generation, expiresAt: current.lastHeartbeat + LOCAL_VIDEO_LIMITS.controlExpiryMs, sequence: 0 };
          note('control-granted');
          return state(caller);
        });
      }
      if (command.kind === 'input') {
        if (pendingInputs >= LOCAL_VIDEO_LIMITS.pendingRequests)
          refuse('queue-full', 'The bounded Computer input queue is full.');
        if (typeof command.input !== 'object' || command.input === null)
          refuse('invalid-input', 'A desktop input is required.');
        const input = parseDesktopInput(command.input as unknown as Record<string, unknown>);
        if (input === undefined || !Number.isSafeInteger(command.sequence) || command.sequence <= 0)
          refuse('invalid-input', 'A valid input and positive sequence are required.');
        const active = checkGrant(current, command.generation);
        if ((input.kind === 'click' || input.kind === 'scroll') &&
          ((input.x !== undefined && (input.x < 0 || input.x >= current.media.width)) ||
           (input.y !== undefined && (input.y < 0 || input.y >= current.media.height))))
          refuse('invalid-input', 'The input is outside the displayed desktop.');
        if (command.sequence <= active.sequence) refuse('input-sequence', 'This input sequence was already consumed. Never replay an uncertain input.');
        active.sequence = command.sequence;
        const execute = async (): Promise<void> => {
          if (signal?.aborted) refuse('stale-grant', 'The queued input was cancelled before execution.');
          checkGrant(current, command.generation);
          await requireGeometry(current);
          if (signal?.aborted) refuse('stale-grant', 'The queued input was cancelled before execution.');
          checkGrant(current, command.generation);
          const call = desktopInputCall(input, undefined);
          const effect = options.driver.call(call.tool, { ...call.args, session: `local-video:${current.binding.viewerId}` });
          humans.add(effect);
          try {
            // Do not abort the native effect merely because its HTTP acknowledgement was lost.
            const result = await effect;
            if (typeof result === 'object' && result !== null && 'isError' in result && result.isError === true)
              refuse('input-failed', 'The Computer driver refused this input.');
          } finally {
            humans.delete(effect);
          }
        };
        pendingInputs += 1;
        const pending = inputs.then(execute, execute).finally(() => { pendingInputs -= 1; });
        inputs = pending.catch(() => undefined);
        try {
          await bounded(pending, operationTimeout, 'input-result-unknown');
        } catch (error) {
          if (!(error instanceof LocalVideoError) || error.code === 'input-result-unknown') {
            invalidate();
            note('input-uncertain', 'input-result-unknown');
            refuse('input-result-unknown', 'The input result is unknown. It will not be replayed.');
          }
          throw error;
        }
        return state(caller);
      }
      if (command.kind === 'release' || command.kind === 'close') {
        if (command.generation !== undefined && command.generation !== grant?.generation)
          refuse('stale-grant', 'The control grant changed.');
        // Fence queued inputs immediately, even if a previous transition is still pending.
        invalidate();
        if (command.kind === 'close') {
          await closeViewer(current);
          return state(caller);
        }
        return await transition(async () => {
          checkViewer(caller, command.binding);
          invalidate();
          await drain(humans);
          note('control-released');
          return state(caller);
        });
      }
      refuse('invalid-input', 'Unknown Local Computer video command.');
    } finally {
      requests -= 1;
    }
  };

  return {
    handle,
    isPaused: () => paused,
    async runBotOperation<T>(operation: () => Promise<T>): Promise<T> {
      requireActive();
      if (paused) refuse('control-required', 'Computer Pause is active. Only an explicit Human resume permits Bot operations.');
      if (bots.size >= LOCAL_VIDEO_LIMITS.pendingRequests) refuse('queue-full', 'Too many Bot Computer operations are pending.');
      const epoch = botEpoch;
      const pending = operation();
      bots.add(pending);
      try {
        const result = await pending;
        if (paused || disposed || epoch !== botEpoch)
          refuse('control-required', 'Computer Pause changed during this operation. Its result was withheld.');
        return result;
      } finally {
        bots.delete(pending);
      }
    },
    async revoke(deviceId) {
      const current = viewer;
      if (current?.deviceId !== deviceId) return;
      invalidate();
      await closeViewer(current);
      note('device-revoked');
    },
    async resetRuntime() {
      invalidate();
      botEpoch += 1;
      runtimeId = randomUUID();
      const current = viewer;
      if (current !== undefined) await closeViewer(current);
      note('runtime-reset');
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      invalidate();
      botEpoch += 1;
      const current = viewer;
      if (current !== undefined) await closeViewer(current);
      note('disposed');
    },
  };
}
