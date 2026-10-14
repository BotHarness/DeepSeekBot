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
  process.env.BH_E2E_SCREENSHOT_DIR ?? join(root, 'docs/assets/pr/579-browser-observation-refs'),
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
  bots.find((item) => item.displayName === 'Browser Ref QA') ??
  (await rpc('create', { displayName: 'Browser Ref QA' })).bot;
const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
await rpc('browserAccessSet', { slug: bot.slug, enabled: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const server = createServer((_request, response) => {
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(
    '<!doctype html><html><title>Browser Ref fixture</title><body style="font:24px sans-serif;padding:24px"><h1>Browser Ref QA</h1><p id="state">Intended: 0 | Wrong: 0 — Ready for local verification</p><div id="controls"><button id="intended" onclick="document.querySelector(\'#state\').textContent=\'Intended: 1 | Wrong: 0\'">Complete intended action</button><button id="human" onclick="const b=document.createElement(\'button\');b.id=\'decoy\';b.textContent=\'Different action\';b.onclick=()=>document.querySelector(\'#state\').textContent=\'Intended: 0 | Wrong: 1\';document.querySelector(\'#controls\').prepend(b)">Insert new control</button></div><div id="roleless" style="cursor:pointer;margin-top:32px">Upload image</div></body></html>',
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
  await new Promise((done) => server.listen(31998, '127.0.0.1', done));
  const fixture = 'http://127.0.0.1:31998/';
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
    assert.equal(response.ok, true);
    return response.json();
  }
  function intendedRef(observation) {
    const text = observation.content.find((block) => block.type === 'text').text;
    const match = text.match(/(\S+) button Complete intended action/u);
    assert.ok(match, 'Intended control must have a ref');
    return match[1];
  }
  const first = await tool('browser_observe', {});
  const oldRef = intendedRef(first);
  await clickButton(['Pause Bot', '暂停 Bot']);
  await paused(true);
  const endpoint = readFileSync(join(home, 'botharness/browser/DevToolsActivePort'), 'utf8')
    .trim()
    .split('\n');
  const managed = await puppeteer.connect({
    browserWSEndpoint: `ws://127.0.0.1:${endpoint[0]}${endpoint[1]}`,
    defaultViewport: null,
  });
  try {
    const fixturePage = (await managed.pages()).find((candidate) => candidate.url() === fixture);
    assert.ok(fixturePage);
    await fixturePage.setViewport({ width: 1200, height: 736, deviceScaleFactor: 1 });
    await fixturePage.click('#human');
    await fixturePage.waitForSelector('#decoy');
    const second = await tool('browser_observe', {});
    assert.equal(second.isError, false);
    const freshRef = intendedRef(second);
    const clickableVisible = JSON.stringify(second).includes('clickable Upload image');
    assert.equal(clickableVisible, !before);
    await clickButton(['Resume', '继续']);
    await paused(false);
    const staleAction = await tool('browser_click', { ref: oldRef });
    assert.equal(staleAction.isError, !before);
    if (!before) assert.ok(JSON.stringify(staleAction).includes('ref is stale'));
    const state = await fixturePage.$eval('#state', (element) => element.textContent);
    assert.ok(state.includes(before ? 'Wrong: 1' : 'Wrong: 0'));
    await sleep(1800);
    await page.screenshot({ path: join(evidence, `${before ? 'before' : 'after'}-old-ref.png`) });
    await fixturePage.screenshot({
      path: join(evidence, `${before ? 'before' : 'after'}-page.png`),
    });
    let freshAction;
    let recoveredRef;
    if (!before) {
      recoveredRef = intendedRef(await tool('browser_observe', {}));
      freshAction = await tool('browser_click', { ref: recoveredRef });
      assert.equal(freshAction.isError, false);
      assert.ok(
        (await fixturePage.$eval('#state', (element) => element.textContent)).includes(
          'Intended: 1 | Wrong: 0',
        ),
      );
      await sleep(1800);
      await page.screenshot({ path: join(evidence, 'after-fresh-ref.png') });
      await fixturePage.screenshot({ path: join(evidence, 'after-intended-page.png') });
    }
    let modelRefClick;
    if (!before) {
      await tool('browser_open', { url: fixture });
      await fixturePage.click('#human');
      await fixturePage.waitForSelector('#decoy');
      const modelEvents = await turn(
        '本地 QA：请先 browser_observe 取得本次 ref，然后 browser_click 点击 Complete intended action，最后 browser_observe 确认 Intended: 1 | Wrong: 0。不要点 Different action，不要用坐标，简短汇报。',
        (fresh) => {
          const results = toolResults(fresh);
          assert.ok(results.some((result) => result.name === 'browser_click' && !result.error));
          assert.ok(
            results.some(
              (result) =>
                result.name === 'browser_observe' &&
                !result.error &&
                result.text.includes('Intended: 1 | Wrong: 0'),
            ),
          );
        },
      );
      const click = modelEvents.find(
        (event) => event.type === 'tool/call' && event.data.name === 'browser_click',
      );
      assert.ok(click);
      const modelArguments = JSON.parse(click.data.arguments);
      assert.equal(typeof modelArguments.ref, 'string');
      assert.equal(modelArguments.x, undefined);
      assert.equal(modelArguments.y, undefined);
      modelRefClick = click.data;
      assert.ok(
        (await fixturePage.$eval('#state', (element) => element.textContent)).includes(
          'Intended: 1 | Wrong: 0',
        ),
      );
      writeFileSync(
        join(evidence, 'model-ref-click.json'),
        JSON.stringify(modelRefClick, null, 2) + '\n',
      );
    }
    writeFileSync(
      join(evidence, `${before ? 'before' : 'after'}-results.json`),
      JSON.stringify(
        {
          nativeScopedExecutor: true,
          realChrome: true,
          humanChromeInputWhilePaused: true,
          oldRef,
          freshRef,
          recoveredRef,
          clickableVisible,
          staleAction,
          state,
          freshAction,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      before
        ? 'PASS: baseline reproduced wrong-target action and vanished clickable'
        : 'PASS: old ref refused, clickable retained, fresh ref activates intended control',
    );
  } finally {
    managed.disconnect();
  }
} finally {
  await browser.close();
  if (server.listening) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
}
