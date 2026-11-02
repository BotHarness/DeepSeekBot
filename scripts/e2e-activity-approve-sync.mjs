import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { assignmentProbe, installed } from './e2e-assignment-probe.mjs';

assert.ok(process.env.BH_E2E_INSTANCE);
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
assert.equal(resolve(instance.worktree), resolve('.'));
const { rpc, nativeSnapshot } = assignmentProbe({
  origin: new URL(instance.url).origin,
  home: instance.home,
});
const out = resolve(dirname(process.env.BH_E2E_INSTANCE), 'evidence', 'approve-sync-' + Date.now());
mkdirSync(out, { recursive: true });
const save = (name, value) =>
  writeFileSync(resolve(out, name + '.json'), JSON.stringify(value, null, 2));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const wait = async (test, label, timeout = 120000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await test();
    if (result) return result;
    await sleep(150);
  }
  throw Error('Timed out: ' + label);
};
const scenes = process.env.BH_APPROVAL_SCENES
  ? JSON.parse(readFileSync(process.env.BH_APPROVAL_SCENES, 'utf8'))
  : [];
if (!scenes.length) {
  for (const surface of ['activity', 'conversation']) {
    const bot = (
      await rpc('create', {
        displayName: 'Approve ' + surface,
        persona:
          'Disposable QA Bot. Follow the exact Human command using native bash. Wait for Human approval when required. No other commands, files or settings changes.',
      })
    ).bot;
    await rpc('modelPlanCustomize', {
      slug: bot.slug,
      orchestrator: {
        provider: process.env.BH_QA_PROVIDER ?? 'deepseek-official',
        model: process.env.BH_QA_MODEL ?? 'deepseek-flash',
        effort: 'low',
      },
    });
    const channel = (await rpc('channelDm', { slug: bot.slug })).channel;
    const file = resolve(out, surface + '-approved.txt');
    const command = `printf APPROVE_2230_${surface.toUpperCase()} > ${file}`;
    scenes.push({ surface, slug: bot.slug, channelId: channel.id, file, command });
    save('scenes', scenes);
    await rpc('channelSend', {
      channelId: channel.id,
      body: `Run exactly this native bash command: ${command}. Use the existing default working directory. First attempt normal sandbox. If denied, request the native sanctioned one-shot wider sandbox approval for exactly the same command, then wait for Human. Do not work around a refusal or change standing permissions. No other commands. After actual success bot_send_message APPROVE_DONE_${surface.toUpperCase()}.`,
    });
  }
}
for (const scene of scenes) {
  assert.ok(resolve(scene.file).startsWith(resolve('.humanlayer') + '/'));
  assert.equal(scene.command, `printf APPROVE_2230_${scene.surface.toUpperCase()} > ${scene.file}`);
  assert.equal(existsSync(scene.file), false);
  scene.item = await wait(
    async () =>
      (await rpc('humanAttention', { category: 'action' })).items.find(
        (item) => item.channelId === scene.channelId && item.kind === 'tool-approval',
      ),
    'real pending ' + scene.surface,
  );
  scene.request = (await rpc('channelMessages', { channelId: scene.channelId })).messages.find(
    (m) => m.id === scene.item.messageId,
  );
  assert.equal(scene.request.toolApprovalRequest.toolName, 'bash');
  assert.equal(JSON.parse(scene.request.toolApprovalRequest.input).command, scene.command);
}
save('preconditions', scenes);
const browsers = [];
const errors = [];
const consoleMessages = [];
const decisions = [];
const sockets = [];
const pages = [];
const click = async (page, name, root = '', optional = false) => {
  await page.bringToFront();
  for (const button of await page.$$((root + ' button').trim())) {
    if (!(await button.isVisible())) continue;
    const matches = await button.evaluate(
      (b, label) => (b.getAttribute('aria-label') ?? b.textContent.trim()) === label,
      name,
    );
    if (matches) {
      await button.click();
      return;
    }
  }
  if (!optional) throw Error('Visible control missing: ' + name);
};
const open = async (role) => {
  const browser = await installed('puppeteer').launch({ headless: true, args: ['--no-sandbox'] });
  browsers.push(browser);
  const page = await browser.newPage();
  pages.push({ page, role });
  page.on('pageerror', (e) => errors.push({ role, message: e.message }));
  page.on('console', (m) => consoleMessages.push({ role, type: m.type(), message: m.text() }));
  page.on('request', (r) => {
    if (r.url().endsWith('/toolApprovalDecide'))
      decisions.push({ role, at: Date.now(), args: JSON.parse(r.postData()).payload.args });
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketCreated', (e) => sockets.push({ role, path: new URL(e.url).pathname }));
  await page.setViewport({ width: 1500, height: 1000 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Bot 模式布局"]') ||
      [...document.querySelectorAll('button')].some(
        (b) => (b.getAttribute('aria-label') ?? b.textContent.trim()) === 'Bot 模式',
      ),
  );
  const dismiss = async () => {
    for (let n = 0; n < 6; n++) {
      const name = await page.evaluate(() =>
        [...document.querySelectorAll('button')]
          .find(
            (b) =>
              b.offsetParent !== null &&
              ['继续', '稍后配置', '跳过教程', '跳过引导', '稍后继续'].includes(
                b.textContent.trim(),
              ),
          )
          ?.textContent.trim(),
      );
      if (!name) return;
      await click(page, name, '', true);
      await sleep(250);
    }
  };
  await sleep(500);
  await dismiss();
  if (
    !(await page.evaluate(() =>
      document.querySelector('[aria-label="Bot 模式布局"]')?.checkVisibility(),
    ))
  )
    await click(page, 'Bot 模式');
  await page.waitForFunction(() =>
    document.querySelector('[aria-label="Bot 模式布局"]')?.checkVisibility(),
  );
  await dismiss();
  const messages = await page.evaluate(() =>
    [...document.querySelectorAll('button[aria-label^="消息"]')]
      .find((e) => e.offsetParent !== null)
      ?.getAttribute('aria-label'),
  );
  if (!(await page.$('[role="region"][aria-label="消息"]'))) await click(page, messages);
  await sleep(400);
  return page;
};
const shot = async (page, name) => {
  await page.bringToFront();
  if (name.endsWith('-after-activity'))
    await page.evaluate(() => {
      for (const e of document.querySelectorAll('.bh-activity-center, .bh-activity-center *'))
        if (e.scrollHeight > e.clientHeight) e.scrollTop = 0;
    });
  save(name + '-aria', await page.accessibility.snapshot());
  await page.evaluate((prefix) => {
    window.qaRedactions = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent.includes(prefix)) {
        window.qaRedactions.push([node, node.textContent]);
        node.textContent = node.textContent.split(prefix).join('[isolated QA worktree]');
      }
    }
  }, resolve('.'));
  await page.screenshot({ path: resolve(out, name + '.png') });
  await page.evaluate(() => {
    for (const [node, text] of window.qaRedactions) node.textContent = text;
    delete window.qaRedactions;
  });
};
const proofs = [];
try {
  const activity = await open('activity');
  const activityName = await activity.evaluate(() =>
    [...document.querySelectorAll('button[aria-label^="活动中心"]')]
      .find((e) => e.offsetParent !== null)
      ?.getAttribute('aria-label'),
  );
  await click(activity, activityName);
  const conversation = await open('conversation');
  for (const scene of scenes) {
    const row = `[data-channel-id="${scene.channelId}"]`;
    await conversation.waitForSelector(row);
    let name;
    let channelButton;
    for (const element of await conversation.$$(row)) {
      if (!(await element.isVisible())) continue;
      const snapshot = await conversation.accessibility.snapshot({ root: element });
      if (snapshot?.name) {
        name = snapshot.name;
        channelButton = element;
        break;
      }
    }
    assert.ok(name, 'Visible Channel accessible name');
    await conversation.bringToFront();
    await channelButton.click();
    const messageCard = `[data-message-id="${scene.item.messageId}"] .bh-tool-approval-card`;
    const activityCard = `[data-attention-id="${scene.item.id}"]`;
    for (const [page, selector] of [
      [conversation, messageCard],
      [activity, activityCard],
    ])
      await page.waitForFunction(
        (root) =>
          [...document.querySelectorAll(root + ' button')].some(
            (button) =>
              button.checkVisibility() &&
              !button.disabled &&
              button.textContent.trim() === '仅批准这一次',
          ),
        {},
        selector,
      );
    await shot(activity, scene.surface + '-before-activity');
    await shot(conversation, scene.surface + '-before-conversation');
    const source = scene.surface === 'activity' ? activity : conversation;
    const root = scene.surface === 'activity' ? activityCard : messageCard;
    const start = Date.now();
    await click(source, '仅批准这一次', root);
    const activityDone = activity
      .waitForSelector(activityCard, { hidden: true, timeout: 5000 })
      .then(() => Date.now() - start);
    const conversationDone = conversation
      .waitForFunction(
        (selector) => {
          const card = document.querySelector(selector);
          return (
            card &&
            /已批准|已允许/.test(card.textContent) &&
            ![...card.querySelectorAll('button')].some((b) =>
              ['仅批准这一次', '拒绝'].includes(b.textContent.trim()),
            )
          );
        },
        { timeout: 5000 },
        `[data-message-id="${scene.item.messageId}"]`,
      )
      .then(() => Date.now() - start);
    const [activityMs, conversationMs] = await Promise.all([activityDone, conversationDone]);
    const audits = (await rpc('channelMessages', { channelId: scene.channelId })).messages.filter(
      (m) => m.toolApprovalDecision?.requestMessageId === scene.item.messageId,
    );
    assert.equal(audits.length, 1);
    assert.equal(audits[0].toolApprovalDecision.outcome, 'allowed-once');
    assert.equal(
      (await rpc('humanAttention', { category: 'action', channelId: scene.channelId })).items
        .length,
      0,
    );
    await wait(() => existsSync(scene.file), 'actual native file effect', 15000);
    assert.equal(readFileSync(scene.file, 'utf8'), 'APPROVE_2230_' + scene.surface.toUpperCase());
    await shot(activity, scene.surface + '-after-activity');
    await shot(conversation, scene.surface + '-after-conversation');
    const native = await nativeSnapshot(scene.request.toolApprovalRequest.sessionId);
    save(scene.surface + '-native', native);
    proofs.push({
      clickedSurface: scene.surface,
      requestMessageId: scene.item.messageId,
      sourceEventId: scene.item.sourceEventId,
      decisionMessageId: audits[0].id,
      outcome: audits[0].toolApprovalDecision.outcome,
      canonicalDecisionCount: audits.length,
      activityMs,
      conversationMs,
      fileEffect: readFileSync(scene.file, 'utf8'),
      conversationText: await conversation.$eval(
        `[data-message-id="${scene.item.messageId}"]`,
        (e) => e.textContent,
      ),
    });
    save('proof', { proofs, errors, decisions, sockets });
  }
  assert.equal(decisions.length, 2);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', proofs, sockets, evidence: out }));
} catch (error) {
  for (const { page, role } of pages)
    save(
      'failure-dom-' + role,
      await page.evaluate(() => ({
        visible: document.visibilityState,
        messages: [...document.querySelectorAll('[data-message-id]')].map((e) => ({
          id: e.getAttribute('data-message-id'),
          visible: e.checkVisibility(),
          text: e.textContent,
        })),
        body: document.body.innerText,
      })),
    );
  for (const { page, role } of pages) await shot(page, 'failure-' + role).catch(() => {});
  save('failure', { message: error.message, proofs, errors, decisions });
  throw error;
} finally {
  save('console', consoleMessages);
  for (const browser of browsers) await browser.close();
}
