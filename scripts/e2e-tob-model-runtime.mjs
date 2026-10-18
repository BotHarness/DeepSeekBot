import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const native = !!process.env.BH_DESKTOP_CDP;
const instance = native ? undefined : JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE));
const out = resolve(
  process.env.BH_E2E_EVIDENCE || '.humanlayer/verify/tob-model-runtime/journey',
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
const phase = process.argv[2] || 'discovery';
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

async function humanCli(command, args = [], input) {
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
      if (code !== 0) reject(Error('Human CLI fixture failed with exit ' + code));
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
async function settings() {
  return (await rpc('describe', {}, 'settings')).namespaces.find(
    (x) => x.ns === 'botharness-client',
  );
}
async function waitForApproval(channelId, previousIds, previousCalls, command, matches) {
  for (let i = 0; i < 180; i++) {
    const messages = (await rpc('channelMessages', { channelId })).messages;
    for (const message of messages) {
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
async function developerUi(expected) {
  mark('settings-dismiss-bubble');
  await dismissBubble();
  const character = await page.$('.bh-companion-character');
  const box = character && (await character.boundingBox());
  if (box && box.x < 100) {
    mark('settings-clear-covered-rail');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 400, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await pause(400);
  }
  mark('settings-open');
  await click('Bot settings', '.bh-workspace-rail');
  await page.waitForSelector('[role="dialog"]', { visible: true });
  mark('settings-advanced');
  await click('Advanced', '[role="dialog"]');
  mark('settings-value');
  let selector;
  for (const label of ['开发者模式', 'Developer mode']) {
    const candidate = `::-p-aria(${JSON.stringify(label)})`;
    if (await page.$(candidate)) {
      selector = candidate;
      break;
    }
  }
  assert.ok(selector, 'Developer mode switch not found in Advanced settings');
  await page.waitForFunction(
    (value) => {
      const n = [...document.querySelectorAll('[role="switch"],input[type="checkbox"]')].find((x) =>
        ['开发者模式', 'Developer mode'].includes(x.getAttribute('aria-label')),
      );
      return (
        n &&
        (n.getAttribute('aria-checked') === String(value) ||
          ('checked' in n && n.checked === value))
      );
    },
    {},
    expected,
  );
  await shot('developer-mode-setting');
  await click('Close', '[role="dialog"]');
  mark('settings-verified');
  steps.push('real Settings UI developer mode matches canonical value ' + expected);
}
async function modelUi(route) {
  mark('model-ui-open');
  await page.locator('[data-composer-chip="model"]').click();
  await page.waitForSelector('[role="dialog"] .bh-model-picker', { visible: true });
  await click('Task model settings', '[role="dialog"]');
  await page.waitForSelector('.bh-model-entry', { visible: true });
  await page.waitForFunction(
    ({ model }) => {
      const content = document.querySelector('.bh-model-entry')?.textContent ?? '';
      return content.includes(model);
    },
    {},
    route,
  );
  await page.$eval('.bh-model-entry', (node) => node.scrollIntoView({ block: 'center' }));
  await shot('model-plan-setting');
  await click('Cancel', '[role="dialog"]');
  steps.push('real Bot model settings UI shows the approved model route');
  mark('model-ui-verified');
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

async function waitForIntroCompletion(home, prompt, previousMessageIds, previousCalls, started) {
  let sessionId, turnNumber, messageId;
  for (let i = 0; i < 120; i++) {
    const messages = (await rpc('channelMessages', { channelId: home.channelId })).messages;
    const fresh = messages.filter((message) => !previousMessageIds.has(message.id));
    assert.ok(
      !fresh.some((message) => message.toolApprovalRequest),
      'introduction proposed approval',
    );
    assert.ok(!fresh.some((message) => message.sessionFailure), 'introduction Session failed');
    const submitted = fresh.find(
      (message) => message.author.kind === 'human' && message.body === prompt,
    );
    if (submitted) messageId ??= submitted.id;
    const evidence = await newToolCalls(home.botSlug, previousCalls, sessionId);
    if (turnNumber === undefined) {
      const turn = evidence.trace.turns.find(
        (entry) =>
          Date.parse(entry.startedAt) >= started &&
          entry.calls.some(
            (call) =>
              !previousCalls.has(call.callId) &&
              ['bash', 'pwsh'].includes(call.name) &&
              JSON.stringify(call.args).includes('deepseekbot capabilities'),
          ),
      );
      if (turn) {
        sessionId = evidence.trace.sessionId;
        turnNumber = turn.turn;
      }
    }
    const turn = evidence.trace.turns.find((entry) => entry.turn === turnNumber);
    if (turn?.endReason !== undefined)
      assert.equal(turn.endReason, 'completed', 'introduction turn did not complete successfully');
    const delivery = messages
      .find((message) => message.id === messageId)
      ?.deliveries?.find((entry) => entry.botSlug === home.botSlug);
    assert.ok(
      !['retryable', 'needs-repair', 'ignored'].includes(delivery?.state),
      'submitted introduction was not handled successfully',
    );
    if (messageId && turn?.endReason === 'completed' && delivery?.state === 'handled') {
      const completion = {
        messageId,
        sessionId,
        turn: turnNumber,
        endReason: turn.endReason,
        delivery: delivery.state,
      };
      writeFileSync(
        resolve(out, 'intro-turn-completion.json'),
        JSON.stringify(completion, null, 2),
      );
      return completion;
    }
    await pause(1000);
  }
  throw Error('submitted introduction did not reach a completed native turn and handled delivery');
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

try {
  mark('entry-start');
  if (!native) {
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setLocaleOverride', { locale: 'en-US' });
    await page.setExtraHTTPHeaders({ 'accept-language': 'en-US' });
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(instance.url, { waitUntil: 'networkidle2' });
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
      'intro',
      'discovery',
      'maintenance-refusals',
      'runtime-approve',
      'runtime-deny',
      'runtime-stale',
      'model-approve',
      'restart-read',
    ].includes(phase),
    'unknown phase',
  );
  const target = process.env.BH_E2E_TARGET_BOT || home.botSlug;
  const initial = await settings();
  if (phase === 'restart-read') {
    if (process.env.BH_E2E_EXPECT_DEVELOPER !== undefined)
      assert.equal(
        initial.value.developerMode === true,
        process.env.BH_E2E_EXPECT_DEVELOPER === 'true',
      );
    await developerUi(initial.value.developerMode === true);
    writeFileSync(
      resolve(out, 'restart-setting.json'),
      JSON.stringify(
        { value: initial.value.developerMode === true, revision: initial.revision },
        null,
        2,
      ),
    );
  } else {
    const trace = await rpc('botToolTrace', { slug: home.botSlug, turns: 20 }).catch(() => ({
      turns: [],
    }));
    const previousCalls = new Set(
      trace.turns.flatMap((turn) => turn.calls).map((call) => call.callId),
    );
    const previousMessages = (await rpc('channelMessages', { channelId: home.channelId })).messages;
    const previousMessageIds = new Set(previousMessages.map((message) => message.id));
    const previousIds = new Set(
      previousMessages
        .filter((message) => message.toolApprovalRequest)
        .map((message) => message.id),
    );
    const beforePlan = await rpc('modelPlan', { slug: target });
    const previousDeveloper = initial.value.developerMode === true;
    const desiredDeveloper = !previousDeveloper;
    let command, prompt, route, maintenanceBefore;
    if (phase === 'intro') {
      prompt = process.env.BH_E2E_SIMPLE_PROMPT || '你能做什么？';
    } else if (phase === 'discovery') {
      const direct = {};
      for (const [name, args] of [
        ['model-catalog', []],
        ['list', []],
        ['model-plan', [target]],
        ['settings', ['botharness-client']],
        ['model-presets', []],
        ['telemetry-status', []],
        ['git-status', []],
        ['release-info', []],
        ['release-check', []],
      ])
        direct[name] = await humanCli(name, args);
      writeFileSync(resolve(out, 'human-cli-discovery.json'), JSON.stringify(direct, null, 2));
      prompt = `Use native bash and the scoped deepseekbot CLI only. Run separate short commands: deepseekbot capabilities; deepseekbot model-catalog; deepseekbot list; deepseekbot model-plan ${target}; deepseekbot settings botharness-client; deepseekbot model-presets; deepseekbot telemetry-status; deepseekbot git-status; deepseekbot release-info; deepseekbot release-check. Use one native Shell call per command so each result is visible. Report the available model route, this Bot model plan revision, developerMode, model presets, telemetry lock, Git availability and release status. Do not change anything, delegate, seek credentials, or inspect config files.`;
    } else if (phase === 'maintenance-refusals') {
      maintenanceBefore = {
        telemetry: await rpc('telemetryStatus'),
        release: await rpc('releaseUpdate'),
      };
      assert.ok(
        maintenanceBefore.telemetry.lockedBy,
        'refusal fixture requires environment-locked telemetry',
      );
      assert.equal(maintenanceBefore.telemetry.enabled, false);
      assert.notEqual(
        maintenanceBefore.release.status,
        'restart-required',
        'refusal fixture must have no pending restart',
      );
      assert.notEqual(
        maintenanceBefore.release.installable,
        true,
        'refusal fixture must not permit installing a release',
      );
      writeFileSync(
        resolve(out, 'maintenance-preconditions.json'),
        JSON.stringify(maintenanceBefore, null, 2),
      );
      prompt =
        'This isolated development-profile test has telemetry disabled by an environment lock and no installable release or pending restart. Use native bash and deepseekbot to exercise exactly these three expected refusals, each in its own short Shell call: deepseekbot telemetry-set --enabled; deepseekbot release-install 999.0.0 --confirm; deepseekbot release-restart --confirm. Run each once and continue to the next after its expected refusal; do not retry any command. Report each exact CLI refusal code. Do not install another version, change environment/config files, seek credentials, delegate, or work around the refusals.';
    } else if (phase === 'model-approve') {
      command = 'model-plan-customize';
      const defaultSetting = (await rpc('describe', {}, 'settings')).namespaces.find(
        (x) => x.ns === 'agent-default-model',
      );
      route = beforePlan.plan?.orchestrator ?? defaultSetting.value;
      assert.ok(route?.provider && route?.model, 'effective model route unavailable');
      prompt = `Use native bash and the scoped deepseekbot CLI. Read deepseekbot model-catalog and deepseekbot model-plan ${target}, then request approval to customize exactly this Bot's Orchestrator route to provider ${route.provider}, model ${route.model}${route.reasoningEffort ? ', reasoning effort ' + route.reasoningEffort : ''}. Invoke deepseekbot model-plan-customize ${target} with --orchestrator-provider, --orchestrator-model${route.reasoningEffort ? ', --orchestrator-effort' : ''} and --expected-revision from the read. Preserve Assignment choices and all other Bots. After approval, read back deepseekbot model-plan ${target}. Keep the same provider credential. Do not delegate or edit config files.`;
    } else {
      command = 'settings-set';
      prompt = `Use native bash to run deepseekbot settings botharness-client. Request approval to change only developerMode to ${desiredDeveloper} through deepseekbot settings-set botharness-client --patch-stdin --expected-revision REVISION --previous-value with the exact previous developerMode JSON. Pipe the patch JSON to stdin. Use separate short read/write commands. After approval read it back. If denied or stale, report the exact refusal code and stop without retrying. Do not delegate, change the model or credentials, or edit config files.`;
    }
    if (phase === 'runtime-approve' && process.env.BH_E2E_NATURAL_CHANGE === '1')
      prompt = desiredDeveloper ? '帮我开启开发者模式。' : '帮我关闭开发者模式。';
    mark('prompt-submit');
    const started = Date.now();
    const input = await page.waitForSelector('[data-home-panel] textarea');
    await input.type(prompt);
    await input.press('Enter');
    await page.waitForSelector('[data-dock-header="bh:channel-body"]');
    mark('prompt-submitted');
    if (phase === 'intro') {
      await verifyCliTrace(home.botSlug, previousCalls, ['capabilities']);
      const completion = await waitForIntroCompletion(
        home,
        prompt,
        previousMessageIds,
        previousCalls,
        started,
      );
      mark('intro-turn-completed');
      let reply;
      for (let i = 0; i < 120; i++) {
        const messages = (await rpc('channelMessages', { channelId: home.channelId })).messages;
        reply = messages.find(
          (m) =>
            m.author.kind === 'bot' &&
            !m.toolApprovalRequest &&
            !m.onboardingWelcome &&
            !m.sessionFailure &&
            Date.parse(m.at) >= started &&
            m.body,
        );
        if (reply) break;
        await pause(1000);
      }
      assert.ok(reply, 'natural capability reply missing');
      const calls = (await newToolCalls(home.botSlug, previousCalls, completion.sessionId)).calls;
      const capabilityCall = calls.find(
        (call) =>
          ['bash', 'pwsh'].includes(call.name) &&
          JSON.stringify(call.args).includes('deepseekbot capabilities'),
      );
      assert.equal(capabilityCall?.outcome, 'ok', 'capability discovery failed');
      assert.ok(
        capabilityCall?.result.includes('assignmentConcurrencyLimit'),
        'capability result missing',
      );
      assert.match(reply.body, /模型|model/iu, 'reply should explain current model capability');
      assert.match(reply.body, /[？?]/u, 'reply should invite a concrete next step');
      assert.ok(
        !calls.some((call) =>
          /deepseekbot (?:settings-set|home-model-set|model-plan-(?:set|customize|inherit|assignments-set)|model-preset-(?:create|update|apply)|telemetry-set|git-install|release-(?:install|restart))\b/u.test(
            JSON.stringify(call.args),
          ),
        ),
        'capability question must not propose a write',
      );
      const messages = (await rpc('channelMessages', { channelId: home.channelId })).messages;
      assert.equal(
        messages.filter((m) => m.toolApprovalRequest && !previousIds.has(m.id)).length,
        0,
      );
      const current = await settings();
      assert.deepEqual(current.value, initial.value, 'introduction changed global settings');
      assert.equal(current.revision, initial.revision, 'introduction changed settings revision');
      assert.deepEqual(
        await rpc('modelPlan', { slug: target }),
        beforePlan,
        'introduction changed Bot model',
      );
      await page.waitForFunction(
        (id) => !!document.querySelector(`[data-message-id="${id}"]`),
        {},
        reply.id,
      );
      await dismissBubble();
      if (await page.$('[data-home-panel]')) {
        await page.locator('.bh-workspace-rail [data-pinned-panel="bh:home"]').click();
        await page.waitForFunction(() => !document.querySelector('[data-home-panel]'));
      }
      const replySelector = `[data-message-id="${reply.id}"]`;
      for (const label of ['展开全部', 'Expand all']) {
        const button = await page.$(`${replySelector} ::-p-aria(${JSON.stringify(label)})`);
        if (button && (await button.isVisible())) await button.click();
      }
      await page.$eval(replySelector, (node) => node.scrollIntoView({ block: 'start' }));
      await pause(500);
      writeFileSync(
        resolve(out, 'natural-intro.json'),
        JSON.stringify({ prompt, completion, reply: reply.body, calls }, null, 2),
      );
      steps.push(
        'short natural question discovers installed CLI capabilities, explains models and asks a next step; no approval or mutation',
      );
    } else if (phase === 'discovery') {
      await verifyCliTrace(home.botSlug, previousCalls, [
        'capabilities',
        'model-catalog',
        'list',
        'model-plan',
        'settings',
        'model-presets',
        'telemetry-status',
        'git-status',
        'release-info',
        'release-check',
      ]);
      let reply;
      for (let i = 0; i < 120; i++) {
        const messages = (await rpc('channelMessages', { channelId: home.channelId })).messages;
        reply = messages.find(
          (m) =>
            m.author.kind === 'bot' &&
            !m.toolApprovalRequest &&
            !m.onboardingWelcome &&
            !m.sessionFailure &&
            Date.parse(m.at) >= started,
        );
        if (reply) break;
        await pause(1000);
      }
      assert.ok(reply, 'real Tob discovery reply missing');
      steps.push('direct Human CLI and real Tob native Shell model/runtime/maintenance discovery');
    } else if (phase === 'maintenance-refusals') {
      const refusals = [
        ['telemetry-set', 'telemetry-locked'],
        ['release-install', 'maintenance-unavailable'],
        ['release-restart', 'restart-not-pending'],
      ];
      await verifyCliTrace(
        home.botSlug,
        previousCalls,
        refusals.map(([name]) => name),
      );
      const evidence = await newToolCalls(home.botSlug, previousCalls);
      for (const [name, code] of refusals) {
        const calls = evidence.calls.filter(
          (call) =>
            ['bash', 'pwsh'].includes(call.name) &&
            JSON.stringify(call.args).includes('deepseekbot ' + name),
        );
        assert.equal(calls.length, 1, 'expected exactly one Shell attempt for ' + name);
        assert.ok(calls[0].result.includes(code), name + ' Shell result did not contain ' + code);
      }
      const after = {
        telemetry: await rpc('telemetryStatus'),
        release: await rpc('releaseUpdate'),
      };
      for (const key of ['enabled', 'preference', 'lockedBy'])
        assert.deepEqual(after.telemetry[key], maintenanceBefore.telemetry[key]);
      assert.equal(after.release.status, maintenanceBefore.release.status);
      const newApprovals = (
        await rpc('channelMessages', { channelId: home.channelId })
      ).messages.filter(
        (m) =>
          m.toolApprovalRequest &&
          !previousIds.has(m.id) &&
          refusals.some(([name]) => m.toolApprovalRequest.toolName === 'deepseekbot ' + name),
      );
      assert.equal(newApprovals.length, 0, 'unavailable maintenance must refuse before approval');
      writeFileSync(
        resolve(out, 'maintenance-refusals.json'),
        JSON.stringify({ refusals, calls: evidence.calls, after }, null, 2),
      );
      steps.push(
        'actual CLI refusal codes for environment-locked telemetry, unavailable release install and no pending restart; no side effects',
      );
    } else {
      mark('approval-wait');
      const message = await waitForApproval(
        home.channelId,
        previousIds,
        previousCalls,
        command,
        (proposal) =>
          proposal.target === (phase === 'model-approve' ? target : 'botharness-client') &&
          (phase === 'model-approve'
            ? proposal.patch?.orchestrator?.provider === route.provider &&
              proposal.patch?.orchestrator?.model === route.model
            : proposal.patch?.developerMode === desiredDeveloper),
      );
      const reviewed = JSON.parse(message.toolApprovalRequest.input);
      assert.equal(reviewed.command, command);
      assert.equal(
        reviewed.expectedRevision,
        phase === 'model-approve' ? (beforePlan.revision ?? 0) : initial.revision,
      );
      if (phase !== 'model-approve')
        assert.deepEqual(reviewed.previousValue, { developerMode: previousDeveloper });
      mark('approval-render');
      const selector = await showApproval(message);
      if (phase === 'runtime-stale') {
        const fresh = await settings();
        const previous = fresh.value.showBotSessions !== false;
        await humanCli(
          'settings-set',
          [
            'botharness-client',
            '--patch-stdin',
            '--expected-revision',
            String(fresh.revision),
            '--previous-value',
            JSON.stringify({ showBotSessions: previous }),
          ],
          { showBotSessions: !previous },
        );
        assert.equal((await settings()).value.showBotSessions, !previous);
        steps.push('independent Human CLI changes another field at the same Settings revision');
      }
      mark('approval-decide');
      await decideApproval(selector, phase === 'runtime-deny');
      mark('trace-wait');
      await verifyCliTrace(
        home.botSlug,
        previousCalls,
        [command],
        phase === 'runtime-deny'
          ? 'approval-denied'
          : phase === 'runtime-stale'
            ? 'stale-setting'
            : undefined,
      );
      if (phase === 'model-approve') {
        const current = await rpc('modelPlan', { slug: target });
        assert.equal(current.plan?.orchestrator.provider, route.provider);
        assert.equal(current.plan?.orchestrator.model, route.model);
        assert.ok(current.revision > (beforePlan.revision ?? 0));
        writeFileSync(
          resolve(out, 'model-plan-readback.json'),
          JSON.stringify({ target, reviewed, current }, null, 2),
        );
        steps.push('Bot model plan canonical readback; provider/model credential unchanged');
        await modelUi(route);
      } else {
        const current = await settings();
        const expected = phase === 'runtime-approve' ? desiredDeveloper : previousDeveloper;
        assert.equal(current.value.developerMode === true, expected);
        writeFileSync(
          resolve(out, 'runtime-readback.json'),
          JSON.stringify(
            {
              reviewed,
              expected,
              actual: {
                developerMode: current.value.developerMode === true,
                revision: current.revision,
              },
            },
            null,
            2,
          ),
        );
        await developerUi(expected);
      }
    }
  }
  mark('completed');
  await shot(phase);
  writeFileSync(
    resolve(out, 'result.json'),
    JSON.stringify({ steps, errors, botSlug: home.botSlug, channelId: home.channelId }, null, 2),
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
