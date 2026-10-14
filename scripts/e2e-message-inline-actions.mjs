import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
const origin = process.env.BH_E2E_ORIGIN,
  home = process.env.BH_E2E_HOME,
  evidence = process.env.BH_E2E_EVIDENCE;
assert.ok(origin && home && evidence);
const endpoint = new URL(origin);
assert.ok(
  endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname),
);
const phase = process.argv[2] ?? 'after';
assert.ok(['before', 'after'].includes(phase));
const scene = JSON.parse(
  readFileSync('.humanlayer/tasks/message-inline-actions/qa-state.json', 'utf8'),
);
const cookie = readFileSync(resolve(tmpdir(), 'dsh-' + basename(home) + '.cookies'), 'utf8').split(
  ';',
)[0];
async function rpc(method, args) {
  const response = await fetch(origin + '/api/botharness/' + method, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: 'botharness/' + method,
      payload: { args },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const result = (await response.json()).result;
  assert.equal(result?.ok, true);
  return result.value;
}
const messages = (
  await rpc('channelMessages', { channelId: scene.group.id })
).messages.toReversed();
assert.equal(messages.length, 10);
assert.equal(messages.filter((m) => m.author.kind === 'bot').length, 8);
const target = messages[1],
  human = messages[4];
const modules = resolve('node_modules/.pnpm');
const dir = readdirSync(modules).find((d) => d.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(modules, dir, 'node_modules/'))('puppeteer');
mkdirSync(evidence, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const split = cookie.indexOf('=');
await browser.setCookie({
  name: cookie.slice(0, split),
  value: cookie.slice(split + 1),
  domain: endpoint.hostname,
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
async function enter() {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((b) =>
          ['Continue', '继续'].includes(b.textContent?.trim() ?? ''),
        ),
      { timeout: 10000 },
    )
    .catch(() => undefined);
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((b) => ['Continue', '继续'].includes(b.textContent?.trim() ?? ''))
      ?.click(),
  );
  for (let n = 0; n < 3 && !(await page.$('.bh-main')); n++) {
    await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
    await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('button')].some((b) =>
            ['Configure later', '稍后配置'].includes(b.textContent?.trim() ?? ''),
          ) || document.querySelector('.bh-main'),
        { timeout: 5000 },
      )
      .catch(() => undefined);
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((b) => ['Configure later', '稍后配置'].includes(b.textContent?.trim() ?? ''))
        ?.click(),
    );
    await page.waitForSelector('.bh-main', { timeout: 10000 }).catch(() => undefined);
  }
  await page.waitForSelector('.bh-main');
  await page.waitForSelector('[data-channel-id="' + scene.group.id + '"]');
  await page.click('[data-channel-id="' + scene.group.id + '"]');
  await page.waitForFunction(
    (name) => document.querySelector('[data-group-channel-name]')?.textContent === name,
    {},
    scene.group.name,
  );
  await page.waitForSelector('[data-message-id="' + target.id + '"]');
}
async function measure(id) {
  return await page.evaluate((id) => {
    const wrap = document.querySelector('[data-message-id="' + id + '"]'),
      group = wrap.closest('.bh-message-group');
    const bubble = wrap.querySelector('.bh-bubble'),
      receipt = wrap.querySelector('.bh-delivery-trigger'),
      meta = wrap.querySelector('.bh-bubble-meta'),
      time = group.querySelector('.bh-bubble-time');
    const rect = (node) => {
      const r = node?.getBoundingClientRect();
      return r
        ? {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          }
        : null;
    };
    return {
      id,
      human: group.classList.contains('bh-message-group-me'),
      bubble: rect(bubble),
      wrap: rect(wrap),
      receipt: rect(receipt),
      meta: rect(meta),
      actions: [...wrap.querySelectorAll('.bh-bubble-action')].map(rect),
      metaOpacity: getComputedStyle(meta).opacity,
      timeOpacity: time ? getComputedStyle(time).opacity : null,
      times: group.querySelectorAll('.bh-bubble-time').length,
      timeAfterAuthor:
        time?.previousElementSibling?.classList.contains('bh-bubble-author') ?? false,
      nextBubble: rect(wrap.nextElementSibling?.querySelector('.bh-bubble')),
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  }, id);
}
const proof = {
  phase,
  base: 'db3ea89869d94392bcca8178c84290e853b21746',
  group: scene.group,
  messages: messages.map((m) => ({ id: m.id, author: m.author, body: m.body, at: m.at })),
  cases: [],
};
try {
  await page.setViewport({ width: 1500, height: 1000 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await enter();
  const first = '[data-message-id="' + messages[0].id + '"]';
  const selector = '[data-message-id="' + target.id + '"]';
  for (const [theme, width, height] of [
    ['light', 1500, 1000],
    ['dark', 420, 860],
  ]) {
    await page.setViewport({ width, height });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
    await page.evaluate(() => {
      document.querySelector('.bh-chat-body').scrollTop = 0;
    });
    await page.mouse.move(1, 1);
    const hidden = await measure(messages[0].id);
    if (phase === 'after') {
      assert.equal(hidden.times, 1);
      assert.equal(hidden.timeAfterAuthor, true);
      assert.equal(hidden.metaOpacity, '0');
      assert.equal(hidden.timeOpacity, '0');
      assert.ok(hidden.nextBubble.top - hidden.bubble.bottom <= 3, 'compact adjacent bubbles');
      assert.ok(hidden.wrap.height <= hidden.bubble.height + 1, 'no reserved action row');
    }
    await page.screenshot({
      path: resolve(evidence, phase + '-' + theme + '-' + width + '-rest.png'),
    });
    await page.hover(selector + ' .bh-bubble');
    const visible = await measure(target.id);
    if (phase === 'after') {
      assert.equal(visible.metaOpacity, '1');
      assert.equal(visible.timeOpacity, '1');
      assert.equal(visible.times, 1);
      assert.ok(visible.receipt);
      assert.ok(visible.receipt.left - visible.bubble.right <= 5, 'receipt close to bubble');
      assert.ok(visible.meta.left >= visible.receipt.right - 1, 'Bot actions right of receipt');
      for (const r of visible.actions) {
        assert.ok(
          r.top < visible.receipt.bottom && r.bottom > visible.receipt.top,
          'same horizontal receipt line',
        );
        assert.ok(r.left >= 0 && r.right <= width, 'visible controls fit viewport');
      }
      assert.ok(visible.scrollWidth <= width, 'no horizontal overflow');
    }
    await page.screenshot({
      path: resolve(evidence, phase + '-' + theme + '-' + width + '-hover.png'),
    });
    proof.cases.push({ theme, width, hidden, visible });
  }
  if (phase === 'after') {
    await page.evaluate(() => {
      window.qaClicks = [];
      document.addEventListener(
        'click',
        (e) =>
          window.qaClicks.push({
            tag: e.target.tagName,
            aria: e.target.closest('button')?.getAttribute('aria-label'),
            className: e.target.className,
          }),
        true,
      );
    });
    await browser
      .defaultBrowserContext()
      .overridePermissions(origin, [
        'clipboard-read',
        'clipboard-write',
        'clipboard-sanitized-write',
      ]);
    await page.click(
      selector +
        ' button[aria-label="复制消息"],' +
        selector +
        ' button[aria-label="Copy message"]',
    );
    await page.waitForFunction(
      (body) => navigator.clipboard.readText().then((value) => value === body),
      { timeout: 5000 },
      target.body,
    );
    proof.copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(proof.copied, target.body);
    await page.click(
      selector + ' button[aria-label="回复"],' + selector + ' button[aria-label="Reply"]',
    );
    await page.waitForSelector('.bh-composer-reply-body');
    proof.reply = await page.$eval('.bh-composer-reply-body', (e) => e.textContent);
    assert.equal(proof.reply, target.body);
    await page.click('.bh-composer-reply-cancel');
    await page.click(selector + ' .bh-delivery-trigger');
    await page.waitForSelector('.bh-delivery-panel');
    proof.deliveryDialog = await page.$eval('.bh-delivery-panel', (e) => ({
      role: e.getAttribute('role'),
      text: e.textContent,
    }));
    assert.equal(proof.deliveryDialog.role, 'dialog');
    await page.keyboard.press('Escape');
    await page.mouse.move(1, 1);
    await page.focus(selector + ' .bh-bubble-action');
    const focused = await measure(target.id);
    assert.equal(focused.metaOpacity, '1');
    assert.equal(focused.timeOpacity, '1');
    proof.focused = focused;
    await page.hover('[data-message-id="' + human.id + '"] .bh-bubble');
    proof.human = await measure(human.id);
    assert.ok(
      proof.human.receipt.right <= proof.human.bubble.left + 1,
      'Human bubble remains on outer right',
    );
    assert.ok(proof.human.bubble.left - proof.human.receipt.right <= 5);
    assert.ok(
      proof.human.meta.right <= proof.human.receipt.left + 1,
      'Human actions mirror toward center',
    );
    await page.screenshot({ path: resolve(evidence, 'after-human-dark-420-hover.png') });
    await page.setViewport({ width: 420, height: 860, hasTouch: true });
    await enter();
    await page.evaluate(() => document.activeElement?.blur());
    proof.touch = await measure(target.id);
    assert.equal(await page.evaluate(() => matchMedia('(hover: none)').matches), true);
    assert.equal(proof.touch.metaOpacity, '1');
    assert.equal(proof.touch.timeOpacity, '1');
    assert.equal(proof.touch.times, 1);
    assert.ok(proof.touch.scrollWidth <= proof.touch.viewport);
    for (const r of proof.touch.actions) assert.ok(r.left >= 0 && r.right <= 420);
    await page.screenshot({ path: resolve(evidence, 'after-touch-dark-420.png') });
  }
  assert.deepEqual(errors, []);
  proof.errors = errors;
  writeFileSync(resolve(evidence, phase + '-proof.json'), JSON.stringify(proof, null, 2) + '\n');
  console.log(
    JSON.stringify({
      phase,
      verified: true,
      screenshots: phase === 'after' ? 6 : 4,
      copyReplyDelivery: phase === 'after',
    }),
  );
} catch (error) {
  await page.screenshot({ path: resolve('.humanlayer/tasks/message-inline-actions/failure.png') });
  writeFileSync(
    '.humanlayer/tasks/message-inline-actions/failure-state.json',
    JSON.stringify(
      {
        errors,
        clicks: await page.evaluate(() => window.qaClicks),
        buttons: await page.$$eval('button', (nodes) =>
          nodes.map((n) => ({ text: n.textContent, aria: n.getAttribute('aria-label') })),
        ),
        text: await page.$eval('body', (n) => n.innerText.slice(0, 5000)),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
