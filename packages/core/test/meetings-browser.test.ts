import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createBrowserFarEnd,
  untilPage,
  type MeetingPageDriver,
} from '../src/meetings/browser-far-end.js';
import { findMeetingChrome, meetingChromeCandidates } from '../src/meetings/meeting-browser.js';
import type { MeetingFarEndHandlers } from '../src/meetings/meetings.js';
import { zoomDriver, zoomMeetingNumber, zoomWebClientUrl } from '../src/meetings/zoom-driver.js';

const MEETING_PAGE = `<!doctype html><meta charset="utf-8"><title>Synthetic meeting</title>
<body data-phase="joining">
<input id="name"><button id="join">Join</button>
<script>
const params = new URLSearchParams(location.search);
const set = (key, value) => { document.body.dataset[key] = String(value); };
const tone = (ctx, hz) => {
  const osc = ctx.createOscillator();
  osc.frequency.value = hz;
  const gain = ctx.createGain();
  gain.gain.value = 0.5;
  osc.connect(gain);
  osc.start();
  return gain;
};
async function webrtc() {
  const ctx = new AudioContext();
  const out = ctx.createMediaStreamDestination();
  tone(ctx, 440).connect(out);
  const a = new RTCPeerConnection();
  const b = new RTCPeerConnection();
  a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate);
  b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate);
  b.ontrack = (e) => { const el = new Audio(); el.srcObject = e.streams[0]; el.play().catch(() => {}); };
  a.addTrack(out.stream.getAudioTracks()[0], out.stream);
  await a.setLocalDescription(await a.createOffer());
  await b.setRemoteDescription(a.localDescription);
  await b.setLocalDescription(await b.createAnswer());
  await a.setRemoteDescription(b.localDescription);
}
function webaudio() {
  const ctx = new AudioContext();
  tone(ctx, 330).connect(ctx.destination);
}
async function mic() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  const ctx = new AudioContext();
  const meter = ctx.createAnalyser();
  ctx.createMediaStreamSource(stream).connect(meter);
  const data = new Float32Array(meter.fftSize);
  setInterval(() => {
    meter.getFloatTimeDomainData(data);
    set('micPeak', Math.max(...data.map(Math.abs)).toFixed(4));
  }, 200);
}
document.getElementById('join').onclick = () => {
  set('who', document.getElementById('name').value);
  set('phase', 'lobby');
  setTimeout(async () => {
    set('phase', 'in-meeting');
    set('people', params.get('people') ?? '3');
    set('speaker', 'Lin');
    await mic();
    if (params.get('audio') === 'webaudio') webaudio(); else await webrtc();
    const end = Number(params.get('end') ?? 0);
    if (end > 0) setTimeout(() => set('phase', 'ended'), end);
  }, 300);
};
</script>`;

let micPeak = 0;
const synthetic: MeetingPageDriver = {
  platform: 'synthetic',
  matches: (url) => url.protocol === 'http:',
  pageUrl: (url) => url.toString(),
  async enter(page, displayName, signal) {
    await untilPage(page, `!!document.getElementById('name')`, {
      timeoutMs: 5_000,
      signal,
      what: 'name field',
    });
    await page.evaluate(
      `document.getElementById('name').value = ${JSON.stringify(displayName)}; document.getElementById('join').click(); true`,
    );
  },
  async read(page) {
    const state = await page.evaluate<{
      phase: 'in-meeting';
      micPeak?: string;
    }>(`({
      micPeak: document.body.dataset.micPeak,
      phase: document.body.dataset.phase,
      participants: document.body.dataset.people ? Number(document.body.dataset.people) : undefined,
      speaker: document.body.dataset.speaker,
    })`);
    micPeak = Math.max(micPeak, Number(state.micPeak ?? 0));
    return state;
  },
  async leave(page) {
    await page.evaluate(`document.body.dataset.phase = 'left'`);
  },
};

const chrome = findMeetingChrome([...meetingChromeCandidates(), '/opt/pw-browsers/chromium']);
const cleanup: (() => Promise<unknown> | unknown)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function serve(): Promise<string> {
  const server: Server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(MEETING_PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
}

function attend(query: string, options: { aloneMs?: number } = {}) {
  const heard: Int16Array[] = [];
  const events: string[] = [];
  const handlers: MeetingFarEndHandlers = {
    onPcm: (samples) => heard.push(samples),
    onAdmitted: () => events.push('admitted'),
    onEnded: (reason) => events.push(`ended:${reason}`),
  };
  const abort = new AbortController();
  const farEnd = createBrowserFarEnd(synthetic, {
    chrome: () => chrome,
    pollMs: 200,
    ...options,
  });
  return {
    heard,
    events,
    abort,
    session: serve().then(async (base) => {
      const session = await farEnd.join({
        attendanceId: 'mtg-1',
        url: new URL(`${base}?${query}`),
        displayName: "Ada (Vain's Bot)",
        signal: abort.signal,
        handlers,
      });
      cleanup.push(() => session.leave());
      return session;
    }),
  };
}

const rms = (chunks: Int16Array[]) => {
  let sum = 0;
  let count = 0;
  for (const chunk of chunks.slice(-10))
    for (const sample of chunk) {
      sum += sample * sample;
      count += 1;
    }
  return count === 0 ? 0 : Math.sqrt(sum / count);
};

describe.skipIf(chrome === undefined || !existsSync(chrome))('the browser meeting far end', () => {
  it('hears remote WebRTC audio after admission and reports the active speaker', async () => {
    const meeting = attend('audio=webrtc');
    const session = await meeting.session;
    await vi.waitFor(() => expect(meeting.events).toEqual(['admitted']), { timeout: 10_000 });
    await vi.waitFor(() => expect(rms(meeting.heard)).toBeGreaterThan(1_000), {
      timeout: 10_000,
    });
    expect(meeting.heard[0]!.length).toBe(2048);
    expect(session.speaker?.()).toBe('Lin');
  }, 30_000);

  it('hears audio a page plays through Web Audio, and gives the page a silent microphone', async () => {
    micPeak = 0;
    const meeting = attend('audio=webaudio');
    await meeting.session;
    await vi.waitFor(() => expect(rms(meeting.heard)).toBeGreaterThan(1_000), {
      timeout: 10_000,
    });
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(micPeak).toBe(0);
  }, 30_000);

  it('reports the meeting ending and being left alone', async () => {
    const ended = attend('audio=webaudio&end=800');
    await ended.session;
    await vi.waitFor(() => expect(ended.events).toEqual(['admitted', 'ended:meeting-ended']), {
      timeout: 10_000,
    });
    const alone = attend('audio=webaudio&people=1', { aloneMs: 500 });
    await alone.session;
    await vi.waitFor(() => expect(alone.events).toEqual(['admitted', 'ended:alone']), {
      timeout: 10_000,
    });
  }, 30_000);
});

describe('Zoom meeting links', () => {
  it('opens invites in the web client and keeps the passcode', () => {
    expect(
      zoomWebClientUrl(new URL('https://us02web.zoom.us/j/81234567890?pwd=abc.1&from=addon')),
    ).toBe('https://app.zoom.us/wc/join/81234567890?pwd=abc.1');
    expect(zoomWebClientUrl(new URL('https://zoom.us/wc/81234567890/join'))).toBe(
      'https://app.zoom.us/wc/join/81234567890',
    );
    expect(zoomDriver.matches(new URL('https://acme.zoom.com/j/912345678'))).toBe(true);
  });

  it('does not take start links, other hosts or look-alike domains', () => {
    for (const raw of [
      'https://zoom.us/s/81234567890',
      'https://zoom.us.evil.example/j/81234567890',
      'https://notzoom.us/j/81234567890',
      'http://zoom.us/j/81234567890',
      'https://meet.google.com/abc-defg-hij',
    ])
      expect(zoomMeetingNumber(new URL(raw)), raw).toBeUndefined();
  });

  it('finds the Chrome a Host attends with', () => {
    expect(meetingChromeCandidates('linux', { DEEPSEEKBOT_MEETING_CHROME: ' /x/chrome ' })).toEqual(
      ['/x/chrome'],
    );
    expect(findMeetingChrome(['/a', '/b'], (path) => path === '/b')).toBe('/b');
  });
});
