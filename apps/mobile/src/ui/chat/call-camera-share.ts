import type { CallClientFrame } from '../../../../../packages/core/src/voice/call-client';
import type {
  CallCapture,
  CallCaptureEvents,
  CallCaptureFactory,
  CallVisualState,
} from '../../../../../packages/core/src/voice/call-session';
import {
  CALL_CAMERA_OFF,
  type CallCameraPosition,
  type CallCameraState,
  type PhoneCallCameraError,
} from './call-session';

export interface PhoneCameraPort {
  start(position: CallCameraPosition, testVideo?: string): Promise<void>;
  stop(): void;
}

export interface PhoneCameraShare {
  readonly capture: CallCaptureFactory<CallCapture>;
  aim(position: CallCameraPosition, testVideo?: string): void;
  keyframe(frame: CallClientFrame): Promise<void>;
  pause(paused: boolean): void;
}

export function createPhoneCameraShare(
  camera: () => PhoneCameraPort | undefined,
): PhoneCameraShare {
  let owner: object | undefined;
  let events: CallCaptureEvents | undefined;
  let aim: { position: CallCameraPosition; testVideo?: string } = { position: 'front' };
  return {
    capture: (_source, next) => {
      const token = {};
      const target = aim;
      return {
        async acquire() {
          const port = camera();
          if (port === undefined) throw new Error('camera-missing');
          owner = token;
          events = next;
          await port.start(target.position, target.testVideo);
        },
        run() {},
        stop() {
          if (owner !== token) return;
          owner = undefined;
          events = undefined;
          camera()?.stop();
        },
      };
    },
    aim(position, testVideo) {
      aim = testVideo === undefined ? { position } : { position, testVideo };
    },
    keyframe: (frame) => events?.keyframe(frame) ?? Promise.resolve(),
    pause: (paused) => events?.pause(paused),
  };
}

const PHONE_CAMERA_ERRORS = new Set<string>(['camera-denied', 'camera-missing']);

export function phoneCameraState(
  visual: CallVisualState,
  position: CallCameraPosition,
): CallCameraState {
  const error =
    visual.error !== undefined && PHONE_CAMERA_ERRORS.has(visual.error)
      ? (visual.error as PhoneCallCameraError)
      : undefined;
  return {
    ...CALL_CAMERA_OFF,
    on: visual.source === 'camera',
    starting: visual.starting,
    position,
    paused: visual.paused,
    keyframes: visual.keyframes,
    keyframeAt: visual.keyframeAt,
    error,
  };
}
