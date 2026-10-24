import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assignmentProbe, installed } from './e2e-assignment-probe.mjs';
import { compactNative, checkNativeWait } from './experiment-native-wait-proof.mjs';
import { exportWaitEvidence } from './experiment-native-wait-evidence.mjs';

const launchPath = process.env.BH_WAIT_LAUNCH;
assert.ok(launchPath, 'Set BH_WAIT_LAUNCH to the private dev-instance --json output');
const launch = JSON.parse(readFileSync(launchPath, 'utf8').replace(/^\uFEFF/u, ''));
const origin = new URL(launch.url).origin;
const { rpc, nativeSnapshot, cookie } = assignmentProbe({ origin, home: launch.home });
const mode = process.argv[2] ?? 'baseline';
assert.ok(['baseline', 'assignment', 'approval', 'question', 'revoked', 'changed'].includes(mode));
const out = resolve(process.env.BH_WAIT_OUT ?? '.humanlayer/tasks/1036/runs', mode);
mkdirSync(out, { recursive: true });
const proof = { mode, startedAt: new Date().toISOString(), observations: [] };
function save() {
  writeFileSync(resolve(out, 'private.json'), JSON.stringify(proof, null, 2));
}
const mark = (kind, value) => {
  proof.observations.push({ at: new Date().toISOString(), kind, value });
  save();
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(test, label, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await test();
    if (value) return value;
    await sleep(1000);
  }
  throw Error('Timed out: ' + label);
}
const browser = await installed('puppeteer').launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push({ kind: 'pageerror', message: e.message }));
page.on('console', (e) => {
  if (['error', 'warn'].includes(e.type()))
    consoleErrors.push({ kind: e.type(), message: e.text() });
});
const split = cookie.indexOf('=');
await browser.setCookie({
  name: cookie.slice(0, split),
  value: cookie.slice(split + 1),
  domain: new URL(origin).hostname,
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
});
await page.setViewport({ width: 1500, height: 1000 });
let scene;
const messages = async () =>
  (await rpc('channelMessages', { channelId: scene.channelId })).messages;
const send = async (body) => {
  const messageId = 'human-' + crypto.randomUUID();
  const result = await rpc('channelSend', { channelId: scene.channelId, messageId, body });
  mark('human-submit', { messageId, body, result });
  return messageId;
};
const hasReply = async (marker) =>
  (await messages()).find(
    (m) =>
      m.author.kind === 'bot' &&
      !m.toolApprovalRequest &&
      !m.userQuestionRequest &&
      m.body.includes(marker),
  );
async function openDM() {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]', {
    timeout: 60000,
  });
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((b) =>
          ['Continue', '继续'].includes(b.textContent?.trim()),
        ),
      { timeout: 3000 },
    )
    .catch(() => undefined);
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((b) => ['Continue', '继续'].includes(b.textContent?.trim()))
      ?.click(),
  );
  await sleep(500);
  if (!(await page.$('[data-channel-id]')))
    await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  for (let attempt = 0; attempt < 3; attempt++) {
    const ready = await page
      .waitForFunction(
        () =>
          document.querySelector('[data-channel-id]') ||
          [...document.querySelectorAll('button')].some((b) =>
            ['Configure later', '稍后配置'].includes(b.textContent?.trim()),
          ),
        { timeout: 5000 },
      )
      .then(
        () => true,
        () => false,
      );
    if (ready) break;
    mark('navigation-attempt', {
      attempt,
      text: await page.$eval('body', (b) => b.innerText),
      consoleErrors,
    });
    assert.ok(attempt < 2, 'Bot navigation did not enter a Channel surface');
    await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  }
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((b) => ['Configure later', '稍后配置'].includes(b.textContent?.trim()))
      ?.click(),
  );
  await page.waitForSelector(`[data-channel-id="${scene.channelId}"]`, { timeout: 30000 });
  await page.click(`[data-channel-id="${scene.channelId}"]`);
  await page.waitForSelector('.bh-composer-shell');
  mark('client', { consoleErrors, text: await page.$eval('body', (b) => b.innerText) });
}
async function clickDecision(request, question = false) {
  const selector = question ? '.bh-question-card' : '.bh-tool-approval-card';
  await page.waitForSelector(selector, { timeout: 30000 });
  const response = page.waitForResponse((r) =>
    r.url().endsWith('/api/botharness/' + (question ? 'userQuestionAnswer' : 'toolApprovalDecide')),
  );
  if (question) {
    const labels = await page.$$eval(selector + ' button', (nodes) =>
      nodes.map((n) => n.textContent),
    );
    mark('question-buttons', labels);
    await page.evaluate(
      (selector) =>
        [...document.querySelectorAll(selector + ' button')]
          .find((b) => b.textContent?.includes('Canary'))
          ?.click(),
      selector,
    );
    await page.evaluate(
      (selector) =>
        [...document.querySelectorAll(selector + ' button')]
          .find((b) => ['Answer and continue', '回答并继续'].includes(b.textContent?.trim()))
          ?.click(),
      selector,
    );
  } else {
    await page.evaluate(
      (selector) =>
        [...document.querySelectorAll(selector + ' button')]
          .find((b) => ['Allow once', '仅批准这一次'].includes(b.textContent?.trim()))
          ?.click(),
      selector,
    );
  }
  mark('web-decision-response', await (await response).json());
  mark('decided-request', request.id);
}
async function staleDecision(request) {
  const method = 'botharness/toolApprovalDecide';
  const response = await fetch(origin + '/api/' + method, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method,
      payload: {
        args: { channelId: scene.channelId, messageId: request.id, outcome: 'allowed-once' },
      },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const envelope = await response.json();
  mark('stale-decision', envelope);
  assert.equal(envelope.result?.ok, false);
  assert.equal(envelope.result?.error?.code, 'invalid-input');
  assert.equal(envelope.result?.error?.message, 'Tool approval request is no longer pending');
}
try {
  scene = {
    bot: (
      await rpc('create', {
        displayName: `Wait experiment ${mode} ${Date.now()}`,
        persona:
          'Follow the Human exactly. Use native tools only when explicitly requested. Do not retry refused operations. Reply only through bot_send_message. When an Assignment is running, do not wait_for_assignment unless explicitly requested; end your turn after dispatch so you can handle unrelated messages.',
      })
    ).bot,
  };
  scene.channelId = (await rpc('channelDm', { slug: scene.bot.slug })).channel.id;
  mark('scene', scene);
  await openDM();
  await send('Reply through bot_send_message with exactly BASELINE_1036. Do not use other tools.');
  mark('baseline-reply', await until(() => hasReply('BASELINE_1036'), 'real model baseline DM'));
  mark('baseline-sessions', await rpc('sessions', { slug: scene.bot.slug }));
  if (mode === 'baseline') {
    proof.verdict = 'model DM verified';
  } else {
    const workspacePath = resolve(out, 'workspace');
    mkdirSync(workspacePath, { recursive: true });
    const workspace = await rpc('create', { request: { path: workspacePath } }, 'workspace');
    const grant = (
      await rpc('grantCreate', {
        slug: scene.bot.slug,
        workspaceId: workspace.workspace.workspaceId,
      })
    ).grant;
    mark('grant', grant);
    const question = mode === 'question';
    if (question) {
      await send(
        'Call native ask_user_question exactly once: one question id wait-route, question "Which test route?", options [{label:"Canary",description:"Test route"},{label:"Stable",description:"Other route"}]. Wait for Human decision. After actual tool result, bot_send_message ORIGINAL_RESULT_1036 plus the actual answer. Do not create Assignments.',
      );
    } else if (mode === 'assignment' || mode === 'revoked') {
      await send(
        `Use Grant ${grant.id} to create exactly one Assignment with continuity key wait-1036. Its purpose: call native ${process.platform === 'win32' ? 'pwsh' : 'bash'} once with command "echo EXACT_OPERATION_1036", then report_to_orchestrator state completed with actual stdout (or state failed with actual error), summary beginning ORIGINAL_RESULT_1036. Do not retry. Orchestrator: immediately bot_send_message DISPATCHED_1036 after create_assignment returns and end the turn. Do not wait_for_assignment or poll; handle unrelated messages normally. Relay the eventual report through bot_send_message including ORIGINAL_RESULT_1036 and the actual result.`,
      );
    } else {
      await send(
        `Call native ${process.platform === 'win32' ? 'pwsh' : 'bash'} exactly once with command "echo EXACT_OPERATION_1036". Await Human approval and actual native result, then bot_send_message ORIGINAL_RESULT_1036 plus actual stdout or error. Do not retry or create an Assignment.`,
      );
    }
    const request = await until(
      async () =>
        (await messages()).find((m) => (question ? m.userQuestionRequest : m.toolApprovalRequest)),
      'native decision request',
    );
    mark('native-request', request);
    const nativeId = (request.toolApprovalRequest ?? request.userQuestionRequest).sessionId;
    mark('native-before', await nativeSnapshot(nativeId));
    mark('owned-sessions-before', await rpc('sessions', { slug: scene.bot.slug }));
    if (mode === 'assignment' || mode === 'revoked')
      await until(() => hasReply('DISPATCHED_1036'), 'Orchestrator dispatch completed');
    const unrelatedId = await send(
      'This is unrelated Inbox work. Use bot_send_message now to reply with exactly UNRELATED_REPLY_1036. Do not approve, answer, cancel or replace any pending operation.',
    );
    const untilAt = Date.now() + 20000;
    while (Date.now() < untilAt && !(await hasReply('UNRELATED_REPLY_1036'))) await sleep(1000);
    mark('while-pending', {
      unrelatedId,
      reply: (await hasReply('UNRELATED_REPLY_1036')) ?? null,
      attention: await rpc('botAttention', { slug: scene.bot.slug }),
      native: await nativeSnapshot(nativeId),
      activity: await rpc('activitySnapshot'),
    });
    if (mode === 'revoked') {
      mark('revoke', await rpc('grantRevoke', { slug: scene.bot.slug, grantId: grant.id }));
      await staleDecision(request);
    } else if (mode === 'changed') {
      mark(
        'scope-change',
        await rpc('grantWriteSet', { slug: scene.bot.slug, grantId: grant.id, enabled: true }),
      );
      await staleDecision(request);
    } else {
      await clickDecision(request, question);
    }
    if (mode === 'revoked' || mode === 'changed') {
      await until(
        async () =>
          (await nativeSnapshot(nativeId)).records.some(
            ({ event }) =>
              event?.type === 'tool/result' &&
              event.data.message.toolCallId === request.toolApprovalRequest.callId &&
              event.data.message.isError === true,
          ),
        'native refused original operation',
      );
    } else {
      await until(
        async () =>
          (await hasReply('ORIGINAL_RESULT_1036')) ||
          (!question && (await hasReply('EXACT_OPERATION_1036'))),
        'actual original result reply',
      );
    }
    await until(() => hasReply('UNRELATED_REPLY_1036'), 'unrelated message eventually answered');
    mark('messages-after', await messages());
    mark('native-after', await nativeSnapshot(nativeId));
    mark('sessions-after', await rpc('sessions', { slug: scene.bot.slug }));
    for (const owner of (await rpc('sessions', { slug: scene.bot.slug })).sessions) {
      mark('owned-native-after', {
        role: owner.role,
        snapshot: await nativeSnapshot(owner.sessionId),
      });
    }
    mark('assignments-after', await rpc('assignments', { slug: scene.bot.slug }));
    mark('attention-after', await rpc('botAttention', { slug: scene.bot.slug }));
    const read = (kind) => proof.observations.find((o) => o.kind === kind)?.value;
    const nativeAfter = compactNative(read('native-after'));
    const orchestrator = proof.observations.find(
      (o) => o.kind === 'owned-native-after' && o.value.role === 'orchestrator',
    );
    const verification = checkNativeWait({
      owner: request.toolApprovalRequest?.role ?? 'orchestrator',
      before: compactNative(read('native-before')),
      during: compactNative(read('while-pending').native),
      after: nativeAfter,
      orchestrator: orchestrator ? compactNative(orchestrator.value.snapshot) : nativeAfter,
      request,
      messages: read('messages-after'),
      decision: read('web-decision-response') ?? read('stale-decision'),
      rejected: mode === 'revoked' || mode === 'changed',
    });
    mark('verification', verification);
    proof.verdict = verification.repliedWhileWaiting
      ? 'Assignment independent-root path verified'
      : 'same-Orchestrator native wait blocks unrelated processing';
  }
  mark('client-final', { consoleErrors, text: await page.$eval('body', (b) => b.innerText) });
  proof.finishedAt = new Date().toISOString();
  save();
  if (mode !== 'baseline')
    writeFileSync(
      resolve(out, 'evidence.json'),
      JSON.stringify(exportWaitEvidence(proof), null, 2) + '\n',
    );
  console.log(
    JSON.stringify({ mode, verdict: proof.verdict, evidence: resolve(out, 'evidence.json') }),
  );
} catch (error) {
  mark('failure', {
    message: error.message,
    consoleErrors,
    text: await page.$eval('body', (b) => b.innerText).catch(() => ''),
  });
  throw error;
} finally {
  await browser.close();
}
process.exit(0);
