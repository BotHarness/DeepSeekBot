#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const assets = join(root, 'packages/computer/native/local-video');
const require = createRequire(import.meta.url);
const { chromium } = require(
  require.resolve('playwright', {
    paths: [root, execSync('npm root -g', { encoding: 'utf8' }).trim()],
  }),
);
const { unrun } = await import(pathToFileURL(require.resolve('unrun', { paths: [root] })).href);
const { build } = createRequire(require.resolve('unrun', { paths: [root] }))('rolldown');

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const scenarios = (flag('--scenario') ?? 'question,long-task').split(',');
const json = args.includes('--json');
const wavMic = args.includes('--wav-mic') || process.platform === 'darwin';
const work = mkdtempSync(join(tmpdir(), 'bh-desktop-call-'));
const RATE = 16_000;
const CAPTURE_RATE = 48_000;

const entry = join(work, 'host.ts');
writeFileSync(
  entry,
  [
    `export { createVoiceCalls } from ${JSON.stringify(join(root, 'packages/core/src/voice/calls.ts'))};`,
    `export { createVoiceCallHttp } from ${JSON.stringify(join(root, 'packages/core/src/voice/call-http.ts'))};`,
    `export { speech, cough, silence, concat } from ${JSON.stringify(join(root, 'packages/core/test/voice-audio-fixtures.ts'))};`,
  ].join('\n'),
);
const sharpEntry = require.resolve('sharp', { paths: [join(root, 'packages/core')] });
const host = (
  await unrun({
    path: entry,
    inputOptions: {
      resolve: { alias: { sharp: sharpEntry } },
      external: (id) => id === sharpEntry,
    },
  })
).module;

const page = join(work, 'desktop.ts');
writeFileSync(
  page,
  `import { createDesktopCall } from ${JSON.stringify(join(root, 'packages/client/src/client/desktop-call.ts'))};
(globalThis as Record<string, unknown>).__desktopCall = createDesktopCall();`,
);
const bundle = await build({
  input: page,
  platform: 'browser',
  write: false,
  output: { format: 'iife' },
});
const desktopJs = bundle.output[0].code;

function wavBytes(samples, rate) {
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + samples.length * 2, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(samples.length * 2, 40);
  for (let index = 0; index < samples.length; index += 1)
    out.writeInt16LE(samples[index], 44 + index * 2);
  return out;
}

function readWav16k(path) {
  const bytes = readFileSync(path);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`${path} is not a WAV file`);
  let offset = 12;
  let rate = RATE;
  let channels = 1;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      channels = bytes.readUInt16LE(offset + 10);
      rate = bytes.readUInt32LE(offset + 12);
    }
    if (id === 'data') {
      const frames = Math.floor(size / 2 / channels);
      const source = new Int16Array(frames);
      for (let index = 0; index < frames; index += 1)
        source[index] = bytes.readInt16LE(offset + 8 + index * 2 * channels);
      if (rate === RATE) return source;
      const out = new Int16Array(Math.floor((frames * RATE) / rate));
      for (let index = 0; index < out.length; index += 1)
        out[index] = source[Math.min(frames - 1, Math.floor((index * rate) / RATE))];
      return out;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error(`${path} has no audio data`);
}

function timelineAudio(steps) {
  const parts = [];
  let end = 0;
  for (const step of steps) {
    const audio = step.audio ?? readWav16k(step.file);
    const start = Math.round((step.at * RATE) / 1000);
    if (start > end) parts.push(new Int16Array(start - end));
    parts.push(audio);
    end = Math.max(end, start) + audio.length;
  }
  parts.push(new Int16Array(RATE * 2));
  const all = host.concat(...parts);
  const up = new Int16Array(all.length * 3);
  for (let index = 0; index < all.length; index += 1) {
    const next = all[Math.min(all.length - 1, index + 1)];
    up[index * 3] = all[index];
    up[index * 3 + 1] = Math.round((all[index] * 2 + next) / 3);
    up[index * 3 + 2] = Math.round((all[index] + next * 2) / 3);
  }
  return up;
}

function scriptSteps(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return parsed.map((step) => {
    if (!Number.isSafeInteger(step.at) || typeof step.file !== 'string' || !isAbsolute(step.file))
      throw new Error(
        'Each script step needs "at" (ms) and an absolute "file", like call-simulate.',
      );
    return { at: step.at, file: step.file };
  });
}

function tone(seconds, frequency) {
  const count = Math.round(24_000 * seconds);
  const samples = new Int16Array(count);
  for (let index = 0; index < count; index += 1)
    samples[index] = Math.round(Math.sin((2 * Math.PI * frequency * index) / 24_000) * 12_000);
  return wavBytes(samples, 24_000);
}

const SCENARIOS = {
  question: {
    steps: [
      { at: 1_500, audio: host.cough(350) },
      { at: 2_800, audio: host.speech(1_400, { seed: 3 }) },
    ],
    transcripts: ['What is the weather in Shanghai tomorrow?'],
    replies: (text) => [{ delayMs: 600, text: `Tomorrow: light rain. (${text.length})` }],
    expectHeard: 1,
    expectNoise: true,
  },
  'long-task': {
    steps: [{ at: 1_500, audio: host.speech(1_600, { seed: 5, f0: 180 }) }],
    transcripts: ['Check the three latest pull requests and tell me which one is risky.'],
    replies: () => [
      { delayMs: 500, text: 'Let me check.' },
      { delayMs: 3_500, text: 'The second one touches the database; review it first.' },
    ],
    expectHeard: 1,
    expectNoise: false,
  },
  camera: {
    camera: true,
    steps: [{ at: 6_000, audio: host.speech(1_400, { seed: 7 }) }],
    transcripts: ['What am I holding up to the camera?'],
    replies: () => [{ delayMs: 500, text: 'A red card, then a blue one, then a green one.' }],
    expectHeard: 1,
    expectNoise: false,
  },
  screen: {
    screen: true,
    steps: [{ at: 11_000, audio: host.speech(1_400, { seed: 9 }) }],
    transcripts: ['What does the terminal say?'],
    replies: () => [{ delayMs: 500, text: 'The build failed at the link step.' }],
    expectHeard: 1,
    expectNoise: false,
  },
};

const screenWindows = [
  { seconds: 4, background: 'white', lines: '0x9aa3b2', top: 60 },
  { seconds: 4, background: '0x1b1f27', lines: '0x4cc38a', top: 120 },
  { seconds: 16, background: '0xeef3fb', lines: '0x1f7a52', top: 200 },
];

function screenVideo(path) {
  const inputs = screenWindows.flatMap((window) => [
    '-f',
    'lavfi',
    '-t',
    String(window.seconds),
    '-i',
    `color=c=${window.background}:s=1280x720:r=15`,
  ]);
  const drawn = screenWindows.map((window, index) => {
    const boxes = Array.from(
      { length: 8 },
      (_, line) =>
        `drawbox=x=${80 + (line % 3) * 40}:y=${window.top + line * 48}:w=${640 - (line % 4) * 90}:h=18:color=${window.lines}:t=fill`,
    ).join(',');
    return `[${index}:v]${boxes}[w${index}]`;
  });
  execSync(
    [
      'ffmpeg -hide_banner -loglevel error -y',
      ...inputs.map((part) => (part.includes('=') ? JSON.stringify(part) : part)),
      `-filter_complex "${drawn.join(';')};${screenWindows.map((_, index) => `[w${index}]`).join('')}concat=n=${screenWindows.length}:v=1:a=0[v]"`,
      '-map "[v]" -pix_fmt yuv420p',
      JSON.stringify(path),
    ].join(' '),
  );
}

function cameraVideo(path) {
  const scenes = ['red', 'blue', 'green', 'yellow', 'white', 'purple'];
  const inputs = scenes.flatMap((color) => [
    '-f',
    'lavfi',
    '-t',
    '1.5',
    '-i',
    `color=c=${color}:s=640x360:r=15`,
  ]);
  execSync(
    [
      'ffmpeg -hide_banner -loglevel error -y',
      ...inputs.map((part) => (part.includes('=') ? JSON.stringify(part) : part)),
      `-filter_complex "${scenes.map((_, index) => `[${index}:v]`).join('')}concat=n=${scenes.length}:v=1:a=0[v]"`,
      '-map "[v]" -pix_fmt yuv420p',
      JSON.stringify(path),
    ].join(' '),
  );
}

async function hostMediaPage(browser, base) {
  const context = await browser.newContext();
  const media = await context.newPage();
  const state = { onPcm: undefined, onStatus: undefined, played: new Map() };
  await media.exposeBinding('__bridgePcm', (_source, data) => {
    const bytes = Buffer.from(data, 'base64');
    const samples = new Int16Array(bytes.length / 2);
    for (let index = 0; index < samples.length; index += 1)
      samples[index] = bytes.readInt16LE(index * 2);
    state.onPcm?.(samples);
  });
  await media.exposeBinding('__bridgeState', (_source, value) => state.onStatus?.(value));
  await media.exposeBinding('__bridgePlayed', (_source, playback, ok) => {
    state.played.get(playback)?.(ok);
    state.played.delete(playback);
  });
  await media.addInitScript(() => {
    window.__ready = false;
    window.callBridge = {
      ready: () => (window.__ready = true),
      pcm: (data) => window.__bridgePcm(data),
      state: (value) => window.__bridgeState(value),
      played: (playback, ok) => window.__bridgePlayed(playback, ok),
    };
  });
  let playback = 0;
  return {
    close: () => context.close(),
    media: {
      availability: async () => 'ready',
      async open({ onPcm, onStatus }) {
        state.onPcm = onPcm;
        state.onStatus = (value) => onStatus(value === 'connected' ? 'connected' : 'failed');
        await media.goto(`${base}/call-renderer.html`);
        await media.waitForFunction(() => window.__ready);
        const { offer } = await media.evaluate(() => window.callStart());
        return {
          offer,
          async answer(answer) {
            await media.evaluate((sdp) => window.callAnswer(sdp), answer.sdp);
          },
          async play(audio, mime) {
            const id = `p${(playback += 1)}`;
            const data = Buffer.from(audio).toString('base64');
            for (let offset = 0; offset < data.length; offset += 48 * 1024)
              await media.evaluate(
                ([key, part]) => window.callAudio(key, part),
                [id, data.slice(offset, offset + 48 * 1024)],
              );
            const done = new Promise((resolve) => state.played.set(id, resolve));
            await media.evaluate(([key, type]) => window.callPlay(key, type), [id, mime]);
            if (!(await done)) throw new Error('playback failed');
          },
          async close() {
            state.onPcm = undefined;
            state.onStatus = undefined;
            await media.goto('about:blank').catch(() => undefined);
          },
        };
      },
    },
  };
}

async function runScenario(name, scenario) {
  const capture = join(work, `${name}.wav`);
  writeFileSync(capture, wavBytes(timelineAudio(scenario.steps), CAPTURE_RATE));
  const video = join(work, `${name}.y4m`);
  if (scenario.camera) cameraVideo(video);
  if (scenario.screen) screenVideo(video);
  const sent = [];
  const transcripts = [...scenario.transcripts];
  const asrAudio = [];
  let calls;
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://x').pathname;
    if (path === '/api/voice/call') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const reply = await route(
        new Request('http://x/api/voice/call', { method: 'POST', body: Buffer.concat(chunks) }),
      );
      response.writeHead(reply.status, { 'content-type': 'application/json' });
      response.end(await reply.text());
      return;
    }
    if (path === '/capture.wav') {
      response.writeHead(200, { 'content-type': 'audio/wav' });
      response.end(readFileSync(capture));
      return;
    }
    if (path === '/desktop.html') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><meta charset="utf-8"><script src="desktop.js"></script>');
      return;
    }
    if (path === '/desktop.js') {
      response.writeHead(200, { 'content-type': 'text/javascript' });
      response.end(desktopJs);
      return;
    }
    const name = path.slice(1);
    if (['call-renderer.html', 'call-renderer.js'].includes(name)) {
      response.writeHead(200, {
        'content-type': name.endsWith('.html') ? 'text/html' : 'text/javascript',
      });
      response.end(readFileSync(join(assets, name)));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  const base = `http://127.0.0.1:${server.address().port}`;
  const helperBrowser = await chromium.launch({
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  });
  const desktopBrowser = await chromium.launch({
    args: [
      ...(wavMic && !scenario.camera && !scenario.screen
        ? []
        : ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']),
      ...(wavMic ? [] : [`--use-file-for-fake-audio-capture=${capture}%noloop`]),
      ...(scenario.camera || scenario.screen ? [`--use-file-for-fake-video-capture=${video}`] : []),
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  });
  const desktopContext = async () => {
    const context = await desktopBrowser.newContext();
    await context.addInitScript((substitute) => {
      const devices = navigator.mediaDevices;
      const native = devices.getUserMedia.bind(devices);
      window.__micConstraints = [];
      devices.getDisplayMedia = async () => {
        const stream = await native({ video: { width: 1280, height: 720 } });
        window.__screenStream = stream;
        return stream;
      };
      devices.getUserMedia = async (constraints) => {
        if (constraints?.video) return native(constraints);
        window.__micConstraints.push(constraints);
        if (!substitute) return native(constraints);
        const context = new AudioContext();
        const data = await (await fetch('/capture.wav')).arrayBuffer();
        const source = context.createBufferSource();
        source.buffer = await context.decodeAudioData(data);
        const sink = context.createMediaStreamDestination();
        source.connect(sink);
        source.start();
        return sink.stream;
      };
    }, wavMic);
    return context;
  };
  const helper = await hostMediaPage(helperBrowser, base);
  calls = host.createVoiceCalls({
    bot: (slug) =>
      slug === 'mira'
        ? { slug, asr: { providerId: 'asr-e2e' }, voice: { providerId: 'tts-e2e' } }
        : undefined,
    providers: {
      has: (id, kind) => id.startsWith(kind),
      async transcribe({ audio }) {
        asrAudio.push(audio.byteLength);
        return { text: transcripts.shift() ?? '', latencyMs: 5 };
      },
      async synthesize({ text }) {
        return { audio: tone(Math.min(2.5, 0.3 + text.length / 40), 330), mime: 'audio/wav' };
      },
    },
    media: () => helper.media,
    async send(input) {
      sent.push({
        body: input.body,
        at: Date.now(),
        ...(input.visual === undefined
          ? {}
          : {
              visual:
                'image' in input.visual
                  ? {
                      source: input.visual.source,
                      frames: input.visual.frames,
                      layout: input.visual.image.layout,
                      bytes: input.visual.image.jpeg.byteLength,
                    }
                  : { source: input.visual.source, sameAs: input.visual.sameAs },
            }),
      });
      for (const reply of scenario.replies(input.body))
        setTimeout(
          () =>
            void calls.speak({
              slug: input.slug,
              channelId: input.channelId,
              messageId: `bot-${reply.text.length}-${Date.now()}`,
              at: new Date().toISOString(),
              body: reply.text,
            }),
          reply.delayMs,
        );
    },
    busy: () => false,
  });
  const route = host.createVoiceCallHttp(() => calls);
  const result = { scenario: name };
  try {
    const desktop = await desktopContext();
    const window1 = await desktop.newPage();
    await window1.addInitScript(() => {
      const Native = window.RTCPeerConnection;
      window.__downlink = [];
      window.RTCPeerConnection = class extends Native {
        constructor(...input) {
          super(...input);
          this.addEventListener('track', (event) => {
            const context = new AudioContext();
            const analyser = context.createAnalyser();
            analyser.fftSize = 2048;
            context.createMediaStreamSource(new MediaStream([event.track])).connect(analyser);
            const data = new Float32Array(analyser.fftSize);
            setInterval(() => {
              analyser.getFloatTimeDomainData(data);
              let sum = 0;
              for (const value of data) sum += value * value;
              window.__downlink.push({ at: performance.now(), rms: Math.sqrt(sum / data.length) });
            }, 50);
          });
        }
      };
    });
    await window1.goto(`${base}/desktop.html`);
    const started = Date.now();
    await window1.evaluate(() => window.__desktopCall.start('mira'));
    const opened = await window1.evaluate(() => window.__desktopCall.snapshot());
    assert.equal(
      opened.state.status,
      'live',
      `the desktop call is live (${JSON.stringify(opened.block ?? opened.state)})`,
    );
    result.connectedMs = Date.now() - started;
    if (scenario.camera) {
      await window1.evaluate(() => window.__desktopCall.camera(true));
      const visual = await window1.evaluate(() => {
        const current = window.__desktopCall.snapshot().visual;
        return { source: current.source, error: current.error ?? null };
      });
      assert.deepEqual(visual, { source: 'camera', error: null }, 'the camera is on');
    }
    if (scenario.screen) {
      await window1.evaluate(() => window.__desktopCall.screen(true));
      const visual = await window1.evaluate(() => {
        const current = window.__desktopCall.snapshot().visual;
        return { source: current.source, error: current.error ?? null };
      });
      assert.deepEqual(visual, { source: 'screen', error: null }, 'the screen is shared');
    }

    const other = await (await desktopContext()).newPage();
    await other.goto(`${base}/desktop.html`);
    await other.evaluate(() => window.__desktopCall.start('mira'));
    const refused = await other.evaluate(() => window.__desktopCall.snapshot());
    assert.deepEqual(refused.block, { kind: 'elsewhere' }, 'a second window is refused');
    result.secondWindow = 'refused: call-active';

    const expectedReplies = scenario.replies('x').length;
    const deadline = Date.now() + 20_000;
    let snapshot;
    while (Date.now() < deadline) {
      snapshot = await window1.evaluate(() => window.__desktopCall.snapshot());
      const events = snapshot.state.events ?? [];
      if (events.filter((event) => event.type === 'reply-done').length >= expectedReplies) break;
      await new Promise((wait) => setTimeout(wait, 250));
    }
    const events = snapshot.state.events ?? [];
    const types = events.map((event) => event.type);
    const heard = events.filter((event) => event.type === 'sent');
    const played = events.filter((event) => event.type === 'reply-done');
    const playing = events.filter((event) => event.type === 'playing');
    assert.equal(
      heard.length,
      scenario.expectHeard,
      `heard ${heard.length} sentence(s): ${types.join(',')}`,
    );
    assert.equal(
      played.length,
      expectedReplies,
      `played ${played.length} reply(s): ${types.join(',')}`,
    );
    if (scenario.expectNoise)
      assert.ok(types.includes('noise-discarded'), `the cough was discarded: ${types.join(',')}`);
    const [requested] = await window1.evaluate(() => window.__micConstraints);
    assert.equal(
      requested?.audio?.echoCancellation,
      true,
      'the microphone runs with echo cancellation',
    );
    const downlink = await window1.evaluate(() => window.__downlink);
    const loud = Math.max(0, ...downlink.map((level) => level.rms));
    assert.ok(loud > 0.05, `the desktop heard the reply (rms ${loud.toFixed(3)})`);
    result.heard = heard.map((event) => event.text);
    result.replies = played.length;
    result.firstAudioMs = playing[0]?.responseMs;
    result.noiseDiscarded = types.filter((type) => type === 'noise-discarded').length;
    result.downlinkRms = Number(loud.toFixed(3));
    result.asrClipMs = asrAudio.map((bytes) => Math.round(((bytes - 44) / 2 / RATE) * 1000));
    if (scenario.camera) {
      const received = events.filter((event) => event.type === 'frame-received');
      const built = events.find((event) => event.type === 'grid-built');
      const gridSent = events.find((event) => event.type === 'grid-sent');
      assert.ok(received.length >= 2, `keyframes reached the Host: ${types.join(',')}`);
      assert.ok(
        built !== undefined && gridSent !== undefined,
        `a grid was sent: ${types.join(',')}`,
      );
      assert.equal(gridSent.grid, built.grid, 'the sent grid is the built one');
      assert.equal(sent[0]?.visual?.source, 'camera', 'the sentence carried the camera grid');
      const shown = await window1.evaluate(() => window.__desktopCall.snapshot().visual.keyframes);
      result.camera = {
        keyframesShown: shown,
        received: received.length,
        frameBytes: received.map((event) => event.bytes),
        prepareMs: received.map((event) => event.prepareMs),
        grid: sent[0].visual,
        composeMs: built.composeMs,
        waitedMs: gridSent.waitedMs,
      };
    }
    if (scenario.screen) {
      const received = events.filter((event) => event.type === 'frame-received');
      const built = events.find((event) => event.type === 'grid-built');
      const gridSent = events.find((event) => event.type === 'grid-sent');
      assert.equal(
        received.length,
        screenWindows.length,
        `one keyframe per window and none for a still page: ${received.length}`,
      );
      assert.ok(
        built !== undefined && gridSent?.grid === built.grid,
        `a grid was sent: ${types.join(',')}`,
      );
      assert.deepEqual(
        sent[0]?.visual && { source: sent[0].visual.source, frames: sent[0].visual.frames },
        { source: 'screen', frames: screenWindows.length },
        'the sentence carried the three windows',
      );
      await window1.evaluate(() =>
        window.__screenStream.getVideoTracks()[0].dispatchEvent(new Event('ended')),
      );
      const stopped = await window1.evaluate(() => {
        const current = window.__desktopCall.snapshot();
        return {
          source: current.visual.source,
          error: current.visual.error,
          status: current.state.status,
        };
      });
      assert.deepEqual(
        stopped,
        { source: 'off', error: 'screen-stopped', status: 'live' },
        'a share stopped by the system falls back to voice only',
      );
      const after = Date.now() + 3_000;
      let hostVisual;
      while (Date.now() < after) {
        hostVisual = (await calls.handle({ deviceId: 'host-owner' }, { kind: 'status' })).calls.at(
          -1,
        ).visual;
        if (hostVisual === 'off') break;
        await new Promise((wait) => setTimeout(wait, 100));
      }
      assert.equal(hostVisual, 'off', 'the Host call is voice only');
      result.screen = {
        received: received.length,
        frameBytes: received.map((event) => event.bytes),
        prepareMs: received.map((event) => event.prepareMs),
        grid: sent[0].visual,
        composeMs: built.composeMs,
        waitedMs: gridSent.waitedMs,
        stopped: stopped.error,
      };
    }

    await window1.evaluate(() => window.__desktopCall.mute(true));
    assert.equal((await window1.evaluate(() => window.__desktopCall.snapshot())).state.muted, true);
    await window1.evaluate(() => window.__desktopCall.hangup());
    const status = await calls.handle({ deviceId: 'host-owner' }, { kind: 'status' });
    assert.equal(status.calls.at(-1).endReason, 'hangup');
    await other.evaluate(() => window.__desktopCall.dismiss());
    await other.evaluate(() => window.__desktopCall.start('mira'));
    assert.equal(
      (await other.evaluate(() => window.__desktopCall.snapshot())).state.status,
      'live',
      'the other window can call after hang-up',
    );
    await other.evaluate(() => window.__desktopCall.hangup());
    result.ok = true;
    return result;
  } finally {
    await calls.dispose();
    await helper.close().catch(() => undefined);
    await helperBrowser.close();
    await desktopBrowser.close();
    server.close();
  }
}

try {
  const results = [];
  for (const name of scenarios) {
    const scenario =
      SCENARIOS[name] ??
      (isAbsolute(name)
        ? {
            steps: scriptSteps(name),
            transcripts: ['scripted sentence'],
            replies: () => [{ delayMs: 500, text: 'Scripted reply.' }],
            expectHeard: 1,
            expectNoise: false,
          }
        : undefined);
    if (scenario === undefined) throw new Error(`Unknown scenario ${name}`);
    results.push(await runScenario(name, scenario));
  }
  const output = { ok: true, results };
  console.log(json ? JSON.stringify(output) : output);
} finally {
  rmSync(work, { recursive: true, force: true });
}
