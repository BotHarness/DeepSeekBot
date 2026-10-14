import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const evidence = process.env.BH_E2E_EVIDENCE;
const mode = process.argv[2] ?? 'check';
const baseline = mode.startsWith('before');
assert.ok(origin && home && evidence, 'set BH_E2E_ORIGIN, HOME and EVIDENCE');
mkdirSync(evidence, { recursive: true });
const header = process.env.BH_E2E_GROUP_HEADER === '1';
const privateDir = resolve(
  '.humanlayer/tasks',
  header ? '124-group-header-activity' : '124-group-activity',
);
mkdirSync(privateDir, { recursive: true });
const statePath = resolve(privateDir, 'qa-state.json');
const cookie = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(
  ';',
)[0];
async function rpc(method, args = {}, namespace = 'botharness') {
  const response = await fetch(`${origin}/api/${namespace}/${method}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: `${namespace}/${method}`,
      payload: { args },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const result = (await response.json()).result;
  assert.equal(
    result?.ok,
    true,
    `${namespace}/${method} failed: ${result?.error?.code}: ${result?.error?.message}`,
  );
  return result.value;
}
const pnpm = resolve('node_modules/.pnpm');
const pkg = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
assert.ok(pkg);
const puppeteer = createRequire(resolve(pnpm, pkg, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const clientErrors = [];
page.on('pageerror', (error) => clientErrors.push(error.message));
await page.setViewport({ width: 1500, height: 1000 });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
const separator = cookie.indexOf('=');
await browser.setCookie({
  name: cookie.slice(0, separator),
  value: cookie.slice(separator + 1),
  domain: new URL(origin).hostname,
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
});
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const frames = [];
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
cdp.on('Network.eventSourceMessageReceived', (event) => {
  if (event.eventName !== 'activity/snapshot') return;
  const value = JSON.parse(event.data);
  frames.push({
    generation: value.generation,
    revision: value.revision,
    bots: value.bots.map(({ slug, state, activity, sessions, attention }) => ({
      slug,
      state,
      activity,
      sessions,
      attention,
    })),
  });
});
async function waitFor(test, label) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const value = await test();
    if (value) return value;
    await delay(1000);
  }
  throw Error(`Timed out: ${label}`);
}
async function open(channelId) {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  await delay(500);
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  if (!(await page.$('.bh-main')))
    await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  for (let attempt = 0; attempt < 3 && !(await page.$('.bh-main')); attempt++) {
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((button) =>
          ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''),
        )
        ?.click(),
    );
    if (attempt > 0)
      await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
    await page.waitForSelector('.bh-main', { timeout: 10000 }).catch(() => {});
  }
  await page.waitForSelector(`[data-channel-id="${channelId}"]`);
  await page.click(`[data-channel-id="${channelId}"]`);
  await page.waitForSelector('.bh-composer-shell');
}
const shot = async (name) => {
  await page.evaluate((home) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent?.includes(home))
        node.textContent = node.textContent.split(home).join('[isolated QA home]');
    }
  }, home);
  return page.screenshot({ path: resolve(evidence, name + '.png') });
};
async function prepare() {
  const stamp = Date.now();
  const model = (await rpc('modelCatalog')).models.find(
    (model) => model.model.includes('flash') && model.efforts.some((effort) => effort.id === 'low'),
  );
  assert.ok(model);
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: `Group activity QA ${stamp}`,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  const bots = [];
  for (const name of ['Orbit', 'Nova', 'Quiet', 'Long quiet member for overflow']) {
    const bot = (
      await rpc('create', {
        displayName: `${name} QA ${stamp}`,
        persona:
          'Follow Human instructions precisely. Use native Shell only when explicitly requested by the Human. Do not delegate or react to messages from other Bots. After the requested bounded timer finishes, channel_send the requested completion marker in the originating Group and end your Turn.',
      })
    ).bot;
    await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
    bots.push({ slug: bot.slug, name: bot.displayName });
  }
  const group = (
    await rpc('channelCreate', {
      name: `Group activity Human QA ${stamp}`,
      members: (header ? [...bots.slice(2), ...bots.slice(0, 2)] : bots).map((bot) => bot.slug),
    })
  ).channel;
  for (const bot of bots)
    await rpc('channelGroupWakeSet', {
      channelId: group.id,
      botSlug: bot.slug,
      mode: 'mentions',
      count: 5,
      intervalSeconds: 60,
    });
  return { channelId: group.id, name: group.name, bots };
}
try {
  const scene =
    mode === 'before' || mode === 'prepare'
      ? await prepare()
      : JSON.parse(readFileSync(statePath, 'utf8'));
  writeFileSync(statePath, JSON.stringify(scene, null, 2));
  if (mode === 'prepare') {
    console.log(JSON.stringify({ prepared: true, group: scene.name }));
    await browser.close();
    process.exit(0);
  }
  await open(scene.channelId);
  await shot('idle');
  const targets = scene.bots.slice(0, 2);
  const marker = 'GROUP_ACTIVITY_DONE_' + Date.now();
  const existingMessages = new Set(
    (await rpc('channelMessages', { channelId: scene.channelId })).messages.map(
      (message) => message.id,
    ),
  );
  const prefix = targets.map((bot) => `@${bot.name}`).join(' ');
  const mentions = [];
  let start = 0;
  for (const bot of targets) {
    mentions.push({ botSlug: bot.slug, label: bot.name, start, end: start + bot.name.length + 1 });
    start += bot.name.length + 2;
  }
  if (mode !== 'before-resume')
    await rpc('channelSend', {
      channelId: scene.channelId,
      body: `${prefix} Each of you: use the native Shell command node -e "setTimeout(() => {}, 45000)" with description "Verify my Group activity". Do not delegate. After it finishes, channel_send ${marker} in this Group and end. Do not respond to the other Bot.`,
      mentions,
    });
  const approvals = await waitFor(async () => {
    const pending = (
      await Promise.all(
        targets.map(async (bot) => {
          const channelId = (await rpc('channelDm', { slug: bot.slug })).channel.id;
          const messages = (await rpc('channelMessages', { channelId })).messages;
          const resolved = new Set(
            messages.flatMap((message) =>
              message.toolApprovalDecision ? [message.toolApprovalDecision.requestMessageId] : [],
            ),
          );
          return messages
            .filter((message) => message.toolApprovalRequest && !resolved.has(message.id))
            .map((message) => ({ ...message, approvalChannelId: channelId }));
        }),
      )
    ).flat();
    return pending.length === 2 ? pending : false;
  }, 'both real model Shell approvals');
  for (const message of approvals) {
    assert.equal(
      JSON.parse(message.toolApprovalRequest.input).command,
      'node -e "setTimeout(() => {}, 45000)"',
    );
    assert.equal(
      (
        await rpc('toolApprovalDecide', {
          channelId: message.approvalChannelId,
          messageId: message.id,
          outcome: 'allowed-once',
        })
      ).accepted,
      true,
    );
  }
  const working = await waitFor(async () => {
    const snapshot = await rpc('activitySnapshot');
    return targets.every((target) =>
      snapshot.bots.some(
        (bot) =>
          bot.slug === target.slug &&
          bot.state === 'working' &&
          bot.activity?.effect === 'executing' &&
          !bot.attention?.approvalCount,
      ),
    )
      ? snapshot
      : false;
  }, 'both real native tools working');
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '.bh-composer-activity-facepile .bh-persona-avatar[data-state="working"]',
      ).length === 2,
  );
  const collapsed = await page.$eval('.bh-composer-activity-summary', (node) => node.textContent);
  if (!baseline) {
    for (const bot of targets) assert.ok(collapsed.includes(bot.name));
    assert.ok(collapsed.includes('执行') || collapsed.includes('Executing'));
  }
  await shot('group-collapsed-light');
  if (header && !baseline) {
    const visibleHeader = await page.$$eval(
      '.bh-group-channel-header .bh-avatar-facepile-button',
      (nodes) => nodes.map((node) => node.getAttribute('aria-label')),
    );
    assert.equal(visibleHeader.length, 3);
    for (const bot of targets) assert.ok(visibleHeader.some((label) => label.startsWith(bot.name)));
    assert.equal(
      await page.$eval(
        '.bh-group-channel-header .bh-avatar-facepile-overflow',
        (node) => node.textContent,
      ),
      '+1',
    );
    const headerAvatar = await page.$('.bh-group-channel-header .bh-avatar-facepile-button');
    assert.ok(headerAvatar);
    await headerAvatar.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    await page.waitForSelector('[role="tooltip"]');
    const tip = await page.$eval('[role="tooltip"]', (node) => node.textContent);
    assert.ok(scene.bots.some((bot) => tip.includes(bot.name)));
    await shot('group-header-focus-light');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.bh-group-live-activity');
    const rows = await page.$$eval('.bh-group-live-activity .bh-group-activity-chip', (nodes) =>
      nodes.map((node) => node.textContent),
    );
    assert.equal(rows.length, 3);
    for (const bot of targets) assert.ok(rows.some((row) => row.includes(bot.name)));
    assert.equal(await page.$eval('.bh-group-activity-overflow', (node) => node.textContent), '+1');
    assert.equal(
      await page.$eval('.bh-group-live-activity-chips', (node) => getComputedStyle(node).display),
      'flex',
    );
    await shot('group-header-list-light');
    const chip = await page.$('.bh-group-activity-chip');
    assert.ok(chip);
    await chip.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    await page.waitForSelector('[role="tooltip"]');
    const chipTip = await page.$eval('[role="tooltip"]', (node) => node.textContent);
    assert.ok(targets.some((bot) => chipTip.includes(bot.name)));
    assert.ok(chipTip.includes('bash'));
    assert.ok(!chipTip.includes('setTimeout'));
    await shot('group-chip-tooltip-light');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.bh-profile-popover'));
    await page.click('[data-group-channel-name]');
    await page.waitForSelector('.bh-profile-popover .bh-profile-expand');
    await page.keyboard.press('Escape');
  }
  await page.click('.bh-composer-activity-toggle');
  if (!baseline) {
    const rows = await page.$$eval('.bh-composer-activity-bot', (nodes) =>
      nodes.map((node) => node.textContent),
    );
    assert.equal(rows.length, 2);
    for (const bot of targets) assert.ok(rows.some((row) => row.includes(bot.name)));
    const names = await page.$$eval('.bh-composer-activity-source-label', (nodes) =>
      nodes.map((node) => node.textContent),
    );
    assert.deepEqual(new Set(names), new Set(targets.map((bot) => bot.name)));
  }
  await shot('group-expanded-light');
  if (!baseline) {
    const avatar = await page.$('.bh-composer-activity-facepile .bh-avatar-facepile-button');
    assert.ok(avatar);
    await avatar.hover();
    await page.waitForSelector('[role="tooltip"]');
    const tooltip = await page.$eval('[role="tooltip"]', (node) => node.textContent);
    assert.ok(targets.some((bot) => tooltip.includes(bot.name)));
    assert.ok(tooltip.includes('执行') || tooltip.includes('Executing'));
    await shot('group-avatar-tooltip-light');
    await avatar.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.bh-composer-activity-status').open);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.bh-composer-activity-status').open);
  }

  const summaries = await page.$$eval(
    '.bh-composer-activity-facepile .bh-persona-avatar',
    (nodes) =>
      nodes.map((node) => ({
        state: node.dataset.state,
        effect: node.dataset.effect,
        title: node.title,
      })),
  );
  for (const bot of targets)
    assert.ok(
      summaries.some((row) => row.title.startsWith(bot.name) && row.effect === 'executing'),
    );
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
  await shot('group-expanded-dark');
  await page.setViewport({ width: 420, height: 860 });
  await shot('group-narrow-dark');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false);
  await page.setViewport({ width: 1500, height: 1000 });
  await page.setOfflineMode(true);
  await delay(1200);
  const frameCountBeforeReconnect = frames.length;
  await page.setOfflineMode(false);
  const reconnected = await waitFor(async () => {
    const snapshot = await rpc('activitySnapshot');
    return frames
      .slice(frameCountBeforeReconnect)
      .some(
        (frame) => frame.generation === snapshot.generation && frame.revision === snapshot.revision,
      )
      ? snapshot
      : false;
  }, 'new live snapshot after reconnect matches Host revision');
  const expectedMembers = targets.map((target) => {
    const bot = reconnected.bots.find((bot) => bot.slug === target.slug);
    assert.ok(bot);
    return {
      name: target.name,
      state: bot.state,
      effect:
        bot.state === 'working'
          ? (bot.activity?.effect ?? 'generic-working')
          : bot.state === 'thinking'
            ? 'thinking-dots'
            : undefined,
    };
  });
  await page.waitForFunction(
    (expected) => {
      const nodes = [
        ...document.querySelectorAll('.bh-composer-activity-facepile .bh-persona-avatar'),
      ];
      return expected.every((member) =>
        member.state === 'idle'
          ? !nodes.some(
              (node) =>
                node.title.startsWith(member.name) &&
                ['working', 'thinking'].includes(node.dataset.state),
            )
          : nodes.some(
              (node) =>
                node.title.startsWith(member.name) &&
                node.dataset.state === member.state &&
                node.dataset.effect === member.effect,
            ),
      );
    },
    {},
    expectedMembers,
  );
  await shot('group-reconnected-dark');
  const settled = await waitFor(async () => {
    const snapshot = await rpc('activitySnapshot');
    const messages = (await rpc('channelMessages', { channelId: scene.channelId })).messages;
    return targets.every(
      (target) =>
        snapshot.bots.some((bot) => bot.slug === target.slug && bot.state === 'idle') &&
        messages.some(
          (message) =>
            !existingMessages.has(message.id) &&
            message.author?.slug === target.slug &&
            message.body.includes(marker),
        ),
    )
      ? snapshot
      : false;
  }, 'both actual model Group replies and idle');
  await page.waitForFunction(
    () =>
      !document.querySelector(
        '.bh-composer-activity-facepile .bh-persona-avatar[data-state="working"]',
      ),
  );
  await shot('group-completed-dark');
  if (header && !baseline) {
    await page.setViewport({ width: 1500, height: 1000 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    await page.click('[data-group-channel-name]');
    await page.waitForSelector('.bh-group-live-activity');
    assert.equal(
      await page.$$eval('.bh-group-live-activity .bh-group-activity-chip', (nodes) => nodes.length),
      3,
    );
    await shot('group-header-list-idle-light');
    await page.setViewport({ width: 420, height: 860 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await shot('group-header-list-narrow-dark');
  }
  assert.deepEqual(clientErrors, []);
  const safe = (snapshot) => ({
    generation: snapshot.generation,
    revision: snapshot.revision,
    bots: snapshot.bots.filter((bot) => scene.bots.some((member) => member.slug === bot.slug)),
  });
  writeFileSync(
    resolve(evidence, 'proof.json'),
    JSON.stringify(
      {
        scene,
        collapsed,
        summaries,
        working: safe(working),
        settled: safe(settled),
        reconnected: safe(reconnected),
        reconnect: { frameCountBeforeReconnect, newSnapshotReceived: true, viewMatchesHost: true },
        frames: frames.map(safe),
        overflow,
        clientErrors,
        baseline,
        headerVerified: header && !baseline,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ success: true, group: scene.name, baseline, collapsed }));
} catch (error) {
  await shot('failure');
  writeFileSync(
    resolve(privateDir, `failure-${mode}.json`),
    JSON.stringify({ error: String(error), frames, clientErrors }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
