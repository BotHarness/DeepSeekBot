import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { nativeTimerCall } from './e2e-group-assignment-proof.mjs';
import { assertGroupMotionSurface } from './e2e-group-motion-proof.mjs';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const evidence = process.env.BH_E2E_EVIDENCE;
assert.ok(origin && home && evidence, 'set BH_E2E_ORIGIN, BH_E2E_HOME and BH_E2E_EVIDENCE');
const endpoint = new URL(origin);
assert.ok(
  endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname),
  'isolated loopback origin',
);
const mode = process.argv[2] ?? 'check';
const privateDir = resolve('.humanlayer/tasks/124-group-motion-matrix');
mkdirSync(privateDir, { recursive: true });
mkdirSync(evidence, { recursive: true });
const statePath = resolve(privateDir, 'qa-state.json');
const cookie = readFileSync(resolve(tmpdir(), 'dsh-' + basename(home) + '.cookies'), 'utf8').split(
  ';',
)[0];
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
async function rpc(method, args = {}, namespace = 'botharness') {
  const response = await fetch(origin + '/api/' + namespace + '/' + method, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: namespace + '/' + method,
      payload: { args },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const result = (await response.json()).result;
  assert.equal(result?.ok, true, method + ': ' + JSON.stringify(result?.error));
  return result.value;
}
async function waitFor(test, label) {
  for (let n = 0; n < 180; n++) {
    const value = await test();
    if (value) return value;
    await delay(1000);
  }
  throw Error('Timed out: ' + label);
}
async function prepare() {
  const stamp = Date.now();
  const model = (await rpc('modelCatalog')).models.find(
    (m) => m.model.includes('flash') && m.efforts.some((e) => e.id === 'low'),
  );
  assert.ok(model);
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: 'Group motion QA ' + stamp,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  const bots = [];
  for (const label of [
    'Quiet',
    'Long quiet member whose complete name must remain accessible without overflowing the Group preview',
    'Quiet three',
    'Quiet four',
    'Orbit',
  ]) {
    const bot = (
      await rpc('create', {
        displayName: label + ' QA ' + stamp,
        persona:
          'Follow Human precisely. Execute only the exact bounded native timer requested by Human, after approval. No delegation, extra commands or file modifications. After actual successful completion send the requested marker to the originating Group and end your Turn.',
      })
    ).bot;
    if (label === 'Orbit') await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
    bots.push({ slug: bot.slug, name: bot.displayName });
  }
  const owner = bots.at(-1);
  const groups = [];
  for (const count of [1, 3, 5]) {
    const members = [...bots.slice(0, count - 1), owner];
    const channel = (
      await rpc('channelCreate', {
        name: 'Group motion QA ' + stamp + ' — ' + count + ' members',
        members: members.map((b) => b.slug),
      })
    ).channel;
    for (const bot of members)
      await rpc('channelGroupWakeSet', {
        channelId: channel.id,
        botSlug: bot.slug,
        mode: 'mentions',
        count: 5,
        intervalSeconds: 60,
      });
    groups.push({ id: channel.id, name: channel.name, members });
  }
  return { route, bots, owner, groups };
}
const scene = mode === 'prepare' ? await prepare() : JSON.parse(readFileSync(statePath, 'utf8'));
writeFileSync(statePath, JSON.stringify(scene, null, 2));
if (mode === 'prepare') {
  console.log(JSON.stringify({ prepared: true, groups: scene.groups.map((g) => g.name) }));
  process.exit(0);
}
const timer = 'node -e "setTimeout(() => {}, 180000)"';
const group = scene.groups.at(-1);
const previous =
  mode === 'resume'
    ? (await rpc('channelMessages', { channelId: group.id })).messages.findLast(
        (m) => m.author.kind === 'human' && m.body.includes('GROUP_MOTION_DONE_'),
      )
    : undefined;
const marker = previous
  ? previous.body.match(/GROUP_MOTION_DONE_\d+/)[0]
  : 'GROUP_MOTION_DONE_' + Date.now();
const sent = previous
  ? { message: previous }
  : await rpc('channelSend', {
      channelId: group.id,
      body:
        '@' +
        scene.owner.name +
        ' Use native Shell exactly once with command ' +
        timer +
        ' and description "Group motion Human QA". No extra commands, files, Assignment or Subagent. After actual successful completion send ' +
        marker +
        ' with channel_send to this Group, then end.',
      mentions: [
        {
          botSlug: scene.owner.slug,
          label: scene.owner.name,
          start: 0,
          end: scene.owner.name.length + 1,
        },
      ],
    });
const dm = (await rpc('channelDm', { slug: scene.owner.slug })).channel.id;
const approval = await waitFor(async () => {
  const messages = (await rpc('channelMessages', { channelId: dm })).messages;
  const resolved = new Set(
    messages.flatMap((m) =>
      m.toolApprovalDecision ? [m.toolApprovalDecision.requestMessageId] : [],
    ),
  );
  const pending = messages.filter(
    (m) => m.at >= sent.message.at && m.toolApprovalRequest && !resolved.has(m.id),
  );
  return pending.length === 1 ? pending[0] : false;
}, 'one exact native timer approval');
assert.equal(JSON.parse(approval.toolApprovalRequest.input).command, timer);
const owned = (await rpc('sessions', { slug: scene.owner.slug })).sessions;
assert.equal(owned.filter((s) => s.role === 'assignment').length, 0);
assert.ok(
  owned.some(
    (s) => s.role === 'orchestrator' && s.sessionId === approval.toolApprovalRequest.sessionId,
  ),
);
if (mode === 'human') {
  console.log(JSON.stringify({ group: group.name, owner: scene.owner.name, pendingApprovals: 1 }));
  process.exit(0);
}
const modules = resolve('node_modules/.pnpm');
function installed(name) {
  const dir = readdirSync(modules).find((d) => d.startsWith(name + '@'));
  assert.ok(dir);
  return createRequire(resolve(modules, dir, 'node_modules/'))(name);
}
const puppeteer = installed('puppeteer');
const WebSocket = installed('ws');
async function nativeSnapshot(sessionId) {
  const socket = new WebSocket(origin.replace(/^http/, 'ws') + '/api/remote.mux', {
    headers: { cookie },
  });
  try {
    await new Promise((done, reject) => {
      socket.once('open', done);
      socket.once('error', reject);
    });
    return await new Promise((done, reject) => {
      const timeout = setTimeout(() => reject(Error('native snapshot timeout')), 20000);
      socket.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      socket.on('message', (raw) => {
        const f = JSON.parse(String(raw));
        if (f.type === 'error') {
          clearTimeout(timeout);
          reject(Error(JSON.stringify(f.error)));
        }
        if (f.type === 'item' && f.value.type === 'snapshot') {
          clearTimeout(timeout);
          done(f.value);
        }
      });
      socket.send(
        JSON.stringify({
          type: 'open',
          streamId: crypto.randomUUID(),
          endpoint: 'session/follow',
          payload: {
            args: { request: { address: { kind: 'session', sessionId }, maxMessages: 100 } },
          },
        }),
      );
    });
  } finally {
    socket.terminate();
  }
}
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
await page.emulateMediaFeatures([
  { name: 'prefers-color-scheme', value: 'light' },
  { name: 'prefers-reduced-motion', value: 'no-preference' },
]);
const split = cookie.indexOf('=');
await browser.setCookie({
  name: cookie.slice(0, split),
  value: cookie.slice(split + 1),
  domain: endpoint.hostname,
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const frames = [];
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
cdp.on('Network.eventSourceMessageReceived', (e) => {
  if (e.eventName === 'activity/snapshot') frames.push(JSON.parse(e.data));
});
const proof = { route: scene.route, cases: [], nativeTimer: undefined };
async function boot() {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((b) =>
          ['Continue', '继续'].includes(b.textContent?.trim() ?? ''),
        ),
      { timeout: 8000 },
    )
    .catch(() => undefined);
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((b) => ['Continue', '继续'].includes(b.textContent?.trim() ?? ''))
      ?.click(),
  );
  await delay(500);
  for (let n = 0; n < 3 && !(await page.$('.bh-main')); n++) {
    await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((b) => ['Configure later', '稍后配置'].includes(b.textContent?.trim() ?? ''))
        ?.click(),
    );
    await page.waitForSelector('.bh-main', { timeout: 10000 }).catch(() => undefined);
  }
  await page.waitForSelector('.bh-main');
}
async function open(g) {
  await page.waitForSelector('[data-channel-id="' + g.id + '"]');
  await page.click('[data-channel-id="' + g.id + '"]');
  await page.waitForSelector('.bh-group-channel-header');
  await page.waitForFunction(
    (name) => document.querySelector('.bh-group-channel-name')?.textContent === name,
    {},
    g.name,
  );
}
async function setPreference(preference) {
  await page.setViewport({ width: 1500, height: 1000 });
  await page.waitForSelector('.bh-panel-gear');
  await page.click('.bh-panel-gear');
  await page.waitForSelector('[data-setting="motion"] button[aria-haspopup="menu"]');
  await page.click('[data-setting="motion"] button[aria-haspopup="menu"]');
  const labels = {
    system: ['Follow system', '跟随系统'],
    reduce: ['Reduce motion', '减少动效'],
    full: ['Full motion', '完整动效'],
  }[preference];
  await page.waitForFunction(
    (labels) =>
      [...document.querySelectorAll('[role="menuitem"],[role="menuitemradio"]')].some((e) =>
        labels.includes(e.textContent?.trim() ?? ''),
      ),
    {},
    labels,
  );
  await page.evaluate(
    (labels) =>
      [...document.querySelectorAll('[role="menuitem"],[role="menuitemradio"]')]
        .find((e) => labels.includes(e.textContent?.trim() ?? ''))
        ?.click(),
    labels,
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[data-setting="motion"]'));
}
async function measure(g, preference, systemReduced, theme, width) {
  const expected = preference === 'system' ? (systemReduced ? 'reduce' : 'full') : preference;
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: theme },
    { name: 'prefers-reduced-motion', value: systemReduced ? 'reduce' : 'no-preference' },
  ]);
  await page.setViewport({ width, height: width < 500 ? 860 : 1000 });
  await open(g);
  await page.waitForFunction(
    (value) => document.documentElement.dataset.botharnessMotion === value,
    {},
    expected,
  );
  const snapshot = await waitFor(async () => {
    const s = await rpc('activitySnapshot');
    return s.bots.find((b) => b.slug === scene.owner.slug)?.state === 'working' &&
      frames.some((f) => f.generation === s.generation && f.revision === s.revision)
      ? s
      : false;
  }, 'real working snapshot + SSE');
  for (const quiet of scene.bots.slice(0, -1))
    assert.equal(snapshot.bots.find((b) => b.slug === quiet.slug).state, 'idle');
  await delay(400);
  const state = await page.$eval('.bh-group-channel-header', (node) => ({
    names: [...node.querySelectorAll('.bh-avatar-facepile-button')].map((e) =>
      e.getAttribute('aria-label'),
    ),
    overflow: node.querySelector('.bh-avatar-facepile-overflow')?.textContent ?? null,
    avatars: [...node.querySelectorAll('.bh-persona-avatar')].map((e) => ({
      title: e.title,
      state: e.dataset.state,
      active: e.dataset.active,
      infinite: e
        .getAnimations({ subtree: true })
        .filter(
          (a) => a.effect.getComputedTiming().iterations === Infinity && a.playState === 'running',
        ).length,
    })),
    movingContainer: [
      node,
      ...node.querySelectorAll('.bh-avatar-facepile,.bh-avatar-facepile-button'),
    ].reduce((count, element) => count + element.getAnimations().length, 0),
  }));
  assert.equal(state.names.length, Math.min(3, g.members.length));
  assert.ok(state.names[0].startsWith(scene.owner.name));
  assert.equal(state.overflow, g.members.length > 3 ? '+' + (g.members.length - 3) : null);
  assert.equal(state.movingContainer, 0);
  for (const avatar of state.avatars) {
    assert.equal(avatar.state, avatar.title.startsWith(scene.owner.name) ? 'working' : 'idle');
    assert.equal(avatar.infinite > 0, expected === 'full' && avatar.state === 'working');
  }
  await page.click('.bh-group-channel-name');
  await page.waitForSelector('.bh-group-live-activity-chips');
  await delay(400);
  const profile = await page.$eval('.bh-group-live-activity-chips', (node) => ({
    ids: [...node.querySelectorAll('[data-bot-id]')].map((e) => e.dataset.botId),
    overflow:
      node.querySelector('.bh-group-activity-overflow')?.textContent ??
      [...node.children].find((e) => /^\+\d+$/.test(e.textContent?.trim() ?? ''))?.textContent ??
      null,
    avatars: [...node.querySelectorAll('.bh-persona-avatar')].map((e) => ({
      id: e.closest('[data-bot-id]')?.dataset.botId,
      state: e.dataset.state,
      infinite: e
        .getAnimations({ subtree: true })
        .filter(
          (a) => a.effect.getComputedTiming().iterations === Infinity && a.playState === 'running',
        ).length,
    })),
  }));
  assert.equal(profile.ids.length, Math.min(3, g.members.length));
  assert.equal(profile.ids[0], scene.owner.slug);
  assertGroupMotionSurface(state, profile, {
    members: g.members,
    ownerId: scene.owner.slug,
    ownerName: scene.owner.name,
    count: g.members.length,
    effective: expected,
  });
  for (const a of profile.avatars)
    assert.equal(a.infinite > 0, expected === 'full' && a.state === 'working');
  const geometry = await page.evaluate(() => {
    const pop = document.querySelector('.bh-profile-popover').getBoundingClientRect();
    const header = document.querySelector('.bh-group-channel-header').getBoundingClientRect();
    return {
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
      pop: { left: pop.left, right: pop.right },
      header: { left: header.left, right: header.right },
      viewport: innerWidth,
    };
  });
  assert.equal(geometry.documentOverflow, false);
  assert.ok(geometry.pop.left >= 0 && geometry.pop.right <= width + 1);
  assert.ok(geometry.header.left >= 0 && geometry.header.right <= width + 1);
  const name =
    g.members.length +
    '-' +
    preference +
    '-' +
    (systemReduced ? 'system-reduce' : 'system-full') +
    '-' +
    theme +
    '-' +
    width;
  await page.screenshot({ path: resolve(evidence, name + '.png') });
  proof.cases.push({
    members: g.members.length,
    preference,
    systemReduced,
    effective: expected,
    theme,
    width,
    generation: snapshot.generation,
    revision: snapshot.revision,
    header: state,
    profile,
    geometry,
  });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.bh-profile-popover'));
}
try {
  await boot();
  await open(group);
  await setPreference('full');
  const decision = await rpc('toolApprovalDecide', {
    channelId: dm,
    messageId: approval.id,
    outcome: 'allowed-once',
  });
  assert.equal(decision.accepted, true);
  for (const g of scene.groups) await measure(g, 'full', false, 'light', 1500);
  await measure(group, 'full', true, 'dark', 420);
  await setPreference('reduce');
  await measure(group, 'reduce', false, 'light', 1500);
  await measure(group, 'reduce', true, 'dark', 420);
  await setPreference('system');
  await measure(group, 'system', true, 'light', 1500);
  await measure(group, 'system', false, 'dark', 420);
  proof.persistence = [];
  for (const [preference, systemReduced, expected] of [
    ['reduce', false, 'reduce'],
    ['full', true, 'full'],
  ]) {
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: systemReduced ? 'reduce' : 'no-preference' },
    ]);
    await setPreference(preference);
    await boot();
    await page.waitForFunction(
      (value) => document.documentElement.dataset.botharnessMotion === value,
      {},
      expected,
    );
    proof.persistence.push({ preference, systemReduced, effectiveAfterReload: expected });
  }
  await setPreference('system');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.waitForFunction(() => document.documentElement.dataset.botharnessMotion === 'reduce');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.waitForFunction(() => document.documentElement.dataset.botharnessMotion === 'full');
  proof.systemTracksRuntimeChange = true;
  await open(group);
  const complete = await waitFor(async () => {
    const s = await rpc('activitySnapshot');
    return s.bots.find((b) => b.slug === scene.owner.slug)?.state === 'idle' ? s : false;
  }, 'completion returns idle');
  const native = await nativeSnapshot(approval.toolApprovalRequest.sessionId);
  writeFileSync(resolve(privateDir, 'native-private.json'), JSON.stringify(native));
  const call = nativeTimerCall(native.records, Date.parse(sent.message.at), timer);
  const result = native.records.find(
    (r) => r.event.type === 'tool/result' && r.event.data.message.toolCallId === call.data.callId,
  )?.event;
  assert.ok(result);
  assert.equal(result.data.message.isError, false);
  const reply = await waitFor(
    async () =>
      (await rpc('channelMessages', { channelId: group.id })).messages.find(
        (m) =>
          m.author.kind === 'bot' &&
          m.author.slug === scene.owner.slug &&
          m.at >= sent.message.at &&
          m.body.includes(marker),
      ),
    'fresh completion reply',
  );
  assert.ok(Date.parse(reply.at) >= result.time);
  proof.nativeTimer = {
    tool: call.data.name,
    callAt: call.time,
    resultAt: result.time,
    isError: false,
  };
  proof.completion = {
    at: reply.at,
    body: reply.body,
    generation: complete.generation,
    revision: complete.revision,
  };
  assert.deepEqual(errors, []);
  proof.clientErrors = errors;
  proof.verdict = 'PASS';
  writeFileSync(resolve(evidence, 'runtime-proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({ success: true, cases: proof.cases.length, group: group.name }));
} catch (error) {
  await page.screenshot({ path: resolve(privateDir, 'failure.png') });
  writeFileSync(
    resolve(privateDir, 'failure-dom.json'),
    JSON.stringify(
      await page.evaluate(() => ({
        text: document.body.innerText.slice(-6000),
        dialogs: [...document.querySelectorAll('[role="dialog"]')].map((e) =>
          e.outerHTML.slice(0, 3000),
        ),
        menus: [...document.querySelectorAll('[role^="menu"]')].map((e) =>
          e.outerHTML.slice(0, 1500),
        ),
      })),
    ),
  );
  throw error;
} finally {
  await browser.close();
}
