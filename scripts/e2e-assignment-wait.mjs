import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const evidence = process.env.BH_E2E_EVIDENCE;
const mode = process.argv[2] ?? 'check';
assert.ok(origin && home && evidence, 'set BH_E2E_ORIGIN, HOME and EVIDENCE');
mkdirSync(evidence, { recursive: true });
const privateDir = resolve('.humanlayer/tasks/123-assignment-wait');
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
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent?.includes('bh123-wait-workspace-'))
        node.textContent = node.textContent.replace(
          /[A-Z]:\\Users\\[^\\]+\\AppData\\Local\\Temp\\bh123-wait-workspace-[^\s]+/g,
          '[isolated QA workspace]',
        );
    }
  });
  return page.screenshot({ path: resolve(evidence, `${name}.png`) });
};
async function host(slug) {
  const snapshot = await rpc('activitySnapshot');
  return {
    generation: snapshot.generation,
    revision: snapshot.revision,
    ...snapshot.bots.find((bot) => bot.slug === slug),
  };
}
async function prepare() {
  const bot = (
    await rpc('create', {
      displayName: `Assignment wait Human QA ${Date.now()}`,
      persona:
        'Follow Human instructions precisely. When asked to verify Assignment waiting, create one Assignment and immediately call wait_for_assignment with timeout_seconds 120. Do not poll inspect_assignment. The Assignment must run a bounded native Shell command and report completed. After wait returns, send the result to the Channel and end the Turn.',
    })
  ).bot;
  const channelId = (await rpc('channelDm', { slug: bot.slug })).channel.id;
  const model = (await rpc('modelCatalog')).models.find(
    (model) => model.model.includes('flash') && model.efforts.some((effort) => effort.id === 'low'),
  );
  assert.ok(model);
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: bot.displayName,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
  const folder = resolve(tmpdir(), `bh123-wait-workspace-${bot.slug}`);
  mkdirSync(folder, { recursive: true });
  const workspace = await rpc('create', { request: { path: folder } }, 'workspace');
  const grant = (
    await rpc('grantCreate', { slug: bot.slug, workspaceId: workspace.workspace.workspaceId })
  ).grant;
  return { slug: bot.slug, displayName: bot.displayName, channelId, grantId: grant.id };
}
try {
  const scene = mode !== 'check' ? JSON.parse(readFileSync(statePath, 'utf8')) : await prepare();
  writeFileSync(statePath, JSON.stringify(scene, null, 2));
  await open(scene.channelId);
  if (mode === 'human') {
    console.log(
      JSON.stringify({
        humanQA: scene.displayName,
        instruction: 'Ask: Repeat the Assignment waiting verification with a new continuity key.',
      }),
    );
  } else {
    await shot('before-wait-operation');
    await rpc('channelSend', {
      channelId: scene.channelId,
      messageId: `human-${crypto.randomUUID()}`,
      body: `Verify Assignment waiting now. Use Grant ${scene.grantId}, create exactly one Assignment with a new continuity key. Its purpose: run one native Shell command node -e "setTimeout(() => {}, 25000)" (wait 25 seconds), then call report_to_orchestrator with state completed and summary WAIT_VERIFIED. Use no other tools. You, Orchestrator: immediately after create_assignment returns, call wait_for_assignment with its session_id and timeout_seconds 120. Do not inspect-poll and do not end your Turn early. Once wait returns, bot_send_message WAIT_VERIFIED with its outcome, then end.`,
    });
    const waiting = await waitFor(async () => {
      const value = await host(scene.slug);
      return value.activity?.sources?.some((source) => source.role === 'assignment') &&
        value.sessions?.some(
          (session) =>
            session.role === 'orchestrator' && session.activity?.toolName === 'wait_for_assignment',
        )
        ? value
        : false;
    }, 'real explicit wait selecting Assignment activity');
    await page.waitForFunction(
      (channelId) => {
        const sidebar = document.querySelector(
          `[data-channel-id="${channelId}"] .bh-persona-avatar`,
        );
        const composer = document.querySelector('.bh-composer-activity-status .bh-persona-avatar');
        return sidebar?.dataset.state === 'working' && composer?.dataset.state === 'working';
      },
      {},
      scene.channelId,
    );
    await page.click('.bh-composer-activity-status summary');
    await shot('assignment-selected-waiting-light');
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
    await shot('assignment-selected-waiting-dark');
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    const approval = await waitFor(
      async () =>
        (await rpc('channelMessages', { channelId: scene.channelId })).messages.find(
          (message) => message.toolApprovalRequest?.role === 'assignment',
        ),
      'actual Assignment Shell approval',
    );
    assert.equal(
      JSON.parse(approval.toolApprovalRequest.input).command,
      'node -e \"setTimeout(() => {}, 25000)\"',
    );
    await page.setOfflineMode(true);
    const decision = await rpc('toolApprovalDecide', {
      channelId: scene.channelId,
      messageId: approval.id,
      outcome: 'allowed-once',
    });
    assert.equal(decision.accepted, true);
    await page.setOfflineMode(false);
    await page.waitForSelector('.bh-composer-shell');
    const working = await host(scene.slug);
    assert.ok(working.activity?.sources?.some((source) => source.role === 'assignment'));
    await page.waitForFunction(
      () => !document.querySelector('.bh-composer-activity-status .bh-avatar-attention'),
      { timeout: 20000 },
    );
    await shot('reconnected-assignment-working');
    await waitFor(
      async () => (await host(scene.slug)).state === 'idle',
      'real Assignment report and Orchestrator completion',
    );
    const final = await host(scene.slug);
    const restored = frames.filter(
      (frame) =>
        frame.revision > waiting.revision &&
        frame.bots.some(
          (bot) =>
            bot.slug === scene.slug &&
            bot.activity?.sources?.some((source) => source.role === 'orchestrator'),
        ),
    ).length;
    assert.ok(restored > 0, 'actual Orchestrator presentation resumes after report');
    const messages = (await rpc('channelMessages', { channelId: scene.channelId })).messages;
    assert.ok(
      messages.some(
        (message) => message.body.includes('WAIT_VERIFIED') && message.author?.kind === 'bot',
      ),
    );
    await shot('report-returned-idle');
    writeFileSync(
      resolve(evidence, 'proof.json'),
      JSON.stringify(
        {
          waiting,
          working,
          final,
          frames: frames.map((frame) => ({
            ...frame,
            bots: frame.bots.filter((bot) => bot.slug === scene.slug),
          })),
          clientErrors,
        },
        null,
        2,
      ),
    );
    assert.deepEqual(clientErrors, []);
    console.log(
      JSON.stringify({ success: true, humanQA: scene.displayName, frames: frames.length }),
    );
  }
} catch (error) {
  await page.screenshot({ path: resolve(privateDir, 'failure.png') });
  writeFileSync(
    resolve(privateDir, 'failure.json'),
    JSON.stringify({ error: String(error), frames, clientErrors }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
