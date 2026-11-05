// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/client/ds/tooltip.js', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));

import type { CallClientMedia } from '../../core/src/voice/call-client.js';
import { createVoiceCallHttp } from '../../core/src/voice/call-http.js';
import {
  createVoiceCalls,
  type VoiceCallMedia,
  type VoiceCalls,
} from '../../core/src/voice/calls.js';
import {
  CallCameraError,
  type CallCamera,
  type CallCaptureErrorCode,
} from '../src/client/call-camera.js';
import type { CallVisualSource } from '../../core/src/voice/keyframes.js';
import {
  DESKTOP_CALL_VISUAL_OFF,
  createCallPost,
  createDesktopCall,
  desktopCallNotice,
  desktopCallView,
  formatCallDuration,
  type DesktopCallCaptureHandlers,
} from '../src/client/desktop-call.js';
import { DmCallControl } from '../src/client/dm-call.js';
import { en } from '../src/client/locale.js';

const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.unstubAllGlobals();
});

function hostMedia(): VoiceCallMedia {
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

function host(options: { asr?: boolean; busy?: () => boolean; localOff?: boolean } = {}) {
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

function windowMedia() {
  const started: string[] = [];
  const muted: boolean[] = [];
  let stops = 0;
  const media: CallClientMedia = {
    async start({ offer }) {
      started.push(offer);
      return 'v=0\r\na=answer\r\n';
    },
    mute: (value) => muted.push(value),
    stop: () => {
      stops += 1;
    },
    onState: () => () => undefined,
  };
  return { media, started, muted, stops: () => stops };
}

const RED_JPEG =
  '/9j/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAkAEADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAQG/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AjgIWoAAAAAAAAAAAAAAAAAAAAAAf/9k=';

function fakeCamera(options: { fail?: CallCaptureErrorCode } = {}) {
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

function desktopWindow(
  fetcher: typeof fetch,
  client: string,
  camera: ReturnType<typeof fakeCamera> = fakeCamera(),
) {
  const media = windowMedia();
  const call = createDesktopCall({
    post: createCallPost(client, fetcher),
    media: () => media.media,
    capture: (source, handlers) => camera.make(source, handlers),
  });
  cleanup.push(() => call.hangup());
  return { call, media, camera };
}

function translate() {
  return ((key: string, params?: Record<string, unknown>) => {
    let text = (en as Record<string, string>)[key] ?? key;
    for (const [name, value] of Object.entries(params ?? {}))
      text = text.replace(`{${name}}`, String(value));
    return text;
  }) as never;
}

describe('desktop call', () => {
  it('calls through the Host-owner route and hangs up', async () => {
    const { fetcher } = host();
    const mac = desktopWindow(fetcher, 'window-mac-0001');
    await mac.call.start('mira');
    const state = mac.call.snapshot().state;
    expect(state).toMatchObject({ status: 'live', call: { slug: 'mira' } });
    expect(mac.media.started[0]).toContain('m=audio');
    expect(desktopCallView(state)).toMatchObject({ status: 'call.listening', tone: 'live' });
    await mac.call.mute(true);
    expect(mac.media.muted).toEqual([true]);
    expect(desktopCallView(mac.call.snapshot().state)).toMatchObject({
      status: 'call.muted',
      muted: true,
    });
    await mac.call.hangup();
    expect(mac.call.snapshot().state).toEqual({ status: 'idle' });
    expect(desktopCallNotice(mac.call.snapshot())).toBeUndefined();
  });

  it('refuses a second window clearly and keeps the first call', async () => {
    const { fetcher } = host();
    const mac = desktopWindow(fetcher, 'window-mac-0001');
    const other = desktopWindow(fetcher, 'window-win-0002');
    await mac.call.start('mira');
    await other.call.start('mira');
    expect(other.call.snapshot().block).toEqual({ kind: 'elsewhere' });
    expect(desktopCallNotice(other.call.snapshot())).toEqual(['call.elsewhere']);
    expect(other.media.started).toEqual([]);
    expect(mac.call.snapshot().state.status).toBe('live');
    await mac.call.hangup();
    other.call.dismiss();
    await other.call.start('mira');
    expect(other.call.snapshot().state.status).toBe('live');
  });

  it('names what is missing before dialing', async () => {
    const { fetcher } = host({ asr: false });
    const mac = desktopWindow(fetcher, 'window-mac-0001');
    await mac.call.start('mira');
    expect(desktopCallNotice(mac.call.snapshot())).toEqual(['call.missing.asr']);
  });

  it('names a stopped local speech service before dialing', async () => {
    const { fetcher } = host({ localOff: true });
    const mac = desktopWindow(fetcher, 'window-mac-0001');
    await mac.call.start('mira');
    expect(desktopCallNotice(mac.call.snapshot())).toEqual(['call.missing.localVoiceOff']);
    expect(mac.media.started).toEqual([]);
  });

  it('shows the busy hint only on screen', async () => {
    let busy = false;
    const { fetcher } = host({ busy: () => busy });
    const mac = desktopWindow(fetcher, 'window-mac-0001');
    busy = true;
    await mac.call.start('mira');
    expect(desktopCallView(mac.call.snapshot().state)).toMatchObject({
      status: 'call.busy',
      tone: 'busy',
    });
  });

  it('explains a blocked microphone', () => {
    expect(
      desktopCallNotice({
        slug: 'mira',
        checking: false,
        block: undefined,
        state: { status: 'ended', reason: 'media-failed', error: 'microphone-denied', events: [] },
        visual: DESKTOP_CALL_VISUAL_OFF,
      }),
    ).toEqual(['call.microphoneDenied']);
    expect(formatCallDuration(65_400)).toBe('01:05');
    expect(formatCallDuration(3_725_000)).toBe('1:02:05');
  });

  it('renders the call button and the call bar in the chat header', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const { fetcher } = host();
    const mac = desktopWindow(fetcher, 'window-mac-0001');
    const t = ((key: string, params?: Record<string, unknown>) => {
      let text = (en as Record<string, string>)[key] ?? key;
      for (const [name, value] of Object.entries(params ?? {}))
        text = text.replace(`{${name}}`, String(value));
      return text;
    }) as never;
    const element = document.createElement('div');
    const root = createRoot(element);
    cleanup.push(() => act(() => root.unmount()));
    await act(async () =>
      root.render(<DmCallControl slug="mira" name="Mira" t={t} call={mac.call} />),
    );
    const dial = element.querySelector<HTMLButtonElement>('button[aria-label="Call Mira"]')!;
    expect(dial).not.toBeNull();
    await act(async () => dial.click());
    await act(async () => {
      for (let index = 0; index < 20 && mac.call.snapshot().state.status !== 'live'; index += 1)
        await new Promise((resolve) => setTimeout(resolve, 5));
    });
    const bar = element.querySelector('[role="group"][aria-label="Call with Mira"]')!;
    expect(bar).not.toBeNull();
    expect(bar.querySelector('[role="status"]')?.textContent).toBe('Listening');
    expect(bar.querySelector('.bh-call-duration')?.textContent).toMatch(/^00:0\d$/u);
    const mute = bar.querySelector<HTMLButtonElement>('button[aria-label="Mute"]')!;
    await act(async () => mute.click());
    expect(element.querySelector('button[aria-label="Unmute"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    await act(async () =>
      element.querySelector<HTMLButtonElement>('button[aria-label="Hang up"]')!.click(),
    );
    expect(element.querySelector('button[aria-label="Call Mira"]')).not.toBeNull();
  });

  it('offers hang-up from another Bot chat while a call runs', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const { fetcher } = host();
    const mac = desktopWindow(fetcher, 'window-mac-0001');
    const t = ((key: string, params?: Record<string, unknown>) => {
      let text = (en as Record<string, string>)[key] ?? key;
      for (const [name, value] of Object.entries(params ?? {}))
        text = text.replace(`{${name}}`, String(value));
      return text;
    }) as never;
    await mac.call.start('mira');
    expect(mac.call.snapshot().state.status).toBe('live');
    const element = document.createElement('div');
    const root = createRoot(element);
    cleanup.push(() => act(() => root.unmount()));
    await act(async () =>
      root.render(<DmCallControl slug="kai" name="Kai" t={t} call={mac.call} />),
    );
    expect(
      element.querySelector<HTMLButtonElement>('button[aria-label="Call Kai"]')?.disabled,
    ).toBe(true);
    await act(async () =>
      element
        .querySelector<HTMLButtonElement>('button[aria-label="Hang up the current call"]')!
        .click(),
    );
    expect(mac.call.snapshot().state).toEqual({ status: 'idle' });
    expect(element.querySelector('button[aria-label="Hang up the current call"]')).toBeNull();
  });

  it('shares camera keyframes with the Host call and turns saving off', async () => {
    const { calls, fetcher } = host();
    const mac = desktopWindow(fetcher, 'window-mac-0001');
    await mac.call.start('mira');
    await mac.call.camera(true);
    expect(mac.call.snapshot().visual).toMatchObject({
      source: 'camera',
      save: true,
      keyframes: 0,
    });
    expect(mac.camera.running()).toBe(true);
    await mac.camera.keyframe();
    expect(mac.call.snapshot().visual.keyframes).toBe(1);
    await mac.call.saveFrames(false);
    const status = await calls.handle({ deviceId: 'host-owner' }, { kind: 'status' });
    const view = (status as unknown as { calls: { visual?: string; events: { type: string }[] }[] })
      .calls[0]!;
    expect(view.visual).toBe('camera');
    const types = view.events.map((event) => event.type);
    expect(types).toEqual(expect.arrayContaining(['visual', 'frame-received']));
    expect(view.events.filter((event) => event.type === 'visual').at(-1)).toMatchObject({
      unsaved: true,
    });
    await mac.call.camera(false);
    expect(mac.camera.running()).toBe(false);
    expect(mac.call.snapshot().visual).toMatchObject({ source: 'off', save: false });
    await mac.call.camera(true);
    await mac.call.hangup();
    expect(mac.camera.running()).toBe(false);
    expect(mac.call.snapshot().visual).toEqual(DESKTOP_CALL_VISUAL_OFF);
  });

  it('explains a blocked camera and keeps the voice call', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const { calls, fetcher } = host();
    const mac = desktopWindow(fetcher, 'window-mac-0001', fakeCamera({ fail: 'camera-denied' }));
    await mac.call.start('mira');
    await mac.call.camera(true);
    expect(mac.call.snapshot().visual).toMatchObject({ source: 'off', error: 'camera-denied' });
    expect(mac.call.snapshot().state.status).toBe('live');
    const status = await calls.handle({ deviceId: 'host-owner' }, { kind: 'status' });
    expect((status as unknown as { calls: { visual?: string }[] }).calls[0]!.visual).toBe('off');
    const element = document.createElement('div');
    const root = createRoot(element);
    cleanup.push(() => act(() => root.unmount()));
    await act(async () =>
      root.render(<DmCallControl slug="mira" name="Mira" t={translate()} call={mac.call} />),
    );
    expect(document.body.querySelector('.bh-call-camera[role="alert"]')?.textContent).toContain(
      'Camera access was denied',
    );
  });

  it('switches from the camera to a shared window and notes when the system stops it', async () => {
    const { calls, fetcher, records } = host();
    const mac = desktopWindow(fetcher, 'window-mac-0001');
    await mac.call.start('mira');
    await mac.call.camera(true);
    await mac.camera.keyframe();
    await mac.call.screen(true);
    expect(mac.call.snapshot().visual).toMatchObject({
      source: 'screen',
      label: 'build.log - Terminal',
      keyframes: 0,
    });
    expect(mac.camera.source()).toBe('screen');
    await mac.camera.keyframe();
    const status = async () =>
      (
        (await calls.handle({ deviceId: 'host-owner' }, { kind: 'status' })) as unknown as {
          calls: { visual?: string; events: { type: string; source?: string }[] }[];
        }
      ).calls[0]!;
    expect((await status()).visual).toBe('screen');
    expect(
      (await status()).events.filter((event) => event.type === 'frame-received').at(-1),
    ).toMatchObject({ source: 'screen' });
    mac.camera.end();
    await vi.waitFor(async () => expect((await status()).visual).toBe('off'));
    expect(mac.call.snapshot().visual).toMatchObject({
      source: 'off',
      error: 'screen-stopped',
      stream: undefined,
    });
    expect(mac.call.snapshot().state.status).toBe('live');
    await vi.waitFor(() =>
      expect(records).toContainEqual(
        expect.objectContaining({ state: 'share-stopped', source: 'screen' }),
      ),
    );
    mac.call.dismissVisual();
    expect(mac.call.snapshot().visual.error).toBeUndefined();
  });

  it('keeps the current source when the screen picker is cancelled', async () => {
    const { fetcher } = host();
    const cancelled = fakeCamera({ fail: 'screen-cancelled' });
    const mac = desktopWindow(fetcher, 'window-mac-0001', cancelled);
    await mac.call.start('mira');
    await mac.call.screen(true);
    expect(mac.call.snapshot().visual).toMatchObject({ source: 'off', error: undefined });
    expect(mac.call.snapshot().state.status).toBe('live');
  });

  it('shows the camera button, preview and save switch in the call bar', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const { fetcher } = host();
    const mac = desktopWindow(fetcher, 'window-mac-0001');
    await mac.call.start('mira');
    const element = document.createElement('div');
    const root = createRoot(element);
    cleanup.push(() => act(() => root.unmount()));
    await act(async () =>
      root.render(<DmCallControl slug="mira" name="Mira" t={translate()} call={mac.call} />),
    );
    await act(async () =>
      element.querySelector<HTMLButtonElement>('button[aria-label="Turn camera on"]')!.click(),
    );
    expect(
      element.querySelector('button[aria-label="Turn camera off"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    const panel = document.body.querySelector('[role="group"][aria-label="Camera preview"]')!;
    expect(panel.textContent).toContain('Changes in the picture go to the Bot');
    await act(async () => mac.camera.keyframe());
    expect(panel.textContent).toContain('Keyframes sent to the Bot: 1');
    expect(panel.querySelector('.bh-call-camera-flash')?.getAttribute('data-flash')).toBe('true');
    const save = panel.querySelector<HTMLInputElement>('#bh-call-save-frames')!;
    expect(save.checked).toBe(true);
    await act(async () => save.click());
    expect(mac.call.snapshot().visual.save).toBe(false);
    await act(async () =>
      element.querySelector<HTMLButtonElement>('button[aria-label="Turn camera off"]')!.click(),
    );
    expect(document.body.querySelector('[aria-label="Camera preview"]')).toBeNull();
    await act(async () =>
      element.querySelector<HTMLButtonElement>('button[aria-label="Share screen"]')!.click(),
    );
    const shared = document.body.querySelector(
      '[role="group"][aria-label="Screen share preview"]',
    )!;
    expect(shared.getAttribute('data-source')).toBe('screen');
    expect(shared.textContent).toContain('Sharing: build.log - Terminal');
    expect(
      element
        .querySelector('button[aria-label="Stop sharing screen"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    await act(async () => mac.camera.end());
    const notice = document.body.querySelector('.bh-call-camera[role="alert"]')!;
    expect(notice.textContent).toContain('Screen sharing stopped. The call is voice only now.');
    await act(async () =>
      notice.querySelector<HTMLButtonElement>('.bh-call-camera-close')!.click(),
    );
    expect(document.body.querySelector('.bh-call-camera')).toBeNull();
  });
});
