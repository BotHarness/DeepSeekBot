import { createRequire } from 'node:module';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const token = process.env.BH_E2E_TOKEN;
if (!token) throw new Error('Set BH_E2E_TOKEN');
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3214';
const shots = process.env.BH_SCREENSHOT_DIR ?? '/tmp/bh312-sessions-shots';
mkdirSync(shots, { recursive: true });
const name = 'SessionsQA-' + Date.now();
const folder = '/tmp/bh312-sessions-workspace-' + Date.now();
mkdirSync(folder, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  await page.goto(origin + '/?token=' + encodeURIComponent(token), {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  await page.click('button[aria-label="Bot mode"]');
  try {
    await page.waitForSelector('button[aria-label="New"]', { timeout: 20000 });
  } catch (error) {
    await page.screenshot({ path: resolve(shots, '00-initial-state.png'), fullPage: true });
    console.log(
      'INITIAL PAGE',
      await page.evaluate(() => ({
        url: location.href,
        text: document.body.innerText.slice(0, 1500),
        buttons: Array.from(document.querySelectorAll('button'))
          .slice(0, 30)
          .map((button) => ({
            label: button.getAttribute('aria-label'),
            text: button.textContent?.trim(),
          })),
      })),
    );
    throw error;
  }
  await page.click('button[aria-label="New"]');
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Create PersonaBot')
      ?.click(),
  );
  await page.waitForSelector('input[placeholder="e.g. Xiao Yan"]', { timeout: 10000 });
  await page.type('input[placeholder="e.g. Xiao Yan"]', name);
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Create')
      ?.click(),
  );
  const composer = 'textarea[placeholder^="发消息给"], textarea[placeholder^="Message "]';
  await page.waitForSelector(composer, { timeout: 10000 });
  const rpc = async (method, args) =>
    page.evaluate(
      async (method, args) => {
        const response = await fetch('/api/' + method, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: 'stop-e2e-' + Math.random(),
            method,
            payload: { args },
          }),
        });
        const envelope = await response.json();
        if (envelope.result?.ok !== true)
          throw new Error(method + ': ' + JSON.stringify(envelope.result ?? envelope));
        return envelope.result.value;
      },
      method,
      args,
    );
  const channels = await rpc('botharness/channels', {});
  const dm = channels.channels.find((c) => c.type === 'dm' && c.name === name);
  const slug = dm?.botSlug;
  if (!slug) throw new Error('Missing bot DM');
  const workspace = await rpc('workspace/create', { request: { path: folder } });
  const grant = (
    await rpc('botharness/grantCreate', { slug, workspaceId: workspace.workspace.workspaceId })
  ).grant;
  const send = async (message) => {
    await rpc('botharness/channelSend', { channelId: dm.id, body: message });
  };
  await send(
    '请从当前有效工作区授权创建一个独立事项，让该事项使用 DSH 原生 bash 执行 pwd。Orchestrator 不要自己运行 bash；请在 Channel 告诉我事项 Session ID。',
  );
  await page.waitForFunction(
    async (slug) => {
      const response = await fetch('/api/botharness/assignments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'stop-poll-' + Math.random(),
          method: 'botharness/assignments',
          payload: { args: { slug } },
        }),
      });
      const envelope = await response.json();
      return envelope.result?.value?.assignments?.some((item) => item.activity === 'working');
    },
    { timeout: 120000, polling: 700 },
    slug,
  );
  const assignments = (await rpc('botharness/assignments', { slug })).assignments;
  const assignment = assignments.find((item) => item.activity === 'working');
  if (!assignment) throw new Error('Missing working Assignment');
  const owned = (await rpc('botharness/sessions', { slug })).sessions;
  if (
    !owned.some((item) => item.role === 'orchestrator') ||
    !owned.some((item) => item.role === 'assignment' && item.sessionId === assignment.sessionId)
  )
    throw new Error('Missing owned root Sessions: ' + JSON.stringify(owned));
  await page.waitForSelector('.bh-tool-approval-card', { timeout: 90000 });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-panel-head]'))
      .find((button) => /Sessions|会话/.test(button.textContent ?? ''))
      ?.click(),
  );
  await page.waitForFunction(() => document.querySelectorAll('.bh-session-row').length >= 2, {
    timeout: 20000,
    polling: 500,
  });
  const currentRows = await page.$$eval('.bh-session-row', (items) =>
    items.map((item) => item.textContent),
  );
  if (
    !currentRows.some((row) => row?.includes('Orchestrator')) ||
    !currentRows.some((row) => row?.includes('Assignment'))
  )
    throw new Error('Missing role labels: ' + JSON.stringify(currentRows));
  await page.screenshot({ path: resolve(shots, '01-pending-approval.png'), fullPage: true });
  await send(
    '请立即使用 stop_assignment 停止刚创建的事项 Session ' +
      assignment.sessionId +
      '。停止完成后在本 Channel 告诉我结果。不要批准或运行待审批的 bash。',
  );
  await page.waitForFunction(
    async (slug, sessionId) => {
      const response = await fetch('/api/botharness/assignments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'stop-poll-' + Math.random(),
          method: 'botharness/assignments',
          payload: { args: { slug } },
        }),
      });
      const envelope = await response.json();
      return envelope.result?.value?.assignments?.some(
        (item) => item.sessionId === sessionId && item.activity === 'stopped',
      );
    },
    { timeout: 120000, polling: 700 },
    slug,
    assignment.sessionId,
  );
  await page.waitForFunction(
    async (channelId, sessionId) => {
      const response = await fetch('/api/botharness/channelMessages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'stop-history-' + Math.random(),
          method: 'botharness/channelMessages',
          payload: { args: { channelId } },
        }),
      });
      const envelope = await response.json();
      return envelope.result?.value?.messages?.some(
        (message) =>
          message.author?.kind === 'bot' &&
          message.body?.includes(sessionId) &&
          message.body.includes('stopped'),
      );
    },
    { timeout: 30000, polling: 500 },
    dm.id,
    assignment.sessionId,
  );
  const stopped = (await rpc('botharness/assignments', { slug })).assignments.find(
    (item) => item.sessionId === assignment.sessionId,
  );
  await page.waitForFunction(
    (botName) =>
      Array.from(document.querySelectorAll('button')).some((button) =>
        button.textContent?.includes(botName),
      ),
    { timeout: 10000 },
    name,
  );
  await page.evaluate(
    (botName) =>
      Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent?.includes(botName))
        ?.click(),
    name,
  );
  await page.waitForFunction(
    (sessionId) =>
      document.body.innerText.includes(sessionId) &&
      !document.body.innerText.includes('Loading messages…'),
    { timeout: 10000 },
    assignment.sessionId,
  );
  await page.click('button[aria-label="Session view options"]');
  await page.waitForSelector('div[role="menu"]', { timeout: 10000 });
  const selectedAll = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('div[role="menu"] button')).find((item) =>
      /^(All|全部)$/.test(item.textContent?.trim() ?? ''),
    );
    button?.click();
    return button !== undefined;
  });
  if (!selectedAll) throw new Error('Could not select All from the Sessions menu');
  await page.waitForFunction(() => document.querySelectorAll('.bh-session-row').length >= 2, {
    timeout: 10000,
    polling: 500,
  });
  await page.screenshot({ path: resolve(shots, '02-stopped-all.png'), fullPage: true });
  const sessionRows = await page.$$eval('.bh-session-row', (items) =>
    items.map((item) => item.textContent),
  );
  if (!sessionRows.some((row) => row?.includes('Stopped') || row?.includes('已停止')))
    throw new Error('Stopped Session missing: ' + JSON.stringify(sessionRows));
  if (stopped?.activity !== 'stopped') throw new Error('Assignment not stopped');
  console.log(
    JSON.stringify({
      verdict: 'PASS',
      name,
      slug,
      folder,
      grantId: grant.id,
      sessionId: assignment.sessionId,
      status: stopped.activity,
      currentRows,
      sessionRows,
      shots,
    }),
  );
} finally {
  await browser.close();
}
