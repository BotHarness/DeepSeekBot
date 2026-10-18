import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const native = !!process.env.BH_DESKTOP_CDP;
const instance = native ? undefined : JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE));
const out = resolve(
  process.env.BH_E2E_EVIDENCE || '.humanlayer/verify/tob-group-decisions/journey',
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
const phases = phase.split(',');
const runs = (name) => phases.includes(name);
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
    'Channel settings': ['频道设置…', 'Channel settings…'],
    'Group management': ['群管理', 'Group management'],
    'Member policy': ['消息提醒设置', 'Message attention settings'],
  }[name] ?? [name];
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const label of names) {
      const selector = `${scope} ::-p-aria([name=${JSON.stringify(label)}])`.trim();
      for (const handle of await page.$$(selector)) {
        if (await handle.isVisible()) {
          await handle.click();
          return;
        }
      }
    }
    await pause(100);
  }
  throw Error('visible accessible action not found: ' + name);
};
const shot = async (name) => {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState === 'running' &&
          Number.isFinite(animation.effect?.getComputedTiming().endTime),
      );
    await Promise.race([
      Promise.allSettled(finite.map((animation) => animation.finished)),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await pause(150);
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
      /^(?:tob_assignment_limit_(?:read|set)|group_create|group_invite_bot|group_rename|group_remove_member|group_set_member_wake_policy|group_join_decide|group_invite_respond)$/u.test(
        call.name,
      ),
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
  writeFileSync(
    resolve(out, 'cli-tool-trace-' + Date.now() + '.json'),
    JSON.stringify(evidence, null, 2),
  );
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
  await payload.screenshot({ path: resolve(out, 'approval-operation-' + message.id + '.png') });
  await shot('approval-expanded-' + message.id);
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

async function snapshot(channelId) {
  return humanCli('channel', [channelId]);
}
async function saveState(fixture, label) {
  const state = await snapshot(fixture.channelId);
  writeFileSync(resolve(out, label + '-canonical.json'), JSON.stringify(state, null, 2));
  return state;
}
async function openGroup(fixture, label) {
  await dismissBubble();
  await setHomeVisible(false);
  await (
    await visibleElement(
      `[data-dock-panel="bh:channels"] [data-channel-id=${JSON.stringify(fixture.channelId)}]`,
    )
  ).click();
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('[data-dock-header="bh:channel-body"]')].some(
        (node) => node.getBoundingClientRect().width > 0 && node.textContent?.includes(name),
      ),
    {},
    fixture.name,
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
    ({ bots, members }) => {
      const names = [...document.querySelectorAll('.bh-member-row .bh-name')]
        .filter((node) => node.getBoundingClientRect().width > 0)
        .map((node) => node.textContent);
      return bots.every((bot) => members.includes(bot.slug) === names.includes(bot.displayName));
    },
    {},
    { bots: fixture.bots, members: fixture.members },
  );
  await shot(label);
}
async function inspectAttention(fixture, label) {
  await openGroup(fixture, label + '-members');
  await (
    await visibleElement(
      'button[aria-label^="Invitations and join requests"],button[aria-label^="邀请与入群申请"]',
    )
  ).click();
  await page.waitForSelector('[data-group-attention]', { visible: true });
  const expected = [
    { slug: fixture.invitee, status: fixture.invitationStatus, kind: 'invite' },
    ...Object.values(fixture.requests).map((request) => ({
      slug: request.slug,
      status: request.status,
      kind: 'request',
    })),
  ].map((item) => ({
    ...item,
    name: fixture.bots.find((bot) => bot.slug === item.slug).displayName,
  }));
  await page.waitForFunction(
    (expected) => {
      const labels = {
        pending: ['Pending', '待接受'],
        requestPending: ['Awaiting approval', '待审批'],
        accepted: ['Accepted', '已接受'],
        declined: ['Declined', '已拒绝'],
        cancelled: ['Cancelled', '已取消'],
      };
      const rows = [...document.querySelectorAll('[data-group-attention-item]')].filter(
        (node) => node.getBoundingClientRect().width > 0,
      );
      return expected.every((item) => {
        const row = rows.find((node) => node.textContent?.includes(item.name));
        const statuses =
          item.status === 'pending' && item.kind === 'request'
            ? labels.requestPending
            : labels[item.status];
        return row && statuses.some((status) => row.textContent.includes(status));
      });
    },
    {},
    expected,
  );
  await shot(label);
  await click('Close', '[role="dialog"]:has([data-group-attention])');
  await page.waitForSelector('[data-group-attention]', { hidden: true });
}
async function waitOrdinaryJoin(bot, channelId, previousCalls, previousMessages, prompt) {
  for (let i = 0; i < 180; i++) {
    const state = await snapshot(channelId);
    const request = state.channel.joinRequests?.find(
      (item) => item.requesterBotSlug === bot.slug && item.status === 'pending',
    );
    const trace = await rpc('botToolTrace', { slug: bot.slug, turns: 20 }).catch(() => ({
      turns: [],
    }));
    const turn = trace.turns.find((entry) =>
      entry.calls.some(
        (call) =>
          !previousCalls.has(call.callId) &&
          call.name === 'group_join_request' &&
          call.args?.channel_id === channelId &&
          call.outcome === 'ok',
      ),
    );
    const messages = (await rpc('channelMessages', { channelId: `dm-${bot.slug}` })).messages;
    const fresh = messages.filter((item) => !previousMessages.has(item.id));
    assert.ok(!fresh.some((item) => item.sessionFailure), 'requester Session failed');
    const human = fresh.find((item) => item.author.kind === 'human' && item.body === prompt);
    const delivery = human?.deliveries?.find((entry) => entry.botSlug === bot.slug);
    if (request && turn?.endReason === 'completed' && delivery?.state === 'handled') {
      writeFileSync(
        resolve(out, 'requester-' + bot.slug + '.json'),
        JSON.stringify({ request, turn, messageId: human.id, delivery: delivery.state }, null, 2),
      );
      return request;
    }
    await pause(1000);
  }
  throw Error(
    'ordinary Bot did not create and finish a real selected-Group join request: ' + bot.slug,
  );
}
async function seedDecisions() {
  const suffix = Date.now().toString(36);
  const bots = [];
  for (const [index, label] of ['成员', '邀请', '接受', '拒绝', '并发'].entries()) {
    mark('seed-bot-' + index);
    const displayName = `群决定验收${label}-${suffix}`;
    const created = await humanCli('create', [
      '--name',
      displayName,
      '--operation-key',
      `group-decisions-${suffix}-${index}`,
      '--persona',
      index === 1
        ? 'You are a test helper. When invited to a Group, acknowledge briefly but do NOT accept or decline. Leave the invitation pending for the Human. Do not call group_invite_respond.'
        : 'You are a concise test helper. When the Human asks to join a selected Group, request membership and wait for their decision. Do not send messages in the Group, invite others or change settings.',
    ]);
    const slug = created.bot.id;
    if (index > 0) {
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
    }
    bots.push({ slug, displayName });
  }
  const name = '群决定验收-' + suffix;
  const created = await humanCli('group-create', [
    name,
    '--operation-key',
    'group-decisions-' + suffix,
    '--member',
    bots[0].slug,
  ]);
  const fixture = {
    channelId: created.channel.id,
    name,
    bots,
    members: [bots[0].slug],
    invitee: bots[1].slug,
    requests: {},
    invitationStatus: 'pending',
  };
  writeFileSync(resolve(out, 'decisions-fixture.json'), JSON.stringify(fixture, null, 2));
  mark('seed-pending-invitation');
  const settings = await humanCli('settings', ['botharness-client']);
  const originalPolicy = settings.value.autoAcceptGroupInvites !== false;
  let invitation;
  try {
    await humanCli('settings-set', ['botharness-client', '--patch-stdin'], {
      autoAcceptGroupInvites: false,
    });
    const state = await snapshot(fixture.channelId);
    const result = await humanCli('group-invite', [
      fixture.channelId,
      '--bot',
      bots[1].slug,
      '--operation-key',
      'pending-' + suffix,
      '--expected-channel',
      state.channelFingerprint,
    ]);
    invitation = result.channel.invitations.find(
      (item) => item.targetBotSlug === bots[1].slug && item.status === 'pending',
    );
    assert.ok(invitation, 'opt-out fixture did not create a pending invitation');
  } finally {
    await humanCli('settings-set', ['botharness-client', '--patch-stdin'], {
      autoAcceptGroupInvites: originalPolicy,
    });
  }
  fixture.invitationId = invitation.id;
  fixture.autoAccept = originalPolicy;
  writeFileSync(resolve(out, 'decisions-fixture.json'), JSON.stringify(fixture, null, 2));
  mark('seed-invitation-policy-restored');
  for (let i = 0; i < 180; i++) {
    const state = await snapshot(fixture.channelId);
    assert.equal(
      state.channel.invitations.find((item) => item.id === invitation.id)?.status,
      'pending',
      'fixture invitee decided before the Human test',
    );
    assert.equal(state.invitationPolicy.autoAccept, originalPolicy);
    const trace = await rpc('botToolTrace', { slug: bots[1].slug, turns: 20 }).catch(() => ({
      turns: [],
    }));
    assert.ok(
      !trace.turns
        .flatMap((turn) => turn.calls)
        .some((call) => call.name === 'group_invite_respond'),
      'fixture invitee attempted a decision',
    );
    if (trace.turns.some((turn) => turn.endReason === 'completed')) {
      writeFileSync(
        resolve(out, 'pending-invite-precondition.json'),
        JSON.stringify({ invitation, trace, restoredAutoAccept: originalPolicy }, null, 2),
      );
      break;
    }
    if (i === 179) throw Error('pending invitee acknowledgement turn did not complete');
    await pause(1000);
  }
  for (const [index, label] of ['accept', 'decline', 'stale'].entries()) {
    mark('seed-join-request-' + label);
    const bot = bots[index + 2];
    await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName });
    const previousMessages = new Set(
      (await rpc('channelMessages', { channelId: `dm-${bot.slug}` })).messages.map(
        (item) => item.id,
      ),
    );
    const trace = await rpc('botToolTrace', { slug: bot.slug, turns: 20 }).catch(() => ({
      turns: [],
    }));
    const previousCalls = new Set(
      trace.turns.flatMap((turn) => turn.calls).map((call) => call.callId),
    );
    const body = `请申请加入 #${name}，等待批准，不要做其他操作。`;
    const start = body.indexOf('#');
    await rpc('channelSend', {
      channelId: `dm-${bot.slug}`,
      body,
      channelRefs: [
        { channelId: fixture.channelId, label: name, start, end: start + name.length + 1 },
      ],
    });
    const request = await waitOrdinaryJoin(
      bot,
      fixture.channelId,
      previousCalls,
      previousMessages,
      body,
    );
    fixture.requests[label] = { id: request.id, slug: bot.slug, status: 'pending' };
    writeFileSync(resolve(out, 'decisions-fixture.json'), JSON.stringify(fixture, null, 2));
  }
  steps.push(
    'Preconditions only: public Human CLI creates a disposable Group; invitation opt-out is temporary and restored, invitee finishes without deciding; real ordinary Bot turns request membership from selected Human DM Group references',
  );
  return fixture;
}
function expectedChanges(fixture, key, accept) {
  return (proposal) =>
    proposal.target === fixture.channelId &&
    (key === 'invite'
      ? proposal.patch?.changes?.cancelInvitation?.id === fixture.invitationId
      : proposal.patch?.changes?.joinDecision?.id === fixture.requests[key].id &&
        proposal.patch.changes.joinDecision.accept === accept);
}
async function mutation(home, fixture, command, prompt, matches, deny = false) {
  const before = await snapshot(fixture.channelId);
  const context = await beginPrompt(home, prompt);
  const proposal = await review(home, context, command, matches, deny);
  assert.equal(proposal.patch.expectedChannel, before.channelFingerprint);
  await completeTurn(home, context, command, deny ? 'approval-denied' : undefined);
  return { before, proposal };
}
async function assertCanonical(fixture, label) {
  const state = await saveState(fixture, label);
  assert.equal(state.channel.name, fixture.name);
  assert.equal(state.invitationPolicy.autoAccept, fixture.autoAccept);
  assert.deepEqual([...state.channel.members].sort(), [...fixture.members].sort());
  assert.equal(
    state.channel.invitations.find((item) => item.id === fixture.invitationId)?.status,
    fixture.invitationStatus,
  );
  for (const request of Object.values(fixture.requests)) {
    const recorded = state.channel.joinRequests.find((item) => item.id === request.id);
    assert.equal(recorded?.status, request.status);
    if (request.status !== 'pending') assert.equal(recorded.decidedBy, 'human');
  }
  return state;
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
    phases.every((item) =>
      [
        'journey',
        'seed',
        'cancel-deny',
        'cancel',
        'join-deny',
        'join-accept',
        'join-decline',
        'stale',
        'direct',
        'restart-read',
      ].includes(item),
    ),
    'unknown phase',
  );
  const fixturePath = process.env.BH_E2E_DECISIONS_FIXTURE;
  let fixture = fixturePath ? JSON.parse(readFileSync(fixturePath, 'utf8')) : undefined;
  const saveFixture = () =>
    writeFileSync(resolve(out, 'decisions-fixture.json'), JSON.stringify(fixture, null, 2));
  if (runs('journey') || runs('seed')) {
    fixture = await seedDecisions();
    saveFixture();
    await assertCanonical(fixture, 'before');
    await inspectAttention(fixture, 'before-pending-decisions');
  }
  assert.ok(fixture, 'BH_E2E_DECISIONS_FIXTURE required');
  if (!runs('journey') && !runs('seed')) {
    await assertCanonical(fixture, 'resume-before');
    await inspectAttention(fixture, 'before-resumed-decisions');
  }
  const botName = (slug) => fixture.bots.find((bot) => bot.slug === slug).displayName;
  if (runs('journey') || runs('cancel-deny')) {
    const { before } = await mutation(
      home,
      fixture,
      'group-invite-cancel',
      `请取消“${fixture.name}”群聊发给“${botName(fixture.invitee)}”的待接受邀请。如果我拒绝审批，请停止，不要重试。`,
      expectedChanges(fixture, 'invite'),
      true,
    );
    assert.deepEqual(await snapshot(fixture.channelId), before);
    await inspectAttention(fixture, 'after-denied-cancellation');
    steps.push(
      'natural cancellation denied in rendered review returns approval-denied and preserves pending invitation and membership',
    );
  }
  if (runs('journey') || runs('cancel')) {
    await mutation(
      home,
      fixture,
      'group-invite-cancel',
      `请取消“${fixture.name}”群聊发给“${botName(fixture.invitee)}”的待接受邀请。`,
      expectedChanges(fixture, 'invite'),
    );
    fixture.invitationStatus = 'cancelled';
    saveFixture();
    await assertCanonical(fixture, 'cancelled');
    await inspectAttention(fixture, 'after-invitation-cancelled');
    steps.push(
      'natural reviewed cancellation records cancelled history; invitee never gains membership',
    );
  }
  if (runs('journey') || runs('join-deny')) {
    const { before } = await mutation(
      home,
      fixture,
      'group-join-decide',
      `请同意“${botName(fixture.requests.accept.slug)}”加入“${fixture.name}”群聊的申请。如果我拒绝审批，请停止，不要重试。`,
      expectedChanges(fixture, 'accept', true),
      true,
    );
    assert.deepEqual(await snapshot(fixture.channelId), before);
    await inspectAttention(fixture, 'after-denied-join-approval');
    steps.push(
      'denying Tob management approval preserves pending join request; it does not decline the applicant or add membership',
    );
  }
  if (runs('journey') || runs('join-accept')) {
    await mutation(
      home,
      fixture,
      'group-join-decide',
      `请同意“${botName(fixture.requests.accept.slug)}”加入“${fixture.name}”群聊的申请。`,
      expectedChanges(fixture, 'accept', true),
    );
    fixture.requests.accept.status = 'accepted';
    fixture.members = [...new Set([...fixture.members, fixture.requests.accept.slug])];
    saveFixture();
    await assertCanonical(fixture, 'join-accepted');
    await inspectAttention(fixture, 'after-join-accepted');
    steps.push(
      'natural reviewed acceptance records accepted request and adds exactly the requested Bot to visible Members',
    );
  }
  if (runs('journey') || runs('join-decline')) {
    await mutation(
      home,
      fixture,
      'group-join-decide',
      `请拒绝“${botName(fixture.requests.decline.slug)}”加入“${fixture.name}”群聊的申请。`,
      expectedChanges(fixture, 'decline', false),
    );
    fixture.requests.decline.status = 'declined';
    saveFixture();
    await assertCanonical(fixture, 'join-declined');
    await inspectAttention(fixture, 'after-join-declined');
    steps.push(
      'natural approved decline records declined history without adding the applicant to Members',
    );
  }
  if (runs('journey') || runs('stale')) {
    const before = await snapshot(fixture.channelId);
    const context = await beginPrompt(
      home,
      `请同意“${botName(fixture.requests.stale.slug)}”加入“${fixture.name}”群聊的申请。如果审批期间申请已经处理，请停止，不要重新尝试。`,
    );
    const message = await waitForApproval(
      home.channelId,
      context.previousMessages,
      context.previousCalls,
      'group-join-decide',
      expectedChanges(fixture, 'stale', true),
    );
    const proposal = JSON.parse(message.toolApprovalRequest.input);
    assert.equal(proposal.patch.expectedChannel, before.channelFingerprint);
    writeFileSync(resolve(out, 'stale-approval.json'), JSON.stringify(proposal, null, 2));
    const selector = await showApproval(message);
    await humanCli('group-join-decide', [
      fixture.channelId,
      '--request',
      fixture.requests.stale.id,
      '--decline',
      '--expected-channel',
      before.channelFingerprint,
    ]);
    fixture.requests.stale.status = 'declined';
    const independent = await assertCanonical(fixture, 'independent-decision');
    await decideApproval(selector, false);
    await completeTurn(home, context, 'group-join-decide', 'stale-channel');
    assert.deepEqual(
      await snapshot(fixture.channelId),
      independent,
      'old approval replaced a completed independent decision',
    );
    saveFixture();
    await inspectAttention(fixture, 'after-concurrent-decision-refusal');
    steps.push(
      'while Tob acceptance is pending, independent Human CLI declines the same request; old approval refuses stale-channel and preserves declined history/nonmembership',
    );
  }
  if (runs('direct')) {
    const before = await assertCanonical(fixture, 'direct-before');
    const results = {};
    if (fixture.invitationStatus !== 'pending') {
      const result = await humanCli(
        'group-invite-cancel',
        [
          fixture.channelId,
          '--invitation',
          fixture.invitationId,
          '--expected-channel',
          before.channelFingerprint,
        ],
        undefined,
        true,
      );
      assert.equal(result.error.code, 'invitation-not-pending');
      results.invitation = result.error.code;
    }
    const request = Object.values(fixture.requests).find((item) => item.status !== 'pending');
    if (request) {
      const result = await humanCli(
        'group-join-decide',
        [
          fixture.channelId,
          '--request',
          request.id,
          '--accept',
          '--expected-channel',
          before.channelFingerprint,
        ],
        undefined,
        true,
      );
      assert.equal(result.error.code, 'join-request-not-pending');
      results.request = result.error.code;
    }
    assert.ok(
      Object.keys(results).length > 0,
      'direct terminal checks require a completed decision fixture',
    );
    assert.deepEqual(await snapshot(fixture.channelId), before);
    writeFileSync(resolve(out, 'terminal-refusals.json'), JSON.stringify(results, null, 2));
    steps.push(
      'independent Human CLI refuses re-deciding settled invitation/request with current fingerprint, preserving history and membership',
    );
  }
  if (runs('restart-read')) {
    await assertCanonical(fixture, 'restart');
    await inspectAttention(fixture, 'restart-decisions');
    steps.push(
      'after external same-Profile restart, cancelled/accepted/declined records, unchanged default auto-accept policy and exact member set persist and render',
    );
  }
  saveFixture();
  mark('completed');
  await shot(phase);
  writeFileSync(
    resolve(out, 'result.json'),
    JSON.stringify({ steps, errors, channelId: fixture.channelId }, null, 2),
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
