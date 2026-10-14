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
  process.env.BH_E2E_SCREENSHOT_DIR ?? join(root, 'docs/assets/pr/591-browser-access-tabs'),
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
  bots.find((item) => item.displayName === 'Access Work QA') ??
  (await rpc('create', { displayName: 'Access Work QA' })).bot;
const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
await rpc('browserAccessSet', { slug: bot.slug, enabled: true });
const cold =
  bots.find((item) => item.displayName === 'Access Foreign QA') ??
  (await rpc('create', { displayName: 'Access Foreign QA' })).bot;
await rpc('channelDm', { slug: cold.slug });
await rpc('browserAccessSet', { slug: cold.slug, enabled: false });
await rpc('browserAccessSet', { slug: cold.slug, enabled: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
let capturedPage;
const server = createServer((request, response) => {
  response.setHeader('content-type', 'text/html; charset=utf-8');
  const preview = request.url === '/preview';
  response.end(
    `<!doctype html><html><title>${preview ? 'Preview work' : 'Current work'}</title><body style="font:24px sans-serif;padding:24px"><h1>${preview ? 'Preview work' : 'Current work'}</h1><p>Access work QA — ${preview ? 'Human selected preview' : 'Bot current tab'}</p><button onclick="document.querySelector('#state').textContent='Work completed after Access cycle'">Complete work</button><p id="state">Ready for Human action</p></body></html>`,
  );
});
try {
  const page = await browser.newPage();
  capturedPage = page;
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

  await new Promise((done) => server.listen(32001, '127.0.0.1', done));
  const fixture = 'http://127.0.0.1:32001/';
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
          (r) => r.name === 'browser_observe' && !r.error && r.text.includes('Access work QA'),
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
    const value = await response.json();
    assert.equal(response.ok, true, JSON.stringify(value));
    return value;
  }

  async function observation(slug = bot.slug) {
    const response = await fetch(
      `${origin}/api/browser/observation?slug=${encodeURIComponent(slug)}`,
      { headers: { cookie } },
    );
    const value = await response.json();
    assert.equal(response.ok, true, JSON.stringify(value));
    return value;
  }
  const current = (await observation()).focused;
  assert.ok(current);
  for (const tab of (await observation()).tabs) {
    if (tab.targetId !== current)
      assert.equal(
        (await tool('browser_tabs', { action: 'close', targetId: tab.targetId })).isError,
        false,
      );
  }
  assert.equal(
    (await tool('browser_tabs', { action: 'open', url: `${fixture}preview` })).isError,
    false,
  );
  const preview = (await observation()).focused;
  assert.notEqual(preview, current);
  assert.equal(
    (await tool('browser_tabs', { action: 'select', targetId: current })).isError,
    false,
  );
  const foreignResponse = await fetch(`${origin}/api/browser/open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ slug: cold.slug }),
  });
  assert.equal(foreignResponse.ok, true);
  const foreign = (await foreignResponse.json()).tabId;
  const endpoint = readFileSync(join(home, 'botharness/browser/DevToolsActivePort'), 'utf8')
    .trim()
    .split('\n');
  const managed = await puppeteer.connect({
    browserWSEndpoint: `ws://127.0.0.1:${endpoint[0]}${endpoint[1]}`,
    defaultViewport: null,
    protocolTimeout: 15000,
  });
  try {
    const cdp = await managed.target().createCDPSession();
    const targets = async () =>
      (await cdp.send('Target.getTargets')).targetInfos.filter((target) => target.type === 'page');
    const currentTarget = (await managed.targets()).find((target) => target._targetId === current);
    const currentPage = await currentTarget.page();
    await currentPage.setViewport({ width: 1200, height: 736, deviceScaleFactor: 1 });
    await page.waitForFunction(
      (url) => !!document.querySelector(`button[title="${url}"]`),
      {},
      fixture,
    );
    async function toggle(enabled) {
      console.log('Toggle requested', enabled);
      await page.waitForFunction(() => {
        const button = document.querySelector('button[aria-label="Browser Access"]');
        return button && !button.disabled;
      });
      const prior = await page.$eval('button[aria-label="Browser Access"]', (button) =>
        button.getAttribute('aria-checked'),
      );
      assert.equal(prior, String(!enabled));
      await page.click('button[aria-label="Browser Access"]');
      console.log('Toggle clicked', enabled);
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const record = (await rpc('list')).bots.find((item) => item.slug === bot.slug);
        if ((record.browserAccess === true) === enabled) break;
        await sleep(100);
      }
      assert.equal(
        (await rpc('list')).bots.find((item) => item.slug === bot.slug).browserAccess === true,
        enabled,
      );
      await page.waitForFunction(
        (value) => {
          const button = document.querySelector('button[aria-label="Browser Access"]');
          return button?.getAttribute('aria-checked') === String(value) && !button.disabled;
        },
        {},
        enabled,
      );
      if (enabled) {
        await page.evaluate(() => {
          const section = [...document.querySelectorAll('[data-sidebar-entry]')].find((entry) =>
            entry.querySelector('button[aria-label="Browser Access"]'),
          );
          const head = section?.querySelector('[data-panel-head]');
          if (head?.getAttribute('aria-expanded') !== 'true') head?.click();
        });
        await page.waitForFunction(() =>
          [...document.querySelectorAll('[data-sidebar-entry]')]
            .find((entry) => entry.querySelector('button[aria-label="Browser Access"]'))
            ?.querySelector('[data-sidebar-entry-body]'),
        );
      }
    }
    await toggle(false);
    console.log('Access off confirmed');
    const denied = await tool('browser_observe', {});
    assert.equal(denied.isError, true, 'Access off must revoke tool execution');
    console.log('Tool denied', denied.isError);
    const whileOff = await observation();
    assert.ok(
      (await targets()).some((target) => target.targetId === current),
      'Work page must still exist in Chrome',
    );
    console.log('Re-enable requested');
    await toggle(true);
    console.log('Access on confirmed');
    await sleep(2200);
    const restored = await observation();
    const prefix = before ? 'before' : 'after';
    if (before) {
      assert.equal(restored.focused, null);
      assert.equal(restored.tabs.length, 0);
    } else {
      assert.equal(restored.focused, current);
      assert.deepEqual(restored.tabs.map((tab) => tab.targetId).sort(), [current, preview].sort());
      assert.ok(!restored.tabs.some((tab) => tab.targetId === foreign));
      assert.equal(whileOff.focused, current);
    }
    await page.screenshot({ path: join(evidence, `${prefix}-sidebar.png`) });
    const initial = await targets();
    const reply = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/browser/open') && response.request().method() === 'POST',
    );
    await clickButton(['Open Bot Browser', '打开 Bot 浏览器']);
    const openedResponse = await reply;
    assert.equal(openedResponse.ok(), true);
    const opened = await openedResponse.json();
    const final = await targets();
    const added = final.filter(
      (target) => !initial.some((old) => old.targetId === target.targetId),
    );
    const results = {
      baseline: before,
      current,
      preview,
      foreign,
      accessOffRefused: denied.isError,
      restored: { focused: restored.focused, tabs: restored.tabs.map((tab) => tab.targetId) },
      opened,
      addedTargets: added.map((target) => ({ targetId: target.targetId, url: target.url })),
      modelOpenObservePassed: true,
    };
    if (before) {
      assert.equal(added.length, 1);
      assert.equal(added[0].url, 'about:blank');
      const blankTarget = (await managed.targets()).find(
        (target) => target._targetId === opened.tabId,
      );
      const blankPage = await blankTarget.page();
      await blankPage.setViewport({ width: 1200, height: 736, deviceScaleFactor: 1 });
      await blankPage.screenshot({ path: join(evidence, 'before-window.png') });
    } else {
      assert.equal(added.length, 0);
      assert.equal(opened.tabId, current);
      const observed = await tool('browser_observe', {});
      assert.equal(observed.isError, false);
      const text = observed.content
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join('\n');
      const ref = /^(\S+) button Complete work$/mu.exec(text)?.[1];
      assert.ok(ref, 'Re-observe must expose the work button');
      const clicked = await tool('browser_click', { ref });
      assert.equal(clicked.isError, false);
      await currentPage.waitForFunction(
        () => document.querySelector('#state')?.textContent === 'Work completed after Access cycle',
      );
      await currentPage.screenshot({ path: join(evidence, 'after-window.png') });
      await sleep(2000);
      await page.screenshot({ path: join(evidence, 'after-completed-sidebar.png') });
      results.workCompleted = true;
      await toggle(false);
      await currentPage.close();
      await toggle(true);
      const fallbackResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/browser/open') && response.request().method() === 'POST',
      );
      await clickButton(['Open Bot Browser', '打开 Bot 浏览器']);
      const fallback = await (await fallbackResponse).json();
      assert.equal(fallback.tabId, preview);
      assert.equal((await observation()).focused, preview);
      results.closedCurrentRecovered = true;
      assert.ok((await targets()).some((target) => target.targetId === foreign));
      assert.equal((await tool('browser_open', { url: fixture })).isError, false);
    }
    writeFileSync(
      join(evidence, `${prefix}-results.json`),
      `${JSON.stringify(results, null, 2)}\n`,
    );
    console.log(JSON.stringify(results));
    await cdp.detach();
  } finally {
    await managed.disconnect();
  }
} catch (error) {
  await capturedPage?.screenshot({ path: join(evidence, 'ui-failure.png') }).catch(() => undefined);
  throw error;
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await browser.close();
}
