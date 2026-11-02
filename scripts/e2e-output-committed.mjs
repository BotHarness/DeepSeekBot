import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
const origin = process.env.BH_E2E_ORIGIN,
  home = process.env.BH_E2E_HOME,
  evidence = process.env.BH_E2E_EVIDENCE;
assert.ok(origin && home && evidence);
const endpoint = new URL(origin);
assert.ok(
  endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname),
);
const privateDir = resolve('.humanlayer/tasks/125-output-committed');
const phase = process.argv[2] ?? 'send';
assert.ok(['send', 'restart', 'capture'].includes(phase), 'Unsupported verification phase');
const cookie = readFileSync(resolve(tmpdir(), 'dsh-' + basename(home) + '.cookies'), 'utf8').split(
  ';',
)[0];
mkdirSync(evidence, { recursive: true });
async function rpc(method, args = {}) {
  const response = await fetch(origin + '/api/botharness/' + method, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: 'botharness/' + method,
      payload: { args },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const result = (await response.json()).result;
  assert.equal(result?.ok, true, method + ': ' + JSON.stringify(result?.error));
  return result.value;
}
const readProof = () =>
  JSON.parse(readFileSync(resolve(privateDir, 'consumer-proof.json'), 'utf8'));
async function waitFor(fn, label) {
  for (let n = 0; n < 180; n++) {
    const value = await fn();
    if (value) return value;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error('Timed out: ' + label);
}
const modules = resolve('node_modules/.pnpm');
const installed = (name) =>
  createRequire(
    resolve(
      modules,
      readdirSync(modules).find((d) => d.startsWith(name + '@')),
      'node_modules/',
    ),
  )(name);
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
let scene;
if (phase === 'send') {
  const stamp = Date.now();
  const model = (await rpc('modelCatalog')).models.find(
    (m) => m.model.includes('flash') && m.efforts.some((e) => e.id === 'low'),
  );
  assert.ok(model);
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: 'Output QA ' + stamp,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  const bot = (
    await rpc('create', {
      displayName: 'Output QA ' + stamp,
      persona:
        'Use bot_send_message only to send exactly the strings requested by the Human, to the specified Channel. Do not add any other messages or acknowledgements. Never use other tools, delegate or modify files.',
    })
  ).bot;
  await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
  const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
  const group = (
    await rpc('channelCreate', { name: 'Output event QA ' + stamp, members: [bot.slug] })
  ).channel;
  scene = {
    stamp,
    bot: { id: bot.slug, name: bot.displayName },
    dm: dm.id,
    group: { id: group.id, name: group.name },
    route,
  };
  writeFileSync(resolve(privateDir, 'qa-state.json'), JSON.stringify(scene, null, 2));
  await rpc('channelSend', {
    channelId: dm.id,
    body:
      'Use bot_send_message to send exactly "DM output verified" to this DM, then exactly "Group output verified" to Channel ' +
      group.id +
      '. Send no other messages.',
  });
  await waitFor(
    () => readProof().events.some((row) => row.event.content.body === 'Group output verified'),
    'real DM and Group output',
  );
  const initial = readProof();
  assert.deepEqual(
    initial.events.map((row) => row.event.content.body),
    ['DM output verified', 'Group output verified'],
  );
  assert.equal(initial.filtered.length, 1);
  await rpc('channelSend', {
    channelId: dm.id,
    body: 'Use bot_send_message to send exactly "dispose neutral listener" to this DM. Send no other messages.',
  });
  await waitFor(() => readProof().consumerDisposed, 'Consumer Fiber disposed');
  await rpc('channelSend', {
    channelId: dm.id,
    body: 'Use bot_send_message to send exactly "cleanup proof" to this DM. Send no other messages.',
  });
  await waitFor(
    () => readProof().events.some((row) => row.event.content.body === 'cleanup proof'),
    'later output after Consumer disposal',
  );
  const proof = readProof();
  assert.equal(proof.events.length, 4);
  assert.equal(proof.filtered.length, 2);
  assert.equal(proof.syncFailures, 4);
  assert.equal(proof.asyncFailures, 4);
  assert.ok(proof.events.every((row) => row.alreadyCommitted && row.ownedSession && row.frozen));
  assert.equal(new Set(proof.events.map((row) => row.event.messageId)).size, 4);
  const snapshot = await nativeSnapshot(proof.events[0].event.sessionId);
  const nativeText = JSON.stringify(snapshot);
  assert.ok(
    nativeText.includes('bot_send_message'),
    'native Session has actual bot_send_message calls',
  );
  proof.nativeChannelSend = true;
  writeFileSync(resolve(evidence, 'before-restart-proof.json'), JSON.stringify(proof, null, 2));
  console.log(
    JSON.stringify({
      realOutputs: 4,
      consumerCleanup: true,
      failuresIsolated: true,
      nativeChannelSend: true,
    }),
  );
} else if (phase === 'restart') {
  scene = JSON.parse(readFileSync(resolve(privateDir, 'qa-state.json'), 'utf8'));
  const before = JSON.parse(readFileSync(resolve(evidence, 'before-restart-proof.json'), 'utf8'));
  const baseline = readProof();
  assert.notEqual(baseline.generation, before.generation);
  assert.equal(baseline.events.length, 0);
  const dmMessages = (await rpc('channelMessages', { channelId: scene.dm })).messages;
  const groupMessages = (await rpc('channelMessages', { channelId: scene.group.id })).messages;
  for (const row of before.events)
    assert.ok(
      [...dmMessages, ...groupMessages].some(
        (m) => m.id === row.event.messageId && m.body === row.event.content.body,
      ),
    );
  await rpc('channelSend', {
    channelId: scene.dm,
    body: 'Use bot_send_message to send exactly "restart output verified" to this DM. Send no other messages.',
  });
  await waitFor(
    () => readProof().events.some((row) => row.event.content.body === 'restart output verified'),
    'fresh output after restart',
  );
  const proof = readProof();
  assert.equal(proof.events.length, 1);
  assert.ok(proof.events.every((row) => row.alreadyCommitted && row.ownedSession && row.frozen));
  proof.durableMessagesPreserved = true;
  proof.noReplay = true;
  writeFileSync(resolve(evidence, 'after-restart-proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({ newOutput: 1, noReplay: true, durableMessagesPreserved: true }));
}
if (phase === 'capture')
  scene = JSON.parse(readFileSync(resolve(privateDir, 'qa-state.json'), 'utf8'));
const puppeteer = installed('puppeteer');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const split = cookie.indexOf('=');
  await browser.setCookie({
    name: cookie.slice(0, split),
    value: cookie.slice(split + 1),
    domain: endpoint.hostname,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((b) =>
          ['Continue', '继续'].includes(b.textContent?.trim() ?? ''),
        ),
      { timeout: 10000 },
    )
    .catch(() => undefined);
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((b) => ['Continue', '继续'].includes(b.textContent?.trim() ?? ''))
      ?.click(),
  );
  for (let n = 0; n < 3 && !(await page.$('.bh-main')); n++) {
    await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
    await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('button')].some((b) =>
            ['Configure later', '稍后配置'].includes(b.textContent?.trim() ?? ''),
          ) || document.querySelector('.bh-main'),
        { timeout: 5000 },
      )
      .catch(() => undefined);
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((b) => ['Configure later', '稍后配置'].includes(b.textContent?.trim() ?? ''))
        ?.click(),
    );
    await page.waitForSelector('.bh-main', { timeout: 10000 }).catch(() => undefined);
  }
  await page.waitForSelector('.bh-main');
  await page.waitForSelector('[data-channel-id="' + scene.dm + '"]');
  await page.click('[data-channel-id="' + scene.dm + '"]');
  await page.waitForFunction(() =>
    document.querySelector('.bh-chat-body')?.textContent.includes('cleanup proof'),
  );
  await page.screenshot({
    path: resolve(evidence, phase === 'restart' ? 'after-restart-dm.png' : 'actual-dm.png'),
  });
  if (phase !== 'restart') {
    await page.click('[data-channel-id="' + scene.group.id + '"]');
    await page.waitForFunction(() =>
      document.querySelector('.bh-chat-body')?.textContent.includes('Group output verified'),
    );
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.screenshot({ path: resolve(evidence, 'actual-group-dark.png') });
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
