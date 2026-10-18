import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const native = !!process.env.BH_DESKTOP_CDP;
const instance = native ? undefined : JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE));
const out = resolve(
  process.env.BH_E2E_EVIDENCE || '.humanlayer/verify/tob-bot-management/journey',
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
      if ((code !== 0) !== expectedFailure)
        reject(Error('Human CLI fixture unexpected exit ' + code));
      else {
        try {
          done(JSON.parse(stdout));
        } catch {
          reject(Error('Human CLI returned invalid JSON'));
        }
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
    calls.some((call) => /^tob_assignment_limit_(read|set)$/u.test(call.name)),
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
  if (await page.$('[data-home-panel]')) {
    await page.click('.bh-workspace-rail [data-pinned-panel="bh:home"]');
    await page.waitForFunction(() => !document.querySelector('[data-home-panel]'));
  }
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
  const crop = await page.$eval(selector, (card) => {
    const input = card.querySelector('.bh-tool-approval-input').getBoundingClientRect();
    const actions = card.querySelector('.bh-tool-approval-actions').getBoundingClientRect();
    if (input.top < 0 || actions.bottom > window.innerHeight)
      throw Error('approval payload and decision controls must both be visible');
    return {
      x: Math.max(0, Math.min(input.left, actions.left)),
      y: Math.max(0, input.top),
      width: Math.max(input.right, actions.right) - Math.max(0, Math.min(input.left, actions.left)),
      height: Math.min(window.innerHeight, actions.bottom) - Math.max(0, input.top),
    };
  });
  assert.ok(crop.width > 0 && crop.height > 0, 'approval operation is outside viewport');
  await page.screenshot({ path: resolve(out, 'approval-operation.png'), clip: crop });
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
  if (!(await page.$('[data-home-panel]')))
    await page.locator('.bh-workspace-rail [data-pinned-panel="bh:home"]').click();
  const input = await page.waitForSelector('[data-home-panel] textarea', { visible: true });
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
    const turn = evidence.trace.turns.find(
      (item) =>
        Date.parse(item.startedAt) >= context.started &&
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

function createArguments(input, operationKey) {
  assert.equal(input.avatar, undefined, 'journey fixture does not request an avatar');
  const args = ['--name', input.displayName, '--operation-key', operationKey];
  for (const [key, flag] of [
    ['description', '--description'],
    ['persona', '--persona'],
    ['coreMemory', '--core-memory'],
  ])
    if (input[key] !== undefined) args.push(flag, input[key]);
  for (const role of input.roles ?? []) args.push('--role', role);
  return args;
}

async function verifyCreated(fixture) {
  const before = await rpc('get', { slug: fixture.botSlug });
  const soul = await rpc('memoryFile', { channelId: fixture.channelId, path: 'SOUL.md' });
  const memory = await rpc('memoryFile', { channelId: fixture.channelId, path: 'MEMORY.md' });
  assert.ok(soul.file?.body.includes(fixture.personaMarker), 'initial Soul content missing');
  assert.ok(
    memory.file?.body.includes(fixture.memoryMarker),
    'initial Core Memory content missing',
  );
  const retry = await humanCli('create', createArguments(fixture.input, fixture.operationKey));
  assert.equal(retry.bot.id, fixture.botSlug);
  assert.equal(retry.operation.status, 'created');
  assert.equal(retry.operation.channelId, fixture.channelId);
  assert.deepEqual(await rpc('get', { slug: fixture.botSlug }), before, 'replay changed profile');
  assert.deepEqual(
    await rpc('memoryFile', { channelId: fixture.channelId, path: 'SOUL.md' }),
    soul,
    'replay changed Soul',
  );
  assert.deepEqual(
    await rpc('memoryFile', { channelId: fixture.channelId, path: 'MEMORY.md' }),
    memory,
    'replay changed Memory',
  );
  const bots = (await rpc('list')).bots;
  assert.equal(bots.filter((bot) => bot.slug === fixture.botSlug).length, 1);
  const channels = (await rpc('channels')).channels.filter(
    (channel) => channel.type === 'dm' && channel.botSlug === fixture.botSlug,
  );
  assert.equal(channels.length, 1);
  assert.equal(channels[0].id, fixture.channelId);
  writeFileSync(
    resolve(out, 'creation-readback.json'),
    JSON.stringify(
      {
        receipt: retry.operation,
        botSlug: fixture.botSlug,
        channelId: fixture.channelId,
        soul: soul.file,
        memory: memory.file,
      },
      null,
      2,
    ),
  );
  return before;
}

async function openCreatedDm(fixture, expectedName) {
  await dismissBubble();
  if (await page.$('[data-home-panel]'))
    await page.locator('.bh-workspace-rail [data-pinned-panel="bh:home"]').click();
  const row = `.bh-sidebar [data-channel-id=${JSON.stringify(fixture.channelId)}]`;
  const generic = `[data-dock-panel="bh:channels"] [data-channel-id=${JSON.stringify(fixture.channelId)}]`;
  const selector = (await page.$(row)) ? row : generic;
  await page.waitForSelector(selector, { visible: true });
  await page.locator(selector).click();
  await page.waitForFunction(
    (name) =>
      document.querySelector('[data-dock-header="bh:channel-body"]')?.textContent?.includes(name),
    {},
    expectedName,
  );
  await shot('created-bot-dm');
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

try {
  mark('entry-start');
  if (!native) {
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setLocaleOverride', { locale: 'en-US' });
    await page.setExtraHTTPHeaders({ 'accept-language': 'en-US' });
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  }
  for (let i = 0; i < 4; i++) {
    const label = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find(
          (n) =>
            [
              'Continue',
              '继续',
              'Configure later',
              '稍后配置',
              'Skip tutorial',
              '跳过教程',
            ].includes(n.textContent?.trim()) && n.offsetParent,
        )
        ?.textContent?.trim(),
    );
    if (!label) break;
    await click(label);
    await pause(300);
  }
  mark('entry-shell');
  await page.waitForFunction(
    () =>
      !!document.querySelector('.bh-workspace-rail') ||
      [...document.querySelectorAll('button')].some((n) =>
        ['Bot mode', 'Bot 模式'].includes(n.getAttribute('aria-label') || n.textContent?.trim()),
      ),
  );
  if (!(await page.$('.bh-workspace-rail'))) {
    const name = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((n) =>
          ['Bot mode', 'Bot 模式'].includes(n.getAttribute('aria-label') || n.textContent?.trim()),
        )
        ?.getAttribute('aria-label'),
    );
    await click(name || 'Bot mode');
  }
  await page.waitForSelector('.bh-workspace-rail', { visible: true });
  mark('entry-home');
  if (!(await page.$('[data-home-panel]')))
    await page.locator('.bh-workspace-rail [data-pinned-panel="bh:home"]').click();
  await page.waitForSelector('[data-home-panel]');
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
      'create',
      'update',
      'deny',
      'protected',
      'direct',
      'model',
      'restart-read',
    ].includes(phase),
    'unknown phase',
  );
  const fixturePath = process.env.BH_E2E_BOT_FIXTURE;
  let fixture = fixturePath ? JSON.parse(readFileSync(fixturePath, 'utf8')) : undefined;
  const saveFixture = () =>
    writeFileSync(resolve(out, 'bot-fixture.json'), JSON.stringify(fixture, null, 2));
  if (phase === 'journey' || phase === 'create') {
    const suffix = Date.now().toString(36);
    const name = 'Tob QA ' + suffix;
    const personaMarker = 'Be concise and compare fruit clearly.';
    const memoryMarker = 'The Human prefers apples to oranges.';
    const count = (await rpc('list')).bots.length;
    const prompt = `请创建一个名叫“${name}”的 Bot。SOUL.md 请写入这句原文：${personaMarker} MEMORY.md 请写入这句原文：${memoryMarker} 其他设置保持默认。`;
    mark('create-prompt');
    const context = await beginPrompt(home, prompt);
    const proposal = await review(
      home,
      context,
      'create',
      (value) =>
        value.patch?.displayName === name &&
        value.patch?.persona?.includes(personaMarker) &&
        value.patch?.coreMemory?.includes(memoryMarker),
    );
    await completeTurn(home, context, 'create');
    const receipt = await humanCli('create', createArguments(proposal.patch, proposal.target));
    assert.equal(receipt.operation.status, 'created');
    fixture = {
      botSlug: receipt.bot.id,
      channelId: receipt.operation.channelId,
      operationKey: proposal.target,
      input: proposal.patch,
      personaMarker,
      memoryMarker,
    };
    assert.equal(
      (await rpc('list')).bots.length,
      count + 1,
      'creation did not add exactly one Bot',
    );
    saveFixture();
    await verifyCreated(fixture);
    await openCreatedDm(fixture, name);
    steps.push(
      'natural Home creation, reviewed Soul and Memory, completed native turn, stable one-Bot/DM receipt and visible DM',
    );
  }
  if (phase === 'journey' || phase === 'update') {
    assert.ok(fixture, 'BH_E2E_BOT_FIXTURE required');
    const before = await rpc('get', { slug: fixture.botSlug });
    const name = fixture.input.displayName + ' Edited';
    const context = await beginPrompt(
      home,
      `把 Bot“${before.bot.displayName}”的名字改为“${name}”，其他内容不要修改。`,
    );
    const proposal = await review(
      home,
      context,
      'update',
      (value) => value.target === fixture.botSlug && value.patch?.changes?.displayName === name,
    );
    assert.equal(proposal.patch.expectedProfile, before.profileFingerprint);
    await completeTurn(home, context, 'update');
    const after = await rpc('get', { slug: fixture.botSlug });
    assert.equal(after.bot.displayName, name);
    assert.notEqual(after.profileFingerprint, before.profileFingerprint);
    fixture.expectedName = name;
    saveFixture();
    await openCreatedDm(fixture, name);
    steps.push(
      'natural profile edit reviewed observed fingerprint, canonical readback and rendered renamed DM',
    );
  }
  if (phase === 'journey' || phase === 'deny') {
    assert.ok(fixture, 'BH_E2E_BOT_FIXTURE required');
    const before = await rpc('get', { slug: fixture.botSlug });
    const name = before.bot.displayName + ' Denied';
    const context = await beginPrompt(
      home,
      `把 Bot“${before.bot.displayName}”的名字改成“${name}”。如果操作被拒绝就停止，不要重试。`,
    );
    await review(
      home,
      context,
      'update',
      (value) => value.target === fixture.botSlug && value.patch?.changes?.displayName === name,
      true,
    );
    await completeTurn(home, context, 'update', 'approval-denied');
    assert.deepEqual(await rpc('get', { slug: fixture.botSlug }), before);
    steps.push('denied profile edit returns approval-denied with unchanged profile fingerprint');
  }
  if (phase === 'journey' || phase === 'protected') {
    const before = await rpc('get', { slug: home.botSlug });
    const context = await beginPrompt(
      home,
      `这是隔离测试。请用 deepseekbot bot-delete-preview ${home.botSlug} 检查删除 Tob 是否被保护，只运行这次只读预览并报告拒绝码，不要修改任何文件、绕过保护或继续删除。`,
    );
    await completeTurn(home, context, 'bot-delete-preview', 'protected-bot');
    assert.deepEqual(await rpc('get', { slug: home.botSlug }), before);
    const approvals = (await rpc('channelMessages', { channelId: home.channelId })).messages.filter(
      (message) => !context.previousMessages.has(message.id) && message.toolApprovalRequest,
    );
    assert.equal(approvals.length, 0);
    steps.push(
      'protected Tob deletion refuses before approval and leaves canonical profile unchanged',
    );
  }
  if (phase === 'direct') {
    const suffix = Date.now().toString(36);
    const input = {
      displayName: 'CLI QA ' + suffix,
      persona: 'Be concise.',
      coreMemory: 'Remember apples.',
    };
    const key = 'human-qa-' + suffix;
    const first = await humanCli('create', createArguments(input, key));
    fixture = {
      botSlug: first.bot.id,
      channelId: first.operation.channelId,
      operationKey: key,
      input,
      personaMarker: input.persona,
      memoryMarker: input.coreMemory,
    };
    saveFixture();
    await verifyCreated(fixture);
    const conflict = await humanCli(
      'create',
      createArguments({ ...input, displayName: input.displayName + ' conflict' }, key),
      undefined,
      true,
    );
    assert.equal(conflict.error.code, 'creation-key-conflict');
    const before = await humanCli('show', [fixture.botSlug]);
    await humanCli('update', [
      fixture.botSlug,
      '--name',
      input.displayName + ' Updated',
      '--expected-profile',
      before.profileFingerprint,
    ]);
    const current = await humanCli('show', [fixture.botSlug]);
    const stale = await humanCli(
      'update',
      [
        fixture.botSlug,
        '--name',
        input.displayName + ' Stale',
        '--expected-profile',
        before.profileFingerprint,
      ],
      undefined,
      true,
    );
    assert.equal(stale.error.code, 'stale-profile');
    assert.deepEqual(await humanCli('show', [fixture.botSlug]), current);
    const protectedResult = await humanCli('bot-delete-preview', [home.botSlug], undefined, true);
    assert.equal(protectedResult.error.code, 'protected-bot');
    writeFileSync(
      resolve(out, 'direct-refusals.json'),
      JSON.stringify(
        {
          conflict: conflict.error.code,
          stale: stale.error.code,
          protected: protectedResult.error.code,
        },
        null,
        2,
      ),
    );
    steps.push(
      'Human CLI stable create/replay, conflicting payload, stale profile and protected deletion refusals',
    );
  }
  if (phase === 'model') {
    assert.ok(fixture, 'BH_E2E_BOT_FIXTURE required');
    const route = { provider: 'deepseek-official', model: 'deepseek-flash' };
    const catalog = (await rpc('modelCatalog')).models.find(
      (entry) => entry.provider === route.provider && entry.model === route.model,
    );
    assert.ok(
      catalog && !catalog.credential,
      'existing official model credential must be available',
    );
    const target = await rpc('get', { slug: fixture.botSlug });
    const before = await rpc('modelPlan', { slug: fixture.botSlug });
    const tobBefore = await rpc('modelPlan', { slug: home.botSlug });
    const context = await beginPrompt(
      home,
      `请把 Bot“${target.bot.displayName}”的主对话模型设置为 DeepSeek 官方的 ${catalog.modelName}。只修改这个 Bot 的主对话模型，其他模型和设置保持不变。`,
    );
    const proposal = await review(
      home,
      context,
      'model-plan-customize',
      (value) =>
        value.target === fixture.botSlug &&
        value.expectedRevision === (before.revision ?? 0) &&
        value.patch?.orchestrator?.provider === route.provider &&
        value.patch?.orchestrator?.model === route.model,
    );
    await completeTurn(home, context, 'model-plan-customize');
    const after = await rpc('modelPlan', { slug: fixture.botSlug });
    assert.equal(after.plan?.orchestrator.provider, route.provider);
    assert.equal(after.plan?.orchestrator.model, route.model);
    assert.ok(after.revision > (before.revision ?? 0));
    assert.deepEqual(await rpc('modelPlan', { slug: home.botSlug }), tobBefore);
    if (before.plan) {
      assert.deepEqual(after.plan.assignmentDefault, before.plan.assignmentDefault);
      assert.deepEqual(after.plan.assignmentModels, before.plan.assignmentModels);
    }
    writeFileSync(
      resolve(out, 'model-readback.json'),
      JSON.stringify({ target: fixture.botSlug, proposal, before, after }, null, 2),
    );
    await openCreatedDm(fixture, target.bot.displayName);
    await page.waitForSelector('[data-composer-chip="model"]', { visible: true });
    await page.waitForFunction(
      ({ name, model }) => {
        const chip = document.querySelector('[data-composer-chip="model"]');
        const label = chip?.getAttribute('aria-label') || '';
        return label.includes(name) && label.includes(model);
      },
      {},
      { name: target.bot.displayName, model: catalog.modelName },
    );
    const chip = await page.$eval('[data-composer-chip="model"]', (node) => ({
      label: node.getAttribute('aria-label'),
      text: node.textContent,
    }));
    writeFileSync(resolve(out, 'model-chip.json'), JSON.stringify(chip, null, 2));
    await shot('created-bot-model-configured');
    steps.push(
      'natural model request reviewed correct Bot and current revision, completed native turn, canonical Orchestrator route and visible model chip',
    );
  }
  if (phase === 'restart-read') {
    assert.ok(fixture, 'BH_E2E_BOT_FIXTURE required after restarting the same isolated Profile');
    const current = await verifyCreated(fixture);
    await openCreatedDm(fixture, fixture.expectedName || current.bot.displayName);
    steps.push(
      'same Profile restart readback preserves identity, DM, Soul, Memory and stable operation replay',
    );
  }
  mark('completed');
  await shot(phase);
  writeFileSync(
    resolve(out, 'result.json'),
    JSON.stringify(
      {
        steps,
        errors,
        botSlug: home.botSlug,
        channelId: home.channelId,
        fixture: fixture && {
          botSlug: fixture.botSlug,
          channelId: fixture.channelId,
          operationKey: fixture.operationKey,
        },
      },
      null,
      2,
    ),
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
