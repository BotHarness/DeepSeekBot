import { randomUUID } from 'node:crypto';
import type { ComputerPauseStore } from './computer-pause-store.js';
import type { DesktopAccessIssue } from './desktop-availability.js';
import type { DesktopFrame } from './desktop-view.js';
import {
  driverFailed,
  inputOutsideDesktop,
  parseLocalVideoInput,
  requireMatchingInputGeometry,
  sendLocalVideoInput,
} from './local-video-input.js';
import type { ScrollMotion } from './macos-scroll.js';
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

import {
  correlation,
  reportLocalVideoTrace,
  type FailureSource,
  type Initiator,
  type OperationTrace,
} from './local-video-trace.js';

export { createComputerPauseStore, type ComputerPauseStore } from './computer-pause-store.js';

interface Viewer {
  readonly binding: LocalVideoBinding;
  readonly deviceId: string;
  readonly abort: AbortController;
  readonly frames: boolean;
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
  inputGated: boolean;
  cursorReady: boolean;
  closing?: Promise<void>;
}

const COMMAND_PHASES = new Set([
  'open',
  'frame',
  'signal',
  'takeover',
  'input',
  'release',
  'resume',
  'close',
]);

interface Grant {
  readonly viewer: Viewer;
  readonly generation: number;
  expiresAt: number;
  sequence: number;
}

const closedMedia = (): LocalVideoMediaStatus => ({
  status: 'closed',
  captureAlive: false,
  width: 0,
  height: 0,
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
        timer = setTimeout(
          () => reject(new LocalVideoError(code, 'The Computer operation timed out.')),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createLocalVideoOwner(options: {
  readonly pause: ComputerPauseStore;
  readonly driver: Pick<CuaDriver, 'call'>;
  readonly media: LocalVideoMedia;
  readonly frames?: {
    enabled(): boolean;
    next(after: number | undefined, signal: AbortSignal): Promise<DesktopFrame | undefined>;
  };
  readonly isRunning: () => boolean;
  readonly unavailable?: () => DesktopAccessIssue | undefined;
  readonly supported?: () => boolean;
  readonly pauseRecovery?: () => boolean;
  readonly driverPlatform?: 'darwin' | 'win32';
  readonly scrollMotion?: ScrollMotion;
  readonly now?: () => number;
  readonly onEvent?: (detail: string) => void;
  readonly operationTimeoutMs?: number;
  readonly cleanupTimeoutMs?: number;
  readonly sessionUnlocked?: () => Promise<boolean>;
}): LocalVideoOwner {
  const now = options.now ?? Date.now;
  const operationTimeout = options.operationTimeoutMs ?? LOCAL_VIDEO_LIMITS.operationTimeoutMs;
  const cleanupTimeout = options.cleanupTimeoutMs ?? LOCAL_VIDEO_LIMITS.cleanupTimeoutMs;
  let paused = true;
  let unlockAbort: AbortController | undefined;
  let runtimeId = randomUUID();
  let generation = 0;
  const begin = (phase: string, initiator: Initiator, current?: Viewer): OperationTrace => ({
    id: randomUUID(),
    phase,
    initiator,
    started: now(),
    runtime: correlation(current?.binding.runtimeId ?? runtimeId),
    attempt: current === undefined ? 'none' : correlation(current.binding.attemptId),
    grant: generation,
    source: 'owner',
    external: 'none',
  });
  const outcome = (trace: OperationTrace, code?: LocalVideoRefusal): void =>
    reportLocalVideoTrace(trace, now, paused, options.onEvent, code);
  const note = (
    phase: string,
    initiator: Initiator,
    current?: Viewer,
    code?: LocalVideoRefusal,
    source: FailureSource = 'owner',
  ): void => {
    const trace = begin(phase, initiator, current);
    trace.source = source;
    outcome(trace, code);
  };
  const restore = begin('pause-restore', 'lifecycle');
  try {
    paused = options.pause.read();
    outcome(restore);
  } catch {
    restore.source = 'pause-store';
    outcome(restore, 'pause-write-failed');
  }
  let botEpoch = 0;
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

  let scrollEpoch = 0;
  let nativeCleanup: Promise<void> = Promise.resolve();
  const stopScroll = (): Promise<void> => {
    scrollEpoch++;
    const exit = options.scrollMotion?.stop() ?? Promise.resolve();
    humans.add(exit);
    void exit.finally(() => humans.delete(exit)).catch(() => undefined);
    nativeCleanup = bounded(exit, cleanupTimeout, 'operation-timeout');
    return nativeCleanup;
  };
  const invalidate = (): void => {
    void stopScroll().catch(() => {
      cleanupFailed = true;
    });
    generation += 1;
    grant = undefined;
  };
  const blockBots = (): void => {
    paused = true;
    botEpoch += 1;
  };
  const persist = (value: boolean): void => {
    try {
      options.pause.write(value);
    } catch {
      blockBots();
      refuse('pause-write-failed', 'The Computer pause could not be saved. Bots remain paused.');
    }
  };
  const drain = async (operations: Set<Promise<unknown>>): Promise<void> => {
    if (cleanupFailed) refuse('operation-timeout', 'Native input cleanup did not finish.');
    await nativeCleanup;
    await bounded(Promise.allSettled([...operations]), operationTimeout, 'drain-timeout');
    if (cleanupFailed) refuse('operation-timeout', 'Native input cleanup did not finish.');
  };
  const transition = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = transitions.then(operation, operation);
    transitions = next.catch(() => undefined);
    return next;
  };
  const requireActive = (): void => {
    if (disposed) refuse('disposed', 'The Computer owner has stopped.');
  };
  const requireAvailable = (): void => {
    const issue = options.unavailable?.();
    if (issue !== undefined) refuse(issue.code, issue.detail);
  };
  const requireRunning = (): void => {
    requireActive();
    if (options.supported?.() === false)
      refuse('unsupported-platform', 'This Computer does not support a Local Computer viewer.');
    requireAvailable();
    if (!options.isRunning()) refuse('not-running', 'Start the Local Computer first.');
  };
  const requireUnlocked = async (): Promise<void> => {
    if (
      unlockAbort !== undefined ||
      (options.sessionUnlocked !== undefined && !(await options.sessionUnlocked()))
    )
      refuse('control-required', 'Unlock this Computer before using desktop input.');
  };
  const requireRuntime = (value: string): void => {
    requireActive();
    if (value !== runtimeId)
      refuse('stale-attempt', 'The Computer runtime changed. Refresh its state.');
  };
  const checkViewer = (caller: LocalVideoCaller, binding: LocalVideoBinding): Viewer => {
    requireActive();
    if (
      binding === null ||
      typeof binding !== 'object' ||
      binding.computerId !== 'local' ||
      binding.runtimeId !== runtimeId
    )
      refuse('stale-attempt', 'The Computer runtime changed. Open a new viewer.');
    const current = viewer;
    if (current === undefined || current.deviceId !== caller.deviceId)
      refuse('viewer-not-found', 'This viewer does not belong to the authenticated device.');
    if (
      current.binding.viewerId !== binding.viewerId ||
      current.binding.attemptId !== binding.attemptId ||
      current.abort.signal.aborted
    )
      refuse('stale-attempt', 'This video attempt has ended. Open a new viewer.');
    return current;
  };
  const live = (current: Viewer): boolean =>
    current.answered &&
    current.media.width > 0 &&
    current.media.height > 0 &&
    current.media.status === 'live' &&
    current.media.captureAlive &&
    now() - current.lastCapture <= LOCAL_VIDEO_LIMITS.presentationStallMs &&
    current.presenting &&
    now() - current.lastPresentation <= LOCAL_VIDEO_LIMITS.presentationStallMs;

  const closeViewer = (current: Viewer): Promise<void> => {
    if (current.closing !== undefined) return current.closing;
    const trace = begin('peer-close', 'lifecycle', current);
    trace.source = 'cleanup';
    trace.external = 'media-close';
    current.abort.abort();
    if (viewer === current) viewer = undefined;
    if (grant?.viewer === current) invalidate();
    cleanupPending += 1;
    current.closing = (async () => {
      try {
        await bounded(
          (async () => {
            const peer = current.peer ?? (await current.opening?.catch(() => undefined));
            if (peer !== undefined) await closePeer(peer);
          })(),
          cleanupTimeout,
          'operation-timeout',
        );
        outcome(trace);
      } catch (error) {
        cleanupFailed = true;
        outcome(trace, error instanceof LocalVideoError ? error.code : 'helper-failed');
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
    if (silence >= LOCAL_VIDEO_LIMITS.controlLossMs && !current.disconnected) {
      current.disconnected = true;
      note('control-lost', 'timer', current, 'control-disconnected', 'control');
    }
    if (grant?.viewer === current && silence >= LOCAL_VIDEO_LIMITS.controlExpiryMs) {
      note('control-expired', 'timer', current, 'control-disconnected', 'control');
      invalidate();
    }
    if (silence >= LOCAL_VIDEO_LIMITS.controlExpiryMs) {
      void closeViewer(current).catch(() => undefined);
      return;
    }
    const gated =
      !live(current) && grant?.viewer === current && current.media.status !== 'starting';
    if (gated && !current.inputGated) {
      note('input-gated', 'timer', current, 'media-not-live', 'media');
    }
    current.inputGated = gated;
  };
  const timer = setInterval(sweep, 1_000);
  timer.unref();

  const state = (caller: LocalVideoCaller, offer = false): LocalVideoState => {
    sweep();
    const current = viewer?.deviceId === caller.deviceId ? viewer : undefined;
    const ownGrant = grant?.viewer === current ? grant : undefined;
    const mediaViewer = viewer;
    const unavailable = options.unavailable?.();
    return {
      computerId: 'local',
      runtimeId,
      paused,
      viewerCount: viewer === undefined ? 0 : 1,
      controlHeld: grant !== undefined,
      controller: ownGrant !== undefined && current?.disconnected !== true && live(current!),
      ...(current === undefined ? {} : { binding: current.binding }),
      ...(ownGrant === undefined
        ? {}
        : { grant: { generation: ownGrant.generation, expiresAt: ownGrant.expiresAt } }),
      lastInputSequence: ownGrant?.sequence ?? 0,
      ...(options.scrollMotion === undefined ? {} : { continuousScroll: true }),
      media:
        mediaViewer === undefined
          ? closedMedia()
          : {
              ...mediaViewer.media,
              ...(mediaViewer.media.status === 'live' && !live(mediaViewer)
                ? { status: 'stalled' as const }
                : {}),
            },
      ...(options.frames?.enabled() ? { transport: 'frames' as const } : {}),
      ...(unavailable === undefined ? {} : { unavailable }),
      ...(offer && current?.peer !== undefined ? { offer: current.peer.offer } : {}),
    };
  };

  const open = async (
    caller: LocalVideoCaller,
    trace: OperationTrace,
    signal?: AbortSignal,
  ): Promise<LocalVideoState> => {
    requireRunning();
    if (signal?.aborted) refuse('stale-attempt', 'The viewer request was cancelled.');
    if (viewer !== undefined)
      refuse('viewer-limit', 'This slice supports one viewer. Close the existing viewer first.');
    if (cleanupPending !== 0 || cleanupFailed)
      refuse('not-ready', 'The previous video resources have not finished stopping.');
    const current: Viewer = {
      binding: { computerId: 'local', runtimeId, viewerId: randomUUID(), attemptId: randomUUID() },
      deviceId: caller.deviceId,
      abort: new AbortController(),
      frames: options.frames?.enabled() === true,
      media: { ...closedMedia(), status: 'starting' },
      lastHeartbeat: now(),
      lastCapture: 0,
      lastPresentation: 0,
      presentedFrames: 0,
      presenting: false,
      answered: false,
      disconnected: false,
      inputGated: false,
      cursorReady: false,
    };

    viewer = current;
    trace.attempt = correlation(current.binding.attemptId);
    if (current.frames) return state(caller);
    trace.source = 'helper';
    trace.external = 'media-open';
    const abort = (): void => {
      void closeViewer(current).catch(() => undefined);
    };
    signal?.addEventListener('abort', abort, { once: true });
    const opening = Promise.resolve().then(() =>
      options.media.open({
        binding: current.binding,
        signal: current.abort.signal,
        onStatus: (status) => {
          if (viewer !== current || current.abort.signal.aborted) return;
          if (
            current.peer !== undefined &&
            status.status === 'live' &&
            (status.width !== current.peer.display.width ||
              status.height !== current.peer.display.height)
          ) {
            invalidate();
            note('display-changed', 'helper', current, 'media-not-live', 'geometry');
            void closeViewer(current).catch(() => undefined);
            return;
          }
          current.media = status;
          if (status.captureAlive) current.lastCapture = now();
          if (status.status === 'failed' || status.status === 'closed') {
            invalidate();
            note('media-stopped', 'helper', current, 'helper-failed', 'helper');
            void closeViewer(current).catch(() => undefined);
          }
        },
      }),
    );
    current.opening = opening;
    try {
      const peer = await bounded(opening, operationTimeout, 'operation-timeout');
      current.peer = peer;
      if (
        viewer !== current ||
        current.abort.signal.aborted ||
        disposed ||
        current.binding.runtimeId !== runtimeId
      ) {
        await closePeer(peer);
        refuse('stale-attempt', 'The video attempt ended before the helper became ready.');
      }
      if (
        !Number.isSafeInteger(peer.display.width) ||
        !Number.isSafeInteger(peer.display.height) ||
        peer.display.width <= 0 ||
        peer.display.height <= 0 ||
        peer.display.width > 8192 ||
        peer.display.height > 8192
      )
        refuse(
          'helper-start-failed',
          'The helper did not report supported native desktop dimensions.',
        );
      current.media = { ...current.media, ...peer.display };
      return state(caller, true);
    } catch (error) {
      void opening
        .then(async (peer) => {
          if (current.peer !== peer) await closePeer(peer);
        })
        .catch(() => undefined);
      await closeViewer(current).catch(() => undefined);
      throw error instanceof LocalVideoError
        ? error
        : new LocalVideoError('helper-start-failed', 'The video helper could not start.');
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  };

  const checkGrant = (current: Viewer, value: number): Grant => {
    sweep();
    requireRunning();
    if (viewer !== current || current.abort.signal.aborted)
      refuse('stale-attempt', 'The viewer has ended.');
    const active = grant;
    if (active === undefined)
      refuse('control-required', 'Choose Take control before sending input.');
    if (active.viewer !== current || active.generation !== value)
      refuse('stale-grant', 'Control changed. This input was not sent.');
    if (current.disconnected) refuse('control-disconnected', 'The control connection was lost.');
    if (!live(current)) refuse('media-not-live', 'Wait for a live desktop before sending input.');
    return active;
  };

  const requireGeometry = async (current: Viewer): Promise<number> => {
    const probe = options.driver.call('get_screen_size', {
      session: `local-video:${current.binding.viewerId}`,
    });
    humans.add(probe);

    void probe.finally(() => humans.delete(probe)).catch(() => undefined);
    const result = await bounded(probe, operationTimeout, 'operation-timeout');
    return requireMatchingInputGeometry(
      result,
      current.peer?.display ?? current.media,
      options.driverPlatform === 'darwin' && !current.frames,
    );
  };

  const runCommand = async (
    caller: LocalVideoCaller,
    command: LocalVideoCommand,
    trace: OperationTrace,
    signal?: AbortSignal,
  ): Promise<LocalVideoState> => {
    requireActive();
    if (typeof caller.deviceId !== 'string' || caller.deviceId.length === 0)
      refuse('device-revoked', 'An authenticated device is required.');
    if (command === null || typeof command !== 'object')
      refuse('invalid-input', 'A video command is required.');
    if (requests >= LOCAL_VIDEO_LIMITS.pendingRequests)
      refuse('queue-full', 'Too many Computer requests are pending.');
    requests += 1;
    try {
      sweep();
      if (command.kind === 'status') {
        if (options.supported?.() === false && !(paused && options.pauseRecovery?.() === true))
          refuse('unsupported-platform', 'This Computer does not support a Local Computer viewer.');
        return state(caller);
      }
      if (command.kind === 'open') return await open(caller, trace, signal);
      if (command.kind === 'resume') {
        if (unlockAbort !== undefined)
          refuse('control-required', 'Wait for Computer unlock to finish before resuming Bots.');
        if (signal?.aborted) refuse('stale-attempt', 'The resume request was cancelled.');
        requireRuntime(command.runtimeId);
        requireAvailable();
        if (command.binding !== undefined) checkViewer(caller, command.binding);
        if (grant !== undefined && grant.viewer.deviceId !== caller.deviceId)
          refuse('control-conflict', 'Release the current controller before resuming Bots.');
        if (command.generation !== undefined && command.generation !== grant?.generation)
          refuse('stale-grant', 'The control grant changed.');
        invalidate();
        const expectedGeneration = generation;
        return await transition(async () => {
          if (unlockAbort !== undefined || options.sessionUnlocked !== undefined)
            await requireUnlocked();
          if (signal?.aborted)
            refuse('stale-attempt', 'The resume request was cancelled. Bots remain paused.');
          requireRuntime(command.runtimeId);
          if (generation !== expectedGeneration)
            refuse('stale-grant', 'Control changed before resume.');
          trace.source = 'human-drain';
          await drain(humans);
          trace.source = 'owner';
          requireRuntime(command.runtimeId);
          requireAvailable();
          if (generation !== expectedGeneration)
            refuse('stale-grant', 'Control changed during resume.');
          if (signal?.aborted)
            refuse('stale-attempt', 'The resume request was cancelled. Bots remain paused.');
          trace.source = 'pause-store';
          persist(false);
          if (disposed || runtimeId !== command.runtimeId || generation !== expectedGeneration) {
            blockBots();
            persist(true);
            refuse('stale-grant', 'Resume was interrupted. Bots remain paused.');
          }
          paused = false;
          botEpoch += 1;
          return state(caller);
        });
      }
      if (command.kind === 'frame') {
        requireAvailable();
        const current = checkViewer(caller, command.binding);
        requireRunning();
        if (!current.frames || options.frames === undefined || !options.frames.enabled())
          refuse('invalid-input', 'This viewer does not use desktop frames.');
        if (command.after !== undefined && !Number.isSafeInteger(command.after))
          refuse('invalid-input', 'The frame sequence must be an integer.');
        const captureSignal =
          signal === undefined
            ? current.abort.signal
            : AbortSignal.any([signal, current.abort.signal]);
        let frame: DesktopFrame | undefined;
        try {
          frame = await options.frames.next(command.after, captureSignal);
        } catch {
          if (grant?.viewer === current) invalidate();
          requireAvailable();
          refuse('media-not-live', 'The Host could not capture the desktop.');
        }
        checkViewer(caller, command.binding);
        requireRunning();
        if (captureSignal.aborted) refuse('stale-attempt', 'The frame request was cancelled.');
        if (frame !== undefined) {
          const { width, height } = frame;
          if (width <= 0 || height <= 0)
            refuse('media-not-live', 'The desktop capture did not report its dimensions.');
          if (
            grant?.viewer === current &&
            (width !== current.media.width || height !== current.media.height)
          )
            invalidate();
          current.media = { status: 'live', captureAlive: true, width, height };
          current.presenting = true;
          current.answered = true;
        }
        current.lastCapture = current.lastPresentation = current.lastHeartbeat = now();
        current.disconnected = false;
        if (grant?.viewer === current) grant.expiresAt = now() + LOCAL_VIDEO_LIMITS.controlExpiryMs;
        return { ...state(caller), ...(frame === undefined ? {} : { frame }) };
      }
      const current = checkViewer(caller, command.binding);
      if (command.kind === 'heartbeat') {
        if (current.frames) refuse('invalid-input', 'Use frame requests to follow this desktop.');
        const playback = command.playback;
        if (
          playback === null ||
          typeof playback !== 'object' ||
          !Number.isSafeInteger(playback.presentedFrames) ||
          playback.presentedFrames < 0 ||
          typeof playback.presenting !== 'boolean'
        )
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
        if (
          command.answer?.type !== 'answer' ||
          typeof command.answer.sdp !== 'string' ||
          command.answer.sdp.length === 0
        )
          refuse('invalid-input', 'A video answer is required.');
        if (Buffer.byteLength(command.answer.sdp) > LOCAL_VIDEO_LIMITS.signalBytes)
          refuse('request-too-large', 'The video answer is too large.');
        if (current.peer === undefined || current.answered)
          refuse('not-ready', 'This viewer is not awaiting an answer.');
        current.answered = true;
        trace.source = 'signaling';
        trace.external = 'media-answer';
        try {
          await bounded(
            current.peer.answer(command.answer, current.abort.signal),
            operationTimeout,
            'operation-timeout',
          );
          checkViewer(caller, command.binding);
          return state(caller);
        } catch (error) {
          trace.cause = error instanceof LocalVideoError ? error.code : 'signal-failed';
          await closeViewer(current).catch(() => undefined);
          refuse('signal-failed', 'The video answer could not be applied.');
        }
      }
      if (command.kind === 'takeover') {
        if (unlockAbort !== undefined)
          refuse('control-required', 'Wait for Computer unlock to finish before taking control.');
        return await transition(async () => {
          if (unlockAbort !== undefined || options.sessionUnlocked !== undefined)
            await requireUnlocked();
          if (signal?.aborted) refuse('stale-attempt', 'The takeover request was cancelled.');
          checkViewer(caller, command.binding);
          requireRunning();
          if (current.disconnected)
            refuse('control-disconnected', 'Reconnect the control connection first.');
          if (!live(current))
            refuse('media-not-live', 'Wait for a live desktop before taking control.');
          if (grant?.viewer === current) return state(caller);
          if (grant !== undefined && command.force !== true)
            refuse('control-conflict', 'Another viewer controls this Computer.');
          if (grant !== undefined && command.confirm !== true)
            refuse('confirmation-required', 'Confirm replacing the current controller.');
          invalidate();
          const expectedGeneration = generation;
          blockBots();
          trace.source = 'pause-store';
          persist(true);
          trace.source = 'bot-drain';
          await drain(bots);
          trace.source = 'human-drain';
          await drain(humans);
          trace.source = 'geometry';
          trace.external = 'get_screen_size';
          await requireGeometry(current);
          trace.source = 'owner';
          checkViewer(caller, command.binding);
          requireRunning();
          if (generation !== expectedGeneration)
            refuse('stale-grant', 'Takeover was interrupted. Bots remain paused.');
          if (signal?.aborted)
            refuse('stale-attempt', 'The takeover request was cancelled. Bots remain paused.');
          if (!live(current) || current.disconnected)
            refuse('media-not-live', 'Video or control was lost during takeover.');
          grant = {
            viewer: current,
            generation: ++generation,
            expiresAt: current.lastHeartbeat + LOCAL_VIDEO_LIMITS.controlExpiryMs,
            sequence: 0,
          };
          trace.grant = grant.generation;
          return state(caller);
        });
      }
      if (command.kind === 'input') {
        if (unlockAbort !== undefined || options.sessionUnlocked !== undefined)
          await requireUnlocked();
        if (typeof command.input !== 'object' || command.input === null)
          refuse('invalid-input', 'A desktop input is required.');
        const input = parseLocalVideoInput(command.input as unknown as Record<string, unknown>);
        if (input === undefined || !Number.isSafeInteger(command.sequence) || command.sequence <= 0)
          refuse('invalid-input', 'A valid input and positive sequence are required.');
        const isStop = input.kind === 'scroll-motion' && input.vx === 0 && input.vy === 0;
        if (!isStop && pendingInputs >= LOCAL_VIDEO_LIMITS.pendingRequests)
          refuse('queue-full', 'The bounded Computer input queue is full.');
        const active = checkGrant(current, command.generation);
        if (inputOutsideDesktop(input, current.media))
          refuse('invalid-input', 'The input is outside the displayed desktop.');
        if (command.sequence <= active.sequence)
          refuse(
            'input-sequence',
            'This input sequence was already consumed. Never replay an uncertain input.',
          );
        active.sequence = command.sequence;
        if (isStop) {
          await stopScroll();
          return state(caller);
        }
        const motionEpoch = scrollEpoch;
        const execute = async (): Promise<void> => {
          if (unlockAbort !== undefined || options.sessionUnlocked !== undefined)
            await requireUnlocked();
          if (signal?.aborted)
            refuse('stale-grant', 'The queued input was cancelled before execution.');
          checkGrant(current, command.generation);
          trace.source = 'geometry';
          trace.external = 'get_screen_size';
          const scale = await requireGeometry(current);
          trace.source = 'owner';
          if (signal?.aborted)
            refuse('stale-grant', 'The queued input was cancelled before execution.');
          checkGrant(current, command.generation);
          if (input.kind === 'scroll-motion') {
            if (motionEpoch !== scrollEpoch) return;
            if (options.scrollMotion === undefined)
              refuse('update-required', 'Continuous scrolling is unavailable on this Host.');
            const effect = options.scrollMotion.update(
              { x: input.x / scale, y: input.y / scale, vx: input.vx, vy: input.vy },
              () => {
                if (motionEpoch !== scrollEpoch) refuse('stale-grant', 'Scrolling was stopped.');
                checkGrant(current, command.generation);
              },
            );
            humans.add(effect);
            try {
              await effect;
            } catch (error) {
              if (motionEpoch === scrollEpoch) throw error;
            } finally {
              humans.delete(effect);
            }
            return;
          }
          await stopScroll();
          const effect = sendLocalVideoInput({
            driver: options.driver,
            driverPlatform: options.driverPlatform,
            input,
            viewer: current,
            signal,
            checkGrant: () => checkGrant(current, command.generation),
            operationTimeout,
            trace,
          });
          humans.add(effect);
          try {
            const result = await effect;
            if (driverFailed(result))
              refuse('input-failed', 'The Computer driver refused this input.');
          } finally {
            humans.delete(effect);
          }
        };
        pendingInputs += 1;
        const pending = inputs.then(execute, execute).finally(() => {
          pendingInputs -= 1;
        });
        inputs = pending.catch(() => undefined);
        try {
          await bounded(pending, operationTimeout, 'input-result-unknown');
        } catch (error) {
          if (!(error instanceof LocalVideoError) || error.code === 'input-result-unknown') {
            invalidate();
            refuse('input-result-unknown', 'The input result is unknown. It will not be replayed.');
          }
          throw error;
        }
        return state(caller);
      }
      if (command.kind === 'release' || command.kind === 'close') {
        if (command.generation !== undefined && command.generation !== grant?.generation)
          refuse('stale-grant', 'The control grant changed.');

        invalidate();
        if (command.kind === 'close') {
          trace.source = 'cleanup';
          trace.external = 'media-close';
          await closeViewer(current);
          await drain(humans);
          return state(caller);
        }
        return await transition(async () => {
          checkViewer(caller, command.binding);
          invalidate();
          trace.source = 'human-drain';
          await drain(humans);
          return state(caller);
        });
      }
      refuse('invalid-input', 'Unknown Local Computer video command.');
    } finally {
      requests -= 1;
    }
  };

  const handle: LocalVideoOwner['handle'] = async (caller, command, signal) => {
    const kind = command?.kind;
    const phase = COMMAND_PHASES.has(kind) ? kind : 'invalid-command';
    const current = viewer?.deviceId === caller.deviceId ? viewer : undefined;
    const trace = begin(
      phase,
      caller.deviceId === 'host-owner' ? 'host-owner' : 'paired-device',
      current,
    );

    const record = kind !== 'status' && kind !== 'heartbeat' && kind !== 'frame';
    try {
      const result = await runCommand(caller, command, trace, signal);
      if (record) outcome(trace);
      return result;
    } catch (error) {
      if (record || kind === 'frame')
        outcome(trace, error instanceof LocalVideoError ? error.code : 'operation-timeout');
      throw error;
    }
  };

  return {
    handle,
    isPaused: () => paused,
    controlEpoch: () => botEpoch,
    async pauseUnavailable() {
      requireActive();
      blockBots();
      invalidate();
      if (viewer !== undefined) {
        viewer.media = closedMedia();
        viewer.presenting = false;
      }
      persist(true);
      await transition(async () => {
        await Promise.all([drain(bots), drain(humans)]);
      });
    },
    async runBotOperation<T>(operation: () => Promise<T>): Promise<T> {
      requireActive();
      requireAvailable();
      if (paused)
        refuse(
          'control-required',
          'Computer Pause is active. Only an explicit Human resume permits Bot operations.',
        );
      const epoch = botEpoch;
      if (unlockAbort !== undefined || options.sessionUnlocked !== undefined)
        await requireUnlocked();
      if (paused || disposed || epoch !== botEpoch)
        refuse('control-required', 'Computer Pause changed before this operation.');
      if (bots.size >= LOCAL_VIDEO_LIMITS.pendingRequests)
        refuse('queue-full', 'Too many Bot Computer operations are pending.');
      const pending = operation().then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      bots.add(pending);
      try {
        const result = await pending;
        if (unlockAbort !== undefined || options.sessionUnlocked !== undefined)
          await requireUnlocked();
        if (paused || disposed || epoch !== botEpoch)
          refuse(
            'control-required',
            'Computer Pause changed during this operation. Its result was withheld.',
          );
        if (!result.ok) throw result.error;
        return result.value;
      } finally {
        bots.delete(pending);
      }
    },
    async runUnlock<T>(
      operation: (signal: AbortSignal) => Promise<T>,
      signal: AbortSignal,
    ): Promise<T> {
      requireRunning();
      if (unlockAbort !== undefined || signal.aborted)
        refuse('control-conflict', 'Computer unlock is unavailable.');
      const expectedRuntime = runtimeId;
      const controller = new AbortController();
      unlockAbort = controller;
      const attempt = AbortSignal.any([signal, controller.signal]);
      invalidate();
      blockBots();
      try {
        return await transition(async () => {
          requireRunning();
          persist(true);
          await drain(bots);
          await drain(humans);
          requireRunning();
          requireRuntime(expectedRuntime);
          if (attempt.aborted) refuse('stale-attempt', 'The unlock request was cancelled.');
          return operation(attempt);
        });
      } finally {
        unlockAbort = undefined;
      }
    },
    async revoke(deviceId) {
      const current = viewer;
      if (current?.deviceId !== deviceId) return;
      const trace = begin('device-revoke', 'lifecycle', current);
      trace.source = 'cleanup';
      trace.external = 'media-close';
      invalidate();
      try {
        await closeViewer(current);
        await drain(humans);
        outcome(trace);
      } catch (error) {
        outcome(trace, error instanceof LocalVideoError ? error.code : 'helper-failed');
        throw error;
      }
    },
    async resetRuntime() {
      unlockAbort?.abort();
      const trace = begin('runtime-reset', 'lifecycle', viewer);
      trace.source = 'cleanup';
      if (viewer !== undefined) trace.external = 'media-close';
      invalidate();
      botEpoch += 1;
      runtimeId = randomUUID();
      const current = viewer;
      try {
        if (current !== undefined) await closeViewer(current);
        await drain(humans);
        if (cleanupFailed) refuse('operation-timeout', 'Native input cleanup did not finish.');
        outcome(trace);
      } catch (error) {
        outcome(trace, error instanceof LocalVideoError ? error.code : 'helper-failed');
        throw error;
      }
    },
    async dispose() {
      if (disposed) return;
      unlockAbort?.abort();
      const trace = begin('dispose', 'lifecycle', viewer);
      trace.source = 'cleanup';
      if (viewer !== undefined) trace.external = 'media-close';
      disposed = true;
      clearInterval(timer);
      invalidate();
      botEpoch += 1;
      const current = viewer;
      try {
        if (current !== undefined) await closeViewer(current);
        await drain(humans);
        if (cleanupFailed) refuse('operation-timeout', 'Native input cleanup did not finish.');
        outcome(trace);
      } catch (error) {
        outcome(trace, error instanceof LocalVideoError ? error.code : 'helper-failed');
        throw error;
      }
    },
  };
}
