import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rpc } from './verify-app.mjs';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

if (!process.env.BH_E2E_INSTANCE) throw new Error('Set BH_E2E_INSTANCE to the task-owned Host');
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const out = resolve(dirname(process.env.BH_E2E_INSTANCE), `guide-${Date.now()}`);
mkdirSync(out, { recursive: true });
const store = resolve('node_modules/.pnpm');
const puppeteer = createRequire(
  resolve(
    store,
    readdirSync(store).find((n) => n.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const browser = process.env.BH_GUIDE_CDP
  ? await puppeteer.connect({ browserURL: process.env.BH_GUIDE_CDP, defaultViewport: null })
  : await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--lang=en-US'],
      userDataDir: resolve(dirname(process.env.BH_E2E_INSTANCE), 'browser'),
    });
const page = process.env.BH_GUIDE_CDP
  ? (await browser.pages()).find((p) => p.url().startsWith('dsh-app://'))
  : await browser.newPage();
if (!process.env.BH_GUIDE_CDP)
  for (const other of await browser.pages()) if (other !== page) await other.close();
const errors = [];
const sends = [];
page.on('request', (request) => {
  if (/channelSend|requestHomeMessage|sendHome/.test(request.url()))
    sends.push(new URL(request.url()).pathname);
});
page.on('pageerror', (e) => errors.push(e.message));
page.setDefaultTimeout(45000);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (name) => page.locator(`::-p-aria(${name})`).setTimeout(45000).click();
const capture = async (name) => {
  await page.screenshot({ path: resolve(out, `${name}.png`), waitForFonts: false });
  writeFileSync(
    resolve(out, `${name}.aria.json`),
    JSON.stringify(await page.accessibility.snapshot({ interestingOnly: false }), null, 2),
  );
  writeFileSync(resolve(out, 'console.json'), JSON.stringify(errors, null, 2));
};
const layout = () =>
  page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('botharness.bot-mode-layout'));
    if (value?.layout) delete value.layout.activeGroup;
    return JSON.stringify(value);
  });
const desiredModel =
  process.env.BH_GUIDE_MODEL_ID ??
  ((await rpc(instance, 'botharness/modelPlan', { slug: 'bot-061cae3a7431434c94aec044783d7f9f' }))
    .plan?.orchestrator?.model === 'deepseek-v4.1-flash'
    ? 'deepseek-v4-pro'
    : 'deepseek-v4.1-flash');
const desiredName = desiredModel === 'deepseek-v4-pro' ? 'DeepSeek V4 Pro' : 'DeepSeek V4.1 Flash';
const state = () => page.evaluate(() => window[Symbol.for('botharness.clientHelp')].state());
try {
  await page.setViewport({ width: 1440, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setUserAgentOverride', {
    userAgent: await browser.userAgent(),
    acceptLanguage: 'en-US,en',
  });
  if (process.env.BH_GUIDE_CDP) await page.reload({ waitUntil: 'domcontentloaded' });
  else {
    await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
    await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForFunction(() => !!window[Symbol.for('botharness.clientHelp')]);
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find(
          (b) =>
            [
              'Continue',
              'Configure later',
              'Skip tutorial',
              'Skip',
              '继续',
              '稍后配置',
              '跳过教程',
              '跳过',
            ].includes(b.textContent.trim()) && b.offsetParent,
        )
        ?.click(),
    );
    await pause(250);
  }
  if (!(await page.$('.bh-workspace-rail'))) await click('Bot mode');
  await pause(700);
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"] button')]
        .find((b) => ['Skip', '跳过'].includes(b.textContent.trim()))
        ?.click(),
    );
    await pause(200);
  }
  await capture('before');
  console.log(
    await page.$eval('.bh-workspace-rail button[aria-label="User guide"]', (e) => ({
      phase: 'entry',
      rect: e.getBoundingClientRect().toJSON(),
    })),
  );
  const origin =
    process.env.BH_GUIDE_CDP ?? new URL(browser.wsEndpoint()).origin.replace('ws:', 'http:');
  const targets = await (await fetch(origin + '/json/list')).json();
  const id = targets.find((t) => t.url === page.url() && t.type === 'page').id;
  const client = (action) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          'packages/deepseekbot/src/deepseekbot.mjs',
          'help-client',
          '--cdp',
          origin,
          '--target',
          id,
          '--action',
          action,
        ],
        { encoding: 'utf8' },
      ),
    );
  const content = client('content');
  assert(content.ok);
  writeFileSync(resolve(out, 'client-content.json'), JSON.stringify(content, null, 2));
  if (process.env.BH_GUIDE_CDP) {
    assert(content.result.topics.some((t) => t.id === 'vrm:companion-help'));
  }
  if (
    await page.$eval(
      '.bh-workspace-rail button[aria-label="User guide"]',
      (button) => button.getAttribute('aria-pressed') !== 'true',
    )
  )
    await page.locator('.bh-workspace-rail button[aria-label="User guide"]').click();
  assert.equal(
    await page.$eval(
      '.bh-guide-topics button[aria-pressed="true"]',
      (element) => element.textContent,
    ),
    'All',
  );
  const categories = await page.$$eval('.bh-guide-topics button', (buttons) =>
    buttons.map((button) => button.textContent),
  );
  for (const category of categories) {
    await page.locator(`.bh-guide-topics ::-p-text(${category})`).click();
    assert.ok((await page.$$eval('.bh-guide-question', (questions) => questions.length)) > 0);
  }
  await page.locator('.bh-guide-topics ::-p-text(All)').click();
  await page.locator('[id="help-question-botharness:change-model"]').click();
  await page.waitForSelector('.bh-guide-answer', { timeout: 5000 });
  await capture('answer');
  await click('Tob: Idle Tob No messages yet');
  await page.waitForSelector('[data-help-model-trigger]', { timeout: 45000 });
  await capture('selected');
  console.log(
    JSON.stringify({
      phase: 'before-start',
      availability: await page.evaluate(() =>
        window[Symbol.for('botharness.clientHelp')].availability('botharness:change-model'),
      ),
    }),
  );
  const normal = await layout();
  await click('Guide me');
  await page.waitForSelector('.driver-popover');
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => window[Symbol.for('botharness.clientHelp')].state().phase === 'idle',
  );
  await page.waitForFunction(() => document.activeElement?.textContent === 'Guide me');
  assert.equal(await layout(), normal);
  await click('Guide me');
  await pause(1000);
  console.log(JSON.stringify({ phase: 'after-start', state: await state() }));
  await page.waitForSelector('.driver-popover');
  assert.equal((await state()).phase, 'running');
  await capture('step-one');
  assert.equal(await layout(), normal);
  await page.locator('[data-help-model-trigger]').click();
  await pause(300);
  await capture('picker');
  await click('Next');
  await pause(600);
  await capture('step-two');
  assert.equal((await state()).step, 1);
  writeFileSync(
    resolve(out, 'result.json'),
    JSON.stringify({ stage: 'picker-ready', state: await state(), normal, errors }, null, 2),
  );
  await page.locator('input[role=combobox][aria-label="Conversation model"]').click();
  await page.keyboard.down('Meta');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Meta');
  await page.keyboard.type(desiredName);
  await pause(700);
  await capture('options');
  const options = await page.$$eval('[role=option]', (rows) =>
    rows.map((r) => ({ text: r.textContent, value: r.getAttribute('data-value') })),
  );
  writeFileSync(resolve(out, 'options.json'), JSON.stringify(options, null, 2));
  await page
    .locator('[role=option][data-value*=opencode-go][data-value*="' + desiredModel + '"]')
    .setTimeout(15000)
    .click();
  await page.waitForFunction(() => !document.querySelector('.driver-popover-next-btn')?.disabled);
  await capture('saved');
  await click('Done');
  await pause(600);
  assert.equal((await state()).phase, 'idle');
  await pause(300);
  assert.equal(await layout(), normal);
  await capture('restored');
  assert.equal(client('state').result.phase, 'idle');
  if (!process.env.BH_GUIDE_CDP) {
    const model = await rpc(instance, 'botharness/modelPlan', {
      slug: 'bot-061cae3a7431434c94aec044783d7f9f',
    });
    writeFileSync(resolve(out, 'canonical-model.json'), JSON.stringify(model, null, 2));
    assert.equal(model.plan.orchestrator.model, desiredModel);
  }
  await page.keyboard.press('Escape');
  await pause(300);
  if (
    await page.$eval(
      '.bh-workspace-rail button[aria-label="User guide"]',
      (button) => button.getAttribute('aria-pressed') !== 'true',
    )
  )
    await page.locator('.bh-workspace-rail button[aria-label="User guide"]').click();
  const editor = 'textarea[placeholder="Message Tob"],[role=textbox][aria-label="Message Tob"]';
  await page.locator(editor).click();
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'a',
    code: 'KeyA',
    modifiers: 4,
    commands: ['selectAll'],
  });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 4 });
  await page.keyboard.press('Backspace');
  await page.waitForFunction(
    (selector) => {
      const e = document.querySelector(selector);
      return (e.value ?? e.textContent) === '';
    },
    {},
    editor,
  );
  await click('Ask Tob');
  await pause(1200);
  await capture('draft-prefilled');
  const draft = await page.$eval(editor, (e) => e.value ?? e.innerText);
  assert(draft.includes('Tob'));
  await click('Ask Tob');
  await pause(1000);
  assert.equal(await page.$eval(editor, (e) => e.value ?? e.innerText), draft);
  await click('Insert question');
  await pause(600);
  assert.equal(await page.$eval(editor, (e) => e.value ?? e.innerText), draft + '\n\n' + draft);
  const persistedDrafts = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter(
        (key) =>
          key.startsWith('botharness.composer.v1:') &&
          decodeURIComponent(key).includes('"dm-bot-061cae3a7431434c94aec044783d7f9f"]'),
      )
      .map((key) => JSON.parse(localStorage.getItem(key)).draft),
  );
  assert.equal(persistedDrafts.length, 1);
  assert.equal(persistedDrafts[0].text, draft + '\n\n' + draft);
  writeFileSync(resolve(out, 'draft-canonical.json'), JSON.stringify(persistedDrafts[0], null, 2));
  await capture('draft-appended');
  const searchNavigation = async (query) => {
    await page.keyboard.down('Alt');
    await page.keyboard.press('KeyK');
    await page.keyboard.up('Alt');
    await page.waitForSelector('[role="dialog"] input[role="combobox"]');
    await page.locator('[role="dialog"] input[role="combobox"]').fill(query);
  };
  const activityControl = '.bh-workspace-rail [data-pinned-panel="activity-center"]';
  const initialActivity = await page.$eval(activityControl, (element) =>
    element.getAttribute('aria-pressed'),
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    await searchNavigation('Activity Center');
    await page
      .locator('[data-navigation-kind="panel"][data-navigation-id="activity-center"]')
      .click();
    await page.waitForFunction(
      (selector, expected) =>
        document.querySelector(selector)?.getAttribute('aria-pressed') === expected,
      {},
      activityControl,
      attempt === 0 ? (initialActivity === 'true' ? 'false' : 'true') : initialActivity,
    );
  }
  await searchNavigation('How do I change');
  await page.waitForSelector(
    '[data-navigation-kind="faq"][data-navigation-id="botharness:change-model"]',
  );
  await page.keyboard.press('Enter');
  await page.waitForSelector('[id="help-question-botharness:change-model"][aria-expanded="true"]');
  assert.equal((await state()).phase, 'idle');
  await capture('search-faq');
  assert.equal(errors.length, 0);
  assert.deepEqual(sends, []);
  writeFileSync(
    resolve(out, 'result.json'),
    JSON.stringify({ result: 'model-change-layout-cli-draft', errors }, null, 2),
  );
  console.log(JSON.stringify({ out, errors, result: 'model-change-layout-cli-draft' }));
} catch (error) {
  console.log(JSON.stringify({ phase: 'failure', state: await state().catch(() => null) }));
  await capture('failure').catch(() => {});
  writeFileSync(resolve(out, 'failure.txt'), String(error.stack));
  console.error(JSON.stringify({ out, error: String(error) }));
  process.exitCode = 1;
} finally {
  if (process.env.BH_GUIDE_CDP) browser.disconnect();
  else await browser.close();
}
