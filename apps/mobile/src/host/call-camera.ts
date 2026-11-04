import { requireOptionalNativeModule } from 'expo';

import { VOICE_CALL_LIMITS } from '../../../../packages/core/src/voice/call-contract';
import {
  KEYFRAME_DEFAULTS,
  createKeyframePicker,
  type KeyframePicker,
} from '../../../../packages/core/src/voice/keyframes';
import type { CallCameraPosition, PhoneCallCameraError } from '../ui/chat/call-session';

type Subscription = { remove(): void };
type ThumbEvent = { grey: string; width: number; height: number; atMs: number };
type StateEvent = { state: 'paused' | 'resumed' };
type NativeKeyframe = {
  jpeg: string;
  bytes: number;
  width: number;
  height: number;
  prepareMs: number;
};

interface CallCameraNative {
  callCameraStart(
    position: CallCameraPosition,
    testVideo: string | null,
    thumbWidth: number,
    sampleFps: number,
  ): Promise<{ position: string }>;
  callCameraKeyframe(maxBytes: number): Promise<NativeKeyframe | null>;
  callCameraStop(): Promise<void>;
  addListener(event: 'onCallCameraThumb', listener: (event: ThumbEvent) => void): Subscription;
  addListener(event: 'onCallCameraState', listener: (event: StateEvent) => void): Subscription;
}

export type { CallCameraPosition, PhoneCallCameraError };

export interface PhoneCallKeyframe {
  readonly source: 'camera';
  readonly jpeg: string;
  readonly score: number;
  readonly skipped: number;
  readonly bytes: number;
  readonly prepareMs: number;
}

export interface PhoneCallCamera {
  start(position: CallCameraPosition, testVideo?: string): Promise<void>;
  stop(): void;
}

const native = requireOptionalNativeModule<CallCameraNative>('CallCamera');

export const callCameraSupported =
  native !== null && typeof (native as Partial<CallCameraNative>).callCameraStart === 'function';

export class PhoneCallCameraFailure extends Error {
  constructor(readonly code: PhoneCallCameraError) {
    super(code);
  }
}

function bytesOf(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function createPhoneCallCamera(options: {
  onKeyframe(frame: PhoneCallKeyframe): void | Promise<void>;
  onPause(paused: boolean): void;
}): PhoneCallCamera | undefined {
  if (!callCameraSupported || native === null) return undefined;
  const module = native;
  const settings = KEYFRAME_DEFAULTS.camera;
  let picker: KeyframePicker | undefined;
  let subscriptions: Subscription[] = [];
  let busy = false;
  let skipped = 0;
  const release = () => {
    for (const subscription of subscriptions) subscription.remove();
    subscriptions = [];
    picker = undefined;
  };
  const sample = async (event: ThumbEvent) => {
    const active = picker;
    if (active === undefined || busy) return;
    const decision = active.push(bytesOf(event.grey), event.atMs);
    if (!decision.keyframe) {
      skipped += 1;
      return;
    }
    busy = true;
    try {
      const frame = await module.callCameraKeyframe(VOICE_CALL_LIMITS.frameBytes).catch(() => null);
      if (picker !== active) return;
      if (frame === null) {
        active.reset();
        skipped += 1;
        return;
      }
      const sent = skipped;
      skipped = 0;
      await options.onKeyframe({
        source: 'camera',
        jpeg: frame.jpeg,
        score: Math.min(1, decision.score),
        skipped: sent,
        bytes: frame.bytes,
        prepareMs: frame.prepareMs,
      });
    } finally {
      busy = false;
    }
  };
  return {
    async start(position, testVideo) {
      release();
      try {
        await module.callCameraStart(
          position,
          testVideo ?? null,
          settings.thumbWidth,
          settings.sampleFps,
        );
      } catch (error) {
        const code = (error as { code?: unknown } | undefined)?.code;
        throw new PhoneCallCameraFailure(
          code === 'camera-denied' ? 'camera-denied' : 'camera-missing',
        );
      }
      picker = createKeyframePicker(settings);
      skipped = 0;
      subscriptions = [
        module.addListener('onCallCameraThumb', (event) => void sample(event)),
        module.addListener('onCallCameraState', (event) => {
          if (event.state === 'resumed') picker = createKeyframePicker(settings);
          options.onPause(event.state === 'paused');
        }),
      ];
    },
    stop() {
      release();
      void module.callCameraStop().catch(() => undefined);
    },
  };
}
