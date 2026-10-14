import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'after';
const port = Number(process.env.BH_PURGE_QA_PORT ?? (mode === 'before' ? 31988 : 31987));
const home = resolve(
  process.env.BH_PURGE_QA_HOME ??
    resolve(
      repo,
      '.humanlayer/tasks/897-channel-purge',
      mode === 'before' ? 'qa-base' : 'qa-verified',
    ),
);
const out = resolve(repo, '.humanlayer/tasks/897-channel-purge/evidence');
const sceneFile = resolve(out, 'scene.json');
mkdirSync(out, { recursive: true });
assert.ok(home.includes('897-channel-purge'), 'Use this task-owned disposable Profile only');
const url = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}-${port}.log`), 'utf8').match(
  /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u,
)?.[0];
assert.ok(url, 'Launch the isolated Profile with dev-instance first');
const modules = resolve(repo, 'node_modules/.pnpm');
const pkg = readdirSync(modules).find((name) => name.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(modules, pkg, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const rpc = (method, args = {}) =>
  page.evaluate(
    async ({ method, args }) => {
      const response = await fetch('/api/botharness/' + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: 'botharness/' + method,
          payload: { args },
        }),
      });
      const envelope = await response.json();
      if (!envelope.result?.ok)
        throw new Error(method + ': ' + JSON.stringify(envelope.result?.error));
      return envelope.result.value;
    },
    { method, args },
  );
const click = async (label, selector = 'button') => {
  await page.waitForFunction(
    ({ label, selector }) =>
      [...document.querySelectorAll(selector)].some((el) => el.textContent.trim() === label),
    {},
    { label, selector },
  );
  await page.evaluate(
    ({ label, selector }) =>
      [...document.querySelectorAll(selector)]
        .find((el) => el.textContent.trim() === label)
        .click(),
    { label, selector },
  );
};
const text = () => page.evaluate(() => document.body.innerText);
const shot = (name) => page.screenshot({ path: resolve(out, name + '.png') });
const theme = async (dark) => {
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' },
  ]);
  await page.evaluate(async (dark) => {
    document.body.toggleAttribute('data-ds-dark-theme', dark);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, dark);
};
const sortMenu = () => page.click('.bh-icon-btn[aria-label="更多"]');
const selectHistory = async (groupId) => {
  const record = (await rpc('channelHistory')).channels.find((c) => c.id === groupId);
  assert.ok(record, 'Synthetic ended Group is retained');
  await page.waitForSelector(`[data-history-channel-id="${groupId}"] button`);
  await page.click(`[data-history-channel-id="${groupId}"] button`);
};
const openHistory = async (groupId) => {
  await sortMenu();
  await click('已结束会话的历史', '[role=menuitem]');
  await page.waitForSelector('[data-channel-history]');
  await selectHistory(groupId);
  await page.waitForSelector('[data-history-source]');
};
const prepareScene = async () => {
  for (const channel of (await rpc('channels')).channels) {
    assert.equal(
      channel.name,
      'Purge synthetic QA',
      'Only known synthetic Channels may be ended by the fixture',
    );
    await rpc('channelGroupDelete', { channelId: channel.id });
  }
  const group = (await rpc('channelCreate', { name: 'Purge synthetic QA', members: [] })).channel;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[data-channel-id="${group.id}"]`);
  await page.click(`[data-channel-id="${group.id}"]`);
  await page.waitForSelector('.bh-composer-input');
  const body = 'PURGE_QA_ERASE synthetic disposable text';
  for (const value of [body, 'PURGE_QA_KEEP unselected history']) {
    await page.focus('.bh-composer-input');
    await page.keyboard.sendCharacter(value);
    await page.waitForFunction(
      (value) => {
        const input = document.querySelector('.bh-composer-input');
        return (input?.value ?? input?.innerText) === value;
      },
      {},
      value,
    );
    await page.locator('.bh-send-btn').click();
    await page.waitForFunction(
      (value) => {
        const input = document.querySelector('.bh-composer-input');
        return (input?.value ?? input?.innerText) === '' && document.body.innerText.includes(value);
      },
      {},
      value,
    );
  }
  await page.click('[aria-label="更多群管理操作"]');
  await click('解散群聊', '[role=menuitem]');
  await page.waitForSelector('[role=dialog]');
  return { group, body };
};
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.bh-panel-glyph');
  await page
    .waitForFunction(
      () => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '继续'),
      { timeout: 6000 },
    )
    .catch(() => {});
  await page.evaluate(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '继续')?.click(),
  );
  await page.waitForFunction(
    () => ![...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '继续'),
  );
  await page.click('button:has(.bh-panel-glyph)');
  await page.waitForSelector('.bh-region');
  if (mode === 'before') {
    const { group } = await prepareScene();
    await theme(false);
    await shot('before-delete-confirm-light');
    await theme(true);
    await shot('before-delete-confirm-dark');
    await click('解散群聊', '[role=dialog] button');
    await page.waitForFunction(
      (id) => !document.querySelector(`[data-channel-id="${id}"]`),
      {},
      group.id,
    );
    await sortMenu();
    assert.equal((await text()).includes('已结束会话的历史'), false);
    await theme(false);
    await shot('before-menu-light');
    await theme(true);
    await shot('before-menu-dark');
  } else if (mode === 'restart') {
    const scene = JSON.parse(readFileSync(sceneFile, 'utf8'));
    await openHistory(scene.groupId);
    assert.ok((await text()).includes('正文已清除'));
    assert.equal((await text()).includes(scene.body), false);
    assert.ok((await text()).includes('PURGE_QA_KEEP'));
    await theme(false);
    await shot('after-restart-light');
    await theme(true);
    await shot('after-restart-dark');
    console.log('PASS cold restart retained tombstone and unselected history');
  } else {
    const { group, body } = await prepareScene();
    await theme(false);
    await shot('after-delete-confirm-light');
    await theme(true);
    await shot('after-delete-confirm-dark');
    await click('解散群聊', '[role=dialog] button');
    await page.waitForFunction(
      (id) => !document.querySelector(`[data-channel-id="${id}"]`),
      {},
      group.id,
    );
    const history = await rpc('channelHistorySources', { channelId: group.id });
    assert.equal(history.sources.length, 2, 'A same-name Group has a fresh history identity');
    assert.ok(history.sources.some((s) => s.body === body));
    await sortMenu();
    await theme(false);
    await shot('after-menu-light');
    await theme(true);
    await shot('after-menu-dark');
    await click('已结束会话的历史', '[role=menuitem]');
    await selectHistory(group.id);
    await page.waitForSelector('[data-history-source]');
    await theme(false);
    await shot('after-retained-light');
    await page.evaluate(
      (body) =>
        [...document.querySelectorAll('[data-history-source]')]
          .find((el) => el.textContent.includes(body))
          .querySelector('input')
          .click(),
      body,
    );
    await click('预览内容清除范围');
    await page.waitForFunction(() => document.body.innerText.includes('受影响的全部会话位置'));
    await theme(false);
    await shot('after-preview-light');
    await theme(true);
    await shot('after-preview-dark');
    assert.equal((await text()).includes('DSH Session'), false);
    await page.click('[aria-label="清除边界的说明"]');
    await page.waitForFunction(() => document.body.innerText.includes('DSH Session'));
    await page.evaluate(async () => {
      await Promise.all(
        [...document.querySelectorAll('[role=tooltip]')].flatMap((el) =>
          el.getAnimations().map((animation) => animation.finished),
        ),
      );
    });
    await shot('after-boundaries-dark');
    await page.click('[aria-label="清除边界的说明"]');
    await click('取消');
    assert.ok((await text()).includes(body));
    assert.ok(
      (await rpc('channelHistorySources', { channelId: group.id })).sources.some(
        (s) => s.body === body,
      ),
    );
    await click('预览内容清除范围');
    await click('确认永久清除所选正文');
    await page.waitForFunction(() => document.body.innerText.includes('已清除所选正文'));
    assert.equal((await text()).includes(body), false);
    assert.ok((await text()).includes('PURGE_QA_KEEP'));
    await theme(false);
    await shot('after-complete-light');
    await theme(true);
    await shot('after-complete-dark');
    const bounds = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]:has([data-channel-history])');
      const rect = dialog.getBoundingClientRect();
      return { width: rect.width, top: rect.top, bottom: rect.bottom, viewport: innerHeight };
    });
    assert.equal(bounds.width, 560);
    assert.ok(bounds.top >= 24 && bounds.bottom <= bounds.viewport - 24);
    await page.setViewport({ width: 390, height: 620, deviceScaleFactor: 1 });
    await page.waitForFunction(
      () =>
        document
          .querySelector('[role="dialog"]:has([data-channel-history])')
          .getBoundingClientRect().width <=
        innerWidth - 48,
    );
    await shot('after-compact-dark');
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => !document.querySelector('[role="dialog"]:has([data-channel-history])'),
    );
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    writeFileSync(sceneFile, JSON.stringify({ groupId: group.id, body, port }, null, 2));
    console.log(
      'PASS actual Client send/delete/history/preview/cancel/confirm; selected body removed, unselected retained',
    );
  }
} catch (error) {
  await shot('failure-' + mode).catch(() => {});
  console.error((await text()).slice(0, 2500));
  throw error;
} finally {
  await browser.close();
}
