import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = process.env.BH_E2E_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
assert.ok(origin && home, 'Set BH_E2E_ORIGIN and BH_E2E_HOME');
const before = process.argv.includes('--before');
const evidence = resolve(
  process.env.BH_E2E_SCREENSHOT_DIR ?? join(root, 'docs/assets/pr/569-browser-queued-guards'),
);
mkdirSync(evidence, { recursive: true });
const pnpm = join(root, 'node_modules/.pnpm');
const entry = readdirSync(pnpm).find((name) => name.startsWith('puppeteer@'));
assert.ok(entry, 'Puppeteer unavailable');
const puppeteer = createRequire(join(pnpm, entry, 'node_modules/'))('puppeteer');
const cookie = readFileSync(
  join(tmpdir(), `dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`),
  'utf8',
).split(';')[0];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function rpc(method, args = {}) {
  const response = await fetch(`${origin}/api/botharness/${method}`, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `pause-${Date.now()}-${Math.random()}`,
      method: `botharness/${method}`,
      payload: { args },
    }),
  });
  const envelope = await response.json();
  assert.equal(envelope.result?.ok, true, `${method}: ${JSON.stringify(envelope.result?.error)}`);
  return envelope.result.value;
}
const bots = (await rpc('list')).bots;
const bot =
  bots.find((item) => item.displayName === 'Browser Queue QA') ??
  (await rpc('create', { displayName: 'Browser Queue QA' })).bot;
const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
await rpc('browserAccessSet', { slug: bot.slug, enabled: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const server = createServer((_request, response) => {
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(
    '<!doctype html><html><title>Browser Queue fixture</title><body style="font:24px sans-serif;padding:24px"><h1>Browser Queue QA</h1><p id="state">Clicks: 0 — Ready for local verification</p><button style="position:absolute;left:40px;top:250px;font-size:24px;padding:12px" onclick="document.querySelector(\'#state\').textContent=\'Clicks: 1\'">Add one</button></body></html>',
  );
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  await page.setExtraHTTPHeaders({ cookie });
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((b) =>
          ['Continue', '继续'].includes(b.textContent?.trim() ?? ''),
        ),
      { timeout: 5000 },
    )
    .catch(() => undefined);
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((b) => ['Continue', '继续'].includes(b.textContent?.trim() ?? ''))
      ?.click(),
  );
  const mode = 'button[aria-label="Bot mode"],button[aria-label="Bot 模式"]';
  await page.waitForSelector(mode);
  await page.waitForSelector('.bh-panel-glyph', { timeout: 15000 });
  if (!(await page.$('.bh-panel-activity[data-active="true"]')))
    await page.evaluate((selector) => document.querySelector(selector)?.click(), mode);
  await page.waitForSelector('.bh-root', { timeout: 15000 });
  await page
    .waitForSelector(`.bh-root [data-channel-id="${dm.id}"]`, { timeout: 20000 })
    .catch(async (error) => {
      await page.screenshot({ path: join(evidence, 'ui-failure.png') });
      throw error;
    });
  await page.click(`.bh-root [data-channel-id="${dm.id}"]`);
  await page.waitForSelector('.bh-composer', { timeout: 20000 });
  if (!(await page.$('[data-panel-head]')))
    await page.evaluate(() => document.querySelector('.bh-sidebar-toggle')?.click());
  await page.waitForSelector('[data-panel-head]', { timeout: 20000 }).catch(async (error) => {
    await page.screenshot({ path: join(evidence, 'ui-failure.png') });
    throw error;
  });
  await page.waitForSelector('button[aria-label="Browser Access"]', { timeout: 20000 });
  await page.waitForFunction(
    () =>
      document
        .querySelector('button[aria-label="Browser Access"]')
        ?.getAttribute('aria-checked') === 'true',
  );
  await sleep(2000);
  await page.evaluate(() => {
    const section = [...document.querySelectorAll('[data-panel-head]')].find((b) =>
      ['Browser', '浏览器'].includes(b.textContent?.trim() ?? ''),
    );
    if (section?.getAttribute('aria-expanded') !== 'true') section?.click();
  });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-sidebar-entry]')].find((el) =>
        el.querySelector('button[aria-label="Browser Access"]'),
      ),
    { timeout: 15000 },
  );
  async function clickButton(labels) {
    await page.waitForFunction(
      (names) =>
        [...document.querySelectorAll('button')].some(
          (b) => names.includes(b.textContent?.trim() ?? '') && !b.disabled,
        ),
      {},
      labels,
    );
    await page.evaluate(
      (names) =>
        [...document.querySelectorAll('button')]
          .find((b) => names.includes(b.textContent?.trim() ?? '') && !b.disabled)
          ?.click(),
      labels,
    );
  }
  async function paused(value) {
    await page.waitForFunction(
      (want) =>
        [...document.querySelectorAll('button')].some((b) =>
          (want ? ['Resume', '继续'] : ['Pause Bot', '暂停 Bot']).includes(
            b.textContent?.trim() ?? '',
          ),
        ),
      { timeout: 15000 },
      value,
    );
    const response = await fetch(
      `${origin}/api/browser/observation?slug=${encodeURIComponent(bot.slug)}`,
      { headers: { cookie } },
    );
    assert.equal((await response.json()).takeover, value);
  }
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-sidebar-entry]')]
      .find((el) => el.querySelector('button[aria-label="Browser Access"]'))
      ?.querySelector('[data-sidebar-entry-body]'),
  );
  await sleep(1000);
  if (
    await page.evaluate(() =>
      [...document.querySelectorAll('button')].some((b) =>
        ['Resume', '继续'].includes(b.textContent?.trim() ?? ''),
      ),
    )
  ) {
    await clickButton(['Resume', '继续']);
    await paused(false);
  }
  console.log('UI ready');
  await new Promise((done) => server.listen(31997, '127.0.0.1', done));
  const fixture = 'http://127.0.0.1:31997/';
  async function events() {
    const sessions = (await rpc('sessions', { slug: bot.slug })).sessions;
    const sessionId = sessions.find((session) => session.role === 'orchestrator')?.sessionId;
    if (sessionId === undefined) return [];
    async function native(method, request) {
      const response = await fetch(`${origin}/api/session/${method}`, {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: `pause-${method}-${Date.now()}`,
          method: `session/${method}`,
          payload: { args: { request } },
        }),
      });
      const envelope = await response.json();
      assert.equal(envelope.result?.ok, true, `session/${method} failed`);
      return envelope.result.value;
    }
    const projection = await native('projections', { sessionId });
    const history = await native('page', {
      address: { kind: 'session', sessionId },
      throughSeq: projection.asOfSeq,
      maxMessages: 100,
    });
    return history.records
      .filter((record) => record.type === 'event')
      .map((record) => record.event);
  }
  async function turn(body, validate) {
    const prior = new Set((await events()).map((event) => event.seq));
    console.log('Starting model turn', prior.size);
    await rpc('channelSend', { channelId: dm.id, body });
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const fresh = (await events()).filter((event) => !prior.has(event.seq));
      if (fresh.some((event) => event.type === 'turn/end')) {
        console.log('Completed model turn', fresh.length);
        validate(fresh);
        return fresh;
      }
      await sleep(1000);
    }
    throw new Error('Model turn did not finish within 180s');
  }
  function toolResults(fresh) {
    const calls = new Map(
      fresh.filter((e) => e.type === 'tool/call').map((e) => [e.data.callId, e.data.name]),
    );
    return fresh
      .filter((e) => e.type === 'tool/result')
      .map((e) => ({
        name: calls.get(e.data.message.toolCallId),
        error: e.data.message.isError === true,
        text: JSON.stringify(e.data.message),
      }));
  }
  await turn(
    `本地 QA。只调用 browser_open 打开 ${fixture}，然后 browser_observe，最后简短回复；不要执行其他操作。`,
    (fresh) => {
      const results = toolResults(fresh);
      assert.ok(results.some((r) => r.name === 'browser_open' && !r.error));
      assert.ok(
        results.some(
          (r) =>
            r.name === 'browser_observe' &&
            !r.error &&
            r.text.includes('Ready for local verification'),
        ),
      );
    },
  );
  const sessions = (await rpc('sessions', { slug: bot.slug })).sessions;
  const sessionId = sessions.find((item) => item.role === 'orchestrator').sessionId;
  async function tool(name, args) {
    const response = await fetch(`${origin}/api/browser-queue-qa`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ sessionId, name, args }),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    assert.equal(response.ok, true, JSON.stringify(result));
    return result;
  }
  const initial = await tool('browser_observe', {});
  console.log('Initial scoped tool', JSON.stringify(initial));
  assert.ok(JSON.stringify(initial).includes('Clicks: 0'));
  const hold = tool('browser_wait', { ms: 4000 });
  await sleep(300);
  let completed = false;
  const queued = tool('browser_click', { x: 90, y: 275 }).then((value) => {
    completed = true;
    return value;
  });
  await sleep(300);
  assert.equal(completed, false, 'Click must still be queued before Human pauses');
  await clickButton(['Pause Bot', '暂停 Bot']);
  await paused(true);
  await hold;
  const result = await queued;
  const observed = await tool('browser_observe', {});
  console.log('Queued click', JSON.stringify(result));
  assert.equal(result.isError, !before);
  assert.ok(JSON.stringify(observed).includes(before ? 'Clicks: 1' : 'Clicks: 0'));
  if (!before) assert.ok(JSON.stringify(result).includes('Browser Pause is active'));
  await sleep(1800);
  await page.screenshot({ path: join(evidence, `${before ? 'before' : 'after'}-paused.png`) });
  const snapshot = await fetch(
    `${origin}/api/browser/observation?slug=${encodeURIComponent(bot.slug)}`,
    { headers: { cookie } },
  ).then((response) => response.json());
  assert.ok(snapshot.frame);
  writeFileSync(
    join(evidence, `${before ? 'before' : 'after'}-page.jpg`),
    Buffer.from(snapshot.frame.split(',')[1], 'base64'),
  );
  if (!before) {
    await clickButton(['Resume', '继续']);
    await paused(false);
    await tool('browser_observe', {});
    const resumed = await tool('browser_click', { x: 90, y: 275 });
    assert.equal(resumed.isError, false);
    assert.ok(JSON.stringify(await tool('browser_observe', {})).includes('Clicks: 1'));
    await sleep(1200);
    await page.screenshot({ path: join(evidence, 'after-resumed.png') });
  }
  if (before) {
    await clickButton(['Resume', '继续']);
    await paused(false);
  }
  await tool('browser_open', { url: fixture });
  const accessHold = tool('browser_wait', { ms: 4000 });
  await sleep(300);
  let accessCompleted = false;
  const accessQueued = tool('browser_open', { url: fixture }).then((value) => {
    accessCompleted = true;
    return value;
  });
  await sleep(300);
  assert.equal(accessCompleted, false);
  await page.click('button[aria-label="Browser Access"]');
  await page.waitForFunction(
    () =>
      document
        .querySelector('button[aria-label="Browser Access"]')
        ?.getAttribute('aria-checked') === 'false',
  );
  await accessHold;
  const accessResult = await accessQueued;
  console.log('Queued open after Access off', JSON.stringify(accessResult));
  assert.equal(accessResult.isError, !before);
  if (!before) assert.ok(JSON.stringify(accessResult).includes('Browser Access is off'));
  await rpc('browserAccessSet', { slug: bot.slug, enabled: true });
  writeFileSync(
    join(evidence, `${before ? 'before' : 'after'}-results.json`),
    JSON.stringify(
      {
        nativeScopedExecutor: true,
        realChrome: true,
        pauseViaHostUI: true,
        clickQueuedBeforePause: true,
        queuedClick: result,
        queuedAccessOffOpen: accessResult,
        observation: observed,
        baselineExpectedBug: before,
        resumedClick: !before,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    before
      ? 'PASS: baseline reproduced queued click after Pause'
      : 'PASS: queued click refused, observe allowed, Resume + fresh observe + click succeeds',
  );
} finally {
  await browser.close();
  if (server.listening) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
}
