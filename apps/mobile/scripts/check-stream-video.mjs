import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const video = option('--video');
const start = Number(option('--start', 4));
const seconds = Number(option('--seconds', 6));
const scenario = option('--case', 'streaming');
if (
  !video ||
  !Number.isFinite(start) ||
  start < 0 ||
  !Number.isFinite(seconds) ||
  seconds <= 0 ||
  seconds > 15 ||
  !['streaming', 'rich', 'complete-wait', 'complete-ready'].includes(scenario)
)
  throw new Error(
    'Usage: check-stream-video.mjs --video <dark-portrait-qa.mp4> [--start 4] [--seconds 6] [--case streaming|rich|complete-wait|complete-ready] [--out <json>]',
  );
const width = 244,
  height = 542,
  fps = 30;
const decoded = spawnSync(
  'ffmpeg',
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    String(start),
    '-i',
    video,
    '-t',
    String(seconds),
    '-vf',
    `fps=${fps},scale=${width}:${height}`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    'pipe:1',
  ],
  { maxBuffer: 200 * 1024 * 1024 },
);
if (decoded.error || decoded.status !== 0)
  throw new Error('VIDEO_DECODE_FAILED: ' + (decoded.error?.message ?? decoded.stderr.toString()));
const bytes = width * height * 3;
const samples = [];
for (let frame = 0; frame < Math.floor(decoded.stdout.length / bytes); frame++) {
  let ink = 0,
    bubble = 0;
  for (let y = 100; y < 440; y++)
    for (let x = 10; x < 175; x++) {
      const offset = frame * bytes + (y * width + x) * 3;
      const r = decoded.stdout[offset],
        g = decoded.stdout[offset + 1],
        b = decoded.stdout[offset + 2];
      if (r > 175 && g > 175 && b > 175) ink++;
      if (r >= 35 && r <= 95 && Math.abs(r - g) < 15 && Math.abs(g - b) < 15) bubble++;
    }
  samples.push({ at: start + frame / fps, ink, bubble });
}
const occupied = samples.filter((sample) => sample.bubble > 30000);
const peakInk = Math.max(0, ...occupied.map((sample) => sample.ink));
const blank = occupied.filter((sample) => sample.ink < Math.max(100, peakInk * 0.1));
const completeWindow = samples.length === Math.round(seconds * fps);
const pass =
  scenario === 'complete-wait'
    ? completeWindow && occupied.length === 0
    : completeWindow &&
      occupied.length >= samples.length * 0.9 &&
      peakInk > (scenario === 'rich' ? 500 : 1500) &&
      blank.length === 0;
const summary = {
  scenario,
  start,
  seconds,
  frames: samples.length,
  occupiedFrames: occupied.length,
  peakInk,
  blankFrames: blank.length,
  pass,
};
const out = option('--out');
if (out) writeFileSync(out, JSON.stringify({ summary, samples }, null, 2));
console.log(JSON.stringify(summary));
if (!pass) process.exitCode = 1;
