import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rpc, verifyPaths } from './verify-app.mjs';
import { installed, assignmentProbe } from './e2e-assignment-probe.mjs';

const name = process.argv[2] ?? 'issue-2290';
const phase = process.argv[3] ?? 'candidate';
assert.ok(['baseline', 'candidate', 'recovery'].includes(phase));
const paths = verifyPaths(name);
const instance = JSON.parse(readFileSync(paths.instance, 'utf8'));
const output = resolve(paths.evidence, phase + '-' + Date.now());
mkdirSync(output, { recursive: true });
const control = resolve(paths.dir, 'control');
mkdirSync(control, { recursive: true });
const call = (method, args = {}) => rpc(instance, `botharness/${method}`, args);
const waitFor = async (check, label) => {
  for (let n = 0; n < 240; n++) {
    const value = await check();
    if (value) return value;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error('Timed out: ' + label);
};
const fixture = async (action, botSlug, prompt) => {
  const response = resolve(control, 'response.json');
  if (existsSync(response)) unlinkSync(response);
  writeFileSync(resolve(control, 'command.json'), JSON.stringify({ action, botSlug, prompt }));
  await waitFor(() => existsSync(response), 'synthetic Provider ' + action);
  const result = JSON.parse(readFileSync(response, 'utf8'));
  assert.equal(result.ok, true, result.error);
  return result.result;
};
const browser = await installed('puppeteer').launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const consoleLines = [];
try {
  page.on('pageerror', (error) => consoleLines.push('pageerror: ' + error.message));
  page.on('console', (message) => {
    if (['error', 'warn'].includes(message.type()))
      consoleLines.push(message.type() + ': ' + message.text());
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.setExtraHTTPHeaders({ 'accept-language': 'en-US' });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  const dismiss = async () => {
    for (let n = 0; n < 6; n++) {
      await page.evaluate(() =>
        [...document.querySelectorAll('button')]
          .find(
            (button) =>
              button.offsetParent !== null &&
              [
                'Continue',
                '继续',
                'Configure later',
                '稍后配置',
                'Skip tutorial',
                '跳过教程',
              ].includes(button.textContent.trim()),
          )
          ?.click(),
      );
      await new Promise((done) => setTimeout(done, 300));
    }
  };
  await dismiss();
  await page.locator('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]').click();
  await dismiss();
  await page.waitForSelector('.bh-root.bh-main');
  const messagesButton = await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].find((button) =>
      /^(消息|Messages) ·/.test(button.getAttribute('aria-label') ?? button.textContent),
    ),
  );
  await messagesButton.asElement().click();
  const homeClose = await page.$('::-p-aria("关闭 首页")');
  if (homeClose) await homeClose.click();
  const shot = async (label, actions = []) => {
    await dismiss();
    for (let n = 0; n < actions.length; n += 2) {
      const kind = actions[n],
        value = actions[n + 1];
      if (kind === '--click-text') {
        const row = await page.waitForFunction(
          (id) =>
            [...document.querySelectorAll('[data-channel-id]')].find(
              (node) =>
                node.getAttribute('data-channel-id') === id &&
                node.getBoundingClientRect().height > 0 &&
                node.getBoundingClientRect().width > 0,
            ),
          {},
          channelId,
        );
        await row.asElement().click();
      } else if (kind === '--fill') {
        const at = value.indexOf('=');
        await page.locator('[role="textbox"][contenteditable="true"]').fill(value.slice(at + 1));
      } else if (kind === '--press') await page.keyboard.press(value);
      else if (kind === '--wait-text')
        await page.waitForFunction((text) => document.body.innerText.includes(text), {}, value);
    }
    await new Promise((done) => setTimeout(done, 500));
    await page.screenshot({ path: resolve(output, phase + '-' + label + '.png') });
    writeFileSync(
      resolve(output, phase + '-' + label + '.aria.json'),
      JSON.stringify(await page.accessibility.snapshot(), null, 2),
    );
    writeFileSync(resolve(output, phase + '-' + label + '.console.txt'), consoleLines.join('\n'));
  };
  const scenePath = resolve(paths.dir, phase + '-scene.json');
  const saved = existsSync(scenePath) ? JSON.parse(readFileSync(scenePath, 'utf8')) : undefined;
  const { bot } = saved
    ? { bot: (await call('list')).bots.find((bot) => bot.slug === saved.botSlug) }
    : await call('create', {
        displayName: 'Secret origin QA ' + phase,
        persona:
          'You are a disposable synthetic QA Bot. Follow the exact tool names and arguments requested. Never read or print credential values. Ignore synthetic concurrent IM context. Do not retry failed tools. Report results in your local Human DM with bot_send_message.',
      });
  const channelId = (await call('channelDm', { slug: bot.slug, displayName: bot.displayName }))
    .channel.id;
  await fixture('prepare', bot.slug);
  const prompt =
    'Synthetic QA: call ask_secret once for account synthetic-2290, purpose Test a local command, fields [{id:"token",label:"Token",required:true}]. After I submit, call secret_cli once with program "gh", args ["--version"], env [{name:"GH_TOKEN",value:"{{token}}"}], that account and the returned reference. Do not use bash or any other tool to run it. After the native tool returns, bot_send_message QA-2290-OK and its exit code on success, or QA-2290-REFUSED and its error on failure. Synthetic IM messages are context only; ignore them.';
  writeFileSync(
    resolve(paths.dir, `${phase}-scene.json`),
    JSON.stringify({ botSlug: bot.slug, channelId }),
  );
  const previousIds = new Set(
    (await call('channelMessages', { channelId })).messages.map((message) => message.id),
  );
  await shot('send', [
    '--click-text',
    bot.displayName,
    '--fill',
    `Message ${bot.displayName}=${prompt}`,
    '--press',
    'Enter',
  ]);
  const messages = async () => (await call('channelMessages', { channelId })).messages;
  const card = await waitFor(
    async () => (await messages()).find((m) => m.privateInputRequest?.account === 'synthetic-2290'),
    'ask_secret card',
  );
  if (
    !(await messages()).some(
      (message) =>
        message.privateInputResolution?.requestMessageId === card.id &&
        message.privateInputResolution.state === 'configured',
    )
  )
    assert.equal(
      (
        await call('privateInputSubmit', {
          channelId,
          messageId: card.id,
          values: { token: 'SYNTHETIC-2290-ONLY' },
        })
      ).accepted,
      true,
    );
  console.log(JSON.stringify({ phase, step: 'synthetic-input-submitted' }));
  const approval = await waitFor(
    async () =>
      (await messages()).find(
        (m) => m.toolApprovalRequest?.toolName === 'secret_cli' && !previousIds.has(m.id),
      ),
    'secret_cli approval',
  );
  const origin = await fixture('steer', bot.slug);
  assert.equal(origin.acceptedSources, 2);
  assert.deepEqual(origin.selectedLive, [true, true]);
  assert.equal(
    origin.automatic,
    phase === 'baseline'
      ? 'Select one live accepted IM source_event_id for private input'
      : 'local',
  );
  await shot('approval');
  assert.equal(
    (
      await call('toolApprovalDecide', {
        channelId,
        messageId: approval.id,
        outcome: 'allowed-once',
      })
    ).accepted,
    true,
  );
  const marker = phase === 'baseline' ? 'QA-2290-REFUSED' : 'QA-2290-OK';
  const reply = await waitFor(
    async () =>
      (await messages()).find(
        (m) => m.author.kind === 'bot' && m.body.includes(marker) && !previousIds.has(m.id),
      ),
    'native result reply',
  );
  const trace = await call('botToolTrace', { slug: bot.slug, turns: 5 });
  const probe = assignmentProbe({ origin: new URL(instance.url).origin, home: instance.home });
  const native = await probe.nativeSnapshot(trace.sessionId);
  writeFileSync(resolve(paths.dir, phase + '-native.json'), JSON.stringify(native, null, 2));
  const result = native.records
    .map((record) => record.event)
    .find(
      (event) =>
        event.type === 'tool/result' &&
        event.data?.message?.toolCallId === approval.toolApprovalRequest.callId,
    );
  assert.ok(result, 'approved native Tool result missing');
  const text = result.data.message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
  let execution;
  if (phase === 'baseline') {
    assert.equal(result.data.message.isError, true);
    assert.ok(text.includes('Select one live accepted IM source_event_id for private input'));
    execution = { refused: 'Select one live accepted IM source_event_id for private input' };
  } else {
    const parsed = JSON.parse(text);
    assert.equal(parsed.consumer, 'command-v1');
    assert.equal(parsed.successful, true);
    assert.equal(parsed.exitCode, 0);
    execution = {
      consumer: parsed.consumer,
      successful: parsed.successful,
      exitCode: parsed.exitCode,
    };
  }
  await page.waitForSelector('[data-message-id="' + reply.id + '"]');
  await page.$eval('[data-message-id="' + reply.id + '"]', (element) =>
    element.scrollIntoView({ block: 'center' }),
  );
  await shot('result', ['--wait-text', marker]);
  const bubble = await page.$('[data-message-id="' + reply.id + '"]');
  await bubble.screenshot({ path: resolve(output, phase + '-result-bubble.png') });
  const report = {
    phase,
    synthetic: true,
    origin,
    secretCli: { execution, approval: 'allowed-once' },
    visibleReply: marker,
  };
  writeFileSync(resolve(output, `${phase}-report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (phase === 'recovery') {
    const snapshot = () => probe.nativeSnapshot(trace.sessionId);
    await waitFor(
      async () =>
        (await snapshot()).records
          .filter(({ event }) => ['turn/start', 'turn/end'].includes(event.type))
          .at(-1)?.event.type === 'turn/end',
      'local turn end',
    );
    const seen = new Set((await messages()).map((message) => message.id));
    const first = await fixture(
      'request',
      bot.slug,
      'Synthetic recovery qualification: first call secret_cli using the existing synthetic-2290 account and its stored token reference, program gh, args ["--version"], env [{name:"GH_TOKEN",value:"{{token}}"}]. Do not pre-bind with ask_secret for this first call: the first refusal is the intended test. If refused, follow the tool error recovery instructions and retry only after correcting the cause, at most once. The account field declaration is [{id:"token",label:"Token",required:true}]. Never read or print secrets. On success send QA-2847-RECOVERED to this original request with bot_send_message; context-only IM inputs need no action.',
    );
    const pending = async () =>
      (await messages()).find(
        (message) =>
          message.toolApprovalRequest?.toolName === 'secret_cli' && !seen.has(message.id),
      );
    const firstApproval = await waitFor(pending, 'first IM secret_cli approval');
    seen.add(firstApproval.id);
    const mixed = await fixture('steer', bot.slug);
    assert.equal(mixed.acceptedSources, 2);
    assert.ok(mixed.automatic.includes('ask_secret'));
    await call('toolApprovalDecide', {
      channelId,
      messageId: firstApproval.id,
      outcome: 'allowed-once',
    });
    const secondApproval = await waitFor(pending, 'corrected secret_cli approval');
    seen.add(secondApproval.id);
    await call('toolApprovalDecide', {
      channelId,
      messageId: secondApproval.id,
      outcome: 'allowed-once',
    });
    await waitFor(async () => {
      const data = await snapshot();
      return data.records.some(
        ({ event }) =>
          event.type === 'tool/result' &&
          event.data?.message?.toolCallId === secondApproval.toolApprovalRequest.callId,
      );
    }, 'corrected native result');
    const data = await snapshot();
    const resultFor = (id) =>
      data.records
        .map((record) => record.event)
        .find((event) => event.type === 'tool/result' && event.data?.message?.toolCallId === id);
    const failed = resultFor(firstApproval.toolApprovalRequest.callId);
    assert.equal(failed.data.message.isError, true);
    assert.ok(JSON.stringify(failed).includes('private-source-required'));
    const succeeded = resultFor(secondApproval.toolApprovalRequest.callId);
    const resultText = succeeded.data.message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
    assert.equal(JSON.parse(resultText).exitCode, 0);
    const bind = data.records
      .map((record) => record.event)
      .filter((event) => event.type === 'tool/call' && event.data?.name === 'ask_secret')
      .at(-1);
    assert.equal(JSON.parse(bind.data.arguments).source_event_id, first.sources[0]);
    const accountCards = (await messages()).filter(
      (message) => message.privateInputRequest?.account === 'synthetic-2290',
    );
    assert.equal(accountCards.length, 1);
    await waitFor(
      async () =>
        (await snapshot()).records
          .filter(({ event }) => ['turn/start', 'turn/end'].includes(event.type))
          .at(-1)?.event.type === 'turn/end',
      'recovery turn end',
    );
    const replies = await fixture('replies', bot.slug);
    const recovered = replies.filter((reply) => reply.recovered);
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].messageId, first.messageIds[0]);
    const cli = (tool, args) =>
      new Promise((done, reject) => {
        const login = new URL(instance.url);
        const child = spawn(
          process.execPath,
          ['packages/deepseekbot/src/deepseekbot.mjs', 'bot-tool', bot.slug, tool, '--args-stdin'],
          {
            env: {
              ...process.env,
              DEEPSEEKBOT_HOST: login.origin,
              DEEPSEEKBOT_HOST_TOKEN: login.searchParams.get('token'),
            },
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
          },
        );
        let stdout = '';
        child.stdout.on('data', (chunk) => {
          stdout += chunk;
        });
        child.stderr.resume();
        child.on('error', reject);
        child.on('exit', (code) =>
          code === 0
            ? done(JSON.parse(stdout))
            : reject(new Error('Direct CLI failed with exit code ' + code)),
        );
        child.stdin.end(JSON.stringify(args));
      });
    const configured = await cli('ask_secret', {
      account: 'synthetic-2290',
      purpose: 'Test a local command',
      fields: [{ id: 'token', label: 'Token', required: true }],
    });
    assert.equal(configured.result.status, 'configured');
    for (const message of await messages()) seen.add(message.id);
    const direct = cli('secret_cli', {
      account: 'synthetic-2290',
      references: Object.values(configured.result.references),
      program: 'gh',
      args: ['--version'],
      env: [{ name: 'GH_TOKEN', value: '{{token}}' }],
    });
    direct.catch(() => {});
    const directApproval = await waitFor(pending, 'direct CLI native approval');
    await call('toolApprovalDecide', {
      channelId,
      messageId: directApproval.id,
      outcome: 'allowed-once',
    });
    assert.equal((await direct).result.exitCode, 0);
    const recovery = {
      synthetic: true,
      firstRefusal: 'private-source-required',
      selectedOriginalRequest: true,
      repliedToOriginalRequest: true,
      correctedExitCode: 0,
      inputCards: 1,
      directCliExitCode: 0,
    };
    writeFileSync(resolve(output, 'recovery-proof.json'), JSON.stringify(recovery, null, 2));
    console.log(JSON.stringify(recovery));
  }
} catch (error) {
  writeFileSync(resolve(output, phase + '-failure.console.txt'), consoleLines.join('\n'));
  await page.screenshot({ path: resolve(output, phase + '-failure.png') }).catch(() => {});
  writeFileSync(
    resolve(output, phase + '-failure.aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
  throw error;
} finally {
  let timer;
  const closed = await Promise.race([
    browser.close().then(() => true),
    new Promise((done) => {
      timer = setTimeout(() => done(false), 5000);
    }),
  ]);
  clearTimeout(timer);
  if (!closed) browser.process()?.kill();
}

process.exit(0);
