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
  createCallPost,
  createDesktopCall,
  desktopCallNotice,
  desktopCallView,
  formatCallDuration,
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
    busy: options.busy ?? (() => false),
  });
  cleanup.push(() => calls.dispose());
  const route = createVoiceCallHttp(() => calls);
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) =>
    route(new Request(new URL(String(input), 'http://host/'), init))) as typeof fetch;
  return { calls, fetcher };
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

function desktopWindow(fetcher: typeof fetch, client: string) {
  const media = windowMedia();
  const call = createDesktopCall({
    post: createCallPost(client, fetcher),
    media: () => media.media,
  });
  cleanup.push(() => call.hangup());
  return { call, media };
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
});
