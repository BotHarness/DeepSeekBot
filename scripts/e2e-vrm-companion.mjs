import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { rpc } from './verify-app.mjs';
const root = resolve('node_modules/.pnpm');
const puppeteer = createRequire(
  resolve(
    root,
    readdirSync(root).find((name) => name.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const instancePath = resolve(
  process.env.BH_E2E_INSTANCE ?? '.humanlayer/verify/vrm-2222/instance.json',
);
const instance = JSON.parse(readFileSync(instancePath, 'utf8'));
const out = resolve(dirname(instancePath), 'evidence');
mkdirSync(out, { recursive: true });
const phase = process.argv[2] ?? 'open';
const bots = (await rpc(instance, 'botharness/list')).bots;
const ada = bots.find((b) => b.displayName === 'VRM QA Ada');
assert(ada, 'Seed VRM QA Ada in the isolated Host first.');
const browser = await puppeteer.launch({
  headless: true,
  userDataDir: resolve(dirname(instancePath), 'browser'),
  args: ['--no-sandbox', '--lang=en-US'],
  protocolTimeout: 180000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (response) => {
  if (response.status() >= 400)
    errors.push(response.status() + ' ' + response.url().replace(/token=[^&]+/, 'token=*'));
});
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
const aria = (name) => '::-p-aria(' + name + ')';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function visible(selector) {
  for (const node of await page.$$(selector)) if (await node.isVisible()) return node;
  return null;
}
async function click(selector) {
  const node = await visible(selector);
  assert(node, 'Missing visible control: ' + selector);
  await node.click();
}
async function sceneAction(label) {
  for (const button of await page.$$('[data-vrm-scene-menu]')) {
    if (!(await button.isVisible())) continue;
    await button.click();
    await delay(200);
    const picked = await page.$$eval(
      '[role="menuitem"]',
      (items, name) => {
        const item = items.find((n) => n.textContent.trim() === name);
        item?.click();
        return !!item;
      },
      label,
    );
    if (picked) return true;
    await page.keyboard.press('Escape');
    await delay(100);
  }
  return false;
}
async function capture(label) {
  writeFileSync(
    resolve(out, label + '.layout.json'),
    JSON.stringify(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem('botharness.bot-mode-layout') ?? 'null'),
      ),
      null,
      2,
    ),
  );
  await page.screenshot({ path: resolve(out, label + '.png') });
  writeFileSync(
    resolve(out, label + '.aria.json'),
    JSON.stringify(await page.accessibility.snapshot({ interestingOnly: true }), null, 2),
  );
  writeFileSync(resolve(out, label + '.console.json'), JSON.stringify(errors, null, 2));
}
try {
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  for (let attempt = 0; attempt < 40 && !(await page.$('.bh-root.bh-main')); attempt++) {
    for (const name of ['Continue', '继续', 'Bot mode', 'Bot 模式']) {
      const control = await visible(aria(name));
      if (control) await control.click().catch(() => null);
    }
    await delay(500);
  }
  await page.waitForSelector('.bh-root.bh-main');
  await delay(1500);
  await capture('initial-' + phase);
  if (phase !== 'removed') {
    const skip = (await visible(aria('跳过引导'))) ?? (await visible(aria('Skip onboarding')));
    if (skip) await skip.click();
    if (phase === 'instances') {
      for (let n = 0; n < 16; n++) {
        if (!(await sceneAction('Delete instance'))) break;
        await delay(100);
      }
    }
    await click('button[data-channel-id="dm-' + ada.slug + '"]');
    await delay(500);
    if (!(await visible('[data-dock-header="bh:channel-body"]')))
      await page.evaluate(() =>
        [...document.querySelectorAll('button')]
          .find(
            (b) => b.offsetParent && /^(Messages|消息)/.test(b.getAttribute('aria-label') ?? ''),
          )
          ?.click(),
      );
    await page.waitForSelector('[data-dock-header="bh:channel-body"]');
    const homeClose = (await visible(aria('关闭 首页'))) ?? (await visible(aria('Close Home')));
    if (homeClose) await homeClose.click();
    if (!(await visible('[data-vrm-bot="' + ada.slug + '"]')))
      await click('button[aria-label="VRM Companion"]');
    await page.waitForSelector('[data-vrm-loaded="true"]', { timeout: 45000 });
    await delay(1000);
    if (phase === 'lifecycle') {
      await click('button[aria-label="VRM Companion"]');
      const groups = (await rpc(instance, 'botharness/channels')).channels;
      const group = groups.find((c) => c.name === 'VRM QA Group');
      assert(group, 'Seed VRM QA Group first.');
      await click('button[data-channel-id="' + group.id + '"]');
      await delay(500);
      assert.equal(await visible('button[aria-label="VRM Companion"]'), null);
      const fixed = await page.$$eval('[data-vrm-bot]', (ns) => ns.map((n) => n.dataset.vrmBot));
      assert.equal(fixed.length, 2);
      await capture('group-fixed-only');
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await delay(300);
      await capture('reduced-motion');
      await page.evaluate(() => {
        window.qaContexts = [...document.querySelectorAll('[data-vrm-stage] canvas')].map((n) =>
          n.getContext('webgl2'),
        );
      });
      await page.evaluate(() =>
        window.qaContexts[0].getExtension('WEBGL_lose_context').loseContext(),
      );
      await delay(500);
      assert.match(await page.$eval('body', (n) => n.innerText), /3D rendering interrupted/);
      await capture('context-loss');
      await click(aria('Retry character'));
      await delay(1500);
      assert.doesNotMatch(await page.$eval('body', (n) => n.innerText), /3D rendering interrupted/);
      await page.evaluate(() => {
        window.qaContexts = [...document.querySelectorAll('[data-vrm-stage] canvas')].map((n) =>
          n.getContext('webgl2'),
        );
      });
      assert(await sceneAction('Delete instance'), 'Missing Delete instance');
      await delay(300);
      const lost = await page.evaluate(() => window.qaContexts.map((c) => c.isContextLost()));
      assert.equal(lost.filter(Boolean).length, 1);
      assert.equal(await page.$$eval('[data-vrm-bot]', (ns) => ns.length), 1);
      await capture('deleted-instance');
      writeFileSync(
        resolve(out, 'lifecycle-facts.json'),
        JSON.stringify({ fixed, deletedContexts: lost, groupContextEntry: false }, null, 2),
      );
    }
    if (phase === 'instances') {
      const bob = bots.find((b) => b.displayName === 'VRM QA Bob');
      assert(bob);
      await click('[data-vrm-pin]');
      await delay(800);
      await click('button[aria-label="VRM Companion"]');
      await click('button[data-channel-id="dm-' + bob.slug + '"]');
      await delay(700);
      await click('button[aria-label="VRM Companion"]');
      await page.waitForSelector('[data-vrm-bot="' + bob.slug + '"] [data-vrm-loaded="true"]');
      await click('[data-vrm-pin]');
      await delay(800);
      await click('button[aria-label="VRM Companion"]');
      const bindings = () =>
        page.$$eval('[data-vrm-bot]', (ns) => ns.map((n) => n.dataset.vrmBot).sort());
      assert.deepEqual(await bindings(), [ada.slug, bob.slug].sort());
      await capture('two-fixed');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => document.querySelectorAll('[data-vrm-loaded="true"]').length === 2,
      );
      assert.deepEqual(await bindings(), [ada.slug, bob.slug].sort());
      assert.equal(await page.$$eval('[data-vrm-speaking="true"]', (ns) => ns.length), 0);
      await capture('two-restored');
      const before = await page.$$eval('[data-vrm-stage]', (ns) =>
        ns.map((n) => ({ ...n.dataset })),
      );
      await delay(5000);
      const after = await page.$$eval('[data-vrm-stage]', (ns) =>
        ns.map((n) => ({ ...n.dataset })),
      );
      writeFileSync(
        resolve(out, 'two-metrics.json'),
        JSON.stringify(
          {
            viewport: { width: 1440, height: 900 },
            browser: await browser.version(),
            seconds: 5,
            before,
            after,
          },
          null,
          2,
        ),
      );
    }
    if (phase === 'send' || phase === 'work') {
      await capture('before-send');
      const composer = await visible(aria('发消息给 VRM QA Ada'));
      assert(composer);
      await composer.type(
        phase === 'work'
          ? 'VRM 工作状态验证：请先用你可用的 shell 工具执行只等待 4 秒的命令（Windows 使用 Start-Sleep -Seconds 4），然后通过 channel_send 回复「角色动作验证完成，可以验收了」。请实际调用工具，不要只描述。'
          : 'VRM 验证 ' +
              Date.now() +
              '：请用 channel_send 回复我一段约 80 字的中文小故事，关于一个机器人在花园工作。',
      );
      await composer.press('Enter');
      const facts = [];
      const deadline = Date.now() + 150000;
      const observed = new Set();
      let spoke = false;
      while (Date.now() < deadline) {
        const state = await page.$eval('[data-vrm-bot="' + ada.slug + '"]', (n) => ({
          activity: n.dataset.vrmActivity,
          speaking: n.dataset.vrmSpeaking,
          text: n.querySelector('[data-vrm-speech]')?.textContent ?? '',
        }));
        if (!observed.has(state.activity)) {
          observed.add(state.activity);
          facts.push({
            at: Date.now(),
            state,
            canonical: await rpc(instance, 'botharness/activitySnapshot'),
          });
          await capture('activity-' + state.activity);
        }
        if (state.speaking === 'true' && state.text.length >= 8) {
          spoke = true;
          await capture('speaking');
          facts.push({
            at: Date.now(),
            state,
            messages: await rpc(instance, 'botharness/channelMessages', {
              channelId: 'dm-' + ada.slug,
              limit: 10,
            }),
          });
          break;
        }
        await delay(150);
      }
      writeFileSync(resolve(out, phase + '-facts.json'), JSON.stringify(facts, null, 2));
      assert(spoke, 'No committed reply drove speech before deadline; inspect saved facts.');
    }
  } else {
    assert.equal(await page.$$eval('[data-vrm-bot]', (ns) => ns.length), 0);
  }
  await capture(phase);
  console.log(
    JSON.stringify({
      phase,
      text: await page.$eval('body', (n) => n.innerText.slice(-2500)),
      stages: await page.$$eval('[data-vrm-stage]', (ns) => ns.map((n) => ({ ...n.dataset }))),
      errors,
    }),
  );
  assert.equal(errors.length, 0);
} catch (error) {
  await capture(phase + '.failure');
  console.log(
    JSON.stringify({
      phase,
      error: error.message,
      text: await page.$eval('body', (n) => n.innerText.slice(-2500)),
      errors,
    }),
  );
  process.exitCode = 1;
} finally {
  if (process.platform === 'win32') {
    const ownPid = browser.process()?.pid;
    let timer;
    const closed = await Promise.race([
      browser.close().then(() => true),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), 5000);
      }),
    ]).finally(() => clearTimeout(timer));
    if (!closed && ownPid) {
      await browser.disconnect();
      await promisify(execFile)('taskkill', ['/PID', String(ownPid), '/T', '/F']).catch(() => {});
    }
  } else await browser.close();
}
