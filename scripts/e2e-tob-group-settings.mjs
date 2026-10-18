import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const native = !!process.env.BH_DESKTOP_CDP;
const instance = native ? undefined : JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE));
const out = resolve(
  process.env.BH_E2E_EVIDENCE || '.humanlayer/verify/tob-group-settings/journey',
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
      /^(?:tob_assignment_limit_(?:read|set)|group_create|group_invite_bot|group_rename|group_remove_member|group_set_member_wake_policy)$/u.test(
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
  const wake = await humanCli('group-wake-policies', [fixture.channelId]);
  writeFileSync(resolve(out, label + '-canonical.json'), JSON.stringify({ state, wake }, null, 2));
  return { state, wake };
}
async function openGroup(fixture, label) {
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
  const present = fixture.bots.filter((bot) => !fixture.removed?.includes(bot.slug));
  const absent = fixture.bots.filter((bot) => fixture.removed?.includes(bot.slug));
  await page.waitForFunction(
    ({ present, absent }) => {
      const names = [...document.querySelectorAll('.bh-member-row .bh-name')]
        .filter((node) => node.getBoundingClientRect().width > 0)
        .map((node) => node.textContent);
      return (
        present.every((name) => names.includes(name)) &&
        absent.every((name) => !names.includes(name))
      );
    },
    {},
    {
      present: present.map((bot) => bot.displayName),
      absent: absent.map((bot) => bot.displayName),
    },
  );
  await shot(label);
}
async function inspectGroupSettings(fixture, label) {
  await click('Channel settings', '[data-dock-header="bh:channel-body"]');
  await click('Group management', '.bh-channel-settings');
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('.bh-channel-settings input')].some(
        (node) =>
          ['群名', 'Group name'].includes(node.getAttribute('aria-label')) && node.value === name,
      ),
    {},
    fixture.name,
  );
  await shot(label);
  await click('Close', '.bh-channel-settings');
}
async function inspectWake(fixture, label) {
  await openGroup(fixture, label + '-members');
  const member = fixture.bots[0];
  const row = await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('.bh-member-row')].find(
        (node) =>
          node.getBoundingClientRect().width > 0 &&
          node.querySelector('.bh-name')?.textContent === name,
      ),
    {},
    member.displayName,
  );
  const menu = await row.asElement().$('.bh-member-menu-button');
  assert.ok(menu);
  await menu.click();
  await click('Member policy');
  await page.waitForSelector('[data-member-wake-mode="mentions"][aria-pressed="true"]', {
    visible: true,
  });
  await shot(label);
  await click('Cancel', '[role="dialog"]');
}
async function seedGroup() {
  const suffix = Date.now().toString(36);
  const bots = [];
  for (const [index, label] of ['苹果', '橙子'].entries()) {
    const displayName = `群设置验收${label}-${suffix}`;
    const created = await humanCli('create', [
      '--name',
      displayName,
      '--operation-key',
      `group-settings-${suffix}-${index}`,
      '--persona',
      'A concise test helper.',
    ]);
    bots.push({ slug: created.bot.id, displayName });
  }
  const name = '群设置验收-' + suffix;
  const result = await humanCli('group-create', [
    name,
    '--operation-key',
    'group-settings-' + suffix,
    ...bots.flatMap((bot) => ['--member', bot.slug]),
  ]);
  assert.deepEqual([...result.channel.members].sort(), bots.map((bot) => bot.slug).sort());
  steps.push(
    'Human CLI seeds a two-Bot Human-owned Group only; no model is needed for preconditions',
  );
  return { channelId: result.channel.id, name, bots, removed: [], wakeMode: null };
}
function matchesGroup(fixture, predicate) {
  return (proposal) => proposal.target === fixture.channelId && predicate(proposal.patch?.changes);
}
async function reviewedMutation(home, fixture, command, prompt, matches, deny = false) {
  const before = await snapshot(fixture.channelId);
  const context = await beginPrompt(home, prompt);
  const proposal = await review(home, context, command, matchesGroup(fixture, matches), deny);
  assert.equal(proposal.patch.expectedChannel, before.channelFingerprint);
  await completeTurn(home, context, command, deny ? 'approval-denied' : undefined);
  return { before, proposal };
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
    [
      'journey',
      'seed',
      'rename',
      'wake',
      'deny',
      'stale',
      'remove',
      'avatar',
      'direct',
      'restart-read',
    ].includes(phase),
    'unknown phase',
  );
  const fixturePath = process.env.BH_E2E_GROUP_FIXTURE;
  let fixture = fixturePath ? JSON.parse(readFileSync(fixturePath, 'utf8')) : undefined;
  const saveFixture = () =>
    writeFileSync(resolve(out, 'group-fixture.json'), JSON.stringify(fixture, null, 2));
  if (
    phase === 'journey' ||
    phase === 'seed' ||
    (!fixture && ['avatar', 'direct'].includes(phase))
  ) {
    fixture = await seedGroup();
    saveFixture();
    await openGroup(fixture, 'before-group-members');
    await inspectGroupSettings(fixture, 'before-group-settings');
    await saveState(fixture, 'before');
  }
  assert.ok(fixture, 'BH_E2E_GROUP_FIXTURE required');
  if (phase === 'journey' || phase === 'rename') {
    const name = fixture.name + '-已改名';
    await reviewedMutation(
      home,
      fixture,
      'channel-rename',
      `请把“${fixture.name}”群聊改名为“${name}”。`,
      (changes) => changes?.name === name,
    );
    const state = await snapshot(fixture.channelId);
    assert.equal(state.channel.name, name);
    fixture.name = name;
    saveFixture();
    await openGroup(fixture, 'after-group-rename');
    await inspectGroupSettings(fixture, 'after-group-settings');
    await saveState(fixture, 'renamed');
    steps.push(
      'natural Home rename, actual review, completed Shell turn, canonical name and rendered Group settings agree',
    );
  }
  if (phase === 'journey' || phase === 'wake') {
    const bot = fixture.bots[0];
    await reviewedMutation(
      home,
      fixture,
      'group-wake-set',
      `请把“${fixture.name}”群聊里“${bot.displayName}”的消息提醒改成仅直接 @ 时唤醒。`,
      (changes) => changes?.wake?.botSlug === bot.slug && changes.wake.mode === 'mentions',
    );
    const { wake } = await saveState(fixture, 'wake');
    const policy = wake.members.find((member) => member.botSlug === bot.slug);
    assert.equal(policy?.inherited, false);
    assert.equal(policy.policy.mode, 'mentions');
    fixture.wakeMode = 'mentions';
    saveFixture();
    await inspectWake(fixture, 'after-member-wake-policy');
    steps.push(
      'natural member attention change, reviewed target, CLI effective policy and selected Members attention UI agree',
    );
  }
  if (phase === 'journey' || phase === 'deny') {
    const bot = fixture.bots[1];
    const { before } = await reviewedMutation(
      home,
      fixture,
      'group-member-remove',
      `请从“${fixture.name}”群聊移除“${bot.displayName}”。如果我拒绝审批，请停止，不要重试。`,
      (changes) => changes?.removeMember?.slug === bot.slug,
      true,
    );
    assert.deepEqual(await snapshot(fixture.channelId), before);
    await openGroup(fixture, 'after-denied-removal');
    steps.push(
      'visible denial returns approval-denied; membership, settings and invitations remain unchanged',
    );
  }
  if (phase === 'journey' || phase === 'stale') {
    const before = await snapshot(fixture.channelId);
    const oldName = fixture.name + '-过期请求';
    const context = await beginPrompt(
      home,
      `请把“${fixture.name}”群聊改名为“${oldName}”。如果审批期间群设置已变化，请停止，不要重新尝试。`,
    );
    const message = await waitForApproval(
      home.channelId,
      context.previousMessages,
      context.previousCalls,
      'channel-rename',
      matchesGroup(fixture, (changes) => changes?.name === oldName),
    );
    const proposal = JSON.parse(message.toolApprovalRequest.input);
    assert.equal(proposal.patch.expectedChannel, before.channelFingerprint);
    writeFileSync(resolve(out, 'stale-approval.json'), JSON.stringify(proposal, null, 2));
    const selector = await showApproval(message);
    const independentName = fixture.name + '-独立更新';
    await humanCli('channel-rename', [
      fixture.channelId,
      '--name',
      independentName,
      '--expected-channel',
      before.channelFingerprint,
    ]);
    const independent = await snapshot(fixture.channelId);
    assert.equal(independent.channel.name, independentName);
    await decideApproval(selector, false);
    await completeTurn(home, context, 'channel-rename', 'stale-channel');
    assert.deepEqual(
      await snapshot(fixture.channelId),
      independent,
      'old approval overwrote an independently changed Group',
    );
    fixture.name = independentName;
    saveFixture();
    await openGroup(fixture, 'after-stale-refusal');
    await inspectGroupSettings(fixture, 'independent-name-preserved');
    await saveState(fixture, 'stale');
    steps.push(
      'pending rename approval becomes stale after an independent Human CLI write; approving refuses stale-channel and preserves the independent name',
    );
  }
  if (phase === 'journey' || phase === 'remove') {
    const bot = fixture.bots[1];
    await reviewedMutation(
      home,
      fixture,
      'group-member-remove',
      `请从“${fixture.name}”群聊移除“${bot.displayName}”，保留其他成员。`,
      (changes) => changes?.removeMember?.slug === bot.slug,
    );
    const state = await snapshot(fixture.channelId);
    assert.ok(!state.channel.members.includes(bot.slug));
    assert.ok(state.channel.members.includes(fixture.bots[0].slug));
    fixture.removed = [bot.slug];
    saveFixture();
    await openGroup(fixture, 'after-member-removed');
    await saveState(fixture, 'removed');
    steps.push(
      'natural approved removal reaches canonical Group owner; removed Bot absent and retained Bot present in Members',
    );
  }
  if (phase === 'avatar') {
    const avatarFile = resolve(out, 'synthetic-avatar.png');
    writeFileSync(
      avatarFile,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6k1sAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    const before = await snapshot(fixture.channelId);
    await humanCli('group-avatar-set', [
      fixture.channelId,
      '--avatar-file',
      avatarFile,
      '--expected-channel',
      before.channelFingerprint,
    ]);
    assert.ok((await snapshot(fixture.channelId)).channel.avatar);
    await openGroup(fixture, 'before-avatar-clear');
    await inspectGroupSettings(fixture, 'before-avatar-settings');
    await reviewedMutation(
      home,
      fixture,
      'group-avatar-set',
      `请清除“${fixture.name}”群聊的自定义头像，恢复默认。`,
      (changes) => changes?.avatar === null,
    );
    assert.equal((await snapshot(fixture.channelId)).channel.avatar, undefined);
    await openGroup(fixture, 'after-avatar-clear');
    await inspectGroupSettings(fixture, 'after-avatar-settings');
    fixture.avatarCleared = true;
    saveFixture();
    await saveState(fixture, 'avatar');
    steps.push(
      'natural reviewed avatar clearing, canonical absence and Group settings UI readback',
    );
  }
  if (phase === 'direct') {
    const before = await snapshot(fixture.channelId);
    const changed = fixture.name + '-CLI';
    await humanCli('channel-rename', [
      fixture.channelId,
      '--name',
      changed,
      '--expected-channel',
      before.channelFingerprint,
    ]);
    const current = await snapshot(fixture.channelId);
    const stale = await humanCli(
      'group-member-remove',
      [
        fixture.channelId,
        '--bot',
        fixture.bots[1].slug,
        '--expected-channel',
        before.channelFingerprint,
      ],
      undefined,
      true,
    );
    assert.equal(stale.error.code, 'stale-channel');
    assert.deepEqual(await snapshot(fixture.channelId), current);
    fixture.name = changed;
    saveFixture();
    await openGroup(fixture, 'direct-stale-readback');
    await saveState(fixture, 'direct');
    steps.push(
      'independent Human CLI rename and stale removal refusal without a model; current membership unchanged',
    );
  }
  if (phase === 'restart-read') {
    const { state, wake } = await saveState(fixture, 'restart');
    assert.equal(state.channel.name, fixture.name);
    assert.deepEqual(
      [...state.channel.members].sort(),
      fixture.bots
        .filter((bot) => !fixture.removed.includes(bot.slug))
        .map((bot) => bot.slug)
        .sort(),
    );
    if (fixture.wakeMode) {
      const policy = wake.members.find((member) => member.botSlug === fixture.bots[0].slug);
      assert.equal(policy?.policy.mode, fixture.wakeMode);
      assert.equal(policy.inherited, false);
    }
    if (fixture.avatarCleared) assert.equal(state.channel.avatar, undefined);
    await openGroup(fixture, 'restart-members');
    await inspectGroupSettings(fixture, 'restart-settings');
    if (fixture.wakeMode === 'mentions') await inspectWake(fixture, 'restart-wake-policy');
    steps.push(
      'after an externally performed same-Profile Host restart, Group name, member removal and custom attention policy persist and render',
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
