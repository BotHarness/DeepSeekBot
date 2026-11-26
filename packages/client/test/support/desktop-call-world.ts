import type { CallClientMedia } from '../../../core/src/voice/call-client.js';
import { createVoiceCallHttp } from '../../../core/src/voice/call-http.js';
import {
  createVoiceCalls,
  type VoiceCallMedia,
  type VoiceCalls,
} from '../../../core/src/voice/calls.js';
import type { CallVisualSource } from '../../../core/src/voice/keyframes.js';
import {
  CallCameraError,
  type CallCamera,
  type CallCaptureErrorCode,
} from '../../src/client/call-camera.js';
import type { BrowserCallMedia } from '../../src/client/call-media.js';
import {
  createCallPost,
  createDesktopCall,
  type DesktopCallCaptureHandlers,
} from '../../src/client/desktop-call.js';
import { en } from '../../src/client/locale.js';

export const cleanup: (() => unknown)[] = [];

export function hostMedia(): VoiceCallMedia {
  return {
    availability: async () => 'ready',
    async open({ onStatus }) {
      return {
        offer: { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' },
        async answer() {
          queueMicrotask(() => onStatus('connected'));
        },
        async play() {},
        async close() {},
      };
    },
  };
}

export function host(options: { asr?: boolean; busy?: () => boolean; localOff?: boolean } = {}) {
  const records: { state: string; source?: string }[] = [];
  const calls: VoiceCalls = createVoiceCalls({
    bot: (slug) =>
      slug === 'mira'
        ? {
            slug,
            ...(options.asr === false ? {} : { asr: { providerId: 'asr-000000000001' } }),
            voice: { providerId: 'tts-000000000001' },
          }
        : undefined,
    providers: {
      has: (id, kind) => id.startsWith(kind),
      ...(options.localOff ? { localServiceOff: async () => true } : {}),
      transcribe: async () => ({ text: 'hi', latencyMs: 1 }),
      synthesize: async () => ({ audio: new Uint8Array(4), mime: 'audio/wav' }),
    },
    media: hostMedia,
    send: async () => undefined,
    record: async ({ record }) => {
      records.push(record);
      return `record-${records.length}`;
    },
    busy: options.busy ?? (() => false),
  });
  cleanup.push(() => calls.dispose());
  const route = createVoiceCallHttp(() => calls);
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) =>
    route(new Request(new URL(String(input), 'http://host/'), init))) as typeof fetch;
  return { calls, fetcher, records };
}

export function windowMedia(refuse?: Error) {
  const started: string[] = [];
  const muted: boolean[] = [];
  let stops = 0;
  let level = 0;
  const sounds: boolean[] = [];
  const soundListeners = new Set<(on: boolean) => void>();
  let soundFails = false;
  const media: CallClientMedia &
    Pick<BrowserCallMedia, 'level' | 'computerSound' | 'onComputerSound'> = {
    level: () => level,
    async computerSound(on) {
      sounds.push(on);
      if (on && soundFails) throw new Error('no sound');
      return on;
    },
    onComputerSound(listener) {
      soundListeners.add(listener);
      return () => soundListeners.delete(listener);
    },
    async start({ offer }) {
      started.push(offer);
      if (refuse !== undefined) throw refuse;
      return 'v=0\r\na=answer\r\n';
    },
    mute: (value) => muted.push(value),
    stop: () => {
      stops += 1;
    },
    onState: () => () => undefined,
  };
  return {
    media,
    started,
    muted,
    sounds,
    failSound: (fails: boolean) => {
      soundFails = fails;
    },
    endSound: () => {
      for (const listener of [...soundListeners]) listener(false);
    },
    stops: () => stops,
    speak: (value: number) => {
      level = value;
    },
  };
}

export const RED_JPEG =
  '/9j/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAkAEADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAQG/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AjgIWoAAAAAAAAAAAAAAAAAAAAAAf/9k=';

export function fakeCamera(options: { fail?: CallCaptureErrorCode } = {}) {
  let handlers: DesktopCallCaptureHandlers | undefined;
  let running: CallVisualSource | undefined;
  let sampling = false;
  return {
    make(source: CallVisualSource, next: DesktopCallCaptureHandlers): CallCamera {
      const stream = { id: `${source}-stream` } as unknown as MediaStream;
      let mine = false;
      return {
        async start() {
          if (options.fail !== undefined) throw new CallCameraError(options.fail);
          handlers = next;
          running = source;
          mine = true;
          return stream;
        },
        run() {
          sampling = true;
        },
        stop() {
          if (!mine) return;
          mine = false;
          if (running !== source) return;
          running = undefined;
          sampling = false;
        },
        stream: () => (mine ? stream : undefined),
        label: () => (source === 'screen' ? 'build.log - Terminal' : 'FaceTime HD Camera'),
      };
    },
    running: () => running !== undefined && sampling,
    source: () => running,
    async keyframe() {
      await handlers?.onKeyframe({
        source: running ?? 'camera',
        jpeg: RED_JPEG,
        score: 0.5,
        skipped: 2,
        bytes: 287,
        prepareMs: 4,
      });
    },
    end() {
      running = undefined;
      sampling = false;
      handlers?.onEnded();
    },
  };
}

export function desktopWindow(
  fetcher: typeof fetch,
  client: string,
  camera: ReturnType<typeof fakeCamera> = fakeCamera(),
  refuse?: Error,
) {
  const media = windowMedia(refuse);
  const call = createDesktopCall({
    post: createCallPost(client, fetcher),
    media: () => media.media,
    capture: (source, handlers) => camera.make(source, handlers),
  });
  cleanup.push(() => call.hangup());
  return { call, media, camera };
}

export function translate() {
  return ((key: string, params?: Record<string, unknown>) => {
    let text = (en as Record<string, string>)[key] ?? key;
    for (const [name, value] of Object.entries(params ?? {}))
      text = text.replace(`{${name}}`, String(value));
    return text;
  }) as never;
}
