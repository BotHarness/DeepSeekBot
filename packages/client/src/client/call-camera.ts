import {
  KEYFRAME_DEFAULTS,
  createKeyframePicker,
  type CallVisualSource,
} from '../../../core/src/voice/keyframes.js';
import { VOICE_CALL_LIMITS } from '../../../core/src/voice/call-contract.js';

export const CALL_FRAME_LONG_EDGE = 1280;

export type CallCaptureErrorCode =
  | 'camera-denied'
  | 'camera-missing'
  | 'screen-cancelled'
  | 'screen-missing';

export class CallCameraError extends Error {
  constructor(readonly code: CallCaptureErrorCode) {
    super(code);
  }
}

export interface CallCameraKeyframe {
  readonly source: CallVisualSource;
  readonly jpeg: string;
  readonly score: number;
  readonly skipped: number;
  readonly bytes: number;
  readonly prepareMs: number;
}

export interface CallCamera {
  start(): Promise<MediaStream>;
  run(): void;
  stop(): void;
  stream(): MediaStream | undefined;
  label(): string | undefined;
}

export interface CallCameraOptions {
  readonly source?: CallVisualSource;
  readonly onKeyframe: (frame: CallCameraKeyframe) => void | Promise<void>;
  readonly onEnded?: () => void;
  readonly devices?: () => MediaDevices | undefined;
  readonly now?: () => number;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function canvas(width: number, height: number): HTMLCanvasElement {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element;
}

function encode(element: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((done) => element.toBlob(done, 'image/jpeg', quality));
}

async function captureCamera(media: MediaDevices | undefined): Promise<MediaStream> {
  if (media?.getUserMedia === undefined) throw new CallCameraError('camera-missing');
  try {
    return await media.getUserMedia({
      audio: false,
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15 } },
    });
  } catch (error) {
    const name = (error as { name?: unknown } | undefined)?.name;
    throw new CallCameraError(
      name === 'NotAllowedError' || name === 'SecurityError' ? 'camera-denied' : 'camera-missing',
    );
  }
}

async function captureScreen(media: MediaDevices | undefined): Promise<MediaStream> {
  if (media?.getDisplayMedia === undefined) throw new CallCameraError('screen-missing');
  try {
    return await media.getDisplayMedia({ audio: false, video: { frameRate: { ideal: 5 } } });
  } catch (error) {
    const name = (error as { name?: unknown } | undefined)?.name;
    throw new CallCameraError(
      name === 'NotAllowedError' || name === 'AbortError' ? 'screen-cancelled' : 'screen-missing',
    );
  }
}

export function createBrowserCallCamera(options: CallCameraOptions): CallCamera {
  const source = options.source ?? 'camera';
  const settings = KEYFRAME_DEFAULTS[source];
  const devices = options.devices ?? (() => globalThis.navigator?.mediaDevices);
  const now = options.now ?? (() => performance.now());
  let current: MediaStream | undefined;
  let video: HTMLVideoElement | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let busy = false;
  let skipped = 0;
  let startedAt = 0;

  const sample = async (
    picker: ReturnType<typeof createKeyframePicker>,
    element: HTMLVideoElement,
  ) => {
    if (busy || element.videoWidth === 0 || element.videoHeight === 0) return;
    busy = true;
    try {
      const started = now();
      const width = settings.thumbWidth;
      const height = Math.max(1, Math.round((element.videoHeight / element.videoWidth) * width));
      const thumb = canvas(width, height);
      const context = thumb.getContext('2d', { willReadFrequently: true });
      if (context === null) return;
      context.drawImage(element, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      const grey = new Uint8Array(width * height);
      for (let index = 0; index < grey.length; index += 1)
        grey[index] = Math.round(
          pixels[index * 4]! * 0.299 +
            pixels[index * 4 + 1]! * 0.587 +
            pixels[index * 4 + 2]! * 0.114,
        );
      const decision = picker.push(grey, Math.round(now() - startedAt));
      if (!decision.keyframe) {
        skipped += 1;
        return;
      }
      const scale = Math.min(
        1,
        CALL_FRAME_LONG_EDGE / Math.max(element.videoWidth, element.videoHeight),
      );
      const full = canvas(
        Math.round(element.videoWidth * scale),
        Math.round(element.videoHeight * scale),
      );
      full.getContext('2d')?.drawImage(element, 0, 0, full.width, full.height);
      let blob: Blob | null = null;
      for (const quality of [0.8, 0.6, 0.45]) {
        blob = await encode(full, quality);
        if (blob !== null && blob.size <= VOICE_CALL_LIMITS.frameBytes) break;
      }
      if (blob === null || blob.size > VOICE_CALL_LIMITS.frameBytes) {
        picker.reset();
        skipped += 1;
        return;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const frame: CallCameraKeyframe = {
        source,
        jpeg: base64(bytes),
        score: Math.min(1, decision.score),
        skipped,
        bytes: bytes.byteLength,
        prepareMs: Math.round(now() - started),
      };
      skipped = 0;
      await options.onKeyframe(frame);
    } finally {
      busy = false;
    }
  };

  const stop = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    for (const track of current?.getTracks() ?? []) track.stop();
    current = undefined;
    if (video !== undefined) {
      video.pause();
      video.srcObject = null;
      video = undefined;
    }
  };

  return {
    async start() {
      stop();
      const media = devices();
      const stream = source === 'screen' ? await captureScreen(media) : await captureCamera(media);
      if (stream.getVideoTracks().length === 0) {
        for (const track of stream.getTracks()) track.stop();
        throw new CallCameraError(source === 'screen' ? 'screen-missing' : 'camera-missing');
      }
      current = stream;
      for (const track of stream.getVideoTracks())
        track.addEventListener('ended', () => {
          if (current !== stream) return;
          stop();
          options.onEnded?.();
        });
      const element = document.createElement('video');
      element.muted = true;
      element.playsInline = true;
      element.srcObject = stream;
      video = element;
      await element.play().catch(() => undefined);
      return stream;
    },
    run() {
      const element = video;
      if (element === undefined || timer !== undefined) return;
      const active = createKeyframePicker(settings);
      skipped = 0;
      startedAt = now();
      timer = setInterval(() => void sample(active, element), 1000 / settings.sampleFps);
    },
    stop,
    stream: () => current,
    label: () => current?.getVideoTracks()[0]?.label || undefined,
  };
}
