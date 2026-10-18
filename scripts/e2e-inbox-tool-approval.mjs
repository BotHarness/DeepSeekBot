import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { assignmentProbe, installed, waitFor } from './e2e-assignment-probe.mjs';

const instancePath = process.env.BH_E2E_INSTANCE;
assert.ok(instancePath, 'Set BH_E2E_INSTANCE to this worktree’s isolated verify-app instance');
const instance = JSON.parse(readFileSync(instancePath, 'utf8'));
assert.equal(resolve(instance.worktree), resolve('.'));
const origin = new URL(instance.url).origin;
const { rpc, cookie } = assignmentProbe({ origin, home: instance.home, freshConnections: true });
const out = resolve(dirname(instancePath), 'evidence', 'inline-approval-' + Date.now());
mkdirSync(out, { recursive: true });
const save = (name, value) =>
  writeFileSync(resolve(out, name + '.json'), JSON.stringify(value, null, 2));
const channels = [process.env.BH_APPROVAL_ALLOW_CHANNEL, process.env.BH_APPROVAL_REJECT_CHANNEL];
assert.ok(
  channels.every(Boolean) && channels[0] !== channels[1],
  'Supply distinct disposable QA Channels',
);
const items = (await rpc('humanAttention', { category: 'action' })).items;
const scenes = [];
for (const [index, channelId] of channels.entries()) {
  const item = items.find(
    (value) => value.channelId === channelId && value.kind === 'tool-approval',
  );
  assert.ok(item, 'A real pending Tool approval is required in ' + channelId);
  const request = (await rpc('channelMessages', { channelId })).messages.find(
    (m) => m.id === item.messageId,
  );
  assert.equal(request?.toolApprovalRequest?.toolName, 'bash');
  const input = JSON.parse(request.toolApprovalRequest.input);
  const file = resolve(
    '.humanlayer/tasks/2026-inline-approval',
    index === 0 ? 'approved-by-ui.txt' : 'rejected-by-ui.txt',
  );
  assert.equal(
    input.command,
    `printf ${index === 0 ? 'ACTIVITY_2026_APPROVED' : 'ACTIVITY_2026_UI_PROOF'} > ${file}`,
  );
  assert.equal(existsSync(file), false, 'QA marker must not exist before a decision');
  scenes.push({ item, request, file });
}
save('preconditions', scenes);
const browser = await installed('puppeteer').launch({ headless: true, args: ['--no-sandbox'] });
const split = cookie.indexOf('=');
await browser.setCookie({
  name: cookie.slice(0, split),
  value: cookie.slice(split + 1),
  domain: new URL(origin).hostname,
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
});
const page = await browser.newPage();
const errors = [];
const decisions = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
const click = async (name) =>
  page.locator(`::-p-aria([name=${JSON.stringify(name)}][role="button"])`).click();
const card = (scene) => `.bh-activity-approval[data-attention-id="${scene.item.id}"]`;
const clickCard = async (scene, name) =>
  page.locator(`${card(scene)} ::-p-aria([name=${JSON.stringify(name)}][role="button"])`).click();
const activity = async () => {
  await page.waitForSelector('button[aria-label^="活动中心"]');
  await click(
    await page.$eval('button[aria-label^="活动中心"]', (element) =>
      element.getAttribute('aria-label'),
    ),
  );
};
const shot = async (name) => {
  await page.screenshot({ path: resolve(out, name + '.png') });
  save(name + '-aria', await page.accessibility.snapshot());
};
const audit = async (scene) =>
  (await rpc('channelMessages', { channelId: scene.item.channelId })).messages.filter(
    (m) => m.toolApprovalDecision?.requestMessageId === scene.request.id,
  );
let interruptOnce = true;
await page.setRequestInterception(true);
page.on('request', async (request) => {
  if (!request.url().endsWith('/api/botharness/toolApprovalDecide')) return request.continue();
  const envelope = JSON.parse(request.postData());
  decisions.push(envelope.payload.args);
  if (interruptOnce) {
    interruptOnce = false;
    return request.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'server-response',
        rpcId: envelope.rpcId,
        result: {
          ok: false,
          error: { code: 'unavailable', message: 'QA submission interrupted', details: {} },
        },
      }),
    });
  }
  await new Promise((done) => setTimeout(done, 500));
  return request.continue();
});
try {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="Bot 模式"]');
  const notice = await page.$('::-p-aria(继续)');
  if (notice && (await notice.isVisible())) await notice.click();
  await click('Bot 模式');
  await page.waitForSelector('.bh-mode-sidebar');
  await activity();
  await page.waitForSelector(card(scenes[0]) + ' .bh-tool-approval-actions');
  await page.setViewport({ width: 1440, height: 1000 });
  await page.waitForSelector('.bh-activity-center:not(.bh-activity-center-panel)');
  await clickCard(scenes[0], '查看上下文');
  await page.waitForSelector(card(scenes[0]) + ' .bh-human-inbox-reply');
  assert.equal(
    await page.$$eval(card(scenes[0]) + ' .bh-tool-approval-card', (nodes) => nodes.length),
    1,
  );
  await shot('page-context-dark');
  await clickCard(scenes[0], '收起上下文');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await shot('page-light');
  await page.focus(card(scenes[0]) + ' .bh-tool-approval-card');
  await page.keyboard.press('y');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  assert.equal(decisions.length, 0);
  await clickCard(scenes[0], '仅批准这一次');
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.textContent.includes('QA submission interrupted'),
    {},
    card(scenes[0]),
  );
  assert.equal((await audit(scenes[0])).length, 0);
  assert.equal(existsSync(scenes[0].file), false);
  assert.equal(
    (
      await rpc('toolApprovalStatus', {
        channelId: scenes[0].item.channelId,
        messageId: scenes[0].item.messageId,
      })
    ).status,
    'pending',
  );
  await shot('page-retry');
  await clickCard(scenes[0], '仅批准这一次');
  await page.waitForSelector(card(scenes[0]) + ' button[aria-busy="true"]');
  await shot('page-submitting');
  await page.waitForSelector(card(scenes[0]), { hidden: true });
  await page.keyboard.press('Enter');
  await page.keyboard.press('y');
  assert.equal(decisions.length, 2, 'Removing the card cannot approve the next request');
  assert.equal((await audit(scenes[0])).length, 1);
  assert.equal((await audit(scenes[0]))[0].toolApprovalDecision.outcome, 'allowed-once');
  await waitFor(() => existsSync(scenes[0].file), 'native bash resumes after approval');
  assert.equal(readFileSync(scenes[0].file, 'utf8'), 'ACTIVITY_2026_APPROVED');
  assert.equal((await audit(scenes[1])).length, 0);
  await shot('page-approved');
  save('page-proof', {
    audit: await audit(scenes[0]),
    otherRequestAudit: await audit(scenes[1]),
    nativeFileEffect: readFileSync(scenes[0].file, 'utf8'),
    decisions,
  });
  const row = `[data-channel-id="${scenes[0].item.channelId}"]`;
  await page.waitForSelector(row);
  const sourceName = (await page.accessibility.snapshot({ root: await page.$(row) })).name;
  await click(sourceName);
  await page.waitForSelector('[role="region"][aria-label="会话"]');
  await click('关闭 会话');
  await click('关闭 Bot 收件箱');
  await activity();
  await page.waitForSelector('.bh-activity-center-panel ' + card(scenes[1]));
  await page.setViewport({ width: 1100, height: 1000 });
  await clickCard(scenes[1], '查看上下文');
  await shot('dock-context-light');
  await clickCard(scenes[1], '收起上下文');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await shot('dock-dark');
  await clickCard(scenes[1], '拒绝');
  await page.waitForSelector(card(scenes[1]), { hidden: true });
  assert.equal((await audit(scenes[1])).length, 1);
  assert.equal((await audit(scenes[1]))[0].toolApprovalDecision.outcome, 'rejected');
  assert.equal(existsSync(scenes[1].file), false);
  assert.ok(
    await page.$(`[data-channel-id="${scenes[0].item.channelId}"].bh-selected`),
    'The original Channel remains selected alongside Dock',
  );
  await shot('dock-rejected');
  save('proof', {
    decisions,
    audits: await Promise.all(scenes.map(audit)),
    traces: await Promise.all(
      scenes.map((scene) => rpc('botToolTrace', { slug: scene.item.botSlug, turns: 2 })),
    ),
    noDuplicateDecision: decisions.length === 3,
    nativeFileEffect: readFileSync(scenes[0].file, 'utf8'),
    rejectedFileAbsent: !existsSync(scenes[1].file),
    errors,
  });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: page retry/approve/native file, Dock reject, context, focus safety; evidence ' + out,
  );
} catch (error) {
  await shot('failure').catch(() => undefined);
  save('failure', {
    message: error.message,
    decisions,
    errors,
    observation: await page
      .evaluate(() => window.__BOTHARNESS_CLIENT_DIAGNOSTICS__?.snapshot())
      .catch(() => null),
  });
  console.error('Evidence: ' + out);
  throw error;
} finally {
  save('console', errors);
  await browser.close();
}
