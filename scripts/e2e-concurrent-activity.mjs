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
const privateDir = resolve('.humanlayer/tasks/123-deterministic-references');
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
      if (node.textContent?.includes('bh123-concurrent-workspace-'))
        node.textContent = node.textContent.replace(
          /[A-Z]:\\Users\\[^\\]+\\AppData\\Local\\Temp\\bh123-concurrent-workspace-[^\s]+/g,
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
      displayName: `Concurrent Assignment Human QA ${Date.now()}`,
      persona:
        'Follow Human instructions precisely. When asked to verify Assignment waiting, create two Assignments and call wait_for_assignment for each with timeout_seconds 120. Do not poll inspect_assignment. The Assignment must run a bounded native Shell command and report completed. After wait returns, send the result to the Channel and end the Turn.',
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
  const folder = resolve(tmpdir(), `bh123-concurrent-workspace-${bot.slug}`);
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
        instruction:
          'Ask: Repeat concurrent Assignment verification with two fresh continuity keys.',
      }),
    );
  } else if (mode === 'settled') {
    const history = JSON.parse(readFileSync(resolve(privateDir, 'failure.json'), 'utf8'));
    const observations = history.frames
      .map((frame) => ({
        generation: frame.generation,
        revision: frame.revision,
        ...frame.bots.find((bot) => bot.slug === scene.slug),
      }))
      .filter((row) => row.slug === scene.slug);
    const waiting = observations.find(
      (row) =>
        row.activity?.activeToolCount === 2 &&
        row.activity?.sources?.some((source) => source.role === 'assignment' && source.count === 2),
    );
    const working = observations.find(
      (row) =>
        row.revision > waiting.revision &&
        row.activity?.activeToolCount === 2 &&
        row.attention?.approvalCount === 0,
    );
    const remaining = observations.find(
      (row) =>
        row.revision > working.revision &&
        row.activity?.activeToolCount === 1 &&
        row.activity?.sources?.some((source) => source.role === 'assignment') &&
        row.attention?.informationalCount === 1,
    );
    assert.ok(waiting && working && remaining);
    for (const row of [waiting, working, remaining])
      assert.deepEqual(row.activity.detailRefs, [...row.activity.detailRefs].sort());
    const final = await host(scene.slug);
    assert.equal(final.generation, waiting.generation);
    assert.equal(final.state, 'idle');
    assert.equal(final.activity, undefined);
    assert.equal(final.sessions?.length ?? 0, 0);
    await page.waitForFunction(
      (channelId) =>
        document.querySelector(`[data-channel-id="${channelId}"] .bh-persona-avatar`)?.dataset
          .state === 'idle',
      {},
      scene.channelId,
    );
    await page.click('.bh-composer-activity-status summary');
    assert.equal(await page.$('.bh-composer-activity-source-label'), null);
    await shot('both-reports-returned-idle');
    assert.ok(
      observations.some(
        (row) =>
          row.revision > remaining.revision &&
          row.activity?.sources?.some((source) => source.role === 'orchestrator'),
      ),
    );
    assert.ok(
      (await rpc('channelMessages', { channelId: scene.channelId })).messages.some(
        (message) => message.author?.kind === 'bot' && message.body.includes('CONCURRENT_VERIFIED'),
      ),
    );
    assert.deepEqual(history.clientErrors, []);
    assert.deepEqual(clientErrors, []);
    writeFileSync(
      resolve(evidence, 'proof.json'),
      JSON.stringify(
        {
          waiting,
          working,
          remaining,
          final,
          canonicalReferences: true,
          recoveredFinalAssertion: true,
          observations,
          clientErrors,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        success: true,
        humanQA: scene.displayName,
        observations: observations.length,
        resumedExactCompletedScene: true,
      }),
    );
  } else {
    await shot('before-wait-operation');
    await rpc('channelSend', {
      channelId: scene.channelId,
      messageId: `human-${crypto.randomUUID()}`,
      body: `Verify concurrent Assignments now. Use Grant ${scene.grantId}. Create exactly two Assignments with different fresh continuity keys and native Session names Concurrent first and Concurrent second. First purpose: run only the native Shell command node -e "setTimeout(() => {}, 40000)" and then report_to_orchestrator state completed, summary FIRST_VERIFIED, expects_reply false. Second purpose: run only node -e "setTimeout(() => {}, 60000)" and report completed, summary SECOND_VERIFIED, expects_reply false. You, Orchestrator: create both before waiting, immediately wait_for_assignment on the first session_id with timeout_seconds 120, then wait on the second with timeout_seconds 120. Do not inspect-poll or end your Turn before both finish. Finally bot_send_message CONCURRENT_VERIFIED and end.`,
    });
    const waiting = await waitFor(async () => {
      const value = await host(scene.slug);
      return value.activity?.activeToolCount === 2 &&
        value.activity?.sources?.some(
          (source) => source.role === 'assignment' && source.count === 2,
        ) &&
        value.sessions?.some(
          (session) =>
            session.role === 'orchestrator' && session.activity?.toolName === 'wait_for_assignment',
        )
        ? value
        : false;
    }, 'two actual Assignment tools selected during explicit Orchestrator wait');
    assert.equal(waiting.activity.effect, 'executing');
    assert.equal(waiting.activity.detailRefs.length, 2);
    const canonical = (row) => {
      const refs = row.activity?.detailRefs ?? [];
      if (!process.env.BH_E2E_BASELINE) assert.deepEqual(refs, [...refs].sort());
      return JSON.stringify(refs) === JSON.stringify([...refs].sort());
    };
    canonical(waiting);
    await page.waitForFunction(
      (channelId) => {
        const sidebar = document.querySelector(
          `[data-channel-id="${channelId}"] .bh-persona-avatar`,
        );
        const composer = document.querySelector('.bh-composer-activity-status .bh-persona-avatar');
        return sidebar?.dataset.effect === 'executing' && composer?.dataset.effect === 'executing';
      },
      {},
      scene.channelId,
    );
    await page.click('.bh-composer-activity-status summary');
    await shot('two-assignments-pending-light');
    const approvals = await waitFor(async () => {
      const items = (await rpc('channelMessages', { channelId: scene.channelId })).messages.filter(
        (message) =>
          message.toolApprovalRequest?.role === 'assignment' && !message.toolApprovalDecision,
      );
      return items.length === 2 ? items : false;
    }, 'both actual bounded Assignment Shell approvals');
    const commands = approvals
      .map((message) => JSON.parse(message.toolApprovalRequest.input).command)
      .sort();
    assert.deepEqual(commands, [
      'node -e "setTimeout(() => {}, 40000)"',
      'node -e "setTimeout(() => {}, 60000)"',
    ]);

    await page.setOfflineMode(true);
    for (const approval of approvals) {
      const decision = await rpc('toolApprovalDecide', {
        channelId: scene.channelId,
        messageId: approval.id,
        outcome: 'allowed-once',
      });
      assert.equal(decision.accepted, true);
    }
    await page.setOfflineMode(false);
    await page.waitForSelector('.bh-composer-shell');
    const working = await host(scene.slug);
    assert.equal(working.activity?.activeToolCount, 2);
    canonical(working);
    await page.waitForFunction(
      () => !document.querySelector('.bh-composer-activity-status .bh-avatar-attention'),
      { timeout: 20000 },
    );
    await waitFor(
      async () =>
        frames.some(
          (frame) =>
            frame.generation === working.generation &&
            frame.revision >= working.revision &&
            frame.bots.some(
              (bot) => bot.slug === scene.slug && bot.activity?.activeToolCount === 2,
            ),
        ),
      'post-reconnect authenticated Activity baseline',
    );
    await page.waitForFunction(
      () =>
        !document.body.innerText.includes('重新连接中') &&
        !document.body.innerText.includes('Reconnecting'),
      { timeout: 30000 },
    );
    await page.waitForFunction(
      () => document.querySelectorAll('.bh-composer-activity-session').length === 3,
    );
    await shot('reconnected-concurrent-working');
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
    await shot('concurrent-working-dark');
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    const remaining = await waitFor(async () => {
      const value = await host(scene.slug);
      return value.activity?.sources?.some((source) => source.role === 'assignment') &&
        value.activity?.activeToolCount === 1
        ? value
        : false;
    }, 'first Assignment finishes, second remains executing');
    canonical(remaining);
    await page.waitForFunction(
      () => document.querySelectorAll('.bh-composer-activity-session').length === 2,
    );
    await shot('one-assignment-remaining');
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
        (message) => message.body.includes('CONCURRENT_VERIFIED') && message.author?.kind === 'bot',
      ),
    );
    await page.waitForFunction(
      (channelId) =>
        document.querySelector(`[data-channel-id="${channelId}"] .bh-persona-avatar`)?.dataset
          .state === 'idle' && !document.querySelector('.bh-composer-activity-source-label'),
      {},
      scene.channelId,
    );
    await shot('both-reports-returned-idle');
    assert.equal(final.activity, undefined);
    assert.equal(final.sessions?.length ?? 0, 0);
    writeFileSync(
      resolve(evidence, 'proof.json'),
      JSON.stringify(
        {
          waiting,
          working,
          remaining,
          canonicalReferences: canonical(waiting),
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
