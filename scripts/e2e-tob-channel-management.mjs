import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const native = !!process.env.BH_DESKTOP_CDP;
assert.ok(
  [undefined, '0', '1'].includes(process.env.BH_E2E_GROUP_AUTO_ACCEPT),
  'BH_E2E_GROUP_AUTO_ACCEPT must be 0 or 1',
);
const autoAccept = process.env.BH_E2E_GROUP_AUTO_ACCEPT !== '0';
const instance = native ? undefined : JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE));
const out = resolve(
  process.env.BH_E2E_EVIDENCE || '.humanlayer/verify/tob-channel-management/journey',
  `${native ? 'desktop' : 'web'}-${Date.now()}`,
);
mkdirSync(out, { recursive: true });
const cookie = native
  ? ''
  : readFileSync(
      resolve(tmpdir(), `dsh-${basename(instance.home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`),
      'utf8',
    ).split(';')[0];
const origin = native ? '' : new URL(instance.url).origin;
async function rpc(method, args = {}, ns = 'botharness') {
  if (native) {
    const result = await page.evaluate(
      async ({ method, args, ns }) => {
        const r = await fetch('/api/' + ns + '/' + method, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: crypto.randomUUID(),
            method: ns + '/' + method,
            payload: { args },
          }),
        });
        return (await r.json()).result;
      },
      { method, args, ns },
    );
    assert.equal(
      result?.ok,
      true,
      `${ns}/${method}: ${result?.error?.code}: ${result?.error?.message}`,
    );
    return result.value;
  }
  const response = await fetch(`${origin}/api/${ns}/${method}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: ns + '/' + method,
      payload: { args },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const { result } = await response.json();
  assert.equal(
    result?.ok,
    true,
    `${ns}/${method}: ${result?.error?.code}: ${result?.error?.message}`,
  );
  return result.value;
}
const store = resolve('node_modules/.pnpm');
const puppeteer = createRequire(
  resolve(
    store,
    readdirSync(store).find((n) => n.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const browser = native
  ? await puppeteer.connect({ browserURL: process.env.BH_DESKTOP_CDP, defaultViewport: null })
  : await puppeteer.launch({
      headless: true,
      userDataDir: process.env.BH_BROWSER_PROFILE,
      args: ['--no-sandbox', '--lang=en-US'],
    });
const page = native
  ? (await browser.pages()).find((p) => p.url().startsWith('dsh-app://app/'))
  : await browser.newPage();
assert.ok(page);
page.setDefaultTimeout(30000);
const errors = [],
  steps = [];
page.on('pageerror', (e) => errors.push(e.message));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const phase = process.argv[2] || 'journey';
const progress = [];
function mark(step) {
  const entry = { phase, step, at: new Date().toISOString() };
  progress.push(entry);
  writeFileSync(resolve(out, 'progress.json'), JSON.stringify(progress, null, 2));
  console.log(JSON.stringify(entry));
}
const click = async (name, scope = '') => {
  const names = {
    Members: ['Members', '成员'],
    'Configure model': ['配置模型，开始与 Tob 对话', 'Configure a model to talk to Tob'],
    Close: ['关闭', 'Close'],
    'Bot mode': ['Bot 模式', 'Bot mode'],
    'Bot settings': ['Bot 设置', 'Bot settings'],
    Advanced: ['高级', 'Advanced'],
    'Task model settings': ['任务模型设置…', 'Task model settings…'],
    Cancel: ['取消', 'Cancel'],
    'Approve once': ['仅批准这一次', 'Allow once'],
    Deny: ['拒绝', 'Deny'],
    'Review CLI change': ['使用 deepseekbot settings-set', 'Use deepseekbot settings-set'],
  }[name] ?? [name];
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const label of names) {
      const selector = `${scope} ::-p-aria([name=${JSON.stringify(label)}])`.trim();
      const handle = await page.$(selector);
      if (handle && (await handle.isVisible())) {
        await page.locator(selector).click();
        return;
      }
    }
    await pause(100);
  }
  throw Error('visible accessible action not found: ' + name);
};
const shot = async (name) => {
  await page.screenshot({ path: resolve(out, name + '.png') });
  writeFileSync(
    resolve(out, name + '.aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
};

async function visibleElement(selector) {
  const handle = await page.waitForFunction(
    (selector) =>
      [...document.querySelectorAll(selector)].find((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden';
      }),
    {},
    selector,
  );
  const element = handle.asElement();
  assert.ok(element, 'visible element missing: ' + selector);
  return element;
}
async function setHomeVisible(open) {
  const showing = await page.evaluate(() =>
    [...document.querySelectorAll('[data-home-panel]')].some((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden';
    }),
  );
  if (showing !== open)
    await (await visibleElement('.bh-workspace-rail [data-pinned-panel="bh:home"]')).click();
  await page.waitForFunction(
    (open) =>
      [...document.querySelectorAll('[data-home-panel]')].some((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden';
      }) === open,
    {},
    open,
  );
}

async function humanCli(command, args = [], input, expectedFailure = false) {
  const manifest = process.env.BH_E2E_HUMAN_INSTANCE
    ? JSON.parse(readFileSync(process.env.BH_E2E_HUMAN_INSTANCE, 'utf8'))
    : instance;
  assert.ok(manifest?.url, 'Human CLI requires a private candidate launch manifest');
  const url = new URL(manifest.url);
  const token = url.searchParams.get('token');
  assert.ok(token, 'Human CLI manifest needs a local login token');
  const env = { ...process.env, DEEPSEEKBOT_HOST: url.origin, DEEPSEEKBOT_HOST_TOKEN: token };
  delete env.DEEPSEEKBOT_AGENT_ENDPOINT;
  delete env.DEEPSEEKBOT_AGENT_TOKEN;
  return new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      [resolve('packages/deepseekbot/dist/deepseekbot.mjs'), command, ...args],
      { env, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let stdout = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), 30000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        let value;
        try {
          value = JSON.parse(stdout);
        } catch {
          const failure = {
            command,
            exitCode: code,
            outputBytes: Buffer.byteLength(stdout),
            error: 'invalid-cli-json',
          };
          writeFileSync(
            resolve(out, command + '-cli-error-' + Date.now() + '.json'),
            JSON.stringify(failure, null, 2),
          );
          throw Error(JSON.stringify(failure));
        }
        if ((code !== 0) !== expectedFailure) {
          const message = String(value.error?.message ?? '')
            .slice(0, 500)
            .replace(
              /(?:Bearer\s+|(?:token|secret|password|api[_-]?key)[=:\s]+)[^\s,;]+/giu,
              '[redacted]',
            );
          const failure = {
            command,
            exitCode: code,
            error: { code: String(value.error?.code ?? 'unknown').slice(0, 100), message },
          };
          writeFileSync(
            resolve(out, command + '-cli-error-' + Date.now() + '.json'),
            JSON.stringify(failure, null, 2),
          );
          throw Error(JSON.stringify(failure));
        }
        done(value);
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(input === undefined ? '' : JSON.stringify(input));
  });
}
async function waitForApproval(channelId, previousIds, previousCalls, command, matches) {
  for (let i = 0; i < 180; i++) {
    const messages = (await rpc('channelMessages', { channelId })).messages;
    for (const message of messages) {
      if (!previousIds.has(message.id) && message.sessionFailure)
        throw Error('Session failed before approval: ' + message.sessionFailure.detail);
      const request = message.toolApprovalRequest;
      if (request?.toolName !== 'deepseekbot ' + command || previousIds.has(message.id)) continue;
      const input = JSON.parse(request.input);
      if (previousCalls.has(input.parentShellCallId) || !matches(input)) continue;
      const status = await rpc('toolApprovalStatus', { channelId, messageId: message.id });
      if (status.status === 'pending') return message;
    }
    await pause(1000);
  }
  throw Error('new matching pending approval did not arrive: ' + command);
}
async function dismissBubble() {
  for (const label of ['关闭气泡', 'Dismiss bubble']) {
    const selector = `button[aria-label=${JSON.stringify(label)}]`;
    const button = await page.$(selector);
    if (button && (await button.isVisible())) await page.locator(selector).click();
  }
}
async function newToolCalls(slug, previousIds, sessionId) {
  const trace = await rpc('botToolTrace', {
    slug,
    turns: 20,
    ...(sessionId ? { sessionId } : {}),
  }).catch((error) => {
    if (/gateway\/internal: session "[^"\n]+" not found/u.test(error.message)) return { turns: [] };
    throw error;
  });
  const calls = trace.turns
    .flatMap((turn) => turn.calls)
    .filter((call) => !previousIds.has(call.callId));
  assert.equal(
    calls.some((call) =>
      /^(?:tob_assignment_limit_(?:read|set)|group_create|group_invite_bot)$/u.test(call.name),
    ),
    false,
    'legacy dedicated Tob management tool was invoked',
  );
  return { trace, calls };
}

async function verifyCliTrace(slug, previousIds, commands, refusal) {
  let evidence;
  for (let i = 0; i < 120; i++) {
    evidence = await newToolCalls(slug, previousIds);
    const shells = evidence.calls.filter((call) => ['bash', 'pwsh'].includes(call.name));
    const hasCommands = commands.every((command) =>
      shells.some((call) => JSON.stringify(call.args).includes('deepseekbot ' + command)),
    );
    const complete = shells.length > 0 && shells.every((call) => call.outcome !== 'pending');
    const hasRefusal = !refusal || shells.some((call) => call.result.includes(refusal));
    if (hasCommands && complete && hasRefusal) break;
    await pause(1000);
  }
  writeFileSync(resolve(out, 'cli-tool-trace.json'), JSON.stringify(evidence, null, 2));
  const shells = evidence.calls.filter((call) => ['bash', 'pwsh'].includes(call.name));
  for (const command of commands)
    assert.ok(
      shells.some((call) => JSON.stringify(call.args).includes('deepseekbot ' + command)),
      'missing native Shell CLI call: ' + command,
    );
  assert.ok(
    shells.every((call) => call.outcome !== 'pending'),
    'CLI Shell call is still pending',
  );
  if (refusal)
    assert.ok(
      shells.some((call) => call.result.includes(refusal)),
      'native Shell result missing coded refusal: ' + refusal,
    );
  steps.push('native Shell CLI trace, no dedicated Tob tools' + (refusal ? '; ' + refusal : ''));
}

async function showApproval(message) {
  await dismissBubble();
  await setHomeVisible(false);
  mark('approval-current-card');
  const latest = '.bh-timeline-new';
  if (await page.$(latest)) await page.locator(latest).setTimeout(5000).click();
  const selector = `[data-message-id=${JSON.stringify(message.id)}] .bh-tool-approval-card`;
  await page.waitForSelector(selector, { timeout: 10000 });
  await page.waitForFunction(
    (s) =>
      [...document.querySelectorAll(s + ' button.bh-request-primary')].some((n) => !n.disabled),
    { timeout: 10000 },
    selector,
  );
  mark('approval-expand');
  const summarySelector = selector + ' .bh-request-summary';
  for (let attempt = 0; attempt < 3; attempt++) {
    const expanded = await page.$eval(summarySelector, (n) => n.getAttribute('aria-expanded'));
    if (expanded === 'true') break;
    if (await page.$(latest)) await page.locator(latest).setTimeout(5000).click();
    await page.locator(summarySelector).setTimeout(5000).click();
    try {
      await page.waitForFunction(
        (s) => document.querySelector(s)?.getAttribute('aria-expanded') === 'true',
        { timeout: 5000 },
        summarySelector,
      );
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  await page.waitForFunction(
    (s) => document.querySelector(s)?.getAttribute('aria-expanded') === 'true',
    {},
    summarySelector,
  );
  mark('approval-payload');
  const foldSelector = selector + ' .bh-tool-approval-fold[aria-expanded="false"]';
  if (await page.$(foldSelector)) await page.locator(foldSelector).setTimeout(5000).click();
  const payload = await page.waitForSelector(selector + ' .bh-tool-approval-input');
  await payload.evaluate((n) => n.scrollIntoView({ block: 'start', inline: 'nearest' }));
  assert.deepEqual(
    JSON.parse(await payload.evaluate((n) => n.textContent)),
    JSON.parse(message.toolApprovalRequest.input),
  );
  await pause(300);
  await dismissBubble();
  mark('approval-capture');
  await payload.screenshot({ path: resolve(out, 'approval-operation.png') });
  await shot('approval-expanded');
  return selector;
}

async function decideApproval(selector, deny) {
  const labels = deny ? ['拒绝', 'Deny'] : ['仅批准这一次', 'Allow once'];
  await page.waitForSelector(selector, { visible: true });
  const summary = selector + ' .bh-request-summary';
  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await page.$eval(summary, (n) => n.getAttribute('aria-expanded'))) === 'true') break;
    await page.locator(summary).click();
    try {
      await page.waitForFunction(
        (s) => document.querySelector(s)?.getAttribute('aria-expanded') === 'true',
        { timeout: 5000 },
        summary,
      );
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const label of labels) {
      const target = selector + ' ::-p-aria(' + JSON.stringify(label) + ')';
      if (await page.$(target)) {
        await page.locator(target).click();
        return;
      }
    }
    await pause(200);
  }
  throw Error('accessible decision button missing from selected approval');
}

async function beginPrompt(home, prompt) {
  const trace = await rpc('botToolTrace', { slug: home.botSlug, turns: 20 }).catch(() => ({
    turns: [],
  }));
  const messages = (await rpc('channelMessages', { channelId: home.channelId })).messages;
  const context = {
    prompt,
    started: Date.now(),
    previousMessages: new Set(messages.map((message) => message.id)),
    previousCalls: new Set(trace.turns.flatMap((turn) => turn.calls).map((call) => call.callId)),
  };
  await setHomeVisible(true);
  const input = await visibleElement('[data-home-panel] textarea');
  await input.type(prompt);
  await input.press('Enter');
  await page.waitForSelector('[data-dock-header="bh:channel-body"]');
  return context;
}

async function completeTurn(home, context, command, refusal) {
  await verifyCliTrace(home.botSlug, context.previousCalls, [command], refusal);
  for (let i = 0; i < 180; i++) {
    const messages = (await rpc('channelMessages', { channelId: home.channelId })).messages;
    const fresh = messages.filter((message) => !context.previousMessages.has(message.id));
    assert.ok(!fresh.some((message) => message.sessionFailure), 'native Session failed');
    const submitted = fresh.find(
      (message) => message.author.kind === 'human' && message.body === context.prompt,
    );
    const delivery = submitted?.deliveries?.find((entry) => entry.botSlug === home.botSlug);
    assert.ok(
      !['retryable', 'needs-repair', 'ignored'].includes(delivery?.state),
      'Human message delivery failed',
    );
    const evidence = await newToolCalls(home.botSlug, context.previousCalls);
    const turn = evidence.trace.turns.find((item) =>
      item.calls.some(
        (call) =>
          !context.previousCalls.has(call.callId) &&
          ['bash', 'pwsh'].includes(call.name) &&
          JSON.stringify(call.args).includes('deepseekbot ' + command),
      ),
    );
    if (turn?.endReason !== undefined) assert.equal(turn.endReason, 'completed');
    const reply = fresh.find(
      (message) =>
        message.author.kind === 'bot' &&
        !message.toolApprovalRequest &&
        !message.onboardingWelcome &&
        message.body,
    );
    if (turn?.endReason === 'completed' && delivery?.state === 'handled' && reply) {
      const result = {
        messageId: submitted.id,
        sessionId: evidence.trace.sessionId,
        turn: turn.turn,
        endReason: turn.endReason,
        delivery: delivery.state,
        reply: reply.body,
        calls: evidence.calls,
      };
      writeFileSync(
        resolve(out, command + '-completion-' + context.started + '.json'),
        JSON.stringify(result, null, 2),
      );
      return result;
    }
    await pause(1000);
  }
  throw Error('native turn did not complete with handled delivery and real reply: ' + command);
}

async function review(home, context, command, matches, deny = false) {
  const message = await waitForApproval(
    home.channelId,
    context.previousMessages,
    context.previousCalls,
    command,
    matches,
  );
  const proposal = JSON.parse(message.toolApprovalRequest.input);
  writeFileSync(
    resolve(out, command + '-review-' + context.started + '.json'),
    JSON.stringify(proposal, null, 2),
  );
  const selector = await showApproval(message);
  await decideApproval(selector, deny);
  return proposal;
}

function groupArguments(input, operationKey) {
  return [
    input.name,
    '--operation-key',
    operationKey,
    ...input.members.flatMap((id) => ['--member', id]),
  ];
}
function inviteArguments(input, operationKey) {
  return [
    input.channelId,
    '--bot',
    input.botSlug,
    '--operation-key',
    operationKey,
    '--expected-channel',
    input.expectedChannel,
  ];
}
async function snapshot(channelId) {
  return humanCli('channel', [channelId]);
}
async function openGroup(fixture, expectedMembers) {
  await dismissBubble();
  await setHomeVisible(false);
  const selector = `[data-dock-panel="bh:channels"] [data-channel-id=${JSON.stringify(fixture.channelId)}]`;
  await (await visibleElement(selector)).click();
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('[data-dock-header="bh:channel-body"]')].some(
        (node) => node.getBoundingClientRect().width > 0 && node.textContent?.includes(name),
      ),
    {},
    fixture.input.name,
  );
  const header = '[data-dock-header="bh:channel-body"]';
  const expanded = await (
    await visibleElement(header)
  ).evaluate((node) =>
    [...node.querySelectorAll('button')]
      .find((button) => ['Members', '成员'].includes(button.getAttribute('aria-label')))
      ?.getAttribute('aria-pressed'),
  );
  if (expanded !== 'true') await click('Members', header);
  await page.waitForFunction(
    (names) => {
      const rows = [...document.querySelectorAll('.bh-member-row .bh-name')]
        .filter((node) => node.getBoundingClientRect().width > 0)
        .map((node) => node.textContent);
      return names.every((name) => rows.includes(name));
    },
    {},
    expectedMembers.map((bot) => bot.displayName),
  );
  await shot('group-members');
}
async function verifyReplay(fixture) {
  const before = await snapshot(fixture.channelId);
  const replay = await humanCli(
    'group-create',
    groupArguments(fixture.input, fixture.operationKey),
  );
  assert.equal(replay.channel.id, fixture.channelId);
  assert.equal(replay.receipt.status, 'completed');
  if (fixture.invite) {
    const repeated = await humanCli(
      'group-invite',
      inviteArguments(fixture.invite.input, fixture.invite.operationKey),
    );
    assert.equal(repeated.channel.id, fixture.channelId);
    assert.equal(repeated.receipt.invitationId, fixture.invite.invitationId);
  }
  assert.deepEqual(await snapshot(fixture.channelId), before, 'replay changed canonical Channel');
  const all = (await rpc('channels')).channels;
  assert.equal(all.filter((channel) => channel.id === fixture.channelId).length, 1);
  writeFileSync(resolve(out, 'channel-readback.json'), JSON.stringify(before, null, 2));
  return before;
}
async function waitForInviteDecision(fixture, previousCalls) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const state = await snapshot(fixture.channelId);
    const invitation = state.channel.invitations?.find(
      (item) => item.id === fixture.invite.invitationId,
    );
    assert.ok(invitation, 'canonical invitation missing');
    if (fixture.autoAccept === true) {
      assert.equal(invitation.status, 'accepted', 'default policy must accept immediately');
      assert.equal(invitation.respondedBy, 'profile-policy');
      assert.ok(state.channel.members.includes(fixture.bots[1].slug));
      writeFileSync(
        resolve(out, 'invitation-decision.json'),
        JSON.stringify(
          { invitation, members: state.channel.members, acceptance: 'profile-policy' },
          null,
          2,
        ),
      );
      return state;
    }
    assert.notEqual(
      invitation.respondedBy,
      'profile-policy',
      'automatic acceptance is not a Bot decision',
    );
    assert.ok(!['declined', 'cancelled'].includes(invitation.status), 'invitee did not accept');
    const trace = await rpc('botToolTrace', { slug: fixture.bots[1].slug, turns: 20 }).catch(
      () => ({ turns: [] }),
    );
    const calls = trace.turns
      .flatMap((turn) => turn.calls)
      .filter((call) => !previousCalls.has(call.callId));
    const decision = calls.find(
      (call) =>
        call.name === 'group_invite_respond' &&
        call.args?.invite_id === invitation.id &&
        call.args?.accept === true &&
        call.outcome === 'ok',
    );
    if (
      invitation.status === 'accepted' &&
      invitation.respondedBy === 'bot' &&
      state.channel.members.includes(fixture.bots[1].slug) &&
      decision
    ) {
      writeFileSync(
        resolve(out, 'invitation-decision.json'),
        JSON.stringify({ invitation, members: state.channel.members, calls }, null, 2),
      );
      return state;
    }
    await pause(1000);
  }
  throw Error('invitation did not settle with an actual Bot decision and canonical membership');
}
async function seedBots() {
  const suffix = Date.now().toString(36);
  const bots = [];
  for (const [index, label] of ['苹果', '橙子', '葡萄'].entries()) {
    const displayName = `群聊验收${label}-${suffix}`;
    const result = await humanCli('create', [
      '--name',
      displayName,
      '--operation-key',
      `group-fixture-${suffix}-${index}`,
      '--persona',
      'You are a concise QA helper. Accept a Human invitation to a test Group by calling group_invite_respond with accept true. Do not send extra Group messages or invite others.',
    ]);
    const slug = result.bot.id;
    const plan = await humanCli('model-plan', [slug]);
    await humanCli('model-plan-customize', [
      slug,
      '--orchestrator-provider',
      'deepseek-official',
      '--orchestrator-model',
      'deepseek-flash',
      '--expected-revision',
      String(plan.revision ?? 0),
    ]);
    bots.push({ slug, displayName });
  }
  await humanCli('settings-set', ['botharness-client', '--patch-stdin'], {
    autoAcceptGroupInvites: autoAccept,
  });
  steps.push(
    'Human CLI preconditions only: three existing Bots, available official model and invitation auto-accept ' +
      (autoAccept ? 'enabled (product default)' : 'explicitly disabled'),
  );
  return bots;
}

try {
  mark('entry-start');
  if (!native) {
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setLocaleOverride', { locale: 'en-US' });
    await page.setExtraHTTPHeaders({ 'accept-language': 'en-US' });
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  }
  mark('entry-shell');
  const entryDeadline = Date.now() + 30000;
  let entered = false;
  while (Date.now() < entryDeadline) {
    const state = await page.evaluate(() => {
      const visible = (node) =>
        node.getBoundingClientRect().width > 0 &&
        node.getBoundingClientRect().height > 0 &&
        getComputedStyle(node).visibility !== 'hidden';
      const controls = [...document.querySelectorAll('button, [role="button"]')].filter(visible);
      const overlay = controls.find((node) =>
        ['Continue', '继续', 'Configure later', '稍后配置', 'Skip tutorial', '跳过教程'].includes(
          node.textContent?.trim(),
        ),
      );
      if (overlay) return { overlay: overlay.textContent.trim() };
      if ([...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(visible))
        return {};
      if ([...document.querySelectorAll('.bh-workspace-rail')].some(visible))
        return { ready: true };
      const entry = controls.find((node) =>
        /^(?:Bot mode|Bot 模式)/u.test(
          node.getAttribute('aria-label') || node.textContent?.trim() || '',
        ),
      );
      return entry ? { entry: entry.getAttribute('aria-label') || entry.textContent.trim() } : {};
    });
    if (state.overlay) {
      await click(state.overlay);
    } else if (state.ready) {
      entered = true;
      break;
    } else if (state.entry) {
      await click(state.entry);
    }
    await pause(300);
  }
  assert.ok(entered, 'Client did not expose Bot mode workspace after onboarding');
  await visibleElement('.bh-workspace-rail');
  mark('entry-home');
  await setHomeVisible(true);
  await pause(1200);
  mark('entry-home-ready');
  const home = await rpc('tobHome');
  assert.equal(
    new Set((await Promise.all([rpc('tobHome'), rpc('tobHome')])).map((x) => x.botSlug)).size,
    1,
  );
  steps.push('concurrent Home identity converges');

  assert.ok(
    ['journey', 'create', 'invite', 'deny', 'direct', 'restart-read'].includes(phase),
    'unknown phase',
  );
  const fixturePath = process.env.BH_E2E_CHANNEL_FIXTURE;
  let fixture = fixturePath ? JSON.parse(readFileSync(fixturePath, 'utf8')) : undefined;
  const saveFixture = () =>
    writeFileSync(resolve(out, 'channel-fixture.json'), JSON.stringify(fixture, null, 2));
  if (phase === 'journey' || phase === 'create') {
    const bots = await seedBots();
    const name = '水果讨论-' + Date.now().toString(36);
    const count = (await rpc('channels')).channels.filter(
      (channel) => channel.type === 'group',
    ).length;
    const context = await beginPrompt(
      home,
      `请新建一个叫“${name}”的群聊，初始成员只放“${bots[0].displayName}”。不要加入其他 Bot。`,
    );
    const proposal = await review(
      home,
      context,
      'group-create',
      (value) =>
        value.patch?.name === name &&
        value.patch?.members?.length === 1 &&
        value.patch.members[0].slug === bots[0].slug,
    );
    assert.equal(proposal.patch.initialMembership, 'join-directly');
    await completeTurn(home, context, 'group-create');
    const input = { name, members: [bots[0].slug] };
    const receipt = await humanCli('group-create', groupArguments(input, proposal.target));
    fixture = {
      bots,
      input,
      operationKey: proposal.target,
      channelId: receipt.channel.id,
      autoAccept,
    };
    saveFixture();
    assert.equal(receipt.receipt.status, 'completed');
    assert.deepEqual(receipt.channel.members, input.members);
    assert.equal(receipt.channel.ownerBotSlug, undefined);
    assert.equal(
      (await rpc('channels')).channels.filter((channel) => channel.type === 'group').length,
      count + 1,
    );
    const state = await verifyReplay(fixture);
    assert.equal(state.invitationPolicy.autoAccept, fixture.autoAccept === true);
    await openGroup(fixture, [bots[0]]);
    steps.push(
      'natural Home Group creation, reviewed initial membership, completed Shell turn, one canonical Human-owned Group and rendered member',
    );
  }
  if (phase === 'journey' || phase === 'invite') {
    assert.ok(fixture, 'BH_E2E_CHANNEL_FIXTURE required');
    const before = await snapshot(fixture.channelId);
    assert.equal(before.invitationPolicy.autoAccept, fixture.autoAccept === true);
    assert.ok(!before.channel.members.includes(fixture.bots[1].slug));
    const trace = await rpc('botToolTrace', { slug: fixture.bots[1].slug, turns: 20 }).catch(
      () => ({ turns: [] }),
    );
    const previousCalls = new Set(
      trace.turns.flatMap((turn) => turn.calls).map((call) => call.callId),
    );
    const context = await beginPrompt(
      home,
      `请邀请“${fixture.bots[1].displayName}”加入“${fixture.input.name}”群聊。`,
    );
    const proposal = await review(
      home,
      context,
      'group-invite',
      (value) =>
        value.target === fixture.channelId && value.patch?.invite?.slug === fixture.bots[1].slug,
    );
    assert.equal(proposal.patch.expectedChannel, before.channelFingerprint);
    assert.equal(proposal.patch.invitationPolicy.autoAccept, fixture.autoAccept === true);
    await completeTurn(home, context, 'group-invite');
    const input = {
      channelId: fixture.channelId,
      botSlug: fixture.bots[1].slug,
      expectedChannel: proposal.patch.expectedChannel,
    };
    const receipt = await humanCli(
      'group-invite',
      inviteArguments(input, proposal.patch.operationKey),
    );
    fixture.invite = {
      input,
      operationKey: proposal.patch.operationKey,
      invitationId: receipt.receipt.invitationId,
    };
    saveFixture();
    await waitForInviteDecision(fixture, previousCalls);
    await verifyReplay(fixture);
    await openGroup(fixture, fixture.bots.slice(0, 2));
    steps.push(
      fixture.autoAccept === true
        ? 'natural invite approval, immediate default policy acceptance, canonical membership and both Bots visible in Members'
        : 'natural invite approval, explicit opt-out policy, actual invitee tool decision, accepted canonical membership and both Bots visible in Members',
    );
  }
  if (phase === 'journey' || phase === 'deny') {
    assert.ok(fixture, 'BH_E2E_CHANNEL_FIXTURE required');
    const before = await snapshot(fixture.channelId);
    const context = await beginPrompt(
      home,
      `请邀请“${fixture.bots[2].displayName}”加入“${fixture.input.name}”群聊。如果被拒绝就停止，不要重试。`,
    );
    await review(
      home,
      context,
      'group-invite',
      (value) =>
        value.target === fixture.channelId && value.patch?.invite?.slug === fixture.bots[2].slug,
      true,
    );
    await completeTurn(home, context, 'group-invite', 'approval-denied');
    assert.deepEqual(await snapshot(fixture.channelId), before);
    steps.push(
      'rendered Human denial returns approval-denied and leaves membership and invitations unchanged',
    );
  }
  if (phase === 'journey' || phase === 'direct') {
    if (!fixture) {
      const bots = await seedBots();
      const input = { name: 'CLI水果讨论-' + Date.now().toString(36), members: [bots[0].slug] };
      const operationKey = 'direct-group-' + Date.now();
      const receipt = await humanCli('group-create', groupArguments(input, operationKey));
      fixture = { bots, input, operationKey, channelId: receipt.channel.id, autoAccept };
      saveFixture();
    }
    const before = await verifyReplay(fixture);
    const conflict = await humanCli(
      'group-create',
      groupArguments(
        { ...fixture.input, name: fixture.input.name + '-conflict' },
        fixture.operationKey,
      ),
      undefined,
      true,
    );
    assert.equal(conflict.error.code, 'operation-key-conflict');
    const protectedResult = await humanCli(
      'group-invite',
      inviteArguments(
        {
          channelId: fixture.channelId,
          botSlug: home.botSlug,
          expectedChannel: before.channelFingerprint,
        },
        'protected-invite-' + Date.now(),
      ),
      undefined,
      true,
    );
    assert.equal(protectedResult.error.code, 'protected-bot');
    assert.deepEqual(await snapshot(fixture.channelId), before);
    writeFileSync(
      resolve(out, 'direct-refusals.json'),
      JSON.stringify(
        { conflict: conflict.error.code, protected: protectedResult.error.code },
        null,
        2,
      ),
    );
    steps.push(
      'independent Human CLI exact replay, changed-key-payload conflict and protected Tob invitation refusal',
    );
  }
  if (phase === 'restart-read') {
    assert.ok(
      fixture?.invite,
      'completed BH_E2E_CHANNEL_FIXTURE required after same-Profile restart',
    );
    const state = await verifyReplay(fixture);
    const invitation = state.channel.invitations.find(
      (item) => item.id === fixture.invite.invitationId,
    );
    assert.equal(invitation.status, 'accepted');
    assert.equal(invitation.respondedBy, fixture.autoAccept === true ? 'profile-policy' : 'bot');
    assert.deepEqual(
      [...state.channel.members].sort(),
      fixture.bots
        .slice(0, 2)
        .map((bot) => bot.slug)
        .sort(),
    );
    await openGroup(fixture, fixture.bots.slice(0, 2));
    steps.push(
      'same Profile restart preserves Group, recorded acceptance source, membership and exact receipt replay',
    );
  }
  saveFixture();
  mark('completed');
  await shot(phase);
  writeFileSync(
    resolve(out, 'result.json'),
    JSON.stringify({ steps, errors, channelId: fixture?.channelId }, null, 2),
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ out, steps }));
} catch (error) {
  await shot('failure');
  writeFileSync(resolve(out, 'errors.json'), JSON.stringify(errors));
  console.error(error.stack || String(error));
  process.exitCode = 1;
} finally {
  if (native) browser.disconnect();
  else await browser.close();
}
