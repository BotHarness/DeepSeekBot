import {
  createCallClient,
  type CallClient,
  type CallClientFrame,
  type CallClientOptions,
  type CallClientState,
} from './call-client.js';
import type { CallVisualSource } from './call-contract.js';

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

  const emit = () => {
    if (!disposed) options.onChange({ call, visual });
  };
  const setVisual = (patch: Partial<CallVisualState<Code>>) => {
    visual = { ...visual, ...patch };
    emit();
  };
  const live = () => !disposed && client.state().status === 'live';
  const release = () => {
    const capture = active;
    active = undefined;
    capture?.stop();
  };

  const client = createCallClient({
    ...options,
    onChange: (next) => {
      call = next;
      if (next.status === 'ended' && (active !== undefined || visual.starting)) {
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
      const lost = restart && active !== undefined;
      if (lost) release();
      setVisual({
        starting: false,
        error: failure.cancelled ? undefined : failure.code,
        ...(lost ? { source: 'off' as const, paused: false } : {}),
      });
      if (lost && live()) await client.visual('off');
      return false;
    }
    if (!live()) {
      capture.stop();
      if (!disposed) setVisual({ starting: false });
      return false;
    }
    if (!restart) {
      const answer = await client.visual(source);
      if (!live() || (answer !== undefined && !answer.ok)) {
        capture.stop();
        if (!disposed) setVisual({ starting: false });
        return false;
      }
    }
    if (active !== capture) release();
    active = capture;
    capture.run();
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
      release();
      if (visual.source !== 'off' || visual.starting)
        visual = { ...visual, source: 'off', starting: false, paused: false };
      await client.hangup();
    },
    dispose() {
      release();
      client.dispose();
      disposed = true;
    },
  };
}
