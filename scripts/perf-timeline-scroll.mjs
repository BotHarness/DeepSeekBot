import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { openTimelineConversation } from './perf-timeline-navigation.mjs';

export const usage = `Usage: node scripts/perf-timeline-scroll.mjs --fixture <file> [options]

Measures main-thread work and frame pacing while wheel-scrolling a Bot mode Group conversation.
Targets a task-owned Host: BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json. Seed the
Group once with scripts/perf-idle-timeline.mjs and pass its fixture.json.

  --fixture <file>     Group seeded by perf-idle-timeline (required).
  --mode <cold|loaded> cold: open the Group and wheel up to the first message while older pages
                       load. loaded: mount the whole history first, then wheel up and back down
                       through it (default loaded).
  --distance <px>      loaded mode: distance per direction (default 20000).
  --step <px>          Wheel delta per tick (default 120, one mouse-wheel notch).
  --cpu-throttle <n>   CDP CPU throttling rate (default 1).
  --profile            Save a CPU profile of the scroll window and list the hottest functions.
  --trace              Save a Chrome trace of the scroll window.
  --geometry           Check every painted frame for blank gaps and anchor jumps. A jump is a
                       message that moved by neither the scrollTop change nor a whole number of
                       wheel steps, so scroll-anchoring corrections above the view do not count.
                       The checks read layout, so keep timing runs without it.
  --headed             Open a real browser window (use under Xvfb or on a desktop).
  --uncapped           Lift the vsync frame-rate cap so each rAF interval is the time the page
                       needed to produce that frame. Use it to judge the 8.3 ms (120 Hz) and
                       16.7 ms (60 Hz) budgets; capped runs cannot show a frame under one vsync.
  --label <name>       Evidence label (default "run").
  --out <dir>          Evidence directory (default .humanlayer/perf/timeline-scroll).

Wheel events are trusted CDP input. Frame metrics are rAF intervals and Long Animation Frames
recorded in the page: they show main-thread jank, not presented FPS.`;

const { values: options } = parseArgs({
  options: {
    fixture: { type: 'string' },
    mode: { type: 'string', default: 'loaded' },
    distance: { type: 'string', default: '20000' },
    step: { type: 'string', default: '120' },
    'cpu-throttle': { type: 'string', default: '1' },
    profile: { type: 'boolean', default: false },
    trace: { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    geometry: { type: 'boolean', default: false },
    uncapped: { type: 'boolean', default: false },
    label: { type: 'string', default: 'run' },
    out: { type: 'string', default: '.humanlayer/perf/timeline-scroll' },
    help: { type: 'boolean', default: false },
  },
});
if (options.help) {
  console.log(usage);
  process.exit(0);
}
assert.ok(options.fixture, '--fixture is required');
assert.ok(['cold', 'loaded'].includes(options.mode), '--mode is cold or loaded');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const store = resolve(root, 'node_modules/.pnpm');
const pkg = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(store, pkg, 'node_modules/'))('puppeteer');
assert.ok(process.env.BH_E2E_INSTANCE, 'Set BH_E2E_INSTANCE to the task-owned instance.json');
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const fixture = JSON.parse(readFileSync(options.fixture, 'utf8'));
const out = resolve(options.out);
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const step = Number(options.step);
const distance = Number(options.distance);

const browser = await puppeteer.launch({
  headless: !options.headed,
  args: [
    '--no-sandbox',
    '--lang=en-US',
    '--enable-precise-memory-info',
    ...(options.uncapped ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []),
  ],
  protocolTimeout: 600_000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function dismissOverlays() {
  for (let index = 0; index < 6; index++) {
    for (const label of [
      'Continue',
      'Configure later',
      'Skip tutorial',
      'Skip',
      'Don’t show again',
    ]) {
      const button = await page.$(`::-p-aria(${label})`);
      if (button && (await button.isVisible().catch(() => false)))
        await button.click().catch(() => {});
    }
    await sleep(150);
  }
}

function hottest(profile) {
  const self = new Map();
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  profile.samples.forEach((id, index) => {
    const frame = byId.get(id).callFrame;
    if (['(idle)', '(program)', '(root)'].includes(frame.functionName)) return;
    const file = frame.url.split(/[/?&]/).find((part) => /\.m?js$/.test(part)) ?? '';
    const key = `${frame.functionName || '(anonymous)'} ${file}:${frame.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[index] ?? 0) / 1000);
  });
  return [...self]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 15)
    .map(([name, ms]) => ({ name, ms: Math.round(ms) }));
}

const metric = (list, name) => list.metrics.find((item) => item.name === name)?.value ?? 0;
const loaded = () =>
  page.$eval('.bh-chat-body', (node) =>
    Number(node.dataset.loadedMessages ?? node.querySelectorAll('[data-message-id]').length),
  );

async function installRecorder(geometry, step) {
  await page.evaluate(
    (geometry, step) => {
      const pane = document.querySelector('.bh-chat-body');
      const state = {
        raf: [],
        last: 0,
        gapFrames: 0,
        maxGapPx: 0,
        loaf: [],
        jumps: 0,
        maxJumpPx: 0,
      };
      let anchor;
      const frame = (now) => {
        if (state.last) state.raf.push(now - state.last);
        state.last = now;
        state.id = requestAnimationFrame(frame);
        if (geometry) painted.port2.postMessage(0);
      };
      const painted = new MessageChannel();
      painted.port1.onmessage = () => {
        const view = pane.getBoundingClientRect();
        let gap = 0;
        for (const node of pane.querySelectorAll('.bh-timeline-gap')) {
          const bounds = node.getBoundingClientRect();
          gap += Math.max(0, Math.min(bounds.bottom, view.bottom) - Math.max(bounds.top, view.top));
        }
        if (gap > 0) state.gapFrames++;
        state.maxGapPx = Math.max(state.maxGapPx, gap);
        if (anchor !== undefined) {
          const node = anchor.node.isConnected ? anchor.node : undefined;
          if (node !== undefined) {
            const top = node.getBoundingClientRect().top;
            const shifted = top - anchor.y;
            const notches = Math.round(shifted / step);
            const moved = Math.min(
              Math.abs(top - (anchor.y - (pane.scrollTop - anchor.scrollTop))),
              Math.abs(shifted - notches * step),
            );
            if (moved > 1) {
              state.jumps++;
              state.maxJumpPx = Math.max(state.maxJumpPx, moved);
            }
          }
        }
        anchor = undefined;
        for (const node of pane.querySelectorAll('[data-message-id]')) {
          const bounds = node.getBoundingClientRect();
          if (bounds.bottom > view.top && bounds.top < view.bottom) {
            anchor = { node, y: bounds.top, scrollTop: pane.scrollTop };
            break;
          }
        }
      };
      state.id = requestAnimationFrame(frame);
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          state.loaf.push({
            duration: entry.duration,
            blocking: entry.blockingDuration,
          });
      });
      try {
        observer.observe({ type: 'long-animation-frame' });
      } catch {}
      window.__scrollBench = () => {
        cancelAnimationFrame(state.id);
        observer.disconnect();
        return state;
      };
    },
    geometry,
    step,
  );
}

function share(intervals, budget) {
  const over = intervals.filter((ms) => ms > budget).length;
  return Math.round((over / Math.max(1, intervals.length)) * 1000) / 10;
}

function summarize(state) {
  const raf = [...state.raf].sort((a, b) => a - b);
  const at = (q) => Math.round(raf[Math.min(raf.length - 1, Math.floor(raf.length * q))] * 10) / 10;
  const loaf = state.loaf;
  return {
    frames: raf.length,
    rafP50: at(0.5),
    rafP95: at(0.95),
    rafP99: at(0.99),
    rafMax: Math.round(raf.at(-1) ?? 0),
    slowFrames: raf.filter((ms) => ms > 25).length,
    slowFramePct: share(raf, 25),
    over8Pct: share(raf, 1000 / 120),
    over16Pct: share(raf, 1000 / 60),
    over50: raf.filter((ms) => ms > 50).length,
    longFrames: loaf.length,
    longFrameBlockingMs: Math.round(loaf.reduce((sum, entry) => sum + entry.blocking, 0)),
    longFrameMaxMs: Math.round(Math.max(0, ...loaf.map((entry) => entry.duration))),
    gapFrames: state.gapFrames,
    maxGapPx: Math.round(state.maxGapPx),
    jumps: state.jumps,
    maxJumpPx: Math.round(state.maxJumpPx),
  };
}

let summary;
try {
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await dismissOverlays();
  await openTimelineConversation(page, fixture.channelId, dismissOverlays);
  await sleep(1500);

  if (options.mode === 'loaded') {
    let mounted = 0;
    for (let attempt = 0; attempt < 200; attempt++) {
      await page.$eval('.bh-chat-body', (node) => {
        node.scrollTop = 0;
      });
      await page.waitForFunction(
        (previous) =>
          Number(document.querySelector('.bh-chat-body')?.dataset.loadedMessages ?? 0) > previous,
        { timeout: 30_000 },
        mounted,
      );
      const now = await loaded();
      if (now >= fixture.messageIds.length) break;
      mounted = now;
    }
    await page.$eval('.bh-chat-body', (node) => {
      node.scrollTop = node.scrollHeight;
    });
    await page.$eval('.bh-chat-body', async (body) => {
      const frame = () => new Promise((done) => requestAnimationFrame(() => done(undefined)));
      while (body.scrollTop > 0) {
        body.scrollTop = Math.max(0, body.scrollTop - body.clientHeight);
        await frame();
        await frame();
      }
      body.scrollTop = body.scrollHeight;
      await frame();
    });
    await sleep(1500);
  }

  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
  await cdp.send('Emulation.setCPUThrottlingRate', {
    rate: Number(options['cpu-throttle']),
  });
  const body = await page.$('.bh-chat-body');
  const box = await body.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  if (options.profile) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
  }
  if (options.trace)
    await page.tracing.start({
      path: resolve(out, `${options.label}.trace.json`),
      categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc'],
    });
  await installRecorder(options.geometry, step);
  const before = await cdp.send('Performance.getMetrics');
  const started = performance.now();
  let ticks = 0;
  let scrolled = 0;
  const tick = async (deltaY) => {
    await page.mouse.wheel({ deltaY });
    ticks++;
    await sleep(16);
  };
  if (options.mode === 'cold') {
    for (let index = 0; index < 4000; index++) {
      await tick(-step);
      scrolled += step;
      if (index % 20 === 19) {
        const state = await page.$eval('.bh-chat-body', (node) => ({
          top: node.scrollTop,
          loaded: Number(node.dataset.loadedMessages ?? 0),
        }));
        if (state.top <= 0 && state.loaded >= fixture.messageIds.length) break;
      }
    }
  } else {
    for (let moved = 0; moved < distance; moved += step) await tick(-step);
    for (let moved = 0; moved < distance; moved += step) await tick(step);
    scrolled = distance * 2;
  }
  await sleep(500);
  const elapsedMs = performance.now() - started;
  const after = await cdp.send('Performance.getMetrics');
  const state = await page.evaluate(() => window.__scrollBench());
  if (options.trace) await page.tracing.stop();
  const hot = options.profile
    ? await cdp.send('Profiler.stop').then(({ profile }) => {
        writeFileSync(resolve(out, `${options.label}.cpuprofile`), JSON.stringify(profile));
        return hottest(profile);
      })
    : undefined;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const delta = (name) => Math.round((metric(after, name) - metric(before, name)) * 1000);
  const dom = await page.evaluate(() => ({
    loadedMessages: Number(document.querySelector('.bh-chat-body')?.dataset.loadedMessages ?? 0),
    mountedMessages: document.querySelectorAll('.bh-chat-body [data-message-id]').length,
    nodes: document.getElementsByTagName('*').length,
    scrollTop: Math.round(document.querySelector('.bh-chat-body')?.scrollTop ?? -1),
  }));
  summary = {
    label: options.label,
    mode: options.mode,
    geometry: options.geometry,
    cpuThrottle: Number(options['cpu-throttle']),
    uncapped: options.uncapped,
    ticks,
    scrolledPx: scrolled,
    elapsedMs: Math.round(elapsedMs),
    taskMs: delta('TaskDuration'),
    scriptMs: delta('ScriptDuration'),
    layoutMs: delta('LayoutDuration'),
    recalcStyleMs: delta('RecalcStyleDuration'),
    layouts: Math.round(metric(after, 'LayoutCount') - metric(before, 'LayoutCount')),
    styleRecalcs: Math.round(
      metric(after, 'RecalcStyleCount') - metric(before, 'RecalcStyleCount'),
    ),
    busyPct: Math.round((delta('TaskDuration') / elapsedMs) * 1000) / 10,
    ...summarize(state),
    ...dom,
    hottest: hot,
    pageErrors: errors,
  };
  writeFileSync(resolve(out, `${options.label}.json`), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
}
