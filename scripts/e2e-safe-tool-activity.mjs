import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
const origin = process.env.BH_E2E_ORIGIN,
  home = process.env.BH_E2E_HOME,
  evidence = process.env.BH_E2E_EVIDENCE;
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
          rpcId: `activity-${Math.random()}`,
          method: endpoint,
          payload: { args },
        }),
      });
      break;
    } catch (error) {
      if (
        !['list', 'channelMessages', 'modelCatalog', 'rosterGet'].includes(method) ||
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
const models = (await rpc('modelCatalog')).models;
const model = models.find(
  (e) =>
    e.model.includes(process.env.BH_E2E_MODEL ?? 'flash') &&
    e.efforts.some((x) => x.id === (process.env.BH_E2E_EFFORT ?? 'low')),
);
assert.ok(model);
const route = {
  provider: model.provider,
  model: model.model,
  reasoningEffort: process.env.BH_E2E_EFFORT ?? 'low',
};
const bot = process.env.BH_E2E_RECONNECT_BOT
  ? (await rpc('list')).bots.find((bot) => bot.slug === process.env.BH_E2E_RECONNECT_BOT)
  : (
      await rpc('create', {
        displayName: process.env.BH_E2E_NAME ?? `Tool activity QA ${Date.now()}`,
      })
    ).bot;
assert.ok(bot);
const channelId = `dm-${bot.slug}`;
const publicDetailMode = process.env.BH_E2E_PUBLIC_DETAIL === 'true';
const sessionMode = process.env.BH_E2E_SESSIONS === 'true';
const compactSessions = process.env.BH_E2E_COMPACT === 'true';
const expectedPublicDetail = 'Opening a new browser tab';
const expectedEffect = publicDetailMode && !sessionMode ? 'generic-working' : 'executing';
const sourceRole = process.env.BH_E2E_SOURCE_ROLE;
assert.ok(sourceRole === undefined || ['orchestrator', 'assignment'].includes(sourceRole));
const layout = process.env.BH_E2E_LAYOUT ?? 'row';
if (publicDetailMode) await rpc('browserAccessSet', { slug: bot.slug, enabled: true });
await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName });
if (!process.env.BH_E2E_RECONNECT_BOT) {
  const preset = (
    await rpc('modelPresetCreate', {
      name: bot.displayName,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
}
let assignmentGrant;
if (sourceRole === 'assignment' && process.env.BH_E2E_USE_PENDING !== 'true') {
  const folder = resolve(tmpdir(), `bh122-activity-workspace-${bot.slug}`);
  mkdirSync(folder, { recursive: true });
  const workspace = await rpc('workspace/create', { request: { path: folder } });
  assignmentGrant = (
    await rpc('grantCreate', {
      slug: bot.slug,
      workspaceId: workspace.workspace.workspaceId,
    })
  ).grant;
}
console.log(
  JSON.stringify({ bot: bot.slug, sourceRole, phase: process.env.BH_E2E_PHASE ?? 'after' }),
);
if (layout === 'row') {
  const roster = await rpc('rosterGet');
  await rpc('pinsSet', { pins: roster.pins.filter((id) => id !== channelId) });
}
if (layout !== 'row') {
  const roster = await rpc('rosterGet');
  await rpc('pinsSet', { pins: [...roster.pins, channelId] });
}
const pnpm = resolve('node_modules/.pnpm'),
  pdir = readdirSync(pnpm).find((e) => e.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(pnpm, pdir, 'node_modules/'))('puppeteer');
const wsdir = readdirSync(pnpm).find((e) => e.startsWith('ws@'));
const WebSocket = createRequire(resolve(pnpm, wsdir, 'node_modules/'))('ws');
async function nativeSnapshot(sessionId) {
  const socket = new WebSocket(`${origin.replace(/^http/, 'ws')}/api/remote.mux`, {
    headers: { cookie },
  });
  try {
    await new Promise((done, reject) => {
      socket.once('open', done);
      socket.once('error', reject);
    });
    return await new Promise((done, reject) => {
      const timer = setTimeout(() => reject(Error('Native Session snapshot timeout')), 10000);
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.on('message', (raw) => {
        const frame = JSON.parse(String(raw));
        if (frame.type === 'error') {
          clearTimeout(timer);
          reject(Error(JSON.stringify(frame.error)));
        }
        if (frame.type === 'item' && frame.value.type === 'snapshot') {
          clearTimeout(timer);
          done(frame.value);
        }
      });
      socket.send(
        JSON.stringify({
          type: 'open',
          streamId: crypto.randomUUID(),
          endpoint: 'session/follow',
          payload: {
            args: { request: { address: { kind: 'session', sessionId }, maxMessages: 100 } },
          },
        }),
      );
    });
  } finally {
    socket.terminate();
  }
}

mkdirSync(evidence, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: Number(process.env.BH_E2E_HEIGHT ?? 1180) });
const colorScheme = process.env.BH_E2E_COLOR_SCHEME ?? 'dark';
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: colorScheme }]);
await page.setExtraHTTPHeaders({ cookie });
async function screenshot(name) {
  await page.addStyleTag({
    content:
      '.bh-tool-approval-card > .bh-note:nth-child(3){font-size:0}.bh-tool-approval-card > .bh-note:nth-child(3)::after{content:"[machine-local QA directory redacted]";font-size:12px}',
  });
  await page.evaluate(() => {
    for (const pre of document.querySelectorAll('.bh-tool-approval-input')) {
      const input = JSON.parse(pre.textContent);
      if (input.workdir) input.workdir = '[machine-local QA directory redacted]';
      pre.textContent = JSON.stringify(input, null, 2);
    }
    const nodes = document.createTreeWalker(
      document.querySelector('.bh-main'),
      NodeFilter.SHOW_TEXT,
    );
    while (nodes.nextNode())
      nodes.currentNode.textContent = nodes.currentNode.textContent.replace(
        /(?:botharness-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
        '[QA reference redacted]',
      );
  });
  await page.screenshot({ path: resolve(evidence, name) });
}
const phase = process.env.BH_E2E_PHASE ?? 'after';
const snapshots = [];
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
cdp.on('Network.eventSourceMessageReceived', (event) => {
  if (event.eventName !== 'activity/snapshot') return;
  const frame = JSON.parse(event.data);
  const item = frame.bots.find((b) => b.slug === bot.slug);
  if (item) snapshots.push({ generation: frame.generation, revision: frame.revision, ...item });
});
try {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
      await page
        .waitForFunction(
          () =>
            Array.from(document.querySelectorAll('button')).some((b) =>
              ['Continue', '继续'].includes(b.textContent?.trim() ?? ''),
            ),
          { timeout: 3000 },
        )
        .catch(() => undefined);
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .find((b) => ['Continue', '继续'].includes(b.textContent?.trim() ?? ''))
          ?.click(),
      );
      if (!(await page.$('.bh-composer-shell, .bh-main')))
        await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
      await page.waitForFunction(
        () =>
          document.querySelector('.bh-main') ||
          Array.from(document.querySelectorAll('button')).some((b) =>
            ['Configure later', '稍后配置'].includes(b.textContent?.trim() ?? ''),
          ),
      );
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .find((b) => ['Configure later', '稍后配置'].includes(b.textContent?.trim() ?? ''))
          ?.click(),
      );
      await page.waitForSelector(`.bh-root [data-channel-id="${channelId}"]`);
      break;
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  await page.click(`.bh-root [data-channel-id="${channelId}"]`);
  await page.waitForSelector('.bh-composer-shell');

  const sent =
    process.env.BH_E2E_USE_PENDING === 'true'
      ? undefined
      : await rpc('channelSend', {
          channelId,
          body: publicDetailMode
            ? sessionMode
              ? 'Use browser_tabs action=list exactly once. Then use the native Shell tool to run exactly node -e "setTimeout(() => {}, 2000)" once. Do not skip either operation, delegate, or modify any files. After both finish, use channel_send with the exact phrase Safe tool activity confirmed.'
              : 'Use browser_tabs exactly once with action open and URL https://example.com/?bhqa=private-token-for-proof . Do not use browser_open, browse other pages, delegate, or change files. After it succeeds, use channel_send to send the exact phrase "Safe tool activity confirmed" in this DM.'
            : sourceRole === 'assignment'
              ? `For this QA, create exactly one Assignment with active Workspace Grant ${assignmentGrant.id}, omitting provider/model/effort. Its purpose: use the native Shell tool to run exactly node -e "setTimeout(() => {}, 2000)" once, then report_to_orchestrator that the harmless two-second timer completed. Do not modify files, use any other commands, or create subagents. Do not run Shell yourself. After the Assignment reports successful completion, use channel_send in this DM with exact phrase "Safe tool activity confirmed". Before completion, end your turn and await the Assignment report; do not poll it.`
              : 'Use the native Shell tool to run exactly node -e "setTimeout(() => {}, 2000)" once. This is a harmless two-second QA timer. Do not use any other tool except channel_send afterwards to send the exact phrase "Safe tool activity confirmed" in this DM. Do not delegate or modify any files.',
        });
  let pending;
  for (let i = 0; i < 1200; i++) {
    const list = (await rpc('channelMessages', { channelId })).messages;
    if (sessionMode && sent !== undefined) {
      const first = list.find(
        (message) =>
          message.at >= sent.message.at &&
          message.toolApprovalRequest?.toolName === 'browser_tabs' &&
          JSON.parse(message.toolApprovalRequest.input).action === 'list' &&
          !list.some((decision) => decision.toolApprovalDecision?.requestMessageId === message.id),
      );
      if (first) {
        await rpc('toolApprovalDecide', {
          channelId,
          messageId: first.id,
          outcome: 'allowed-once',
        });
        continue;
      }
    }
    pending = list.find(
      (m) =>
        (sent === undefined || m.at >= sent.message.at) &&
        !list.some((decision) => decision.toolApprovalDecision?.requestMessageId === m.id) &&
        m.toolApprovalRequest &&
        (publicDetailMode && !sessionMode
          ? m.toolApprovalRequest.toolName === 'browser_tabs' &&
            JSON.parse(m.toolApprovalRequest.input).action === 'open'
          : JSON.parse(m.toolApprovalRequest.input).command ===
            'node -e "setTimeout(() => {}, 2000)"'),
    );
    if (pending) break;
    await new Promise((done) => setTimeout(done, 200));
  }
  assert.ok(pending, 'Actual scoped tool approval must be pending');
  const toolName = pending.toolApprovalRequest.toolName;
  assert.ok(
    (publicDetailMode && !sessionMode ? ['browser_tabs'] : ['bash', 'pwsh']).includes(toolName),
    'Registered scoped tool name',
  );
  console.log(JSON.stringify({ approvalPending: true, sourceRole, toolName }));
  await page.waitForFunction(
    (id) =>
      document.querySelector(`[data-channel-id="${id}"] .bh-persona-avatar`)?.dataset.state ===
      'working',
    {},
    channelId,
  );
  if (phase === 'after') {
    await page.waitForFunction(
      (id, effect) =>
        document.querySelector(`[data-channel-id="${id}"] .bh-persona-avatar`)?.dataset.effect ===
          effect &&
        document.querySelector('.bh-composer-shell .bh-persona-avatar')?.dataset.effect === effect,
      {},
      channelId,
      expectedEffect,
    );
  }
  if (sourceRole !== undefined) {
    const current = (await rpc('activitySnapshot')).bots.find((row) => row.slug === bot.slug);
    assert.deepEqual(current?.activity?.sources, [{ role: sourceRole, count: 1 }]);
    const sourceLabel =
      sourceRole === 'assignment' ? ['任务会话', 'Assignment'] : ['主会话', 'Orchestrator'];
    await page.waitForFunction(
      (label) =>
        label.some((text) =>
          document.querySelector('.bh-composer-activity-summary')?.textContent.includes(text),
        ),
      {},
      sourceLabel,
    );
  }
  const dom = await page.evaluate(
    (id) => ({
      sidebar: Array.from(
        document.querySelectorAll(`[data-channel-id="${id}"] .bh-persona-avatar`),
      ).map((e) => ({
        state: e.dataset.state,
        effect: e.dataset.effect,
        label: e.getAttribute('aria-label'),
      })),
      composer: Array.from(document.querySelectorAll('.bh-composer-shell .bh-persona-avatar')).map(
        (e) => ({
          state: e.dataset.state,
          effect: e.dataset.effect,
          label: e.getAttribute('aria-label'),
        }),
      ),
      summary: document.querySelector('.bh-composer-activity-summary')?.textContent,
    }),
    channelId,
  );
  await screenshot(`${phase}.png`);
  const layoutEvidence = [];
  let sourceRows;
  let narrowSourceRows;
  let disclosure;
  let expandedPanel;
  const roster = await rpc('rosterGet');
  await rpc('pinsSet', { pins: [...new Set([...roster.pins, channelId])] });
  await page.waitForSelector(`.bh-pinned[data-channel-id="${channelId}"]`);
  await page.keyboard.press('Tab');
  await page.focus(`.bh-pinned[data-channel-id="${channelId}"]`);
  if (phase === 'after')
    await page.waitForFunction(
      (name) =>
        Array.from(document.querySelectorAll('[role="tooltip"]')).some((e) =>
          e.textContent.includes(name),
        ),
      {},
      toolName,
    );
  await screenshot(`${phase}-pinned.png`);
  layoutEvidence.push({
    layout: 'pinned',
    effect: await page.$eval(
      `.bh-pinned[data-channel-id="${channelId}"] .bh-persona-avatar`,
      (e) => e.dataset.effect,
    ),
  });
  await page.click('button[aria-label="收起侧边栏"],button[aria-label="Collapse sidebar"]');
  await page.waitForSelector('.bh-region-rail');
  const rail = `.bh-rail-channel[data-channel-id="${channelId}"]`;
  await page.hover(rail);
  await page.waitForSelector('.bh-rail-preview');
  await screenshot(`${phase}-rail.png`);
  let railFocusSummary;
  if (phase === 'after') {
    await page.mouse.move(800, 900);
    await page.focus('.bh-composer-input');
    await page.waitForFunction(() => !document.querySelector('.bh-rail-preview'));
    await page.keyboard.press('Tab');
    await page.focus(rail);
    await page.waitForSelector('.bh-rail-preview');
    railFocusSummary = await page.$eval(rail, (button) => button.getAttribute('aria-label'));
    assert.ok(railFocusSummary.includes(toolName));
    await screenshot('rail-focus.png');
  }
  layoutEvidence.push({
    layout: 'rail',
    effect: await page.$eval(`${rail} .bh-persona-avatar`, (e) => e.dataset.effect),
  });
  await page.click('button[aria-label="打开侧边栏"],button[aria-label="Open sidebar"]');
  await page.waitForSelector('.bh-pinned');
  await rpc('pinsSet', { pins: roster.pins });
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
    { name: 'prefers-color-scheme', value: colorScheme },
  ]);
  await page.waitForFunction(() => document.documentElement.dataset.botharnessMotion === 'reduce');
  const motion = await page.$$eval('.bh-composer-activity-facepile .bh-avatar-media', (elements) =>
    elements.map((e) => getComputedStyle(e).animationName),
  );
  assert.ok(motion.length > 0 && motion.every((name) => name === 'none'));
  await screenshot(`${phase}-reduce.png`);
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'no-preference' },
    { name: 'prefers-color-scheme', value: colorScheme },
  ]);
  if (phase === 'after' || sourceRole !== undefined) {
    disclosure = await page.$eval('.bh-composer-activity-status', (details) => ({
      open: details.open,
      headerBackground: getComputedStyle(details.querySelector('summary')).backgroundColor,
      bodyHeight: details.querySelector('.bh-composer-activity-details').getBoundingClientRect()
        .height,
    }));
    assert.equal(disclosure.open, false);
    assert.equal(disclosure.headerBackground, 'rgba(0, 0, 0, 0)');
    assert.equal(disclosure.bodyHeight, 0);
    if (compactSessions) {
      const jump = await page.$('.bh-timeline-new');
      if (jump !== null) await jump.click();
      await page.evaluate(() => {
        const timeline = document.querySelector('.bh-chat-body');
        timeline.scrollTop = timeline.scrollHeight;
        timeline.dispatchEvent(new Event('scroll'));
      });
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
    }
    const summary = await page.$('.bh-composer-activity-status summary');
    assert.ok(summary);
    await summary.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('.bh-composer-activity-status[open]');
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    expandedPanel = await page.$eval('.bh-composer-activity-details', (panel) => {
      const box = panel.getBoundingClientRect();
      const parent = panel.parentElement.getBoundingClientRect();
      const style = getComputedStyle(panel);
      return {
        width: box.width,
        parentWidth: parent.width,
        leftInset: box.left - parent.left,
        radius: style.borderRadius,
        background: style.backgroundColor,
        timelineBottom: document.querySelector('.bh-chat-body').getBoundingClientRect().bottom,
        disclosureBottom: parent.bottom,
      };
    });
    if (compactSessions) {
      assert.equal(expandedPanel.background, 'rgba(0, 0, 0, 0)');
      assert.ok(
        expandedPanel.timelineBottom >= expandedPanel.disclosureBottom,
        'Transcript extends behind the transparent Activity overlay',
      );
      assert.ok(expandedPanel.leftInset <= 6);
      assert.ok(expandedPanel.width >= expandedPanel.parentWidth - 12);
    } else {
      assert.ok(expandedPanel.leftInset >= 36);
      assert.ok(expandedPanel.width < expandedPanel.parentWidth - 36);
      assert.equal(expandedPanel.radius, '20px');
    }
    await screenshot('details.png');
    if (compactSessions) {
      const transparentHistory = await page.evaluate(() => {
        const timeline = document.querySelector('.bh-chat-body');
        const header = document.querySelector('.bh-composer-activity-toggle');
        const latest = timeline.querySelector('.bh-message-block:last-child');
        const guardedBottom = latest?.getBoundingClientRect().bottom;
        const headerTop = header.getBoundingClientRect().top;
        const bottom = timeline.scrollTop;
        timeline.scrollTop = Math.max(0, bottom - 96);
        return { guardedBottom, headerTop, bottom, shifted: timeline.scrollTop };
      });
      writeFileSync(
        resolve(evidence, 'transparent-history-proof.json'),
        JSON.stringify(transparentHistory, null, 2),
      );
      assert.ok(
        transparentHistory.guardedBottom <= transparentHistory.headerTop + 2,
        'Latest message actions remain above the overlay',
      );
      await screenshot('transparent-history.png');
      const historyTop = await page.$eval('.bh-chat-body', (timeline) => timeline.scrollTop);
      await page.click('.bh-composer-activity-status summary');
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
      await page.click('.bh-composer-activity-status summary');
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
      const retainedTop = await page.$eval('.bh-chat-body', (timeline) => timeline.scrollTop);
      assert.ok(
        Math.abs(retainedTop - historyTop) <= 2,
        'Disclosure preserves history reading position',
      );
      transparentHistory.historyTop = historyTop;
      transparentHistory.retainedTop = retainedTop;
      await page.evaluate((top) => {
        document.querySelector('.bh-chat-body').scrollTop = top;
      }, transparentHistory.bottom);
      writeFileSync(
        resolve(evidence, 'transparent-history-proof.json'),
        JSON.stringify(transparentHistory, null, 2),
      );
    }
    if (sourceRole !== undefined) {
      const measureSources = () =>
        page.$$eval('.bh-composer-activity-session', (rows) =>
          rows.map((row) => {
            const style = getComputedStyle(row);
            return {
              height: row.getBoundingClientRect().height,
              width: row.getBoundingClientRect().width,
              parentWidth: row.parentElement.getBoundingClientRect().width,
              clientWidth: row.clientWidth,
              scrollWidth: row.scrollWidth,
              gap: style.gap,
              padding: style.padding,
              radius: style.borderRadius,
              background: style.backgroundColor,
              border: style.border,
              fits: row.scrollWidth <= row.clientWidth,
              icon: row.querySelector('[role="img"]')?.getAttribute('aria-label'),
              name: row.querySelector('.bh-composer-activity-source-label')?.textContent,
              nameOverflow: row.querySelector('.bh-composer-activity-source-label')
                ? getComputedStyle(row.querySelector('.bh-composer-activity-source-label'))
                    .textOverflow
                : undefined,
              nameTop: row
                .querySelector('.bh-composer-activity-source-label')
                ?.getBoundingClientRect().top,
              latestTop: row
                .querySelector('.bh-composer-activity-session-latest')
                ?.getBoundingClientRect().top,
            };
          }),
        );
      sourceRows = await measureSources();
      assert.ok(sourceRows.length > 0);
      assert.ok(
        sourceRows.every(
          (row) =>
            row.height <= (sessionMode && phase === 'after' ? 80 : 44) && row.fits && row.icon,
        ),
      );
      if (compactSessions) {
        assert.ok(
          sourceRows.every(
            (row) =>
              row.width >= row.parentWidth - 1 &&
              Math.abs(row.nameTop - row.latestTop) <= 2 &&
              row.nameOverflow === 'ellipsis',
          ),
        );
      }
      await page.setViewport({ width: 420, height: 860 });
      await page.waitForFunction(
        () => document.querySelector('.bh-composer-activity-details')?.clientWidth >= 180,
      );
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
      narrowSourceRows = await measureSources();
      assert.ok(narrowSourceRows.every((row) => row.fits));
      if (compactSessions)
        assert.ok(
          narrowSourceRows.every(
            (row) => row.latestTop > row.nameTop && row.width >= row.parentWidth - 1,
          ),
        );
      await screenshot('details-narrow.png');
      await page.setViewport({ width: 1500, height: Number(process.env.BH_E2E_HEIGHT ?? 1180) });
    }
    const latest = snapshots.at(-1);
    let sessionEvidence;
    if (sessionMode && phase === 'after') {
      assert.equal(latest.sessions?.length, 1);
      assert.equal(latest.sessions[0].role, sourceRole);
      assert.equal(latest.sessions[0].activity?.toolName, toolName);
      assert.equal(latest.trace, undefined);
      assert.notEqual(latest.sessions[0].id, pending?.externalId);
      assert.equal(await page.$('.bh-composer-activity-bot-header'), null);
      assert.equal(await page.$('.bh-composer-activity-trace'), null);
      sessionEvidence = await page.$$eval('.bh-composer-activity-session', (rows) =>
        rows.map((row) => row.textContent),
      );
      assert.equal(sessionEvidence.length, latest.sessions.length);
      assert.ok(sessionEvidence[0].includes(toolName));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.bh-composer-activity-status');
      const refreshed = await rpc('activitySnapshot');
      assert.deepEqual(
        refreshed.bots.find((row) => row.slug === bot.slug)?.sessions,
        latest.sessions,
      );
      await page.waitForFunction(
        () => document.querySelector('.bh-composer-activity-status summary') !== null,
      );
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
      const restoredOpen = await page.$eval(
        '.bh-composer-activity-status',
        (details) => details.open,
      );
      console.log(JSON.stringify({ refreshedDisclosureOpen: restoredOpen }));
      if (!restoredOpen) {
        await page.focus('.bh-composer-activity-status summary');
        await page.keyboard.press('Enter');
      }
      await page.waitForSelector('.bh-composer-activity-status[open]');
      await screenshot('session-refresh.png');
      writeFileSync(
        resolve(evidence, 'session-proof.json'),
        JSON.stringify({ sessions: latest.sessions, rows: sessionEvidence }, null, 2),
      );
    }
    if (phase === 'after' && process.env.BH_E2E_HOLD !== 'true') {
      await rpc('toolApprovalDecide', {
        channelId,
        messageId: pending.id,
        outcome: 'allowed-once',
      });
      for (let i = 0; i < 1200; i++) {
        const messages = (await rpc('channelMessages', { channelId })).messages;
        const snapshot = await rpc('activitySnapshot');
        if (
          messages.some(
            (m) =>
              m.at >= pending.at &&
              m.author.kind === 'bot' &&
              m.body.includes('Safe tool activity confirmed'),
          ) &&
          snapshot.bots.find((b) => b.slug === bot.slug)?.state === 'idle'
        )
          break;
        assert.ok(i < 1199, 'Real model reply must complete');
        await new Promise((done) => setTimeout(done, 200));
      }
      await page.waitForFunction(
        (id) =>
          document.querySelector(`[data-channel-id="${id}"] .bh-persona-avatar`)?.dataset.state ===
            'idle' && !document.querySelector('.bh-composer-activity-status'),
        {},
        channelId,
      );
      if (sessionMode) {
        const settled = (await rpc('activitySnapshot')).bots.find((row) => row.slug === bot.slug);
        assert.equal(settled.sessions, undefined);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.bh-composer-shell');
        assert.equal(await page.$('.bh-composer-activity-status'), null);
      }
      await screenshot('settled.png');
    }
  }
  const session = (await rpc('sessions', { slug: bot.slug })).sessions.find(
    (session) => session.sessionId === pending.toolApprovalRequest.sessionId,
  );
  assert.ok(session, 'Native approval belongs to a trusted owned Session');
  assert.equal(session.role, sourceRole ?? 'orchestrator');
  const sessionId = session.sessionId;
  const native = await nativeSnapshot(sessionId);
  const nativeEvents = native.records
    .filter(
      (record) =>
        record.event.time >= Date.parse(pending.at) - 5000 &&
        ['tool/call', 'tool/result', 'turn/end'].includes(record.event.type),
    )
    .map((record) => ({
      type: record.event.type,
      time: record.event.time,
      ...(record.event.type === 'tool/call' &&
      [toolName, 'channel_send', 'report_to_orchestrator'].includes(record.event.data.name)
        ? { name: record.event.data.name }
        : {}),
    }));
  const nativeTitle = native.records.findLast((record) => record.event.type === 'session/title')
    ?.event.data.title;
  if (compactSessions && sourceRole === 'assignment') {
    assert.ok(
      typeof nativeTitle === 'string' && nativeTitle.length > 0,
      'Actual Assignment needs a logged native DSH title',
    );
    assert.equal(snapshots.at(-1)?.sessions?.[0]?.name, nativeTitle);
    assert.ok(sourceRows[0].name.startsWith(nativeTitle));
  }
  assert.ok(nativeEvents.some((event) => event.type === 'tool/call' && event.name === toolName));
  if (phase === 'after' && process.env.BH_E2E_HOLD !== 'true') {
    assert.ok(nativeEvents.some((event) => event.type === 'tool/result'));
    assert.ok(nativeEvents.some((event) => event.type === 'turn/end'));
  }
  writeFileSync(
    resolve(evidence, `${phase}-proof.json`),
    JSON.stringify(
      {
        bot: { slug: bot.slug, displayName: bot.displayName },
        route,
        sourceRole,
        ...(compactSessions ? { compactSessions: true, nativeTitle } : {}),
        colorScheme,
        phase,
        snapshots,
        dom,
        nativeEvents,
        railFocusSummary,
        layoutEvidence,
        disclosure,
        expandedPanel,
        sourceRows,
        narrowSourceRows,
        reduceMotion: motion,
        heldForHumanQA: process.env.BH_E2E_HOLD === 'true',
        actualNativeShellApproval: sessionMode || !publicDetailMode,
        ...(publicDetailMode
          ? {
              actualBrowserToolApproval: true,
              ...(sessionMode ? { sessionMode: true } : { publicDetail: expectedPublicDetail }),
            }
          : {}),
        toolName,
        verdict: 'PASS',
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
}
