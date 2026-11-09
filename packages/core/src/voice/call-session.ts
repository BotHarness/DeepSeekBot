import {
  createCallClient,
  type CallClient,
  type CallClientFrame,
  type CallClientOptions,
  type CallClientState,
} from './call-client.js';
import type { CallVisualSource } from './call-contract.js';

const VISUAL_OFF_BEFORE_HANGUP_MS = 1_500;

function settleWithin(work: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((done) => {
    const timer = setTimeout(done, ms);
    void work.then(
      () => {
        clearTimeout(timer);
        done();
      },
      () => {
        clearTimeout(timer);
        done();
      },
    );
  });
}

export class CallCaptureFailure<Code extends string = string> extends Error {
  constructor(
    readonly code: Code,
    readonly cancelled = false,
  ) {
    super(code);
  }
}

export interface CallCaptureEvents {
  keyframe(frame: CallClientFrame): Promise<void>;
  ended(): void;
  pause(paused: boolean): void;
}

export interface CallCapture {
  acquire(): Promise<void>;
  run(): void;
  stop(): void;
}

export type CallCaptureFactory<Capture extends CallCapture> = (
  source: CallVisualSource,
  events: CallCaptureEvents,
) => Capture;

export type CallVisualError<Code extends string> =
  | Code
  | `${CallVisualSource}-missing`
  | `${CallVisualSource}-stopped`;

export interface CallVisualState<Code extends string = string> {
  readonly source: 'off' | CallVisualSource;
  readonly starting: boolean;
  readonly paused: boolean;
  readonly keyframes: number;
  readonly keyframeAt: number | undefined;
  readonly error: CallVisualError<Code> | undefined;
}

export const CALL_VISUAL_OFF: CallVisualState<never> = {
  source: 'off',
  starting: false,
  paused: false,
  keyframes: 0,
  keyframeAt: undefined,
  error: undefined,
};

export interface CallSessionState<Code extends string = string> {
  readonly call: CallClientState;
  readonly visual: CallVisualState<Code>;
}

export interface CallSession<Capture extends CallCapture, Code extends string = string> {
  readonly client: Pick<CallClient, 'open' | 'mute' | 'background'>;
  state(): CallSessionState<Code>;
  capture(): Capture | undefined;
  share(source: CallVisualSource, options?: { restart?: boolean }): Promise<boolean>;
  unshare(source?: CallVisualSource): Promise<void>;
  dismissVisual(): void;
  hangup(): Promise<void>;
  dispose(): void;
}

export interface CallSessionOptions<Capture extends CallCapture> extends Omit<
  CallClientOptions,
  'onChange'
> {
  readonly capture: CallCaptureFactory<Capture>;
  readonly onChange: (state: CallSessionState) => void;
}

export function createCallSession<Capture extends CallCapture, Code extends string = string>(
  options: CallSessionOptions<Capture>,
): CallSession<Capture, Code> {
  const now = options.now ?? Date.now;
  let call: CallClientState = { status: 'idle' };
  let visual: CallVisualState<Code> = CALL_VISUAL_OFF;
  let active: Capture | undefined;
  let disposed = false;
  let generation = 0;
  let callId: string | undefined;
  let pending: number | undefined;

  const emit = () => {
    if (!disposed) options.onChange({ call, visual });
  };
  const setVisual = (patch: Partial<CallVisualState<Code>>) => {
    visual = { ...visual, ...patch };
    emit();
  };
  const live = () => !disposed && client.state().status === 'live';
  const release = () => {
    generation += 1;
    const capture = active;
    active = undefined;
    capture?.stop();
  };

  const client = createCallClient({
    ...options,
    onChange: (next) => {
      call = next;
      const nextId = next.status === 'live' ? next.call.callId : undefined;
      if (nextId !== callId) generation += 1;
      callId = nextId;
      if (next.status === 'ended' && (active !== undefined || visual.starting)) {
        pending = undefined;
        release();
        visual = { ...visual, source: 'off', starting: false, paused: false };
      }
      emit();
    },
  });

  const share = async (
    source: CallVisualSource,
    shareOptions: { restart?: boolean } = {},
  ): Promise<boolean> => {
    if (!live() || visual.starting) return false;
    const restart = visual.source === source;
    if (restart && shareOptions.restart !== true) return true;
    const ticket = (generation += 1);
    const sharedCall = callId;
    const current = () => ticket === generation && live();
    const settle = (patch: Partial<CallVisualState<Code>> = {}) => {
      if (disposed || pending !== ticket) return false;
      pending = undefined;
      setVisual({ ...patch, starting: false });
      return true;
    };
    pending = ticket;
    setVisual({ starting: true, error: undefined });
    const capture: Capture = options.capture(source, {
      keyframe: async (frame) => {
        if (active !== capture || !live()) return;
        setVisual({ keyframes: visual.keyframes + 1, keyframeAt: now() });
        await client.frame(frame);
      },
      ended: () => {
        if (active !== capture) return;
        active = undefined;
        generation += 1;
        setVisual({ source: 'off', paused: false, error: `${source}-stopped` });
        if (live()) void client.visual('off', 'stopped');
      },
      pause: (paused) => {
        if (active !== capture || visual.paused === paused) return;
        setVisual({ paused });
        if (live()) void client.visual(paused ? 'off' : source, paused ? 'paused' : 'resumed');
      },
    });
    try {
      await capture.acquire();
    } catch (error) {
      capture.stop();
      const failure =
        error instanceof CallCaptureFailure
          ? (error as CallCaptureFailure<Code>)
          : new CallCaptureFailure<`${CallVisualSource}-missing`>(`${source}-missing`);
      const fresh = current();
      const lost = restart && fresh && active !== undefined;
      if (lost) release();
      settle({
        ...(fresh ? { error: failure.cancelled ? undefined : failure.code } : {}),
        ...(lost ? { source: 'off' as const, paused: false } : {}),
      });
      if (lost && live()) await client.visual('off');
      return false;
    }
    if (!current()) {
      capture.stop();
      settle();
      return false;
    }
    if (!restart) {
      const answer = await client.visual(source);
      if (!current() || (answer !== undefined && !answer.ok)) {
        capture.stop();
        const owned = settle();
        if (
          owned &&
          answer?.ok === true &&
          live() &&
          callId === sharedCall &&
          visual.source === 'off'
        )
          await client.visual('off');
        return false;
      }
    }
    if (active !== capture) release();
    active = capture;
    capture.run();
    pending = undefined;
    setVisual({
      source,
      starting: false,
      paused: false,
      ...(restart ? {} : { keyframes: 0, keyframeAt: undefined }),
    });
    return true;
  };

  return {
    client,
    state: () => ({ call, visual }),
    capture: () => active,
    share,
    async unshare(source) {
      if (visual.source === 'off' || (source !== undefined && visual.source !== source)) return;
      release();
      setVisual({ source: 'off', paused: false });
      if (live()) await client.visual('off');
    },
    dismissVisual() {
      if (visual.error !== undefined) setVisual({ error: undefined });
    },
    async hangup() {
      pending = undefined;
      release();
      const shared = visual.source !== 'off';
      if (shared || visual.starting)
        visual = { ...visual, source: 'off', starting: false, paused: false };
      if (shared && live()) await settleWithin(client.visual('off'), VISUAL_OFF_BEFORE_HANGUP_MS);
      await client.hangup();
    },
    dispose() {
      release();
      client.dispose();
      disposed = true;
    },
  };
}
