import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

if (!process.env.BH_E2E_INSTANCE) throw new Error('Set BH_E2E_INSTANCE to the task-owned Host');
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const base = dirname(resolve(process.env.BH_E2E_INSTANCE));
const out = resolve(base, `panel-guide-${Date.now()}`);
mkdirSync(out, { recursive: true });
const modules = resolve('node_modules/.pnpm');
const puppeteer = createRequire(
  resolve(
    modules,
    readdirSync(modules).find((name) => name.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--lang=en-US'],
  userDataDir: resolve(base, 'panel-guide-browser'),
});
const startupPages = await browser.pages();
const page = await browser.newPage();
const errors = [];
const sends = [];
const network = [];
const requests = new Map();
const graphFrames = [];
const diagnostics = [];
page.on('console', (message) => {
  if (['error', 'warn'].includes(message.type())) diagnostics.push(message.text());
});
page.on('pageerror', (error) => errors.push(error.message));
page.on('requestfailed', (request) =>
  network.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }),
);
page.on('response', (response) => {
  if (response.status() >= 400)
    network.push({ path: new URL(response.url()).pathname, status: response.status() });
});
page.on('request', (request) => {
  requests.set(request, {
    path: new URL(request.url()).pathname,
    type: request.resourceType(),
    started: Date.now(),
  });
  if (/channelSend|requestHomeMessage|sendHome/.test(request.url()))
    sends.push(new URL(request.url()).pathname);
});
page.on('response', (response) => {
  const entry = requests.get(response.request());
  if (entry) entry.status = response.status();
});
page.on('requestfinished', (request) => {
  const entry = requests.get(request);
  if (entry) entry.finished = Date.now();
});
page.on('requestfailed', (request) => {
  const entry = requests.get(request);
  if (entry) entry.failed = request.failure()?.errorText;
});
page.setDefaultTimeout(20000);
const pause = (duration = 150) => new Promise((done) => setTimeout(done, duration));
const click = (name) => page.locator(`::-p-aria(${name})`).click();
const sessionsControl = async () => {
  await page.locator('[data-dock-header="bh:channel-body"]').click({ button: 'right' });
  await page.locator('[data-pointer-menu] ::-p-text(Sessions)').click();
  await pause();
};
const capture = async (name, subject = page) => {
  await subject.screenshot({ path: resolve(out, `${name}.png`), waitForFonts: false });
  writeFileSync(
    resolve(out, `${name}.aria.json`),
    JSON.stringify(await subject.accessibility.snapshot({ interestingOnly: false }), null, 2),
  );
  writeFileSync(resolve(out, 'console.json'), JSON.stringify(errors, null, 2));
  writeFileSync(resolve(out, 'network.json'), JSON.stringify(network, null, 2));
  writeFileSync(resolve(out, 'graph-frames.json'), JSON.stringify(graphFrames, null, 2));
  writeFileSync(resolve(out, `${name}.state.json`), JSON.stringify(await state(), null, 2));
};
const layout = () =>
  page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('botharness.bot-mode-layout'));
    if (value?.layout) delete value.layout.activeGroup;
    return JSON.stringify(value);
  });
const state = () => page.evaluate(() => window[Symbol.for('botharness.clientHelp')].state());
const next = async () => {
  const before = await state();
  await page.waitForFunction(() => {
    const button = document.querySelector('.driver-popover-next-btn');
    return button && !button.disabled;
  });
  await page.locator('.driver-popover-next-btn').click();
  await page.waitForFunction(
    (before) => {
      const current = window[Symbol.for('botharness.clientHelp')].state();
      return current.phase !== before.phase || current.step !== before.step;
    },
    {},
    before,
  );
};
const question = async (topic, suffix) => {
  await page.locator(`.bh-guide-topics ::-p-text(${topic})`).click();
  await page.locator(`[id="help-question-botharness:panel-help:${suffix}"]`).click();
};
const bounds = (selector) =>
  page.$eval(selector, (element) => element.getBoundingClientRect().toJSON());
const drag = async (source, target) => {
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(source.x + 15, source.y, { steps: 5 });
  await pause();
  await page.mouse.move(target.x, target.y, { steps: 25 });
  for (let repeat = 0; repeat < 3; repeat++) {
    await page.mouse.move(target.x, target.y);
    await pause();
  }
  await page.mouse.up();
  await pause();
};
try {
  for (const restored of startupPages) await restored.close();
  assert.equal((await browser.pages()).length, 1);
  writeFileSync(
    resolve(out, 'browser-ownership.json'),
    JSON.stringify({ startupPagesClosed: startupPages.length, activePages: 1 }, null, 2),
  );
  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: process.env.BH_GUIDE_THEME ?? 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  cdp.on('Network.eventSourceMessageReceived', (event) => {
    try {
      const frame = JSON.parse(event.data);
      if (frame.type === 'graph')
        graphFrames.push({
          receivedAt: new Date().toISOString(),
          revision: frame.graph.rev,
          vrm: frame.graph.entries.some((entry) => entry.id === '@botharness/vrm-companion'),
        });
    } catch {}
  });
  await cdp.send('Emulation.setUserAgentOverride', {
    userAgent: await browser.userAgent(),
    acceptLanguage: 'en-US,en',
  });
  await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window[Symbol.for('botharness.clientHelp')]);
  for (let repeat = 0; repeat < 8; repeat++) {
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find(
          (button) =>
            ['Continue', 'Configure later', 'Skip tutorial', 'Skip'].includes(
              button.textContent.trim(),
            ) && button.offsetParent,
        )
        ?.click(),
    );
    await pause();
  }
  if (!(await page.$('.bh-workspace-rail'))) await click('Bot mode');
  await pause();
  for (let repeat = 0; repeat < 5; repeat++) {
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"] button')]
        .find((button) => button.textContent.trim() === 'Skip')
        ?.click(),
    );
    await pause();
  }
  await click(process.env.BH_GUIDE_BOT_LABEL ?? 'Tob: Idle Tob No messages yet');
  await page.waitForSelector('[data-channel-workspace]');
  if (!(await page.$('[data-dock-header="user-guide"]')))
    await page.locator('.bh-workspace-rail button[aria-label="User guide"]').click();
  const editor = 'textarea[placeholder="Message Tob"],[role="textbox"][aria-label="Message Tob"]';
  await page.waitForSelector(editor);
  await page.locator(editor).fill('S2 guide draft — do not send');
  await question('Sessions', 'sessions:open');
  if (await page.$('[data-dock-header="sessions"]'))
    await page.locator('[data-help-panel-control="sessions"]').click();
  if (process.env.BH_GUIDE_HIDDEN === '1') await sessionsControl();
  await click('Close Messages');
  await pause();
  const beforeDiscovery = await layout();
  await capture('discovery-before');
  await click('Find in Messages');
  await page.waitForSelector('.driver-popover');
  assert.equal(await page.$eval('.driver-popover-next-btn', (button) => button.disabled), true);
  await page.locator('.bh-workspace-rail [data-pinned-panel="bh:channel-body"]').click();
  await next();
  if (process.env.BH_GUIDE_HIDDEN === '1') {
    await page.locator('[data-dock-header="bh:channel-body"]').click({ button: 'right' });
    await page.waitForSelector('[data-pointer-menu].bh-help-owned-popup');
    await capture('discovery-hidden-control-menu');
    await page.locator('[data-pointer-menu] ::-p-text(Sessions)').click();
  }
  await page.locator('[data-help-panel-control="sessions"]').click();
  await next();
  assert.equal((await state()).phase, 'running');
  await capture('discovery-opened');
  await next();
  assert.equal((await state()).phase, 'idle');
  assert.equal(await layout(), beforeDiscovery);
  assert.equal(await page.$('[data-dock-header="bh:channel-body"]'), null);
  await capture('discovery-restored');
  await page.locator('.bh-workspace-rail [data-pinned-panel="bh:channel-body"]').click();
  if (process.env.BH_GUIDE_HIDDEN === '1') {
    assert.equal(await page.$('[data-help-panel-control="sessions"]'), null);
    await sessionsControl();
  }
  await page.waitForSelector(editor);
  await page.$eval(editor, (element) => {
    element.dataset.guideComposerIdentity = 'original';
  });
  await question('Sessions', 'sessions:layout');
  const beforePractice = await layout();
  await click('Practice layout');
  await page.waitForSelector('[data-dock-header="sessions"]');
  await next();
  const initialDivider = await bounds('[data-channel-workspace] [role="separator"]');
  const initialVertical = initialDivider.height > initialDivider.width;
  const initialCenter = {
    x: initialDivider.x + initialDivider.width / 2,
    y: initialDivider.y + initialDivider.height / 2,
  };
  await drag(initialCenter, {
    x: initialCenter.x + (initialVertical ? 20 : 0),
    y: initialCenter.y + (initialVertical ? 0 : 20),
  });
  await pause();
  assert.equal(await page.$eval('.driver-popover-next-btn', (button) => button.disabled), true);
  await page.setViewport({ width: 1360, height: 880 });
  await pause();
  assert.equal(await page.$eval('.driver-popover-next-btn', (button) => button.disabled), true);
  await page.setViewport({ width: 1440, height: 900 });
  await capture('nested-move-refuses-resize');
  const handle = await bounds('[data-dock-header="sessions"] [data-panel-hide]');
  const messages = await bounds('[data-channel-leaf="messages"]');
  await drag(
    { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
    { x: messages.x + messages.width / 2, y: messages.y + messages.height - 25 },
  );
  await capture('nested-moved');
  await next();
  await page.setViewport({ width: 1360, height: 880 });
  await pause();
  assert.equal(await page.$eval('.driver-popover-next-btn', (button) => button.disabled), true);
  await page.setViewport({ width: 1440, height: 900 });
  await pause();
  assert.equal(await page.$eval('.driver-popover-next-btn', (button) => button.disabled), true);
  assert.equal(await layout(), beforePractice);
  const divider = await bounds('[data-channel-workspace] [role="separator"]');
  const vertical = divider.height > divider.width;
  const center = { x: divider.x + divider.width / 2, y: divider.y + divider.height / 2 };
  await drag(center, { x: center.x + (vertical ? 45 : 0), y: center.y + (vertical ? 0 : 45) });
  await capture('nested-resized');
  await next();
  await page.locator('[data-dock-header="sessions"] [data-panel-hide]').click();
  await next();
  await page.locator('[data-help-panel-control="sessions"]').click();
  await next();
  assert.equal((await state()).phase, 'idle');
  assert.equal(await layout(), beforePractice);
  assert.equal(
    await page.$eval(editor, (element) => element.dataset.guideComposerIdentity),
    'original',
  );
  assert.equal(
    await page.$eval(editor, (element) => element.value ?? element.innerText),
    'S2 guide draft — do not send',
  );
  await capture('nested-restored');
  const origin = new URL(browser.wsEndpoint()).origin.replace('ws:', 'http:');
  const targets = await (await fetch(origin + '/json/list')).json();
  const target = targets.find((item) => item.type === 'page' && item.url === page.url());
  const content = JSON.parse(
    execFileSync(
      process.execPath,
      [
        'packages/deepseekbot/src/deepseekbot.mjs',
        'help-client',
        '--cdp',
        origin,
        '--target',
        target.id,
        '--action',
        'content',
      ],
      { encoding: 'utf8' },
    ),
  );
  assert.equal(content.ok, true);
  writeFileSync(resolve(out, 'cli-content.json'), JSON.stringify(content, null, 2));
  if (process.env.BH_GUIDE_VRM === '1') {
    if (process.env.BH_GUIDE_VRM_INSTANCES === '1') {
      const existing = await page.$$('[data-vrm-scene-menu]');
      for (const button of existing) {
        if (await button.evaluate((element) => !!element.closest('[data-channel-workspace]')))
          continue;
        await button.click();
        await click('Delete instance');
      }
    }
    await page.locator('.bh-guide-topics ::-p-text(VRM Companion)').click();
    await page.locator('[id="help-question-vrm:change-camera"]').click();
    await capture('vrm-closed');
    if (!(await page.$('[data-vrm-lesson-target]')))
      await page.locator('[data-help-panel-control="botharness-vrm"]').click();
    await page.waitForFunction(
      () => {
        const help = window[Symbol.for('botharness.clientHelp')];
        return help.availability('vrm:change-camera').status === 'ready';
      },
      { timeout: 90000 },
    );
    await capture('vrm-ready');
    await click('Guide me');
    await page.waitForSelector('.driver-popover');
    assert.equal(await page.$eval('.driver-popover-next-btn', (button) => button.disabled), true);
    await page.locator('[data-vrm-scene-menu]').click();
    await page.waitForSelector('.bh-help-owned-popup');
    await capture('vrm-scene');
    await next();
    const description = await page.$eval(
      '.driver-popover-description',
      (element) => element.textContent,
    );
    const camera = description.includes('Room view') ? 'Room view' : 'Desk view';
    if (
      (await page.$eval('[data-vrm-scene-menu]', (button) =>
        button.getAttribute('aria-expanded'),
      )) !== 'true'
    )
      await page.locator('[data-vrm-scene-menu]').click();
    await click(camera);
    await capture('vrm-camera-changed');
    await next();
    assert.equal((await state()).phase, 'idle');
    await page.locator('[data-vrm-scene-menu]').click();
    await capture('vrm-camera-retained');
    await page.keyboard.press('Escape');
    await click('Guide me');
    await page.waitForSelector('.driver-popover');
    await page.locator('[data-vrm-scene-menu]').click();
    await next();
    const retained = await page.$eval(
      '.driver-popover-description',
      (element) => element.textContent,
    );
    assert(retained.includes(camera === 'Room view' ? 'Desk view' : 'Room view'));
    await page.keyboard.press('Escape');
    assert.equal((await state()).reason, 'closed');
    if (process.env.BH_GUIDE_VRM_INSTANCES === '1') {
      const contextual = '[data-channel-workspace] [data-vrm-scene-menu]';
      await click('Pin character globally');
      await click('Pin character globally');
      await page.waitForFunction(
        () => {
          const availability =
            window[Symbol.for('botharness.clientHelp')].availability('vrm:change-camera');
          return availability.status === 'select' && availability.targets.length === 3;
        },
        { timeout: 90000 },
      );
      const availability = await page.evaluate(() =>
        window[Symbol.for('botharness.clientHelp')].availability('vrm:change-camera'),
      );
      assert.equal(new Set(availability.targets.map((target) => target.id)).size, 3);
      assert.equal(await page.$eval('.bh-guide-actions button', (button) => button.disabled), true);
      await click('Choose a target');
      await click(availability.targets[1].label);
      await capture('vrm-explicit-selection');
      await click('Guide me');
      await page.waitForSelector('.driver-popover');
      assert.equal((await page.$('.driver-active-element [data-vrm-scene-menu]')) !== null, true);
      await page.locator('.driver-active-element [data-vrm-scene-menu]').click();
      await click('Delete instance');
      await page.waitForFunction(
        () => window[Symbol.for('botharness.clientHelp')].state().phase === 'idle',
      );
      assert.equal((await state()).reason, 'target-unavailable');
      await capture('vrm-selected-instance-removed');
      const pins = await page.$$('[data-vrm-scene-menu]');
      for (const button of pins) {
        if (await button.evaluate((element) => !!element.closest('[data-channel-workspace]')))
          continue;
        await button.click();
        await click('Delete instance');
      }
      assert.equal(await page.$$(contextual).then((elements) => elements.length), 1);
    }
    if (process.env.BH_GUIDE_PLUGIN === '1') {
      await click('Guide me');
      await page.waitForSelector('.driver-popover');
      const pluginContext = await browser.createBrowserContext();
      const pluginPage = await pluginContext.newPage();
      pluginPage.on('console', (message) => {
        if (['error', 'warn'].includes(message.type())) diagnostics.push(message.text());
      });
      const pluginClick = (name) => pluginPage.locator(`::-p-aria(${name})`).click();
      const pluginSwitch = '[role="switch"][aria-label="Enable @botharness/vrm-companion"]';
      const waitPlugin = (checked) =>
        pluginPage.waitForFunction(
          (selector, checked) => {
            const control = document.querySelector(selector);
            return (
              control &&
              !control.disabled &&
              control.getAttribute('aria-checked') === String(checked)
            );
          },
          {},
          pluginSwitch,
          checked,
        );
      try {
        const pluginCdp = await pluginPage.createCDPSession();
        await pluginCdp.send('Emulation.setUserAgentOverride', {
          userAgent: await browser.userAgent(),
          acceptLanguage: 'en-US,en',
        });
        await pluginPage.goto(instance.url, { waitUntil: 'domcontentloaded' });
        await pluginPage.waitForFunction(() => !!window[Symbol.for('botharness.clientHelp')]);
        await capture('plugin-settings-entry', pluginPage);
        if (await pluginPage.$('.bh-workspace-rail')) await pluginClick('Exit Bot mode');
        await pluginClick('Plugins');
        await waitPlugin(true);
        await capture('plugin-before-disable', pluginPage);
        await pluginClick('Enable @botharness/vrm-companion');
        await waitPlugin(false);
        await page.waitForFunction(
          () =>
            !window[Symbol.for('botharness.clientHelp')]
              .topics()
              .some((topic) => topic.id === 'vrm:companion-help'),
        );
        assert.equal((await state()).phase, 'idle');
        assert(['plugin-removed', 'target-unavailable'].includes((await state()).reason));
        await capture('plugin-disabled-active-guide');
        await pluginClick('Enable @botharness/vrm-companion');
        await waitPlugin(true);
        await page.bringToFront();
        await page.waitForFunction(() =>
          window[Symbol.for('botharness.clientHelp')]
            .topics()
            .some((topic) => topic.id === 'vrm:companion-help'),
        );
        assert.equal(
          await page.evaluate(
            () =>
              window[Symbol.for('botharness.clientHelp')]
                .topics()
                .filter((topic) => topic.id === 'vrm:companion-help').length,
          ),
          1,
        );
        assert.equal((await state()).phase, 'idle');
        await capture('plugin-reenabled-no-revival');
        await page.waitForFunction(
          () =>
            window[Symbol.for('botharness.clientHelp')].availability('vrm:change-camera').status ===
            'ready',
        );
        await page.locator('[id="help-question-vrm:change-camera"]').click();
        await click('Guide me');
        await page.waitForSelector('.driver-popover');
        await page.keyboard.press('Escape');
        assert.equal((await state()).phase, 'idle');
        await capture('plugin-reenabled-fresh-guide');
      } catch (error) {
        await capture('plugin-failure', pluginPage.isClosed() ? page : pluginPage);
        writeFileSync(
          resolve(out, 'plugin-diagnostics-private.json'),
          JSON.stringify(
            {
              requests: [...requests.values()],
              message: error.message,
              diagnostics,
              main: await page.evaluate(() => ({
                topics: window[Symbol.for('botharness.clientHelp')]
                  .topics()
                  .map((topic) => topic.id),
                panels: [...document.querySelectorAll('[data-dock-header]')].map((node) =>
                  node.getAttribute('data-dock-header'),
                ),
              })),
              settings: pluginPage.isClosed()
                ? undefined
                : await pluginPage.evaluate(() => ({
                    topics: window[Symbol.for('botharness.clientHelp')]
                      .topics()
                      .map((topic) => topic.id),
                    switches: [...document.querySelectorAll('[role="switch"]')].map((node) => ({
                      name: node.getAttribute('aria-label'),
                      checked: node.getAttribute('aria-checked'),
                    })),
                  })),
            },
            null,
            2,
          ),
        );
        throw error;
      } finally {
        try {
          if (
            !pluginPage.isClosed() &&
            (await pluginPage.$eval(
              pluginSwitch,
              (control) => control.getAttribute('aria-checked') === 'false',
            ))
          ) {
            await pluginClick('Enable @botharness/vrm-companion');
            await waitPlugin(true);
          }
        } finally {
          await pluginContext.close();
        }
      }
    }
    if (await page.$('[data-vrm-lesson-target]'))
      await page.locator('[data-help-panel-control="botharness-vrm"]').click();
  }
  if (process.env.BH_GUIDE_GROUP === '1') {
    const availability = (id) =>
      page.evaluate(
        (id) =>
          window[Symbol.for('botharness.clientHelp')].availability(
            `botharness:panel-help:${id}:open`,
          ),
        id,
      );
    assert.equal((await availability('members')).status, 'unavailable');
    await click(process.env.BH_GUIDE_GROUP_LABEL ?? 'S2 guide group No messages yet');
    await page.waitForSelector('[data-channel-workspace^="group-"]');
    assert.equal((await availability('members')).status, 'ready');
    assert.equal((await availability('bot-inbox')).status, 'unavailable');
    await question('Members', 'members:open');
    const beforeMembers = await layout();
    await click('Find in Messages');
    await page.waitForSelector('.driver-popover');
    await page.locator('[data-help-panel-control="members"]').click();
    await next();
    await capture('group-members-open');
    await next();
    assert.equal((await state()).phase, 'idle');
    assert.equal(await layout(), beforeMembers);
    await click(process.env.BH_GUIDE_BOT_LABEL ?? 'Tob: Idle Tob No messages yet');
    await page.waitForSelector(editor);
    assert.equal(
      await page.$eval(editor, (element) => element.value ?? element.innerText),
      'S2 guide draft — do not send',
    );
    await capture('dm-return-draft-retained');
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(sends, []);
  writeFileSync(
    resolve(out, 'result.json'),
    JSON.stringify(
      { passed: true, savedLayoutUnchanged: true, composerRetained: true, errors, sends },
      null,
      2,
    ),
  );
  console.log(out);
} catch (error) {
  await capture('failure');
  writeFileSync(
    resolve(out, 'failure.json'),
    JSON.stringify({ message: error.message, errors }, null, 2),
  );
  console.error(out);
  throw error;
} finally {
  try {
    for (const owned of await browser.pages()) await owned.close();
  } finally {
    await browser.close();
  }
}
