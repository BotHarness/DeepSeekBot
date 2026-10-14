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
  process.env.BH_E2E_SCREENSHOT_DIR ?? join(root, 'docs/assets/pr/584-browser-human-window'),
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
  bots.find((item) => item.displayName === 'Browser Window QA') ??
  (await rpc('create', { displayName: 'Browser Window QA' })).bot;
const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
await rpc('browserAccessSet', { slug: bot.slug, enabled: true });
const cold =
  bots.find((item) => item.displayName === 'Window Cold QA') ??
  (await rpc('create', { displayName: 'Window Cold QA' })).bot;
const coldDm = (await rpc('channelDm', { slug: cold.slug })).channel;
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
    `<!doctype html><html><title>${preview ? 'Preview work' : 'Current work'}</title><body style="font:24px sans-serif;padding:24px"><h1>${preview ? 'Preview work' : 'Current work'}</h1><p>Owned Browser window QA — ${preview ? 'Human selected preview' : 'Bot current tab'}</p><button onclick="document.querySelector('#state').textContent='Human action complete'">Complete Human action</button><p id="state">Ready for Human action</p></body></html>`,
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

  await new Promise((done) => server.listen(31999, '127.0.0.1', done));
  const fixture = 'http://127.0.0.1:31999/';
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
            r.name === 'browser_observe' && !r.error && r.text.includes('Owned Browser window QA'),
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

  async function observation(slug = bot.slug, tab) {
    const response = await fetch(
      `${origin}/api/browser/observation?slug=${encodeURIComponent(slug)}${tab ? `&tab=${encodeURIComponent(tab)}` : ''}`,
      { headers: { cookie } },
    );
    assert.equal(response.ok, true);
    return response.json();
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
  await page.waitForResponse(async (response) => {
    if (!response.url().includes('/api/browser/observation?') || !response.ok()) return false;
    const value = await response.json();
    return value.tabs?.length === 2 && value.tabs.some((tab) => tab.targetId === preview);
  });
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  await page.waitForSelector(`button[title="${fixture}preview"]`);
  await page.click(`button[title="${fixture}preview"]`);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some(
      (b) => b.title.endsWith('/preview') && b.style.fontWeight === '600',
    ),
  );
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
      (await cdp.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page');
    const targetPage = async (id) => {
      const target = (await managed.targets()).find((t) => t._targetId === id);
      assert.ok(target, 'Managed target must exist');
      return target.page();
    };
    const currentPage = await targetPage(current);
    const previewPage = await targetPage(preview);
    await currentPage.setViewport({ width: 1200, height: 736, deviceScaleFactor: 1 });
    await previewPage.setViewport({ width: 1200, height: 736, deviceScaleFactor: 1 });
    await currentPage.bringToFront();
    async function uiOpen() {
      const response = page.waitForResponse(
        (r) => r.url().endsWith('/api/browser/open') && r.request().method() === 'POST',
      );
      const [reply] = await Promise.all([
        response,
        clickButton(['Open Bot Browser', '打开 Bot 浏览器']),
      ]);
      assert.equal(reply.ok(), true, 'Real Human open route must succeed');
      console.log('Human route HTTP', reply.status());
      return { request: reply.request().postData(), response: await reply.json() };
    }
    async function humanOpen(slug, tab) {
      const response = await fetch(`${origin}/api/browser/open`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ slug, ...(tab ? { tab } : {}) }),
      });
      assert.equal(response.ok, true);
      return response.json();
    }
    const initial = await targets();
    await sleep(2000);
    const prefix = before ? 'before' : 'after';
    await page.screenshot({ path: join(evidence, `${prefix}-sidebar.png`) });
    let window;
    if (!before) {
      window = await cdp.send('Browser.getWindowForTarget', { targetId: preview });
      await cdp.send('Browser.setWindowBounds', {
        windowId: window.windowId,
        bounds: { windowState: 'minimized' },
      });
    }
    console.log('Opening preview via real UI');
    const opened = await uiOpen();
    console.log('Preview opened', opened.response);
    const revealed = await targets();
    const added = revealed.filter((t) => !initial.some((old) => old.targetId === t.targetId));
    let foreground;
    if (before) {
      assert.equal(added.length, 1);
      assert.equal(added[0].url, 'about:blank');
      foreground = await targetPage(added[0].targetId);
      await foreground.setViewport({ width: 1200, height: 736, deviceScaleFactor: 1 });
    } else {
      assert.equal(added.length, 0, 'Preview reveal must not create a target');
      assert.equal(JSON.parse(opened.request).tab, preview, 'UI must send its selected preview');
      assert.equal(opened.response.tabId, preview);
      assert.equal(
        (await cdp.send('Browser.getWindowBounds', { windowId: window.windowId })).bounds
          .windowState,
        'normal',
      );
      foreground = previewPage;
    }
    console.log('Checking visible target');
    const session = await foreground.createCDPSession();
    await session.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    let visibility;
    const visibleBy = Date.now() + 5000;
    do {
      visibility = (
        await session.send('Runtime.evaluate', {
          expression: 'document.visibilityState',
          returnByValue: true,
        })
      ).result.value;
      if (visibility === 'visible') break;
      await sleep(100);
    } while (Date.now() < visibleBy);
    console.log('Visibility', visibility);
    assert.equal(visibility, 'visible', 'Revealed native page must be active');
    await session.detach();
    assert.equal(
      (await observation()).focused,
      current,
      'Human preview focus must preserve Bot current pointer',
    );
    await foreground.screenshot({ path: join(evidence, `${prefix}-window.png`) });
    await sleep(1500);
    await page.screenshot({ path: join(evidence, `${prefix}-sidebar.png`) });
    const results = {
      mode: prefix,
      ownedCurrent: current,
      ownedPreview: preview,
      initialTargets: initial.map((t) => ({ targetId: t.targetId, url: t.url })),
      addedTargets: added.map((t) => ({ targetId: t.targetId, url: t.url })),
      open: opened,
      visibility,
      pointerPreserved: true,
    };
    if (!before) {
      await foreground.click('button');
      assert.equal(
        await foreground.$eval('#state', (el) => el.textContent),
        'Human action complete',
      );
      await foreground.screenshot({ path: join(evidence, 'after-human-action.png') });
      await page.click('button[aria-label="跟随 Bot"],button[aria-label="Follow the Bot"]');
      await page.waitForFunction(
        () =>
          document
            .querySelector('button[aria-label="跟随 Bot"],button[aria-label="Follow the Bot"]')
            ?.getAttribute('aria-checked') === 'true',
      );
      console.log('Opening Follow Bot');
      const followed = await uiOpen();
      assert.equal(followed.response.tabId, current);
      assert.equal((await targets()).length, initial.length);
      const repeated = await Promise.all(Array.from({ length: 3 }, () => humanOpen(bot.slug)));
      assert.ok(repeated.every((r) => r.tabId === current));
      assert.equal((await targets()).length, initial.length);
      await currentPage.close();
      const fallback = await humanOpen(bot.slug, current);
      assert.equal(fallback.tabId, preview);
      assert.equal((await observation()).focused, preview);
      assert.equal((await observation()).tabs.length, 1);
      await page.waitForSelector(`.bh-root [data-channel-id="${coldDm.id}"]`);
      await page.click(`.bh-root [data-channel-id="${coldDm.id}"]`);
      if (!(await page.$('[data-panel-head]')))
        await page.evaluate(() => document.querySelector('.bh-sidebar-toggle')?.click());
      await page.waitForSelector('button[aria-label="Browser Access"]');
      await page.waitForFunction(
        () =>
          document
            .querySelector('button[aria-label="Browser Access"]')
            ?.getAttribute('aria-checked') === 'true',
      );
      await page.evaluate(() => {
        const section = [...document.querySelectorAll('[data-sidebar-entry]')].find((el) =>
          el.querySelector('button[aria-label="Browser Access"]'),
        );
        if (!section?.querySelector('[data-sidebar-entry-body]'))
          section?.querySelector('[data-panel-head]')?.click();
      });
      console.log('Cold Browser Access enabled');
      const preCold = (await targets()).length;
      const coldOpened = await uiOpen();
      assert.equal(JSON.parse(coldOpened.request).slug, cold.slug);
      const coldId = coldOpened.response.tabId;
      assert.ok(coldId && coldId !== preview);
      assert.equal((await targets()).length, preCold + 1);
      const concurrent = await Promise.all(
        Array.from({ length: 3 }, () => humanOpen(cold.slug, preview)),
      );
      assert.ok(concurrent.every((r) => r.tabId === coldId));
      assert.equal((await targets()).length, preCold + 1);
      assert.equal((await observation(cold.slug)).tabs.length, 1);
      assert.equal((await observation(cold.slug)).focused, coldId);
      await (await targetPage(coldId)).close();
      const coldReplacement = await Promise.all(
        Array.from({ length: 3 }, () => humanOpen(cold.slug)),
      );
      assert.ok(coldReplacement.every((r) => r.tabId === coldReplacement[0].tabId));
      assert.equal((await targets()).length, preCold + 1);
      await previewPage.close();
      const emptyFallback = await humanOpen(bot.slug);
      assert.notEqual(emptyFallback.tabId, coldReplacement[0].tabId);
      assert.equal((await observation()).tabs.length, 1);
      results.followed = followed;
      results.repeated = repeated;
      results.closedFallback = fallback;
      results.cold = { opened: coldOpened, concurrent, replacement: coldReplacement };
      results.emptyFallback = emptyFallback;
      assert.equal((await tool('browser_open', { url: fixture })).isError, false);
      const qaCurrent = (await observation()).focused;
      assert.equal(
        (await tool('browser_tabs', { action: 'open', url: `${fixture}preview` })).isError,
        false,
      );
      assert.equal(
        (await tool('browser_tabs', { action: 'select', targetId: qaCurrent })).isError,
        false,
      );
      await page.click(`.bh-root [data-channel-id="${dm.id}"]`);
      await sleep(1800);
      await clickButton(['Settings', '设置']);
      await clickButton(['Light', '浅色']);
      await page.waitForFunction(() => !document.body.hasAttribute('data-ds-dark-theme'));
      await page.evaluate((selector) => document.querySelector(selector)?.click(), mode);
      await page.waitForSelector('.bh-root');
      await page.click(`.bh-root [data-channel-id="${dm.id}"]`);
      await sleep(1800);
      await page.evaluate(() => {
        const section = [...document.querySelectorAll('[data-sidebar-entry]')].find((el) =>
          el.querySelector('button[aria-label="Browser Access"]'),
        );
        if (!section?.querySelector('[data-sidebar-entry-body]'))
          section?.querySelector('[data-panel-head]')?.click();
      });
      await page.waitForSelector('button[title="http://127.0.0.1:31999/preview"]');
      await sleep(1800);
      await page.screenshot({ path: join(evidence, 'after-light-sidebar.png') });
      results.themes = { dark: true, light: true };
      await clickButton(['Settings', '设置']);
      await clickButton(['Dark', '深色']);
      await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'));
      await page.evaluate((selector) => document.querySelector(selector)?.click(), mode);
    }
    writeFileSync(
      join(evidence, `${prefix}-results.json`),
      `${JSON.stringify(results, null, 2)}\n`,
    );
    console.log(`PASS: ${prefix} real sidebar open and native Chrome window behavior`);
  } finally {
    managed.disconnect();
  }
} catch (error) {
  await capturedPage?.screenshot({ path: join(evidence, 'ui-failure.png') });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
