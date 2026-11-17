import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const instancePath = process.env.BH_E2E_INSTANCE;
assert.ok(instancePath, 'Set BH_E2E_INSTANCE to this task’s isolated instance');
const instance = JSON.parse(readFileSync(instancePath, 'utf8'));
const modules = resolve('node_modules/.pnpm');
const installed = readdirSync(modules).find((entry) => entry.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(modules, installed, 'node_modules/'))('puppeteer');
const out = resolve(dirname(instancePath), `sessions-${Date.now()}`);
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [],
  results = [];
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const scope = '[data-dock-header="sessions"] button[aria-label="Session view options"]';
const body = '.bh-composer-shell';
const channels = '[data-dock-panel="bh:channels"]';
const screenshot = async (name) => {
  await page.screenshot({ path: resolve(out, `${name}.png`) });
};
const scene = JSON.parse(readFileSync(process.env.BH_SESSION_SCENE, 'utf8'));
try {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewport({ width: 1440, height: 900 });
  const cdp = await page.createCDPSession();
  const follows = [];
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketFrameSent', ({ response }) => {
    try {
      const frame = JSON.parse(response.payloadData);
      if (frame.type === 'open' && frame.endpoint === 'session/follow')
        follows.push(frame.payload.args.request.address.sessionId);
    } catch {}
  });
  const openAssignment = async (selector, sessionId, source) => {
    results.push({
      navigationIntent: sessionId,
      source,
      row: await page.$eval(selector, (node) => ({
        tag: node.tagName,
        className: node.className,
        key: node.closest('[data-flip-key]')?.dataset.flipKey,
      })),
    });
    await page.locator(selector).click();
    await page.waitForFunction(() => !document.querySelector('.bh-workspace-rail'));
    writeFileSync(
      resolve(out, `navigation-${source}.json`),
      JSON.stringify(
        { follows, text: await page.evaluate(() => document.body.innerText) },
        null,
        2,
      ),
    );
    await page.waitForFunction(() => document.body.innerText.includes('SESSION_SCOPE_QA_DONE'));
    assert.ok(
      follows.includes(sessionId),
      'Native navigation follows the same canonical Assignment',
    );
    results.push({
      openedAssignment: sessionId,
      source,
      nativeSessionFollow: true,
      nativeReportVisible: true,
    });
  };
  await cdp.send('Emulation.setUserAgentOverride', {
    userAgent: await browser.userAgent(),
    acceptLanguage: 'en-US,en',
  });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find(
          (button) =>
            ['Continue', 'Configure later', 'Skip tutorial'].includes(button.textContent.trim()) &&
            button.offsetParent,
        )
        ?.click(),
    );
    await wait(200);
  }
  if (!(await page.$('.bh-workspace-rail'))) await page.locator('::-p-aria(Bot mode)').click();
  await page.waitForSelector('.bh-workspace-rail');
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Skip tutorial' && button.offsetParent)
      ?.click(),
  );
  await page.click(`${channels} [data-channel-id="${scene.channel.id}"]`);
  await page.waitForSelector(scope);
  assert.equal(
    await page.$('[data-session-target]'),
    null,
    'Default scope needs no duplicate label',
  );
  assert.equal(await page.$('.bh-workspace-rail [data-pinned-panel="group-work"]'), null);
  const rpc = (method, args) =>
    page.evaluate(
      async (method, args) => {
        const response = await fetch(`/api/botharness/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: crypto.randomUUID(),
            method: `botharness/${method}`,
            payload: { args },
          }),
        });
        const result = (await response.json()).result;
        if (!result?.ok) throw new Error(JSON.stringify(result?.error));
        return result.value;
      },
      method,
      args,
    );
  const before = await rpc('channelAssignments', { channelId: scene.channel.id });
  if (!process.env.BH_ALLOW_EMPTY)
    assert.ok(before.assignments.length, 'Prepare a real Group Assignment before the full journey');
  await screenshot('01-channel');
  await page.evaluate(
    (body, channels) => {
      window.__sessionsQaNodes = [
        document.querySelector(body),
        document.querySelector(channels),
        document.querySelector('.bh-workspace-rail'),
      ];
    },
    body,
    channels,
  );
  const choose = async (label) => {
    await page.click(scope);
    await page.locator(`::-p-aria(${label})`).click();
  };
  await choose(`Bot · ${scene.bot.displayName}`);
  await page.waitForFunction(
    (name) => document.querySelector('[data-session-target]')?.textContent.includes(name),
    {},
    scene.bot.displayName,
  );
  await wait(600);
  assert.ok(
    await page.evaluate(() => window.__sessionsQaNodes.every((node) => node.isConnected)),
    'Other panels retain their DOM',
  );
  const owned = await rpc('sessions', { slug: scene.bot.slug });
  const assignment = before.assignments[0];
  if (assignment) {
    const expand = await page.$(
      '[data-sidebar-entry="sessions"] [data-section="resolved"] button[aria-expanded="false"]',
    );
    if (expand) await expand.click();
    assert.ok(owned.sessions.some((session) => session.sessionId === assignment.sessionId));
    await page.waitForSelector(
      `[data-sidebar-entry="sessions"] [data-flip-key="${assignment.sessionId}"]`,
    );
  }
  if (
    assignment &&
    owned.sessions.find((row) => row.sessionId === assignment.sessionId)?.assignmentArchived
  ) {
    await page
      .locator(
        `[data-sidebar-entry="sessions"] [data-flip-key="${assignment.sessionId}"] [data-session-archive]`,
      )
      .click();
    await page.waitForSelector(
      `[data-sidebar-entry="sessions"] [data-flip-key="${assignment.sessionId}"] [aria-label^="Archive"]`,
    );
    results.push({ explicitRestoreBeforeNavigation: true });
  }
  await screenshot('02-bot');
  if (assignment) {
    await openAssignment(
      `[data-sidebar-entry="sessions"] [data-flip-key="${assignment.sessionId}"] .bh-session-row`,
      assignment.sessionId,
      'bot',
    );
    await page.locator('::-p-aria(Bot mode)').click();
    await page.waitForSelector(scope);
  }
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector(scope);
  assert.ok(
    (await page.$eval('[data-session-target]', (node) => node.textContent)).includes(
      scene.bot.displayName,
    ),
    'Refresh retains explicit Bot',
  );
  await choose('Current channel');
  await wait(500);
  const after = await rpc('channelAssignments', { channelId: scene.channel.id });
  assert.deepEqual(
    after.assignments.map((row) => row.sessionId),
    before.assignments.map((row) => row.sessionId),
    'Reading creates no Assignment',
  );
  results.push({
    scopeSwitch: true,
    refresh: true,
    stablePanels: true,
    assignmentIds: after.assignments.map((row) => row.sessionId),
    fullAssignment: !!assignment,
  });
  const original = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('botharness.bot-mode-layout')),
  );
  const legacy = JSON.parse(JSON.stringify(original).replaceAll('sessions', 'group-work'));
  legacy.version = 2;
  await page.evaluate((legacy) => {
    localStorage.setItem('botharness.bot-mode-layout', JSON.stringify(legacy));
    localStorage.removeItem('botharness.bot-mode-layout.before-sessions-v3');
  }, legacy);
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector(scope);
  const migrated = await page.evaluate(() => ({
    layout: JSON.parse(localStorage.getItem('botharness.bot-mode-layout')),
    backup: JSON.parse(localStorage.getItem('botharness.bot-mode-layout.before-sessions-v3')),
  }));
  assert.equal(migrated.layout.version, 3);
  assert.ok(migrated.layout.layout.panels.sessions);
  assert.ok(!migrated.layout.layout.panels['group-work']);
  assert.equal(migrated.backup.version, 2);
  assert.equal(migrated.layout.gap, original.gap);
  results.push({ legacyWorkMigration: true, backup: true });
  await screenshot('03-migrated');
  if (assignment) {
    const expand = await page.$(
      '[data-sidebar-entry="sessions"] [data-group="done"] button[aria-expanded="false"]',
    );
    if (expand) await expand.click();
    await openAssignment(
      '[data-sidebar-entry="sessions"] .bh-group-work-row',
      assignment.sessionId,
      'channel',
    );
    await screenshot('04-session-opened');
  }
  assert.deepEqual(errors, []);
} catch (error) {
  results.push({ failure: String(error) });
  await screenshot('failure');
  writeFileSync(resolve(out, 'failure.txt'), await page.evaluate(() => document.body.innerText));
  throw error;
} finally {
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
  console.log(out);
}
