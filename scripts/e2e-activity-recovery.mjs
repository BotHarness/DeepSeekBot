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
  const endpoint = `botharness/${method}`;
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
  (e) => e.model.includes('flash') && e.efforts.some((x) => x.id === 'low'),
);
assert.ok(model);
const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
const bot = process.env.BH_E2E_RECONNECT_BOT
  ? (await rpc('list')).bots.find((bot) => bot.slug === process.env.BH_E2E_RECONNECT_BOT)
  : (await rpc('create', { displayName: `Activity recovery QA ${Date.now()}` })).bot;
assert.ok(bot);
const channelId = `dm-${bot.slug}`;
const layout = process.env.BH_E2E_LAYOUT ?? 'row';
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
if (layout !== 'row') {
  const roster = await rpc('rosterGet');
  await rpc('pinsSet', { pins: [...roster.pins, channelId] });
}
const pnpm = resolve('node_modules/.pnpm'),
  pdir = readdirSync(pnpm).find((e) => e.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(pnpm, pdir, 'node_modules/'))('puppeteer');
mkdirSync(evidence, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1180 });
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
  });
  await page.screenshot({ path: resolve(evidence, name) });
}
let denyActivity = !process.env.BH_E2E_RECONNECT_BOT;
let unavailable = 0;
let recoveryReady = false;
let modeExited = false;
const activityFrames = [];
const snapshotQueries = [];
await page.setRequestInterception(true);
page.on('request', (request) => {
  if (request.url().includes('/api/botharness/activitySnapshot')) snapshotQueries.push(Date.now());
  if (denyActivity && request.url().includes('/api/botharness/stream?scope=activity')) {
    unavailable++;
    void request.respond({
      status: 503,
      contentType: 'text/plain',
      body: 'QA: activity stream temporarily unavailable',
    });
  } else void request.continue();
});
const frames = [],
  events = [];
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
cdp.on('Network.eventSourceMessageReceived', (event) => {
  if (event.eventName === 'activity/snapshot') {
    const snapshot = JSON.parse(event.data);
    activityFrames.push({
      generation: snapshot.generation,
      revision: snapshot.revision,
      state: snapshot.bots.find((b) => b.slug === bot.slug)?.state,
    });
  }
  if (!['channel/message', 'channel/admission'].includes(event.eventName)) return;
  const value = JSON.parse(event.data);
  if (value.channelId !== channelId) return;
  events.push({
    name: event.eventName,
    messageId: value.messageId ?? value.message?.id,
    deliveries: value.deliveries ?? value.message?.deliveries,
  });
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
      if (!(await page.$('.bh-root')))
        await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
      await page.waitForFunction(
        () =>
          document.querySelector('.bh-root') ||
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
  if (layout === 'rail') {
    await page.click('button[aria-label="收起侧边栏"],button[aria-label="Collapse sidebar"]');
    await page.waitForSelector('.bh-region-rail');
  }
  if (process.env.BH_E2E_RECONNECT_BOT) {
    await page.waitForFunction(
      (id) =>
        document.querySelector(`[data-channel-id="${id}"] .bh-persona-avatar`)?.dataset.state ===
        'idle',
      {},
      channelId,
    );
    for (let retry = 0; retry < 50 && activityFrames.length === 0; retry++)
      await new Promise((done) => setTimeout(done, 100));
    assert.equal(activityFrames.at(-1)?.state, 'idle');
    const reloads = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
      if (!(await page.$('.bh-root')))
        await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
      await page.waitForSelector(`.bh-root [data-channel-id="${channelId}"]`);
      await page.click(`.bh-root [data-channel-id="${channelId}"]`);
      await page.waitForSelector('.bh-composer-shell');
      await page.waitForFunction(
        (id) =>
          document.querySelector(`[data-channel-id="${id}"] .bh-persona-avatar`)?.dataset.state ===
          'idle',
        {},
        channelId,
      );
      const state = await page.evaluate(
        (id) => ({
          sidebar: Array.from(
            document.querySelectorAll(`[data-channel-id="${id}"] .bh-persona-avatar`),
          ).map((element) => element.dataset.state),
          composer: Array.from(
            document.querySelectorAll('.bh-composer-shell .bh-persona-avatar'),
          ).map((element) => element.dataset.state),
        }),
        channelId,
      );
      assert.ok(state.sidebar.includes('idle'));
      assert.ok(state.composer.every((value) => value === 'idle'));
      reloads.push(state);
    }
    await screenshot('restarted.png');
    writeFileSync(
      resolve(evidence, 'restart-proof.json'),
      JSON.stringify(
        {
          bot: { slug: bot.slug, displayName: bot.displayName },
          activityFrames,
          reloads,
          verdict: 'PASS',
        },
        null,
        2,
      ) + '\n',
    );
    await browser.close();
    process.exit(0);
  }
  await screenshot('idle.png');
  const initialSend = await rpc('channelSend', {
    channelId,
    body: 'Use native glob to inspect your Memory Repository, then use native write to create activity-qa.txt containing the line activity verified. Read that file using native read. Then use the native Shell tool to run exactly node -e \"setTimeout(() => {}, 2000)\" once; this is a harmless two-second timer. Finally send the exact phrase "DM activity confirmed" in this DM using bot_send_message. Do not delegate or change any other file. Use Shell only for that exact timer command.',
  });
  const inputIds = [initialSend.message.id];
  let steered = false;
  let activeCaptured = false;
  const approved = new Set();
  const expectedCommand = 'node -e "setTimeout(() => {}, 2000)"';
  for (let i = 0; i < 600; i++) {
    const host = (await rpc('list')).bots.find((b) => b.slug === bot.slug);
    const dom = await page.evaluate(
      ({ channelId, displayName }) => ({
        sidebar: Array.from(
          document.querySelectorAll(
            `[data-channel-id="${channelId}"] .bh-persona-avatar,.bh-rail-channel[aria-label="${CSS.escape(displayName)}"] .bh-persona-avatar`,
          ),
        ).map((e) => e.dataset.state),
        composer: Array.from(
          document.querySelectorAll('.bh-composer-shell .bh-persona-avatar'),
        ).map((e) => e.dataset.state),
        receipts: Array.from(document.querySelectorAll('.bh-delivery-trigger')).map((e) =>
          e.getAttribute('aria-label'),
        ),
      }),
      { channelId, displayName: bot.displayName },
    );
    frames.push({ host: host?.aggregateState, ...dom });
    if (
      !activeCaptured &&
      host?.aggregateState === 'working' &&
      dom.sidebar.includes('working') &&
      dom.composer.includes('working')
    ) {
      await screenshot('active.png');
      activeCaptured = true;
      assert.ok(unavailable > 0, 'Actual activity stream must fail with HTTP 503');
      assert.equal(
        activityFrames.length,
        0,
        'Working UI must have recovered through snapshot queries, not stream frames',
      );
      assert.ok(snapshotQueries.length >= 2, 'Fallback query must run after initial baseline');
      denyActivity = false;
    }
    if (activeCaptured && !recoveryReady && activityFrames.some((f) => f.state === 'working')) {
      await screenshot('stream-restored.png');
      recoveryReady = true;
      await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
      await page.waitForFunction(() => !document.querySelector('.bh-root'));
      modeExited = true;
    }
    if (process.env.BH_E2E_STEER === '1' && !steered && host?.aggregateState === 'working') {
      const second = await rpc('channelSend', {
        channelId,
        body: 'Additional instruction for the current turn: after the native tools finish, include the exact phrase DM steer confirmed in your DM reply as well.',
      });
      inputIds.push(second.message.id);
      steered = true;
    }
    const messages = await rpc('channelMessages', { channelId });
    const list = messages.messages ?? [];
    for (const message of list) {
      const request = message.toolApprovalRequest;
      if (!request || approved.has(message.id) || !recoveryReady) continue;
      const input = JSON.parse(request.input);
      assert.equal(request.role, 'orchestrator');
      assert.equal(
        input.command,
        expectedCommand,
        'Only the exact harmless QA timer may be approved',
      );
      const decision = await rpc('toolApprovalDecide', {
        channelId,
        messageId: message.id,
        outcome: 'allowed-once',
      });
      assert.equal(decision.accepted, true);
      approved.add(message.id);
    }
    frames.at(-1).hostDeliveries = list.filter((m) => m.author.kind === 'human').at(-1)?.deliveries;
    writeFileSync(
      resolve(evidence, 'proof.json'),
      JSON.stringify(
        { bot: { slug: bot.slug, displayName: bot.displayName }, route, layout, frames, events },
        null,
        2,
      ) + '\n',
    );
    if (
      modeExited &&
      host?.aggregateState === 'idle' &&
      list.some((m) => m.author.kind === 'bot' && m.body.includes('DM activity confirmed'))
    ) {
      const countBefore = activityFrames.length;
      await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
      await page.waitForFunction(() => document.querySelector('.bh-root'));
      await page.waitForFunction(
        (id) => {
          const row = document.querySelector(`[data-channel-id="${id}"] .bh-persona-avatar`);
          const composer = document.querySelector('.bh-composer-shell .bh-persona-avatar');
          return row?.dataset.state === 'idle' && (!composer || composer.dataset.state === 'idle');
        },
        {},
        channelId,
      );
      for (let retry = 0; retry < 50 && activityFrames.length <= countBefore; retry++)
        await new Promise((done) => setTimeout(done, 100));
      assert.ok(
        activityFrames.length > countBefore,
        'Re-entering Bot mode must get a fresh stream baseline',
      );
      assert.equal(activityFrames.at(-1)?.state, 'idle');
      modeExited = false;
      const recovered = await page.evaluate(
        (id) => ({
          sidebar: Array.from(
            document.querySelectorAll(`[data-channel-id="${id}"] .bh-persona-avatar`),
          ).map((element) => element.dataset.state),
          composer: Array.from(
            document.querySelectorAll('.bh-composer-shell .bh-persona-avatar'),
          ).map((element) => element.dataset.state),
        }),
        channelId,
      );
      frames.push({ host: host.aggregateState, ...recovered, recovered: true });
    }
    if (
      activeCaptured &&
      recoveryReady &&
      !modeExited &&
      host?.aggregateState === 'idle' &&
      list.some((m) => m.author.kind === 'bot' && m.body.includes('DM activity confirmed')) &&
      (process.env.BH_E2E_STEER !== '1' ||
        list.some((m) => m.author.kind === 'bot' && m.body.includes('DM steer confirmed'))) &&
      inputIds.every((id) =>
        list.find((m) => m.id === id)?.deliveries?.some((d) => d.state === 'handled'),
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 200));
  }
  await screenshot('settled.png');
  writeFileSync(
    resolve(evidence, 'proof.json'),
    JSON.stringify(
      { bot: { slug: bot.slug, displayName: bot.displayName }, route, layout, frames, events },
      null,
      2,
    ) + '\n',
  );
  const live = frames.filter((f) => ['thinking', 'working'].includes(f.host));
  assert.ok(live.length, 'Real model must enter an active Host state');
  assert.ok(
    live.some((f) => f.sidebar.some((x) => ['thinking', 'working'].includes(x))),
    'Sidebar stayed idle while real Host turn was active',
  );
  assert.ok(
    live.some((f) => f.composer.some((x) => ['thinking', 'working'].includes(x))),
    'Composer activity avatar missing while real Host turn was active',
  );
  assert.ok(
    frames.some((f) => f.receipts.some((s) => /processing|处理中/.test(s ?? ''))),
    'Processing receipt missing',
  );
  assert.ok(
    frames.some(
      (f) =>
        f.host === 'working' && f.sidebar.includes('working') && f.composer.includes('working'),
    ),
    'Both avatars must show actual working, not only thinking',
  );
  const finalMessages = (await rpc('channelMessages', { channelId })).messages ?? [];
  assert.ok(
    finalMessages.some(
      (message) => message.author.kind === 'bot' && message.body.includes('DM activity confirmed'),
    ),
    'Real Bot reply must be committed',
  );
  assert.ok(
    events.some((event) => event.deliveries?.some((delivery) => delivery.state === 'running')),
    'Running admission must arrive on the live stream or initial message baseline',
  );
  assert.ok(
    events.some((event) => event.deliveries?.some((delivery) => delivery.state === 'handled')),
    'Handled admission must arrive on the live stream',
  );
  if (process.env.BH_E2E_STEER === '1') {
    assert.equal(steered, true, 'Second DM must be sent during actual working');
    assert.ok(
      finalMessages.some(
        (message) => message.author.kind === 'bot' && message.body.includes('DM steer confirmed'),
      ),
      'Real Bot must incorporate the steered instruction',
    );
  }
  for (const id of inputIds) {
    assert.ok(
      events.some(
        (event) =>
          event.messageId === id &&
          event.deliveries?.some((delivery) => delivery.state === 'running'),
      ),
      'Each DM must visibly enter running',
    );
    assert.ok(
      finalMessages
        .find((message) => message.id === id)
        ?.deliveries?.some((delivery) => delivery.state === 'handled'),
      'Each DM must settle handled',
    );
  }
  writeFileSync(
    resolve(evidence, 'proof.json'),
    JSON.stringify(
      {
        bot: { slug: bot.slug, displayName: bot.displayName },
        route,
        layout,
        frames,
        events,
        inputIds,
        steered,
        unavailable,
        activityFrames,
        snapshotQueries,
        recoveryReady,
        committedReplies: finalMessages
          .filter(
            (message) =>
              message.author.kind === 'bot' && /DM (activity|steer) confirmed/.test(message.body),
          )
          .map((message) => ({ id: message.id, body: message.body })),
      },
      null,
      2,
    ) + '\n',
  );
  assert.equal(recoveryReady, true);
  assert.equal(frames.at(-1)?.host, 'idle');
  assert.ok(frames.at(-1)?.sidebar.includes('idle'));
  assert.ok(
    frames.at(-1)?.composer.every((x) => x === 'idle'),
    'Idle composer must clear its active indicator',
  );
  console.log(
    JSON.stringify({
      verdict: 'PASS',
      layout,
      bot: bot.displayName,
      frames: frames.length,
      hostStates: [...new Set(frames.map((f) => f.host))],
    }),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  const cleanup = new Promise((resolve) => {
    const timer = setTimeout(() => {
      browser.process()?.kill();
      resolve();
    }, 5000);
    browser
      .close()
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        resolve();
      });
  });
  await cleanup;
}
process.exit(process.exitCode ?? 0);
