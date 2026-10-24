import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rpc, verifyPaths } from './verify-app.mjs';
import { installed, waitFor } from './e2e-assignment-probe.mjs';
import { readClientDiagnostics } from './dev-client-diagnostics.mjs';

const flag = (name) => process.argv[process.argv.indexOf(name) + 1];
const paths = verifyPaths(process.argv.includes('--name') ? flag('--name') : 'ax2080-simple');
const captureOnly = process.argv.includes('--capture-report');
const legacy = process.argv.includes('--expect-legacy');
const managementAlways = !process.argv.includes('--expect-once-only-management');
const prepared = captureOnly
  ? JSON.parse(readFileSync(flag('--capture-report'), 'utf8'))
  : undefined;
const instancePath = prepared?.instance ?? paths.instance;
const instance = JSON.parse(readFileSync(instancePath, 'utf8'));
assert.equal(resolve(instance.worktree), resolve('.'));
const output = resolve(paths.dir, 'three-actions-' + Date.now());
mkdirSync(output, { recursive: true });
const origin = new URL(instance.url);
const secret = origin.searchParams.get('token');
const safe = (value) => String(value).replaceAll(secret ?? '<no-token>', '<redacted>');
const save = (name, value) =>
  writeFileSync(
    resolve(output, name),
    safe(typeof value === 'string' ? value : JSON.stringify(value, null, 2)),
  );
const cli = (args) =>
  JSON.parse(
    execFileSync(
      process.execPath,
      ['packages/deepseekbot/dist/deepseekbot.mjs', ...args, '--compact', '--timeout', '60'],
      {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 90000,
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
          DEEPSEEKBOT_HOST: origin.origin,
          DEEPSEEKBOT_HOST_TOKEN: secret,
        },
      },
    ),
  );
const report = {
  source: cli(['release-info']).identity,
  output,
  stage: 'create',
  botId: prepared?.botId,
  botName:
    prepared?.botName ??
    (process.argv.includes('--bot-name') ? flag('--bot-name') : '2080 审批体验'),
  console: [],
};
const persist = () => save('report.json', report);
const messages = async () =>
  (
    await rpc(instance, 'botharness/channelMessages', {
      channelId: 'dm-' + report.botId,
      limit: 100,
    })
  ).messages;
const send = async (body) => {
  const before = new Set((await messages()).map((message) => message.id));
  await rpc(instance, 'botharness/channelSend', {
    channelId: 'dm-' + report.botId,
    messageId: 'human-' + randomUUID(),
    body,
  });
  return before;
};
const pending = async (before) =>
  waitFor(
    async () =>
      (await messages()).find((message) => !before.has(message.id) && message.toolApprovalRequest),
    'native approval card',
  );
const finished = async (before, marker) => {
  const trace = await waitFor(async () => {
    const value = cli(['bot-trace', report.botId, '--turns', '20']);
    return value.turns
      .flatMap((turn) => turn.calls)
      .some((call) => call.name === 'pwsh' && call.outcome === 'ok' && call.result.includes(marker))
      ? value
      : undefined;
  }, 'native pwsh result ' + marker);
  save(marker + '-trace.json', trace);
  return waitFor(
    async () =>
      (await messages()).find(
        (message) =>
          !before.has(message.id) &&
          message.author.kind === 'bot' &&
          !message.toolApprovalRequest &&
          message.body.includes(marker),
      ),
    'committed reply ' + marker,
  );
};
const shellPrompt = (marker, escalate = true) =>
  `For this authorized synthetic approval UX test, first channel_send one short explanation. Then call native pwsh exactly once with description "Verify the approval action choices", command "Write-Output '${marker}'"${escalate ? ', sandbox_permissions "danger-full-access", justification "May I run this harmless marker to verify the approval buttons?"' : ', with no sandbox_permissions'}. ${escalate ? 'This tests native approval, so use the requested wider mode even though printing itself is harmless.' : ''} Do not delegate or request a folder. After the call settles, channel_send its actual tool output verbatim, then end the turn. Never retry after rejection.`;
let browser, page;
const click = async (label) => {
  const buttons = await page.$$(`::-p-aria([name=${JSON.stringify(label)}][role="button"])`);
  for (const button of buttons) {
    if (await button.isVisible()) {
      await button.click();
      return;
    }
  }
  throw new Error('Visible button unavailable: ' + label);
};
const dismiss = async () => {
  for (let n = 0; n < 4; n++) {
    for (const label of ['Continue', 'Configure later', 'Skip tutorial', 'Skip']) {
      const button = await page.$(`::-p-aria([name=${JSON.stringify(label)}][role="button"])`);
      if (button && (await button.isVisible())) await button.click();
    }
    await new Promise((done) => setTimeout(done, 250));
  }
};
const open = async () => {
  if (!browser) {
    browser = await installed('puppeteer').launch({
      headless: true,
      args: ['--no-sandbox', '--lang=en-US'],
    });
    page = await browser.newPage();
    page.on('pageerror', (error) =>
      report.console.push({ type: 'pageerror', text: safe(error.message) }),
    );
    page.on('console', (event) => {
      if (['error', 'warn'].includes(event.type()))
        report.console.push({ type: event.type(), text: safe(event.text()) });
    });
    await page.setViewport({ width: 1440, height: 1100 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  }
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await dismiss();
  const mode = await page.$('button[aria-label="Bot mode"]');
  if (mode && (await mode.isVisible())) await click('Bot mode');
  await page.waitForSelector('.bh-workspace-rail', { visible: true });
  await dismiss();
  const find = (node) =>
    node.role === 'button' && node.name.startsWith(report.botName + ': ')
      ? node.name
      : node.children?.map(find).find(Boolean);
  const name = find(await page.accessibility.snapshot({ interestingOnly: false }));
  assert.ok(name, 'QA Bot sidebar entry');
  await click(name);
  await dismiss();
  const card = await page
    .waitForSelector('.bh-tool-approval-card[tabindex="0"]', { visible: true, timeout: 5000 })
    .catch(() => null);
  if (!card) await click('Messages · Ctrl + Alt + Shift + 2');
  await (await page.waitForSelector('.bh-tool-approval-card[tabindex="0"]')).scrollIntoView();
};
const capture = async (name) => {
  const reject = await page.$(
    '.bh-tool-approval-card[tabindex="0"] ::-p-aria([name="Reject"][role="button"])',
  );
  if (reject) {
    await reject.scrollIntoView();
    await new Promise((done) => setTimeout(done, 350));
  }
  await page.screenshot({ path: resolve(output, name + '.png') });
  save(name + '.aria.json', await page.accessibility.snapshot({ interestingOnly: false }));
  save(name + '.diagnostics.json', await readClientDiagnostics(instance));
  const box = await page.$('.bh-tool-approval-card[tabindex="0"]');
  if (box) await box.screenshot({ path: resolve(output, name + '-card.png') });
  persist();
};
const decide = (request, outcome) =>
  cli([
    'tool-approval-decide',
    'dm-' + report.botId,
    '--message-id',
    request.id,
    '--outcome',
    outcome,
  ]);
try {
  if (!report.botId)
    report.botId = cli([
      'create',
      ...(process.argv.includes('--preset') ? ['--preset', flag('--preset')] : []),
      '--name',
      report.botName,
      '--persona',
      'Follow Human QA instructions exactly. Use the requested native tool once. Report real results with channel_send. Never retry rejected calls or delegate this QA.',
    ]).bot.id;
  persist();
  report.stage = 'first-request';
  const before = captureOnly ? new Set() : await send(shellPrompt('APPROVAL_SIMPLE_ONE'));
  const request = captureOnly
    ? (await messages()).find((message) => message.id === prepared.requestId)
    : await pending(before);
  assert.equal(request?.toolApprovalRequest?.toolName, 'pwsh');
  report.requestId = request.id;
  await open();
  await page.waitForSelector('.bh-tool-approval-card[tabindex="0"]', { visible: true });
  const labels = await page.$$eval(
    '.bh-tool-approval-card[tabindex="0"] .bh-tool-approval-actions button',
    (buttons) => buttons.map((button) => button.textContent.trim()),
  );
  report.actions = labels;
  if (legacy)
    assert.deepEqual(labels, [
      'Allow once',
      'Always allow this exact call',
      'Always allow all opaque tools in this scope',
      'Reject',
    ]);
  else assert.deepEqual(labels, ['Allow once', 'Always allow', 'Reject']);
  await capture(legacy ? 'before-dark' : 'after-dark');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await capture(legacy ? 'before-light' : 'after-light');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  if (captureOnly) {
    report.status = 'captured-pending';
  } else {
    assert.equal(request.toolApprovalRequest.allowAlways, true);
    await page
      .locator(
        '.bh-tool-approval-card[tabindex="0"] ::-p-aria([name="Always allow"][role="button"])',
      )
      .click();
    await finished(before, 'APPROVAL_SIMPLE_ONE');
    let rules = cli(['tool-approval-rules', report.botId]).rules;
    const rule = rules.find(
      (value) => value.kind === 'tool' && value.toolName === 'pwsh' && !value.revokedAt,
    );
    assert.ok(rule, 'canonical current-tool rule');
    report.rule = rule;
    report.stage = 'changed-input';
    const changed = await send(shellPrompt('APPROVAL_SIMPLE_TWO'));
    await finished(changed, 'APPROVAL_SIMPLE_TWO');
    assert.equal(
      (await messages()).filter(
        (message) => !changed.has(message.id) && message.toolApprovalRequest,
      ).length,
      0,
    );
    report.changedInputWithoutCard = true;
    report.stage = 'other-tool';
    const other = await send(
      'This is a synthetic approval test. First channel_send a short explanation, then call bot_create exactly once with display_name "2080 Pending Creation" and description "Synthetic QA creation, reject this request". Wait for its real result; do not create it through Shell or retry after rejection. End the turn after channel_send reports the actual result.',
    );
    const otherRequest = await pending(other);
    assert.equal(otherRequest.toolApprovalRequest.toolName, 'bot_create');
    decide(otherRequest, 'rejected');
    report.otherToolStillAsks = true;
    report.stage = 'rule-revocation';
    cli(['tool-approval-rule-revoke', report.botId, '--rule', rule.id, '--confirm']);
    const revoked = await send(shellPrompt('APPROVAL_SIMPLE_REVOKED'));
    const revokedRequest = await pending(revoked);
    assert.equal(revokedRequest.toolApprovalRequest.toolName, 'pwsh');
    decide(revokedRequest, 'allowed-once');
    await finished(revoked, 'APPROVAL_SIMPLE_REVOKED');
    report.revocationAndCliOnce = true;
    report.stage = 'full-access';
    await waitFor(async () => {
      const trace = cli(['bot-trace', report.botId, '--turns', '1']);
      return trace.turns.at(-1)?.endReason !== undefined;
    }, 'settled turn before changing Full Access');
    cli([
      'access-set',
      report.botId,
      '--mode',
      'danger-full-access',
      '--scope',
      'chat',
      '--acknowledge-risk',
    ]);
    const full = await send(shellPrompt('APPROVAL_SIMPLE_FULL', false));
    await finished(full, 'APPROVAL_SIMPLE_FULL');
    assert.equal(
      (await messages()).filter((message) => !full.has(message.id) && message.toolApprovalRequest)
        .length,
      0,
    );
    report.fullAccessOrdinaryWithoutCard = true;
    report.stage = 'full-access-permission-change';
    const guard = await send(
      'This is the authorized Human-only approval regression. First channel_send a short explanation, then use native pwsh once to run exactly "deepseekbot grant-write-set synthetic-unavailable --grant synthetic-unavailable --enabled", with a description. No sandbox_permissions. This tests the permission-management card under Full Access. Wait for the real result and report with channel_send; do not retry, edit settings another way, or choose another command. The Human will reject it, so no target authorization should change.',
    );
    const guardRequest = await pending(guard);
    assert.equal(guardRequest.toolApprovalRequest.toolName, 'pwsh');
    assert.equal(guardRequest.toolApprovalRequest.allowAlways, managementAlways);
    await open();
    await page.waitForSelector('.bh-tool-approval-card[tabindex="0"]', { visible: true });
    assert.equal(
      await page.$eval(
        '.bh-tool-approval-card[tabindex="0"] .bh-request-secondary',
        (button) => button.disabled,
      ),
      !managementAlways,
    );
    await capture('full-access-human-only');
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await capture('full-access-human-only-light');
    decide(guardRequest, 'rejected');
    report.fullAccessHumanOnlyCard = true;
    report.stage = 'evidence';
    save('messages.json', await messages());
    save('trace.json', cli(['bot-trace', report.botId, '--turns', '6']));
    rules = cli(['tool-approval-rules', report.botId]).rules;
    save('rules.json', rules);
    assert.ok(rules.find((value) => value.id === rule.id)?.revokedAt);
    assert.deepEqual(report.console, []);
    report.status = 'pass';
  }
  persist();
  console.log(JSON.stringify({ status: report.status, evidence: output, botId: report.botId }));
} catch (error) {
  report.status = 'failed';
  report.error = safe(error.message);
  if (page) await capture('failure').catch(() => undefined);
  persist();
  throw error;
} finally {
  await browser?.close();
}
