import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, join } from 'node:path';
import { exportTimedQuestionEvidence } from './experiment-timed-question-proof.mjs';
import { assignmentProbe, installed } from './e2e-assignment-probe.mjs';

const [launchPath, output, mode = 'native'] = process.argv.slice(2);
assert.ok(['native', 'card'].includes(mode));
assert.ok(
  launchPath && output,
  'Usage: node scripts/experiment-timed-question.mjs <private-launch.json> <private-evidence.json>',
);
for (const path of [launchPath, output]) {
  const rel = relative(resolve('.humanlayer/tasks/1220'), resolve(path));
  assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel), 'only task 1220 private paths');
}
const launch = JSON.parse(readFileSync(launchPath, 'utf8').replace(/^\uFEFF/u, ''));
const manifest = JSON.parse(readFileSync(join(launch.worktree, 'package.json'), 'utf8'));
assert.equal(manifest.name, 'botharness-native-question-rc2-qa');
assert.equal(manifest.devDependencies['@deepseek-ai/dsh'], '0.2.1-rc.2');
const origin = new URL(launch.url).origin;
const { rpc, nativeSnapshot, cookie } = assignmentProbe({ origin, home: launch.home });
const qualification = JSON.parse(readFileSync(join(launch.worktree, 'qualification.json'), 'utf8'));
const proof = {
  integration: mode,
  applicationBaseline: qualification.applicationBaseline,
  startedAt: new Date().toISOString(),
  observations: [],
};
const mark = (kind, value) => {
  proof.observations.push({ at: new Date().toISOString(), kind, value });
  writeFileSync(output, JSON.stringify(proof, null, 2));
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(test, label) {
  const deadline = Date.now() + 120000;
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
try {
  const bot = (
    await rpc('create', {
      displayName: 'RC2 native timed question qualification',
      persona:
        'Follow the Human exactly. Do not read files, use Shell, create Assignments or retry operations. Reply only with channel_send. A pending question is not answered by ordinary chat. If ask_user_question returns pending, channel_send PENDING_1220 then end the turn. When qualified native answer_to_pending_question input later arrives, channel_send ANSWER_1220 plus the actual selected answer. Follow unrelated message requests while the question is pending.',
    })
  ).bot;
  const channelId = (await rpc('channelDm', { slug: bot.slug })).channel.id;
  mark('scene', { bot, channelId });
  const messages = async () => (await rpc('channelMessages', { channelId })).messages;
  const send = async (body) => {
    if (mode === 'card') {
      await page.locator('.bh-composer-shell .bh-composer-input').click();
      await page.keyboard.sendCharacter(body);
      await page.waitForSelector('.bh-send-btn:not(:disabled)');
      const submitted = page.waitForResponse((result) =>
        result.url().endsWith('/api/botharness/channelSend'),
      );
      await page.click('.bh-send-btn');
      assert.equal((await (await submitted).json()).result.ok, true);
      mark('human-submit', { via: 'browser-composer' });
      return;
    }
    const result = await rpc('channelSend', {
      channelId,
      messageId: 'human-' + crypto.randomUUID(),
      body,
    });
    mark('human-submit', result);
    return result;
  };
  const reply = async (marker) =>
    (await messages()).find(
      (m) => m.author.kind === 'bot' && !m.userQuestionRequest && m.body.includes(marker),
    );
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
    assert.ok(attempt < 2, 'Bot navigation unavailable');
    await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  }
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((b) => ['Configure later', '稍后配置'].includes(b.textContent?.trim()))
      ?.click(),
  );
  await page.waitForSelector(`[data-channel-id="${channelId}"]`, { timeout: 30000 });
  await page.click(`[data-channel-id="${channelId}"]`);
  await page.waitForSelector('.bh-composer-shell');
  mark('client', { consoleErrors, text: await page.$eval('body', (b) => b.innerText) });
  mark(
    'composer-ready',
    await page.$$eval(
      '.bh-composer-shell textarea,.bh-composer-shell [contenteditable],.bh-send-btn',
      (nodes) =>
        nodes.map((node) => ({
          tag: node.tagName,
          disabled: node.disabled,
          editable: node.getAttribute('contenteditable'),
          value: node.value,
          rect: {
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          },
        })),
    ),
  );
  await page.screenshot({ path: output.replace(/\.json$/u, '-entry.png') });
  await send('Reply through channel_send with exactly BASELINE_1220. Use no other tools.');
  mark('baseline-reply', await until(() => reply('BASELINE_1220'), 'real model baseline'));
  await send(
    'Call native ask_user_question exactly once with timeout 2: one question id wait-route, question "Which synthetic test route?", options [{label:"Canary",description:"Test route"},{label:"Stable",description:"Other route"}]. If the actual native result is pending, channel_send PENDING_1220 and end your turn. Do not invent an answer. Wait for later qualified native answer_to_pending_question input before reporting ANSWER_1220 plus the actual answer.',
  );
  const request = await until(
    async () => (await messages()).find((m) => m.userQuestionRequest),
    'question request',
  );
  mark('channel-question', request);
  const sessionId = request.userQuestionRequest.sessionId;
  mark('native-before', await nativeSnapshot(sessionId));
  mark('pending-reply', await until(() => reply('PENDING_1220'), 'native pending result'));
  const pending = await nativeSnapshot(sessionId);
  mark('native-pending', pending);
  mark('messages-pending', await messages());
  const call = pending.records.find(
    ({ event }) => event?.type === 'tool/call' && event.data.name === 'ask_user_question',
  ).event;
  const callId = call.data.callId;
  const nativeResult = pending.records.filter(
    ({ event }) => event?.type === 'tool/result' && event.data.message.toolCallId === callId,
  );
  assert.equal(nativeResult.length, 1);
  const result = JSON.parse(
    nativeResult[0].event.data.message.content.find((b) => b.type === 'text').text,
  );
  assert.equal(result.pending, true);
  assert.equal(result.callId, callId);
  assert.match(result.message, /not a skipped answer/u);
  assert.equal(
    pending.projections.values.userQuestions.active.find((row) => row.callId === callId)?.state,
    'continued',
  );
  assert.equal(nativeResult[0].event.data.message.isError, false);
  await send(
    'This is unrelated ordinary Inbox work. Reply through channel_send with exactly UNRELATED_REPLY_1220. Do not answer, approve or replace the pending question.',
  );
  mark(
    'unrelated-reply',
    await until(
      () => reply('UNRELATED_REPLY_1220'),
      'real unrelated model reply while question continued',
    ),
  );
  if (mode === 'card') {
    await until(async () => {
      const snapshot = await nativeSnapshot(sessionId);
      return (
        snapshot.records
          .filter(({ event }) => ['turn/start', 'turn/end'].includes(event?.type))
          .at(-1)?.event.type === 'turn/end'
      );
    }, 'ordinary turn ended before late card answer');
  }
  mark('native-unanswered', await nativeSnapshot(sessionId));
  const capture = async (state) => {
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (dark) => document.body.toggleAttribute('data-ds-dark-theme', dark),
        theme === 'dark',
      );
      await sleep(200);
      await page.screenshot({
        path: join(resolve('.humanlayer/tasks/1220'), `${mode}-${state}-${theme}.png`),
      });
    }
  };
  await capture('pending');
  const answer = { answers: [{ id: 'wait-route', selected: ['Canary'] }] };
  const wrong = await rpc(
    'answer',
    { agentId: sessionId, callId: 'not-the-original-call', answer },
    'userQuestions',
  );
  mark('wrong-call-answer', wrong);
  assert.equal(wrong, false);
  let accepted;
  if (mode === 'card') {
    assert.equal(request.userQuestionRequest.callId, callId);
    mark(
      'card-status-before',
      await rpc('userQuestionStatus', { channelId, messageId: request.id }),
    );
    await page.waitForSelector('.bh-question-card');
    await page.evaluate(() =>
      [...document.querySelectorAll('.bh-question-card button')]
        .find((button) => button.querySelector('.bh-card-title')?.textContent?.trim() === 'Canary')
        ?.click(),
    );
    const response = page.waitForResponse((result) =>
      result.url().endsWith('/api/botharness/userQuestionAnswer'),
    );
    await page.evaluate(() =>
      [...document.querySelectorAll('.bh-question-card button')]
        .find((button) =>
          ['Answer and continue', '回答并继续'].includes(button.textContent?.trim()),
        )
        ?.click(),
    );
    const wire = await (await response).json();
    assert.equal(wire.result.ok, true);
    accepted = true;
    mark('card-submit', { via: 'visible-question-card', accepted });
  } else accepted = await rpc('answer', { agentId: sessionId, callId, answer }, 'userQuestions');
  mark('native-late-answer', accepted);
  assert.equal(accepted, true);
  mark(
    'answer-reply',
    await until(() => reply('ANSWER_1220'), 'real model processed qualified late answer'),
  );
  const duplicate = await rpc('answer', { agentId: sessionId, callId, answer }, 'userQuestions');
  mark('duplicate-answer', duplicate);
  assert.equal(duplicate, false);
  mark('native-after', await nativeSnapshot(sessionId));
  mark('messages-after', await messages());
  if (mode === 'card') {
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.bh-question-card')].some((card) =>
        /Answered|已回答/u.test(card.textContent ?? ''),
      ),
    );
    await capture('answered');
    mark(
      'card-status-after',
      await rpc('userQuestionStatus', { channelId, messageId: request.id }),
    );
  }
  mark('client-final', { consoleErrors, text: await page.$eval('body', (b) => b.innerText) });
  mark('result', {
    sessionId,
    callId,
    nativePending: true,
    unrelatedModelReply: true,
    qualifiedLateAnswer: true,
  });
  mark('verified', exportTimedQuestionEvidence(proof).verdict);
  console.log('RC2 native timed-question qualification completed; private evidence retained.');
} catch (error) {
  await page
    .screenshot({ path: output.replace(/\.json$/u, '-failure.png') })
    .catch(() => undefined);
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
