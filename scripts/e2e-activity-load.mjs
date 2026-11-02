import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { assignmentProbe, installed } from './e2e-assignment-probe.mjs';

assert.ok(process.env.BH_E2E_INSTANCE);
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const { rpc } = assignmentProbe({ origin: new URL(instance.url).origin, home: instance.home });
const baseline = process.env.BH_LOAD_BASELINE === '1';
const out = resolve(
  dirname(process.env.BH_E2E_INSTANCE),
  'evidence',
  'activity-load-' + Date.now(),
);
mkdirSync(out, { recursive: true });
const save = (name, value) =>
  writeFileSync(resolve(out, name + '.json'), JSON.stringify(value, null, 2));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ??
  0;
const wait = async (test, label, timeout = 15000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await test();
    if (value) return value;
    await sleep(50);
  }
  throw Error('Timed out: ' + label);
};
let bot;
let channels;
if (process.env.BH_LOAD_REUSE === '1') {
  bot = (await rpc('list')).bots.find((b) => b.displayName === 'Load QA');
  channels = (await rpc('channels')).channels
    .filter((c) => /^Load \d{2}$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  assert.equal(channels.length, 24);
} else {
  bot = (
    await rpc('create', {
      displayName: 'Load QA',
      persona: 'Disposable load fixture. No model execution requested.',
    })
  ).bot;
  channels = [];
  for (let n = 0; n < 24; n++) {
    const channel = (
      await rpc('channelCreate', {
        name: 'Load ' + String(n).padStart(2, '0'),
        members: [bot.slug],
      })
    ).channel;
    await rpc('channelGroupWakeSet', {
      channelId: channel.id,
      botSlug: bot.slug,
      mode: 'silent',
      count: 20,
      intervalSeconds: 300,
    });
    await rpc('channelSend', {
      channelId: channel.id,
      body: 'Load fixture source event; do not respond.',
    });
    channels.push(channel);
  }
}
const send = async (channel, body) => {
  const start = performance.now();
  const value = await rpc('botToolRun', {
    slug: bot.slug,
    tool: 'bot_send_message',
    args: { channel_id: channel.id, body },
  });
  assert.equal(value.result.status, 'committed');
  return {
    latency: performance.now() - start,
    messageId: value.result.messageId,
    channelId: channel.id,
    body,
  };
};
await Promise.all(channels.map((channel, n) => send(channel, 'LOAD_WARMUP_' + n)));
const browser = await installed('puppeteer').launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
await cdp.send('Performance.enable');
const sockets = [];
const errors = [];
const consoleMessages = [];
const requests = [];
const queryTimes = [];
const queryRecords = [];
const started = new Map();
const networkPending = new Map();
page.on('request', (r) =>
  networkPending.set(r, { url: new URL(r.url()).pathname, at: Date.now(), type: r.resourceType() }),
);
page.on('requestfinished', (r) => networkPending.delete(r));
page.on('requestfailed', (r) => networkPending.delete(r));
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => consoleMessages.push({ type: m.type(), text: m.text() }));
page.on('request', (r) => {
  if (r.url().endsWith('/humanAttention')) {
    requests.push(Date.now());
    started.set(r, performance.now());
  }
});
page.on('response', (r) => {
  const t = started.get(r.request());
  if (t !== undefined) {
    queryTimes.push(performance.now() - t);
    queryRecords.push({ elapsed: performance.now() - t, timing: r.timing(), status: r.status() });
    started.delete(r.request());
  }
});
cdp.on('Network.webSocketFrameReceived', () => {
  proofFrames++;
});
let proofFrames = 0;
cdp.on('Network.webSocketCreated', (e) => sockets.push(new URL(e.url).pathname));
const click = async (name) => {
  for (const b of await page.$$(`::-p-aria([name=${JSON.stringify(name)}][role="button"])`))
    if (await b.isVisible()) {
      await b.click();
      return;
    }
  throw Error('Missing control ' + name);
};
const shot = async (name) => {
  await page.screenshot({ path: resolve(out, name + '.png') });
  save(name + '-aria', await page.accessibility.snapshot());
};
const metrics = async () =>
  Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]),
  );
const proof = {
  sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  baseline,
  channels: 24,
  messagesPerRound: 240,
  rounds: [],
  sockets,
  errors,
};
try {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="Bot 模式"]');
  const dismiss = async () => {
    for (let n = 0; n < 6; n++) {
      const name = await page.evaluate(() =>
        [...document.querySelectorAll('button')]
          .find(
            (b) =>
              b.offsetParent !== null &&
              ['继续', '稍后配置', '跳过教程', '跳过引导', '稍后继续'].includes(
                b.textContent.trim(),
              ),
          )
          ?.textContent.trim(),
      );
      if (!name) return;
      await click(name);
      await sleep(250);
    }
  };
  await sleep(500);
  await dismiss();
  await click('Bot 模式');
  await sleep(1000);
  await dismiss();
  const label = await page.evaluate(() =>
    [...document.querySelectorAll('button[aria-label^="活动中心"]')]
      .find((e) => e.offsetParent !== null)
      ?.getAttribute('aria-label'),
  );
  await click(label);
  await page.waitForSelector('[data-attention-id]');
  await sleep(1500);
  const initialQueries = requests.length;
  await sleep(12000);
  proof.idleQueries = requests.length - initialQueries;
  if (!baseline) assert.equal(proof.idleQueries, 0, 'healthy idle does not poll');
  await shot('loaded-24-channels');
  await cdp.send('HeapProfiler.collectGarbage');
  proof.heapBeforeLoad = (await metrics()).JSHeapUsedSize;
  await page.evaluate(() => {
    window.qaPerf = {
      frames: [],
      longTasks: [],
      loadingMutations: 0,
      lastFrame: performance.now(),
    };
    const frame = (time) => {
      window.qaPerf.frames.push(time - window.qaPerf.lastFrame);
      window.qaPerf.lastFrame = time;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    new PerformanceObserver((list) => {
      for (const item of list.getEntries()) window.qaPerf.longTasks.push(item.duration);
    }).observe({ type: 'longtask', buffered: false });
    new MutationObserver(() => {
      if (
        [...document.querySelectorAll('.bh-activity-center')]
          .filter((e) => e.checkVisibility())
          .some((e) => e.textContent.includes('正在加载收件箱'))
      )
        window.qaPerf.loadingMutations++;
    }).observe(
      [...document.querySelectorAll('.bh-activity-center')].find((e) => e.checkVisibility()),
      { subtree: true, childList: true, characterData: true },
    );
  });
  for (let round = 0; round < 3; round++) {
    await page.bringToFront();
    const before = await metrics();
    await page.evaluate(() => {
      window.qaPerf.frames = [];
      window.qaPerf.longTasks = [];
      window.qaPerf.loadingMutations = 0;
      window.qaPerf.lastFrame = performance.now();
    });
    const q = requests.length;
    const qt = queryTimes.length;
    const start = performance.now();
    const writes = [];
    for (let wave = 0; wave < 10; wave++) {
      const t = performance.now();
      writes.push(
        ...(await Promise.all(
          channels.map((channel, n) =>
            send(channel, `LOAD_R${round}_W${wave}_C${String(n).padStart(2, '0')}`),
          ),
        )),
      );
      await sleep(
        Math.max(0, Number(process.env.BH_LOAD_WAVE_MS ?? 100) - (performance.now() - t)),
      );
    }
    const writeMs = performance.now() - start;
    const committed = performance.now();
    console.log(
      JSON.stringify({
        stage: 'writes-done',
        round,
        writeMs,
        requests: requests.length - q,
        responses: queryTimes.length - qt,
        inFlight: started.size,
        writeP95: percentile(
          writes.map((w) => w.latency),
          0.95,
        ),
      }),
    );
    const converged = await wait(
      () =>
        page.evaluate((r) => {
          const text = [...document.querySelectorAll('.bh-activity-center')]
            .filter((e) => e.checkVisibility())
            .map((e) => e.textContent)
            .join(' ');
          return Array.from(
            { length: 24 },
            (_, n) => `LOAD_R${r}_W9_C${String(n).padStart(2, '0')}`,
          ).every((marker) => text.includes(marker));
        }, round),
      'all latest messages render',
      baseline ? 15000 : 5000,
    ).then(
      () => true,
      () => false,
    );
    const convergenceMs = performance.now() - committed;
    const state = await page.evaluate(() => window.qaPerf);
    const after = await metrics();
    const canonical = (await rpc('humanAttention', { category: 'unread' })).items.filter((x) =>
      channels.some((c) => c.id === x.channelId),
    );
    assert.equal(canonical.length, 24);
    const last = writes.slice(-24);
    for (const message of last) {
      const item = canonical.find((i) => i.channelId === message.channelId);
      assert.equal(item.messageId, message.messageId);
    }
    const result = {
      round,
      writeMs,
      messagesPerSecond: 240 / (writeMs / 1000),
      writeP95Ms: percentile(
        writes.map((w) => w.latency),
        0.95,
      ),
      convergenceMs,
      converged,
      activityQueries: requests.length - q,
      queryP95Ms: percentile(queryTimes.slice(qt), 0.95),
      browserTaskMs: (after.TaskDuration - before.TaskDuration) * 1000,
      browserScriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
      frameP95Ms: percentile(state.frames, 0.95),
      frameMaxMs: Math.max(...state.frames),
      longTasks: state.longTasks.length,
      longTaskMaxMs: Math.max(0, ...state.longTasks),
      loadingMutations: state.loadingMutations,
      heapBefore: before.JSHeapUsedSize,
      heapAfter: after.JSHeapUsedSize,
    };
    proof.queryRecords = queryRecords;
    proof.rounds.push(result);
    save('proof', proof);
    console.log(JSON.stringify(result));
    assert.ok(converged, 'all Channel projections converge within the observation bound');
    if (!baseline) {
      assert.equal(result.loadingMutations, 0, 'background updates retain content');
      assert.ok(convergenceMs < 5000);
      assert.ok(result.activityQueries < 240, 'coalesces burst notifications');
      assert.ok(result.longTaskMaxMs < 1000, 'no one-second browser stall');
    }
    await sleep(1000);
  }
  await shot('after-720-messages');
  await page.bringToFront();
  proof.heapAfterRun = (await metrics()).JSHeapUsedSize;
  const drainStarted = performance.now();
  const drainQueries = requests.length;
  await wait(
    () => started.size === 0 && Date.now() - (requests.at(-1) ?? 0) >= 500,
    'outstanding refreshes drain',
    15000,
  );
  proof.drainMs = performance.now() - drainStarted;
  proof.drainQueries = requests.length - drainQueries;
  const settled = requests.length;
  await sleep(12000);
  proof.settledIdleQueries = requests.length - settled;
  if (!baseline) assert.equal(proof.settledIdleQueries, 0, 'no leftover update loop');
  await cdp.send('HeapProfiler.collectGarbage');
  proof.heapAfterSettledGc = (await metrics()).JSHeapUsedSize;
  assert.deepEqual(errors, []);
  assert.equal(sockets.filter((path) => path === '/api/remote.mux').length, 1);
  proof.pass = true;
  save('proof', proof);
  console.log(
    JSON.stringify({
      result: 'PASS',
      evidence: out,
      idleQueries: proof.idleQueries,
      settledIdleQueries: proof.settledIdleQueries,
    }),
  );
} catch (error) {
  save(
    'failure-dom',
    await page.evaluate(() => ({
      visible: document.visibilityState,
      centers: [...document.querySelectorAll('.bh-activity-center')].map((e) => ({
        visible: e.checkVisibility(),
        text: e.textContent,
      })),
      body: document.body.innerText,
    })),
  );
  await shot('failure').catch(() => {});
  save('failure', {
    ...proof,
    message: error.message,
    queryRecords,
    perf: await page.evaluate(() => window.qaPerf),
    pending: [...networkPending.values()],
    frames: proofFrames,
    requests,
    queryTimes,
    inFlight: started.size,
  });
  throw error;
} finally {
  save('console', consoleMessages);
  await browser.close();
}
