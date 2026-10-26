import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const usage = `Usage: node scripts/perf-idle-timeline.mjs [options]

Measures how much main-thread work an open, idle Bot mode Group conversation costs,
and how fast typing in its composer is. Targets a task-owned Host:
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json (from verify-app launch).

  --messages <n>      Messages to seed in a new Group (default 600). Ignored with --fixture.
  --fixture <file>    Reuse a Group seeded by an earlier run (its fixture.json).
  --load-all          Scroll to the top until the whole history is mounted (default on).
  --no-load-all       Keep only the opening window mounted.
  --seconds <n>       Idle measurement window (default 15).
  --animate           Add one small infinite CSS animation, standing in for Tob or a
                      working indicator, so per-frame cost becomes visible.
  --trace             Save a Chrome trace of the idle window (open in DevTools).
  --profile           Save a CPU profile of the idle window and list the hottest functions.
  --scroll-check      After mounting, scroll from the latest message to the top one viewport at a
                      time and report scroll jumps and skipped blocks left in view (on by
                      default with --load-all; --no-scroll-check turns it off).
  --label <name>      Evidence label (default "run"); use main/fix for AB pairs.
  --out <dir>         Evidence directory (default .humanlayer/perf/idle-timeline).

Prints one JSON summary on stdout and writes <label>.json next to any trace/profile.`;

const { values: options } = parseArgs({
  options: {
    messages: { type: 'string', default: '600' },
    fixture: { type: 'string' },
    'load-all': { type: 'boolean', default: true },
    'no-load-all': { type: 'boolean', default: false },
    seconds: { type: 'string', default: '15' },
    animate: { type: 'boolean', default: false },
    trace: { type: 'boolean', default: false },
    profile: { type: 'boolean', default: false },
    'scroll-check': { type: 'boolean', default: true },
    'no-scroll-check': { type: 'boolean', default: false },
    label: { type: 'string', default: 'run' },
    out: { type: 'string', default: '.humanlayer/perf/idle-timeline' },
    help: { type: 'boolean', default: false },
  },
});
if (options.help) {
  console.log(usage);
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const store = resolve(root, 'node_modules/.pnpm');
const pkg = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(store, pkg, 'node_modules/'))('puppeteer');
assert.ok(process.env.BH_E2E_INSTANCE, 'Set BH_E2E_INSTANCE to the task-owned instance.json');
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const out = resolve(options.out);
mkdirSync(out, { recursive: true });
const seconds = Number(options.seconds);
const loadAll = options['load-all'] && !options['no-load-all'];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const bodies = [
  (i) => `Status ${i}: the build passed. Next I will **review the diff** and report back.`,
  (i) =>
    `Plan for item ${i}:\n\n1. Read \`packages/client/src/client/bot-main.tsx\`\n2. Measure the idle cost\n3. Compare with main\n\n> Note: keep the change small and reversible.`,
  (i) =>
    `Here is the snippet for ${i}:\n\n\`\`\`ts\nexport function sum(values: readonly number[]): number {\n  let total = 0;\n  for (const value of values) total += value;\n  return total;\n}\n\`\`\`\n\nIt runs in O(n).`,
  (i) =>
    `| Metric | Before | After |\n| --- | --- | --- |\n| Task ${i} | 108% | 4% |\n| Heap | 1.1 GB | 300 MB |\n\nSee [the issue](https://github.com/BotHarness/DeepSeekBot/issues/2413).`,
  (i) =>
    `Short reply ${i}. 中文内容也要覆盖：这条消息用来测试中英文混排的渲染成本，以及较长段落的换行。`,
];

async function scrollCheck() {
  const result = await page.$eval('.bh-chat-body', async (body) => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => done(undefined)));
    const firstVisible = () => {
      const top = body.getBoundingClientRect().top;
      for (const node of body.querySelectorAll('[data-message-id]')) {
        if (node.closest('[data-offscreen]')) continue;
        const bounds = node.getBoundingClientRect();
        if (bounds.bottom > top) return { id: node.dataset.messageId, y: bounds.top };
      }
      return undefined;
    };
    body.scrollTop = body.scrollHeight;
    await frame();
    await frame();
    let steps = 0;
    let jumps = 0;
    let maxJumpPx = 0;
    let skippedInView = 0;
    let emptyInView = 0;
    while (body.scrollTop > 0 && steps < 2000) {
      body.scrollTop = Math.max(0, body.scrollTop - body.clientHeight);
      steps += 1;
      await frame();
      const before = firstVisible();
      await frame();
      await frame();
      const after = firstVisible();
      if (before && after && before.id === after.id) {
        const moved = Math.abs(after.y - before.y);
        if (moved > 1) jumps += 1;
        maxJumpPx = Math.max(maxJumpPx, moved);
      }
      const view = body.getBoundingClientRect();
      for (const block of body.querySelectorAll('.bh-message-block')) {
        const bounds = block.getBoundingClientRect();
        if (bounds.bottom < view.top || bounds.top > view.bottom) continue;
        if (block.dataset.offscreen !== undefined) skippedInView += 1;
        if (bounds.height === 0) emptyInView += 1;
      }
    }
    body.scrollTop = body.scrollHeight;
    await frame();
    return { steps, jumps, maxJumpPx: Math.round(maxJumpPx), skippedInView, emptyInView };
  });
  await sleep(1000);
  return result;
}

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--lang=en-US', '--enable-precise-memory-info'],
  protocolTimeout: 600_000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function rpc(method, args = {}) {
  return page.evaluate(
    async (method, args) => {
      const response = await fetch(`/api/botharness/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: `botharness/${method}`,
          payload: { args },
        }),
      });
      const envelope = await response.json();
      if (!envelope.result?.ok) throw Error(`${method}: ${JSON.stringify(envelope.result)}`);
      return envelope.result.value;
    },
    method,
    args,
  );
}

async function dismissOverlays() {
  for (let index = 0; index < 6; index++) {
    for (const label of ['Continue', 'Configure later', 'Skip tutorial', 'Skip']) {
      const button = await page.$(`::-p-aria(${label})`);
      if (button && (await button.isVisible().catch(() => false)))
        await button.click().catch(() => {});
    }
    await sleep(150);
  }
}

async function seed(count) {
  const bots = [];
  for (const name of ['Perf Ada', 'Perf Lin', 'Perf Kai'])
    bots.push((await rpc('create', { displayName: `${name} ${Date.now() % 100000}` })).bot);
  const group = (
    await rpc('channelCreate', {
      name: `Idle perf ${count}`,
      members: bots.map((bot) => bot.slug),
    })
  ).channel;
  for (const bot of bots)
    await rpc('channelGroupWakeSet', {
      channelId: group.id,
      botSlug: bot.slug,
      mode: 'silent',
      count: 5,
      intervalSeconds: 30,
    });
  const ids = [];
  let source;
  for (let index = 0; index < count; index++) {
    if (index % 5 === 0) {
      const sent = await rpc('channelSend', {
        channelId: group.id,
        body: `Human check-in ${index + 1}: how is it going?`,
      });
      source = sent.message?.id ?? sent.messageId ?? sent.id;
      assert.ok(source, JSON.stringify(sent));
      ids.push(source);
      continue;
    }
    const bot = bots[index % bots.length];
    const run = await rpc('botToolRun', {
      slug: bot.slug,
      tool: 'bot_send_message',
      args: {
        channel_id: group.id,
        body: bodies[index % bodies.length](index + 1),
        reply_to: source,
      },
    });
    assert.ok(run.result?.messageId, JSON.stringify(run));
    ids.push(run.result.messageId);
    if ((index + 1) % 100 === 0) console.error(`seeded ${index + 1}/${count}`);
  }
  await rpc('channelMarkRead', { channelId: group.id, messageId: ids.at(-1) });
  return { channelId: group.id, messageIds: ids, bots: bots.map((bot) => bot.slug) };
}

async function startProfile(cdp) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
}

async function stopProfile(cdp, phase) {
  const { profile } = await cdp.send('Profiler.stop');
  writeFileSync(resolve(out, `${options.label}.${phase}.cpuprofile`), JSON.stringify(profile));
  const self = new Map();
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  profile.samples.forEach((id, index) => {
    const frame = byId.get(id).callFrame;
    if (['(idle)', '(program)', '(root)'].includes(frame.functionName)) return;
    const key = `${frame.functionName || '(anonymous)'} ${frame.url.split(/[/?&]/).find((part) => /\.m?js$/.test(part)) ?? ''}:${frame.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[index] ?? 0) / 1000);
  });
  return [...self]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([name, ms]) => ({ name, ms: Math.round(ms) }));
}

const metric = (list, name) => list.metrics.find((item) => item.name === name)?.value ?? 0;

try {
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await dismissOverlays();

  const fixture = options.fixture
    ? JSON.parse(readFileSync(options.fixture, 'utf8'))
    : await seed(Number(options.messages));
  if (!options.fixture) writeFileSync(resolve(out, 'fixture.json'), JSON.stringify(fixture));

  await page.reload({ waitUntil: 'networkidle2' });
  await dismissOverlays();
  if (!(await page.$('.bh-workspace-rail'))) await page.locator('::-p-aria(Bot mode)').click();
  await page.waitForSelector('.bh-workspace-rail');
  await dismissOverlays();
  const messagesButton = await page.$('.bh-workspace-rail button[aria-label="Messages"]');
  if (messagesButton) await messagesButton.click();
  const row = `[data-dock-panel="bh:channels"] button[data-channel-id="${fixture.channelId}"]`;
  await page.waitForSelector(row);
  await page.locator(row).click();
  await page.waitForSelector('.bh-chat-body [data-message-id]');
  await sleep(1500);

  if (loadAll) {
    let mounted = 0;
    for (let attempt = 0; attempt < 200; attempt++) {
      await page.$eval('.bh-chat-body', (node) => {
        node.scrollTop = 0;
      });
      await sleep(500);
      const now = await page.$$eval('.bh-chat-body [data-message-id]', (nodes) => nodes.length);
      if (now >= fixture.messageIds.length) break;
      if (now === mounted && attempt > 2)
        throw new Error(
          `Mounted ${now} of ${fixture.messageIds.length} messages before measurement`,
        );
      mounted = now;
    }
    await page.$eval('.bh-chat-body', (node) => {
      node.scrollTop = node.scrollHeight;
    });
  }
  const scroll =
    loadAll && options['scroll-check'] && !options['no-scroll-check']
      ? await scrollCheck()
      : undefined;
  if (options.animate)
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent =
        '@keyframes perf-bob{from{transform:translateY(0)}to{transform:translateY(6px)}}' +
        '.perf-animated{position:fixed;right:24px;bottom:24px;width:16px;height:16px;' +
        'border-radius:50%;background:currentColor;animation:perf-bob .6s ease-in-out infinite alternate}';
      document.head.append(style);
      const node = document.createElement('div');
      node.className = 'perf-animated';
      document.body.append(node);
    });
  await sleep(3000);

  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
  if (options.profile) await startProfile(cdp);
  const traceFile = resolve(out, `${options.label}.trace.json`);
  if (options.trace)
    await page.tracing.start({
      path: traceFile,
      categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc'],
    });
  const before = await cdp.send('Performance.getMetrics');
  const started = Date.now();
  await sleep(seconds * 1000);
  const after = await cdp.send('Performance.getMetrics');
  const elapsed = (Date.now() - started) / 1000;
  if (options.trace) await page.tracing.stop();
  const idleHottest = options.profile ? await stopProfile(cdp, 'idle') : undefined;
  const delta = (name) => metric(after, name) - metric(before, name);
  const dom = await page.evaluate(() => ({
    mountedMessages: document.querySelectorAll('.bh-chat-body [data-message-id]').length,
    nodes: document.getElementsByTagName('*').length,
    skippedBlocks: document.querySelectorAll('.bh-message-block[data-offscreen]').length,
  }));

  await page.$eval('.bh-chat-body', (node) => {
    node.scrollTop = node.scrollHeight;
  });
  const composer = '.bh-chat-pane .bh-composer [contenteditable="true"], .bh-chat-pane textarea';
  await page.waitForSelector(composer);
  await page.focus(composer);
  await page.evaluate(() => {
    window.__perfEvents = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (['keydown', 'keypress', 'input', 'keyup'].includes(entry.name))
          window.__perfEvents.push(entry.duration);
    }).observe({ type: 'event', durationThreshold: 16, buffered: false });
  });
  if (options.profile) await startProfile(cdp);
  const typedBefore = await cdp.send('Performance.getMetrics');
  await page.keyboard.type('the quick brown fox jumps over the lazy dog', { delay: 60 });
  await sleep(500);
  const typedAfter = await cdp.send('Performance.getMetrics');
  const typingHottest = options.profile ? await stopProfile(cdp, 'typing') : undefined;
  const typed = (name) => metric(typedAfter, name) - metric(typedBefore, name);
  const typing = await page.evaluate(() => {
    const sorted = [...window.__perfEvents].sort((a, b) => a - b);
    const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
    return { slowEvents: sorted.length, p50: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
  });
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');

  const summary = {
    label: options.label,
    channelId: fixture.channelId,
    seeded: fixture.messageIds.length,
    animate: options.animate,
    seconds: Number(elapsed.toFixed(1)),
    ...dom,
    mainThreadBusyPct: Number(((delta('TaskDuration') / elapsed) * 100).toFixed(1)),
    scriptMs: Math.round(delta('ScriptDuration') * 1000),
    layoutMs: Math.round(delta('LayoutDuration') * 1000),
    recalcStyleMs: Math.round(delta('RecalcStyleDuration') * 1000),
    layouts: delta('LayoutCount'),
    styleRecalcs: delta('RecalcStyleCount'),
    frames: delta('FrameCount') || undefined,
    heapMB: Math.round(metric(after, 'JSHeapUsedSize') / 1e6),
    typing: {
      ...typing,
      scriptMs: Math.round(typed('ScriptDuration') * 1000),
      layoutMs: Math.round(typed('LayoutDuration') * 1000),
      recalcStyleMs: Math.round(typed('RecalcStyleDuration') * 1000),
      hottest: typingHottest,
    },
    scroll,
    idleHottest,
    trace: options.trace ? traceFile : undefined,
    pageErrors: errors,
  };
  writeFileSync(resolve(out, `${options.label}.json`), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
}
