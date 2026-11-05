#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const assets = join(root, 'packages/computer/native/local-video');
const require = createRequire(import.meta.url);
const { chromium } = require(
  require.resolve('playwright', {
    paths: [root, execSync('npm root -g', { encoding: 'utf8' }).trim()],
  }),
);

function wav(seconds, frequency) {
  const rate = 24_000;
  const count = Math.round(rate * seconds);
  const out = Buffer.alloc(44 + count * 2);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + count * 2, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(count * 2, 40);
  for (let index = 0; index < count; index += 1)
    out.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * frequency * index) / rate) * 12000),
      44 + index * 2,
    );
  return out;
}

const server = createServer((request, response) => {
  const name = new URL(request.url ?? '/', 'http://x').pathname.slice(1);
  if (!['call-renderer.html', 'call-renderer.js'].includes(name)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'content-type': name.endsWith('.html') ? 'text/html' : 'text/javascript',
  });
  response.end(readFileSync(join(assets, name)));
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
  ],
});
const started = Date.now();
const timings = {};
try {
  const context = await browser.newContext();
  const host = await context.newPage();
  await host.addInitScript(() => {
    window.__events = { ready: 0, pcm: [], states: [], played: [] };
    window.callBridge = {
      ready: () => (window.__events.ready += 1),
      pcm: (data) => window.__events.pcm.push(data),
      state: (state) => window.__events.states.push(state),
      played: (playback, ok) => window.__events.played.push({ playback, ok }),
    };
  });
  await host.goto(`${base}/call-renderer.html`);
  await host.waitForFunction(() => window.__events.ready === 1);

  const phone = await context.newPage();
  await phone.goto(`${base}/missing`).catch(() => undefined);
  await phone.evaluate(() => {
    const context = new AudioContext({ sampleRate: 48000 });
    const destination = context.createMediaStreamDestination();
    const gain = context.createGain();
    gain.gain.value = 0;
    for (let harmonic = 1; harmonic <= 6; harmonic += 1) {
      const oscillator = context.createOscillator();
      oscillator.frequency.value = 150 * harmonic;
      const level = context.createGain();
      level.gain.value = 0.25 / harmonic;
      oscillator.connect(level).connect(gain);
      oscillator.start();
    }
    gain.connect(destination);
    window.__phone = { context, destination, gain, levels: [] };
  });

  const { offer } = await host.evaluate(() => window.callStart());
  assert.equal(offer.type, 'offer');
  const sections = offer.sdp.split(/\r?\n/u).filter((line) => line.startsWith('m='));
  assert.deepEqual(
    sections.map((line) => line.split(' ')[0]),
    ['m=audio'],
    'the offer holds exactly one audio section',
  );
  assert.match(offer.sdp, /a=rtpmap:\d+ opus\/48000/iu);
  assert.doesNotMatch(offer.sdp, /m=application/iu, 'no data channel');
  assert.match(offer.sdp, /a=fmtp:\d+ [^\r\n]*usedtx=1/iu, 'the offer asks the phone for Opus DTX');

  const answer = await phone.evaluate(async (sdp) => {
    const phone = window.__phone;
    const peer = new RTCPeerConnection({ iceServers: [] });
    phone.peer = peer;
    peer.addEventListener('track', (event) => {
      const audio = new Audio();
      audio.muted = true;
      audio.srcObject = new MediaStream([event.track]);
      void audio.play();
      const source = phone.context.createMediaStreamSource(new MediaStream([event.track]));
      const analyser = phone.context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      setInterval(() => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (const value of data) sum += value * value;
        phone.levels.push({
          at: performance.now(),
          rms: Math.sqrt(sum / data.length),
        });
      }, 50);
    });
    await peer.setRemoteDescription({ type: 'offer', sdp });
    const [transceiver] = peer.getTransceivers();
    await transceiver.sender.replaceTrack(phone.destination.stream.getAudioTracks()[0]);
    transceiver.direction = 'sendrecv';
    await peer.setLocalDescription(await peer.createAnswer());
    await new Promise((done) => {
      if (peer.iceGatheringState === 'complete') return done();
      peer.addEventListener('icegatheringstatechange', () => {
        if (peer.iceGatheringState === 'complete') done();
      });
      peer.addEventListener('icecandidate', (event) => {
        if (event.candidate) setTimeout(done, 1500);
      });
    });
    return peer.localDescription.sdp;
  }, offer.sdp);
  await host.evaluate((sdp) => window.callAnswer(sdp), answer);
  await host.waitForFunction(() => window.__events.states.includes('connected'), null, {
    timeout: 10_000,
  });
  timings.connectedMs = Date.now() - started;

  await host.waitForTimeout(800);
  const quiet = await host.evaluate(() => window.__events.pcm.length);
  await phone.evaluate(() => {
    window.__phone.gain.gain.value = 1;
  });
  await host.waitForTimeout(1500);
  const uplink = await host.evaluate(() => {
    const frames = window.__events.pcm.slice(-10).map((data) => {
      const binary = atob(data);
      const samples = new Int16Array(binary.length / 2);
      for (let index = 0; index < samples.length; index += 1)
        samples[index] =
          ((binary.charCodeAt(index * 2) | (binary.charCodeAt(index * 2 + 1) << 8)) << 16) >> 16;
      let sum = 0;
      for (const value of samples) sum += (value / 32768) ** 2;
      return { samples: samples.length, rms: Math.sqrt(sum / samples.length) };
    });
    return { frames: window.__events.pcm.length, last: frames };
  });
  assert.ok(quiet >= 3, `PCM flows while quiet (${quiet} frames)`);
  assert.ok(
    uplink.last.every((frame) => frame.samples === 1600),
    '100 ms frames at 16 kHz',
  );
  const uplinkRms = Math.max(...uplink.last.map((frame) => frame.rms));
  assert.ok(uplinkRms > 0.05, `speech reaches the Host (rms ${uplinkRms.toFixed(3)})`);
  await phone.evaluate(() => {
    window.__phone.gain.gain.value = 0;
  });

  const before = await phone.evaluate(() => window.__phone.levels.length);
  const reply = wav(1.2, 440).toString('base64');
  for (let offset = 0; offset < reply.length; offset += 48 * 1024)
    await host.evaluate(
      ([part]) => window.callAudio('p1', part),
      [reply.slice(offset, offset + 48 * 1024)],
    );
  const playStarted = Date.now();
  const played = await host.evaluate(() => window.callPlay('p1', 'audio/wav'));
  assert.equal(played.started, true);
  await host.waitForFunction(() => window.__events.played.length === 1, null, {
    timeout: 5_000,
  });
  timings.playbackMs = Date.now() - playStarted;
  const heard = await phone.evaluate((from) => window.__phone.levels.slice(from), before);
  const downlinkRms = Math.max(...heard.map((level) => level.rms));
  assert.ok(downlinkRms > 0.05, `the phone hears the Bot (rms ${downlinkRms.toFixed(3)})`);
  assert.deepEqual(await host.evaluate(() => window.__events.played), [
    { playback: 'p1', ok: true },
  ]);

  await host.evaluate(() => window.callAudio('p2', btoa('not audio')));
  await host.evaluate(() => window.callPlay('p2', 'audio/mpeg'));
  await host.waitForFunction(() => window.__events.played.length === 2);
  assert.deepEqual((await host.evaluate(() => window.__events.played))[1], {
    playback: 'p2',
    ok: false,
  });

  const level = async (from) => {
    const levels = await phone.evaluate((start) => window.__phone.levels.slice(start), from);
    const values = levels.map((entry) => entry.rms).sort((x, y) => x - y);
    return values[Math.floor(values.length / 2)] ?? 0;
  };
  const load = async (playback, seconds) => {
    const data = wav(seconds, 440).toString('base64');
    for (let offset = 0; offset < data.length; offset += 48 * 1024)
      await host.evaluate(
        ([id, part]) => window.callAudio(id, part),
        [playback, data.slice(offset, offset + 48 * 1024)],
      );
  };
  await load('p3', 3);
  await host.evaluate(() => window.callPlay('p3', 'audio/wav'));
  await host.waitForTimeout(500);
  let mark = await phone.evaluate(() => window.__phone.levels.length);
  await host.waitForTimeout(600);
  const full = await level(mark);
  await host.evaluate(() => window.callGain(0.3));
  await host.waitForTimeout(250);
  mark = await phone.evaluate(() => window.__phone.levels.length);
  await host.waitForTimeout(600);
  const ducked = await level(mark);
  await host.evaluate(() => window.callGain(1));
  await host.waitForTimeout(250);
  mark = await phone.evaluate(() => window.__phone.levels.length);
  await host.waitForTimeout(500);
  const restored = await level(mark);
  await host.waitForFunction(() => window.__events.played.length === 3, null, { timeout: 5_000 });
  assert.ok(
    ducked < full * 0.5 && ducked > full * 0.1,
    `barge-in duck lowers the Bot to about 30% (${full.toFixed(3)} → ${ducked.toFixed(3)})`,
  );
  assert.ok(restored > full * 0.7, `the volume comes back (${restored.toFixed(3)})`);

  await load('p4', 0.6);
  await load('p5', 0.6);
  await host.evaluate(() => window.callPlay('p4', 'audio/wav'));
  await host.waitForFunction(() => window.__events.played.length === 4, null, { timeout: 5_000 });
  await host.evaluate(() => window.callPlay('p5', 'audio/wav'));
  await host.waitForFunction(() => window.__events.played.length === 5, null, { timeout: 5_000 });
  assert.deepEqual(
    (await host.evaluate(() => window.__events.played)).slice(2),
    ['p3', 'p4', 'p5'].map((playback) => ({ playback, ok: true })),
    'clips play back to back',
  );
  const rate = async (ms) => {
    const sent = () =>
      host.evaluate(async () => {
        let uplink = 0;
        for (const report of (await peer.getStats()).values())
          if (report.kind === 'audio' && report.type === 'inbound-rtp')
            uplink = report.packetsReceived;
        return { at: performance.now(), uplink };
      });
    const received = () =>
      phone.evaluate(async () => {
        let downlink = 0;
        for (const report of (await window.__phone.peer.getStats()).values())
          if (report.kind === 'audio' && report.type === 'inbound-rtp')
            downlink = report.packetsReceived;
        return { at: performance.now(), downlink };
      });
    const [hostFirst, phoneFirst] = await Promise.all([sent(), received()]);
    await host.waitForTimeout(ms);
    const [hostLast, phoneLast] = await Promise.all([sent(), received()]);
    const per = (first, last, key) =>
      Number((((last[key] - first[key]) * 1000) / (last.at - first.at)).toFixed(1));
    return {
      uplink: per(hostFirst, hostLast, 'uplink'),
      downlink: per(phoneFirst, phoneLast, 'downlink'),
    };
  };
  await host.evaluate(() => {
    const silent = playContext.createGain();
    silent.gain.value = 0;
    const tone = playContext.createOscillator();
    tone.connect(silent).connect(destination);
    tone.start();
  });
  await host.waitForTimeout(1000);
  const quietRate = await rate(4000);
  await phone.evaluate(() => {
    window.__phone.gain.gain.value = 1;
  });
  await host.waitForTimeout(300);
  const talkingRate = await rate(2000);
  await phone.evaluate(() => {
    window.__phone.gain.gain.value = 0;
  });
  const pcmBeforeQuiet = await host.evaluate(() => window.__events.pcm.length);
  await host.waitForTimeout(1000);
  const pcmDuringQuiet = (await host.evaluate(() => window.__events.pcm.length)) - pcmBeforeQuiet;
  assert.ok(talkingRate.uplink >= 40, `speech sends every frame (${talkingRate.uplink}/s)`);
  assert.ok(
    quietRate.uplink <= 10,
    `a silent phone sends DTX packets only (${quietRate.uplink}/s)`,
  );
  assert.ok(
    quietRate.downlink <= 10,
    `the phone receives only DTX packets from a silent Host (${quietRate.downlink}/s)`,
  );
  assert.ok(pcmDuringQuiet >= 8, `the Host VAD still gets PCM in DTX gaps (${pcmDuringQuiet}/s)`);

  const stats = await host.evaluate(() => window.callStats());
  assert.equal(stats.state, 'connected');
  assert.ok(stats.bytesReceived > 0 && stats.bytesSent > 0);

  await phone.evaluate(() => window.__phone.peer.close());
  await host.waitForFunction(() => window.__events.states.includes('failed'), null, {
    timeout: 30_000,
  });
  const result = {
    ok: true,
    offerSections: sections.length,
    uplink: { frames: uplink.frames, rms: Number(uplinkRms.toFixed(3)) },
    downlink: { rms: Number(downlinkRms.toFixed(3)) },
    duck: {
      full: Number(full.toFixed(3)),
      ducked: Number(ducked.toFixed(3)),
      restored: Number(restored.toFixed(3)),
    },
    packetsPerSecond: { quiet: quietRate, talking: talkingRate },
    timings,
    stats: {
      path: stats.path,
      bytesReceived: stats.bytesReceived,
      bytesSent: stats.bytesSent,
    },
  };
  console.log(process.argv.includes('--json') ? JSON.stringify(result) : result);
} finally {
  await browser.close();
  server.close();
}
