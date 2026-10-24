import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const evidence = process.env.BH_E2E_EVIDENCE;
assert.ok(origin && home && evidence);
const cookie = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(
  ';',
)[0];
async function rpc(method, args = {}) {
  const endpoint = method.includes('/') ? method : `botharness/${method}`;
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(`${origin}/api/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: endpoint,
          payload: { args },
        }),
      });
      break;
    } catch (error) {
      if (
        ![
          'list',
          'channelMessages',
          'activitySnapshot',
          'activityOverview',
          'modelCatalog',
        ].includes(method) ||
        attempt === 2
      )
        throw error;
      await new Promise((done) => setTimeout(done, 200));
    }
  }
  const result = (await response.json()).result;
  assert.equal(result?.ok, true, `${method}: ${JSON.stringify(result?.error)}`);
  return result.value;
}
async function until(read, predicate, label) {
  for (let attempt = 0; attempt < 180; attempt++) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw Error(`Timed out: ${label}`);
}
const model = (await rpc('modelCatalog')).models.find(
  (entry) =>
    entry.model.includes(process.env.BH_E2E_MODEL ?? 'pro') &&
    entry.efforts.some((effort) => effort.id === (process.env.BH_E2E_EFFORT ?? 'off')),
);
assert.ok(model);
const route = {
  provider: model.provider,
  model: model.model,
  reasoningEffort: process.env.BH_E2E_EFFORT ?? 'off',
};
const bot = process.env.BH_E2E_RECONNECT_BOT
  ? (await rpc('list')).bots.find((bot) => bot.slug === process.env.BH_E2E_RECONNECT_BOT)
  : (
      await rpc('create', {
        displayName: process.env.BH_E2E_NAME ?? `Orchestrator priority QA ${Date.now()}`,
      })
    ).bot;
const channelId = `dm-${bot.slug}`;
await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName });
let grant;
if (!process.env.BH_E2E_RECONNECT_BOT) {
  const preset = (
    await rpc('modelPresetCreate', {
      name: bot.displayName,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
  await rpc('browserAccessSet', { slug: bot.slug, enabled: true });
  const folder = resolve(tmpdir(), `bh123-workspace-${bot.slug}`);
  mkdirSync(folder, { recursive: true });
  const workspace = await rpc('workspace/create', { request: { path: folder } });
  grant = (
    await rpc('grantCreate', { slug: bot.slug, workspaceId: workspace.workspace.workspaceId })
  ).grant;
}
mkdirSync(evidence, { recursive: true });
const pnpm = resolve('node_modules/.pnpm');
const directory = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(pnpm, directory, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1180 });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
await page.setExtraHTTPHeaders({ cookie });
const snapshot = async () =>
  (await rpc('activitySnapshot')).bots.find((row) => row.slug === bot.slug);
const messages = async () => (await rpc('channelMessages', { channelId })).messages;
async function openOnce() {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((button) =>
          ['Continue', '继续'].includes(button.textContent?.trim() ?? ''),
        ),
      { timeout: 2500 },
    )
    .catch(() => undefined);
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  if (!(await page.$('.bh-main')))
    await page.locator('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]').click();
  await page.waitForFunction(
    () =>
      document.querySelector('.bh-main') ||
      [...document.querySelectorAll('button')].some((button) =>
        ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''),
      ),
  );
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  await page.waitForSelector(`[data-channel-id="${channelId}"]`);
  await page.locator(`[data-channel-id="${channelId}"]`).click();
  await page.waitForSelector('.bh-composer-shell');
}
async function open() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await openOnce();
      return;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
}

async function matchUi(row) {
  if (process.env.BH_E2E_APPROVAL_ATTENTION === 'true') {
    await page.waitForFunction(
      (id, count) => {
        const sidebar = document.querySelector(`[data-channel-id="${id}"] .bh-persona-avatar`);
        const composer = document.querySelector('.bh-composer-shell .bh-persona-avatar');
        const approvalCount = (avatar) =>
          Number(avatar?.querySelector('[data-approval-count]')?.dataset.approvalCount ?? 0);
        return approvalCount(sidebar) === count && approvalCount(composer) === count;
      },
      {},
      channelId,
      row.attention?.approvalCount ?? 0,
    );
  }
  await page.waitForFunction(
    (id, state, effect) => {
      const sidebar = document.querySelector(`[data-channel-id="${id}"] .bh-persona-avatar`);
      const composer = document.querySelector('.bh-composer-shell .bh-persona-avatar');
      if (state === 'idle')
        return (
          sidebar?.dataset.state === 'idle' && (!composer || composer.dataset.state === 'idle')
        );
      return (
        sidebar?.dataset.state === state &&
        composer?.dataset.state === state &&
        (effect === undefined ||
          (sidebar?.dataset.effect === effect && composer?.dataset.effect === effect))
      );
    },
    {},
    channelId,
    row.state,
    row.activity?.effect,
  );
}
async function screenshot(name, expand = true) {
  if (expand && (await page.$('.bh-composer-activity-status:not([open])')))
    await page.locator('.bh-composer-activity-status summary').click();
  await page.evaluate(() => {
    for (const pre of document.querySelectorAll('.bh-tool-approval-input')) {
      const value = JSON.parse(pre.textContent);
      if (value.workdir) value.workdir = '[machine-local QA directory redacted]';
      pre.textContent = JSON.stringify(value, null, 2);
    }
    for (const note of document.querySelectorAll('.bh-tool-approval-card .bh-note'))
      if (/C:\\Users\\|C:\/Users\//.test(note.textContent))
        note.textContent = '[machine-local QA directory redacted]';
    const timeline = document.querySelector('.bh-chat-body');
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
  });
  await page.screenshot({ path: resolve(evidence, name) });
}
async function overview(row, approvals, name) {
  const value = await rpc('activityOverview');
  const selected = value.bots.find((item) => item.slug === bot.slug);
  assert.equal(selected.state, row.state);
  assert.deepEqual(selected.activity, row.activity);
  assert.equal(selected.hasAction, approvals > 0);
  if (process.env.BH_E2E_APPROVAL_ATTENTION === 'true')
    assert.deepEqual(selected.attention, row.attention);
  assert.equal(value.actionCount, approvals);
  const roots =
    row.sessions?.filter(
      (session) => session.role !== 'subagent' && ['working', 'thinking'].includes(session.state),
    ) ?? [];
  assert.equal(selected.sessions.length, roots.length);
  await page
    .locator('button[aria-label^="Activity Center"],button[aria-label^="活动中心"]')
    .click();
  await page.waitForSelector(`[data-bot-id="${bot.slug}"]`);
  await page.waitForFunction(
    (slug, state, name) => {
      const card = document.querySelector(`[data-bot-id="${slug}"]`);
      return (
        card?.querySelector('.bh-persona-avatar')?.dataset.state === state &&
        (!name || card.querySelector('.bh-overview-bot-state')?.textContent.includes(name))
      );
    },
    {},
    bot.slug,
    row.state,
    row.activity?.toolName,
  );
  assert.equal(
    await page.$$eval(`[data-bot-id="${bot.slug}"] [data-session-id]`, (rows) => rows.length),
    roots.length,
  );
  if (approvals > 0) {
    await page.waitForFunction(
      (slug, count) =>
        document.querySelectorAll(`[data-bot-id="${slug}"] [data-attention-id^="approval:"]`)
          .length === count,
      {},
      bot.slug,
      approvals,
    );
  }
  if (process.env.BH_E2E_APPROVAL_ATTENTION === 'true') {
    await page.waitForFunction(
      (slug, count) =>
        Number(
          document.querySelector(`[data-bot-id="${slug}"] [data-approval-count]`)?.dataset
            .approvalCount ?? 0,
        ) === count,
      {},
      bot.slug,
      approvals,
    );
  }
  await screenshot(name, false);
  await page.locator(`[data-channel-id="${channelId}"]`).click();
  await page.waitForSelector('.bh-composer-shell');
  await matchUi(row);
}
try {
  await open();
  if (!process.env.BH_E2E_RECONNECT_BOT)
    await rpc('channelSend', {
      channelId,
      body: `For this concurrent Activity QA, first create exactly one Assignment with active Workspace Grant ${grant.id} and continuity key activity-proof. Its purpose is to run exactly node -e "setTimeout(() => {}, 2000)" once through native Shell, then report_to_orchestrator completed with summary Assignment timer finished. Do not modify files, create subagents, or run other Shell commands. For your Orchestrator role, use only create_assignment, browser_tabs and bot_send_message in this QA. Do not use Goal tools (create_goal, get_goal, update_goal), planning tools, questions or polling tools. After create_assignment returns, you must call browser_tabs action=list once yourself; do not skip that call. After browser_tabs succeeds, end your Turn while awaiting the Assignment report without polling or sending a Channel reply. When the Assignment report arrives, use bot_send_message to send exactly Concurrent activity confirmed.`,
    });
  const pending = await until(
    messages,
    (rows) => {
      const unanswered = rows.filter(
        (row) =>
          row.toolApprovalRequest &&
          !rows.some((decision) => decision.toolApprovalDecision?.requestMessageId === row.id),
      );
      return (
        unanswered.some(
          (row) =>
            row.toolApprovalRequest.role === 'orchestrator' &&
            row.toolApprovalRequest.toolName === 'browser_tabs',
        ) &&
        unanswered.some(
          (row) =>
            row.toolApprovalRequest.role === 'assignment' &&
            ['bash', 'pwsh'].includes(row.toolApprovalRequest.toolName),
        )
      );
    },
    'both real Session Tool approvals',
  );
  const requests = pending.filter(
    (row) =>
      row.toolApprovalRequest &&
      !pending.some((decision) => decision.toolApprovalDecision?.requestMessageId === row.id),
  );
  const orchestrator = requests.find((row) => row.toolApprovalRequest.role === 'orchestrator');
  const assignment = requests.find((row) => row.toolApprovalRequest.role === 'assignment');
  assert.equal(JSON.parse(orchestrator.toolApprovalRequest.input).action, 'list');
  assert.equal(
    JSON.parse(assignment.toolApprovalRequest.input).command,
    'node -e "setTimeout(() => {}, 2000)"',
  );
  const both = await until(
    snapshot,
    (row) => row?.sessions?.filter((session) => session.state === 'working').length === 2,
    'both active Session rows',
  );
  assert.deepEqual(both.activity.sources, [{ role: 'orchestrator', count: 1 }]);
  assert.equal(both.activity.toolName, 'browser_tabs');
  assert.equal(both.activity.activeToolCount, 1);
  if (process.env.BH_E2E_APPROVAL_ATTENTION === 'true')
    assert.deepEqual(both.attention, { approvalCount: 2 });
  await matchUi(both);
  await screenshot('orchestrator-selected.png');
  await overview(both, 2, 'overview-orchestrator.png');
  await open();
  await matchUi(both);
  assert.equal(await page.$eval('.bh-composer-activity-status', (details) => details.open), false);
  const refreshed = await snapshot();
  assert.deepEqual(refreshed, both);
  await screenshot('reconnected.png');
  await overview(refreshed, 2, 'overview-reconnected.png');
  writeFileSync(
    resolve(evidence, 'qa-state.json'),
    JSON.stringify({ bot: bot.slug, displayName: bot.displayName, channelId }, null, 2),
  );
  if (process.env.BH_E2E_HOLD === 'true') {
    console.log(
      JSON.stringify({
        heldForHumanQA: true,
        realConcurrentSessions: true,
        selectedOrchestrator: true,
      }),
    );
  } else {
    assert.equal(
      (
        await rpc('toolApprovalDecide', {
          channelId,
          messageId: orchestrator.id,
          outcome: 'allowed-once',
        })
      ).accepted,
      true,
    );
    const handoff = await until(
      snapshot,
      (row) =>
        row?.activity?.sources?.length === 1 && row.activity.sources[0].role === 'assignment',
      'handoff to Assignment',
    );
    assert.ok(['bash', 'pwsh'].includes(handoff.activity.toolName));
    assert.equal(handoff.activity.effect, 'executing');
    if (process.env.BH_E2E_APPROVAL_ATTENTION === 'true')
      assert.deepEqual(handoff.attention, { approvalCount: 1 });
    await matchUi(handoff);
    await screenshot('assignment-selected.png');
    await overview(handoff, 1, 'overview-assignment.png');
    assert.equal(
      (
        await rpc('toolApprovalDecide', {
          channelId,
          messageId: assignment.id,
          outcome: 'allowed-once',
        })
      ).accepted,
      true,
    );
    await until(
      messages,
      (rows) =>
        rows.some(
          (row) =>
            row.author?.kind === 'bot' && /^Concurrent activity confirmed\.?$/u.test(row.body),
        ),
      'real report and Channel reply',
    );
    const idle = await until(snapshot, (row) => row?.state === 'idle', 'settled idle');
    if (process.env.BH_E2E_APPROVAL_ATTENTION === 'true') assert.equal(idle.attention, undefined);
    await matchUi(idle);
    await screenshot('settled.png', false);
    await page
      .locator('button[aria-label^="Activity Center"],button[aria-label^="活动中心"]')
      .click();
    await page
      .locator('button[aria-label="Show idle Bots"],button[aria-label="显示空闲 Bot"]')
      .click();
    await page.waitForSelector(`[data-bot-id="${bot.slug}"]`);
    assert.equal(
      (await rpc('activityOverview')).bots.find((row) => row.slug === bot.slug).state,
      'idle',
    );
    await screenshot('overview-settled.png', false);
    const proof = {
      ...(process.env.BH_E2E_APPROVAL_ATTENTION === 'true'
        ? { revisionedApprovalIndicatorsMatched: true, approvalCountDecreasedAndCleared: true }
        : {}),
      realConcurrentSessions: true,
      selectedOrchestrator: true,
      assignmentRowPreserved: true,
      sidebarComposerMatched: true,
      reconnectPreservedSnapshot: true,
      defaultCollapsed: true,
      handedOffToAssignment: true,
      realAssignmentReportAndReply: true,
      settledIdle: true,
      overviewUsesSameHostStateAndSummary: true,
      attentionIndependentFromExecution: true,
      pendingLiveSessionCardsPreserved: true,
    };
    writeFileSync(resolve(evidence, 'proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
    console.log(JSON.stringify(proof));
  }
} catch (error) {
  try {
    await page.screenshot({ path: resolve(evidence, 'failure.png') });
    console.log(
      await page.evaluate(() => ({
        headings: [...document.querySelectorAll('h1,h2,h3')].map((e) => e.textContent),
        buttons: [...document.querySelectorAll('button')]
          .map((e) => e.textContent?.trim())
          .filter(Boolean)
          .slice(0, 25),
      })),
    );
  } catch {
    console.error('Failure diagnostics unavailable; preserving the original error.');
  }
  throw error;
} finally {
  await browser.close();
}
