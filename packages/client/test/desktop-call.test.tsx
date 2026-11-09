// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/client/ds/tooltip.js', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));

import type { CallClientMedia } from '../../core/src/voice/call-client.js';
import { createVoiceCallHttp } from '../../core/src/voice/call-http.js';
import { CALL_NOTICES } from '../../core/src/voice/call-view.js';
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
  HEARTBEAT_REQUEST_MS,
  createCallPost,
  createDesktopCall,
  desktopCallNotice,
  desktopCallView,
  type DesktopCallCaptureHandlers,
} from '../src/client/desktop-call.js';
import { CallMicrophoneError } from '../src/client/call-media.js';
import { DmCallControl } from '../src/client/dm-call.js';
import {
  CALL_NOTICE_TAG,
  askCallNotifications,
  shellCallWindow,
  watchCallPresence,
  type CallNoticeFactory,
  type CallNoticeHandle,
} from '../src/client/call-presence.js';
import { holdCallActivity } from '../src/client/call-activity.js';
import type { ShellWindowState } from '../src/client/desktop-shell.js';
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

function windowMedia(refuse?: Error) {
  const started: string[] = [];
  const muted: boolean[] = [];
  let stops = 0;
  const media: CallClientMedia = {
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
    expect(other.call.snapshot().block).toEqual({ kind: 'elsewhere', notices: ['elsewhere'] });
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
        state: {
          status: 'ended',
          reason: 'media-failed',
          mediaCode: 'microphone-denied',
          events: [],
        },
        visual: DESKTOP_CALL_VISUAL_OFF,
      }),
    ).toEqual(['call.microphoneDenied']);
  });

  it('explains a blocked microphone from its code, not its message', async () => {
    const { fetcher } = host();
    const denied = new CallMicrophoneError('microphone-denied');
    expect(denied.message).not.toBe('microphone-denied');
    const mac = desktopWindow(fetcher, 'window-mac-0001', fakeCamera(), denied);
    await mac.call.start('mira');
    expect(mac.call.snapshot().state).toMatchObject({
      status: 'ended',
      reason: 'media-failed',
      mediaCode: 'microphone-denied',
      error: denied.message,
    });
    expect(desktopCallNotice(mac.call.snapshot())).toEqual(['call.microphoneDenied']);
  });

  it('has desktop copy for every call notice', () => {
    const keys = desktopCallNotice({
      slug: 'mira',
      checking: false,
      block: { kind: 'refused', notices: CALL_NOTICES },
      state: { status: 'idle' },
      visual: DESKTOP_CALL_VISUAL_OFF,
    })!;
    expect(keys).toHaveLength(CALL_NOTICES.length);
    for (const key of keys) expect((en as Record<string, string>)[key]).toEqual(expect.any(String));
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
    expect(bar.querySelector('.bh-call-duration')?.textContent).toMatch(/^0:0\d$/u);
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

  it('shares camera keyframes with the Host call', async () => {
    const { calls, fetcher } = host();
    const mac = desktopWindow(fetcher, 'window-mac-0001');
    await mac.call.start('mira');
    await mac.call.camera(true);
    expect(mac.call.snapshot().visual).toMatchObject({
      source: 'camera',
      keyframes: 0,
    });
    expect(mac.camera.running()).toBe(true);
    await mac.camera.keyframe();
    expect(mac.call.snapshot().visual.keyframes).toBe(1);
    const status = await calls.handle({ deviceId: 'host-owner' }, { kind: 'status' });
    const view = (status as unknown as { calls: { visual?: string; events: { type: string }[] }[] })
      .calls[0]!;
    expect(view.visual).toBe('camera');
    const types = view.events.map((event) => event.type);
    expect(types).toEqual(expect.arrayContaining(['visual', 'frame-received']));
    expect(view.events.filter((event) => event.type === 'visual').at(-1)).toEqual(
      expect.not.objectContaining({ unsaved: expect.anything() }),
    );
    await mac.call.camera(false);
    expect(mac.camera.running()).toBe(false);
    expect(mac.call.snapshot().visual).toMatchObject({ source: 'off' });
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
    expect(panel.querySelector('input[type="checkbox"]')).toBeNull();
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

  it('sends hang-up with keepalive so it outlives a closing window', async () => {
    const seen: { kind: unknown; keepalive: unknown }[] = [];
    const post = createCallPost('window-keep-0001', (async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { kind: unknown };
      seen.push({ kind: body.kind, keepalive: init?.keepalive });
      return new Response(JSON.stringify({ ok: true }));
    }) as typeof fetch);
    await post({ kind: 'heartbeat', callId: 'c' });
    await post({ kind: 'hangup', callId: 'c' });
    expect(seen).toEqual([
      { kind: 'heartbeat', keepalive: undefined },
      { kind: 'hangup', keepalive: true },
    ]);
  });

  it('retries a heartbeat once when the request is reset or hangs, and nothing else', async () => {
    vi.useFakeTimers();
    cleanup.push(() => vi.useRealTimers());
    const calls: string[] = [];
    let attempt = 0;
    const post = createCallPost('window-retry-0001', ((_input, init) => {
      const kind = (JSON.parse(String(init?.body)) as { kind: string }).kind;
      calls.push(kind);
      attempt += 1;
      if (kind !== 'heartbeat') return Promise.reject(new TypeError('fetch failed'));
      if (attempt === 1) return Promise.reject(new TypeError('fetch failed'));
      if (attempt === 3)
        return new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
        );
      return Promise.resolve(new Response(JSON.stringify({ ok: true })));
    }) as typeof fetch);
    await expect(post({ kind: 'heartbeat', callId: 'c' })).resolves.toEqual({ ok: true });
    const hung = post({ kind: 'heartbeat', callId: 'c' });
    await vi.advanceTimersByTimeAsync(HEARTBEAT_REQUEST_MS);
    await expect(hung).resolves.toEqual({ ok: true });
    await expect(post({ kind: 'mute', callId: 'c', muted: true })).rejects.toThrow('fetch failed');
    expect(calls).toEqual(['heartbeat', 'heartbeat', 'heartbeat', 'heartbeat', 'mute']);
  });
});

function presenceDoc() {
  let state: DocumentVisibilityState = 'visible';
  const listeners = new Set<() => void>();
  return {
    doc: {
      get visibilityState() {
        return state;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    } as unknown as Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>,
    set(next: DocumentVisibilityState) {
      state = next;
      for (const listener of [...listeners]) listener();
    },
    listeners: () => listeners.size,
  };
}

function presenceNotices() {
  const shown: {
    title: string;
    body: string;
    tag: string;
    closed: boolean;
    handle: CallNoticeHandle;
  }[] = [];
  const factory: CallNoticeFactory = (title, options) => {
    const entry = {
      title,
      body: options.body,
      tag: options.tag,
      closed: false,
      handle: undefined as unknown as CallNoticeHandle,
    };
    entry.handle = {
      onclick: null,
      close: () => {
        entry.closed = true;
      },
    };
    shown.push(entry);
    return entry.handle;
  };
  return { shown, factory };
}

describe('desktop call in the background', () => {
  it('posts one system notice while the window is hidden and returns to the chat on click', async () => {
    const { fetcher } = host();
    const mac = desktopWindow(fetcher, 'window-bg-0001');
    const page = presenceDoc();
    const notices = presenceNotices();
    const opened: string[] = [];
    let focused = 0;
    const stop = watchCallPresence({
      call: mac.call,
      doc: page.doc,
      notice: () => notices.factory,
      focus: () => {
        focused += 1;
      },
    });
    cleanup.push(stop);
    page.set('hidden');
    expect(notices.shown).toHaveLength(0);
    page.set('visible');
    const t = translate() as (key: string, params?: Record<string, string>) => string;
    await mac.call.start('mira', {
      title: t('call.backgroundTitle', { name: 'Mira' }),
      body: t('call.backgroundBody'),
      open: () => opened.push('dm-mira'),
    });
    expect(notices.shown).toHaveLength(0);
    page.set('hidden');
    expect(notices.shown).toEqual([
      expect.objectContaining({
        title: 'On a call with Mira',
        body: 'Click to return to the call.',
        tag: CALL_NOTICE_TAG,
        closed: false,
      }),
    ]);
    await mac.call.mute(true);
    expect(notices.shown).toHaveLength(1);
    page.set('visible');
    expect(notices.shown[0]?.closed).toBe(true);
    page.set('hidden');
    expect(notices.shown).toHaveLength(2);
    notices.shown[1]?.handle.onclick?.(new Event('click'));
    expect(focused).toBe(1);
    expect(opened).toEqual(['dm-mira']);
    expect(notices.shown[1]?.closed).toBe(true);
    expect(mac.call.snapshot().state.status).toBe('live');
  });

  it('withdraws the notice when the call ends while hidden', async () => {
    const { fetcher } = host();
    const mac = desktopWindow(fetcher, 'window-bg-0002');
    const page = presenceDoc();
    const notices = presenceNotices();
    const stop = watchCallPresence({
      call: mac.call,
      doc: page.doc,
      notice: () => notices.factory,
    });
    await mac.call.start('mira', { title: 'On a call with Mira', body: '', open: () => undefined });
    page.set('hidden');
    expect(notices.shown).toHaveLength(1);
    await mac.call.hangup();
    expect(notices.shown[0]?.closed).toBe(true);
    stop();
    expect(page.listeners()).toBe(0);
  });

  it('stays quiet without notification permission or a known chat', async () => {
    const { fetcher } = host();
    const mac = desktopWindow(fetcher, 'window-bg-0003');
    const page = presenceDoc();
    const notices = presenceNotices();
    cleanup.push(
      watchCallPresence({
        call: mac.call,
        doc: page.doc,
        notice: () => undefined,
      }),
    );
    cleanup.push(
      watchCallPresence({
        call: mac.call,
        doc: page.doc,
        notice: () => notices.factory,
      }),
    );
    await mac.call.start('mira');
    page.set('hidden');
    expect(notices.shown).toHaveLength(0);
    page.set('visible');
    await mac.call.hangup();
    const silent = desktopWindow(fetcher, 'window-bg-0004');
    cleanup.push(watchCallPresence({ call: silent.call, doc: page.doc, notice: () => undefined }));
    await silent.call.start('mira', { title: 'x', body: 'y', open: () => undefined });
    page.set('hidden');
    expect(notices.shown).toHaveLength(0);
  });

  it('does not post a clicked or dismissed notice again while the window stays hidden', async () => {
    const { fetcher } = host();
    const mac = desktopWindow(fetcher, 'window-bg-0005');
    const page = presenceDoc();
    const notices = presenceNotices();
    cleanup.push(
      watchCallPresence({
        call: mac.call,
        doc: page.doc,
        notice: () => notices.factory,
        focus: () => undefined,
      }),
    );
    await mac.call.start('mira', { title: 'On a call with Mira', body: '', open: () => undefined });
    page.set('hidden');
    expect(notices.shown).toHaveLength(1);
    notices.shown[0]?.handle.onclick?.(new Event('click'));
    await mac.call.mute(true);
    await mac.call.mute(false);
    expect(notices.shown).toHaveLength(1);
    page.set('visible');
    page.set('hidden');
    expect(notices.shown).toHaveLength(2);
    notices.shown[1]?.handle.onclose?.(new Event('close'));
    await mac.call.mute(true);
    expect(notices.shown).toHaveLength(2);
    page.set('visible');
    page.set('hidden');
    expect(notices.shown).toHaveLength(3);
  });

  it('follows the native window and reveals it from the notice when the shell provides it', async () => {
    const { fetcher } = host();
    const mac = desktopWindow(fetcher, 'window-bg-0006');
    const page = presenceDoc();
    const notices = presenceNotices();
    const listeners = new Set<(state: ShellWindowState) => void>();
    let revealed = 0;
    const native = (visible: boolean, minimized = !visible) => {
      for (const listener of [...listeners]) listener({ visible, minimized, focused: visible });
    };
    const shell = {
      state: async () => ({ visible: true, minimized: false, focused: true }),
      subscribe(listener: (state: ShellWindowState) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      reveal: async () => {
        revealed += 1;
        return { visible: true, minimized: false, focused: true };
      },
    };
    const opened: string[] = [];
    const stop = watchCallPresence({
      call: mac.call,
      window: shellCallWindow(shell, page.doc),
      notice: () => notices.factory,
    });
    await mac.call.start('mira', {
      title: 'On a call with Mira',
      body: '',
      open: () => opened.push('dm-mira'),
    });
    native(false);
    expect(page.doc.visibilityState).toBe('visible');
    expect(notices.shown).toHaveLength(1);
    notices.shown[0]?.handle.onclick?.(new Event('click'));
    expect(revealed).toBe(1);
    expect(opened).toEqual(['dm-mira']);
    expect(notices.shown[0]?.closed).toBe(true);
    native(true);
    expect(notices.shown).toHaveLength(1);
    stop();
    expect(listeners.size).toBe(0);
  });

  it('holds the shell background lease only while the call is opening or live', async () => {
    const { fetcher } = host();
    const mac = desktopWindow(fetcher, 'window-bg-0007');
    const log: string[] = [];
    let next = 0;
    let gate: (() => void) | undefined;
    const live = {
      acquire: async (reason: 'call') => {
        log.push(`acquire:${reason}`);
        if (next === 1) await new Promise<void>((done) => (gate = done));
        return `lease-${next++}`;
      },
      release: async (lease: string) => {
        log.push(`release:${lease}`);
      },
    };
    const stop = holdCallActivity(mac.call, live);
    expect(log).toEqual([]);
    await mac.call.start('mira');
    expect(mac.call.snapshot().state.status).toBe('live');
    expect(log).toEqual(['acquire:call']);
    await mac.call.hangup();
    await Promise.resolve();
    expect(log).toEqual(['acquire:call', 'release:lease-0']);
    await mac.call.start('mira');
    await mac.call.hangup();
    gate?.();
    await vi.waitFor(() =>
      expect(log).toEqual(['acquire:call', 'release:lease-0', 'acquire:call', 'release:lease-1']),
    );
    stop();
    expect(holdCallActivity(mac.call, undefined)).toBeTypeOf('function');
  });

  it('asks for notification permission only while it is undecided', async () => {
    const requests: string[] = [];
    const api = (permission: NotificationPermission) => ({
      permission,
      requestPermission: async () => {
        requests.push(permission);
        return 'granted' as const;
      },
    });
    askCallNotifications(api('granted'));
    askCallNotifications(api('denied'));
    askCallNotifications(api('default'));
    askCallNotifications(undefined);
    expect(requests).toEqual(['default']);
  });
});
