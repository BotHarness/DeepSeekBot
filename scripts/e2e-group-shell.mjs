import { assertGroupShellProof } from './e2e-group-shell-proof.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';

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
const privateDir = resolve('.humanlayer/tasks/124-group-shell-acceptance');
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
      name: 'Group shell QA ' + stamp,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  const bots = [];
  for (const label of ['Atlas', 'Boreal', 'Quiet']) {
    const bot = (
      await rpc('create', {
        displayName: label + ' QA ' + stamp,
        persona:
          'Follow Human instructions exactly. When asked, send precisely the requested two messages using channel_send to the specified joined Group in order. Do not delegate, run commands, use other tools or add Group messages. Finish with a brief acknowledgement in the originating DM.',
      })
    ).bot;
    await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
    const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
    bots.push({ slug: bot.slug, name: bot.displayName, dm: dm.id });
  }
  const group = (
    await rpc('channelCreate', {
      name: 'Group shell QA ' + stamp,
      members: bots.map((b) => b.slug),
    })
  ).channel;
  const fallback = (
    await rpc('channelCreate', { name: 'Hashtag fallback QA ' + stamp, members: [] })
  ).channel;
  for (const b of bots)
    await rpc('channelGroupWakeSet', {
      channelId: group.id,
      botSlug: b.slug,
      mode: 'mentions',
      count: 5,
      intervalSeconds: 60,
    });
  return {
    stamp,
    route,
    bots,
    group: { id: group.id, name: group.name },
    fallback: { id: fallback.id, name: fallback.name },
  };
}
const scene = mode === 'prepare' ? await prepare() : JSON.parse(readFileSync(statePath, 'utf8'));
writeFileSync(statePath, JSON.stringify(scene, null, 2));
if (mode === 'prepare') {
  console.log(JSON.stringify({ prepared: true, group: scene.group.name }));
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
async function enter() {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((b) => ['Continue', '继续'].includes(b.textContent?.trim() ?? ''))
      ?.click(),
  );
  for (let n = 0; n < 3 && !(await page.$('.bh-main')); n++) {
    await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
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
async function open(channel) {
  const selector = '[data-channel-id="' + channel.id + '"]';
  await page.waitForSelector(selector);
  await page.click(selector);
  await page.waitForFunction(
    (name) => document.querySelector('[data-group-channel-name]')?.textContent === name,
    {},
    channel.name,
  );
}
async function pair(bot, labels) {
  const bodies = labels.map((label) => label + ' — ' + scene.stamp);
  let messages = (await rpc('channelMessages', { channelId: scene.group.id })).messages;
  if (!bodies.every((body) => messages.some((m) => m.body === body))) {
    await rpc('channelSend', {
      channelId: bot.dm,
      body:
        'Send these two exact messages to joined Group ' +
        scene.group.id +
        ' using channel_send separately in order. First: ' +
        JSON.stringify(bodies[0]) +
        '. Second: ' +
        JSON.stringify(bodies[1]) +
        '. Do not add anything to either body. No other Group messages. Acknowledge briefly in this DM after success.',
    });
    messages = await waitFor(async () => {
      const all = (await rpc('channelMessages', { channelId: scene.group.id })).messages;
      return bodies.every((body) => all.some((m) => m.body === body)) ? all : false;
    }, 'actual Bot pair ' + labels[0]);
  }
  const pair = bodies.map((body) => messages.find((m) => m.body === body));
  for (const m of pair) assert.deepEqual(m.author, { kind: 'bot', slug: bot.slug });
  assert.ok(
    Date.parse(pair[1].at) - Date.parse(pair[0].at) <= 15000,
    'pair within grouping window',
  );
  return pair;
}
const proof = {
  base: 'e8102f47e2a02b46d2c610764f8d2fbdbcaedf18',
  dsh: '0.2.0-rc.1',
  group: scene.group,
  bots: scene.bots.map(({ slug, name }) => ({ slug, name })),
  route: scene.route,
};
try {
  const a = await pair(scene.bots[0], ['Atlas first', 'Atlas second']);
  const b = await pair(scene.bots[1], ['Boreal first', 'Boreal second']);
  let human = (await rpc('channelMessages', { channelId: scene.group.id })).messages.find(
    (m) => m.body === 'Human separator — ' + scene.stamp,
  );
  if (!human)
    human = (
      await rpc('channelSend', {
        channelId: scene.group.id,
        body: 'Human separator — ' + scene.stamp,
      })
    ).message;
  const c = await pair(scene.bots[1], ['Boreal after Human first', 'Boreal after Human second']);
  let departure = (await rpc('channelMessages', { channelId: scene.group.id })).messages.find(
    (m) => m.memberDeparture?.memberId === scene.bots[2].slug,
  );
  if (!departure) {
    await rpc('channelGroupMemberRemove', {
      channelId: scene.group.id,
      botSlug: scene.bots[2].slug,
    });
    departure = (await rpc('channelMessages', { channelId: scene.group.id })).messages.find(
      (m) => m.memberDeparture?.memberId === scene.bots[2].slug,
    );
  }
  assert.ok(departure, 'actual canonical member departure');
  const d = await pair(scene.bots[1], ['Boreal after system first', 'Boreal after system second']);
  const expected = [...a, ...b, human, ...c, departure, ...d];
  for (const [before, after] of [
    [a[1], b[0]],
    [b[1], c[0]],
    [c[1], d[0]],
  ])
    assert.ok(
      Date.parse(after.at) - Date.parse(before.at) <= 15000,
      'boundary must be inside same-author grouping window',
    );
  const stored = (
    await rpc('channelMessages', { channelId: scene.group.id })
  ).messages.toReversed();
  assert.deepEqual(
    stored.map((m) => m.id),
    expected.map((m) => m.id),
    'exact canonical timeline',
  );
  assert.equal(human.author.kind, 'human');
  assert.equal(departure.author.kind, 'system');
  proof.messages = stored.map((m) => ({
    id: m.id,
    at: m.at,
    author: m.author,
    body: m.body,
    ...(m.memberDeparture ? { memberDeparture: m.memberDeparture } : {}),
  }));
  proof.native = [];
  for (const bot of scene.bots.slice(0, 2)) {
    const sessions = (await rpc('sessions', { slug: bot.slug })).sessions;
    assert.equal(sessions.filter((s) => s.role === 'assignment').length, 0);
    const owner = sessions.find((s) => s.role === 'orchestrator');
    assert.ok(owner);
    const snapshot = await nativeSnapshot(owner.sessionId);
    const calls = snapshot.records.filter(
      (r) => r.event.type === 'tool/call' && r.event.data.name === 'channel_send',
    );
    for (const call of calls) {
      const args = JSON.parse(call.event.data.arguments);
      if (args.channel_id !== scene.group.id) continue;
      const message = stored.find((m) => m.body === args.body && m.author.slug === bot.slug);
      assert.ok(message);
      const result = snapshot.records.find(
        (r) =>
          r.event.type === 'tool/result' &&
          r.event.data.message.toolCallId === call.event.data.callId,
      );
      assert.equal(
        result?.event.data.message.isError,
        false,
        'actual native channel_send succeeds',
      );
      proof.native.push({
        botSlug: bot.slug,
        sessionId: owner.sessionId,
        messageId: message.id,
        body: args.body,
        callAt: call.event.time,
        resultAt: result.event.time,
        isError: false,
      });
    }
  }
  assert.deepEqual(
    proof.native.map((n) => n.messageId).sort(),
    [...a, ...b, ...c, ...d].map((m) => m.id).sort(),
  );
  await page.setViewport({ width: 1500, height: 1000 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await enter();
  await open(scene.group);
  await page.waitForSelector('[data-message-id="' + d[1].id + '"]');
  proof.rendered = await page.evaluate(
    (ids) =>
      ids.map((id) => {
        const node = document.querySelector('[data-message-id="' + id + '"]');
        const group = node?.closest('.bh-message-group');
        const rect = node?.getBoundingClientRect();
        const avatar = group?.querySelector('.bh-message-group-avatar');
        const avatarRect = avatar?.getBoundingClientRect();
        const stackRect = group?.querySelector('.bh-message-stack')?.getBoundingClientRect();
        return {
          id,
          groupIds: group
            ? [...group.querySelectorAll('[data-message-id]')].map((n) => n.dataset.messageId)
            : [],
          size: group?.dataset.groupSize,
          headers: group?.querySelectorAll('.bh-bubble-author').length,
          avatars: group?.querySelectorAll('.bh-message-group-avatar').length,
          human: group?.classList.contains('bh-message-group-me') ?? false,
          system: node?.classList.contains('bh-member-departure') ?? false,
          avatarLeft: avatarRect?.left,
          stackLeft: stackRect?.left,
          visible: !!rect && rect.width > 0 && rect.height > 0,
        };
      }),
    expected.map((m) => m.id),
  );
  for (const pair of [a, b, c, d])
    for (const m of pair) {
      const row = proof.rendered.find((r) => r.id === m.id);
      assert.deepEqual(
        row.groupIds,
        pair.map((m) => m.id),
      );
      assert.equal(row.size, '2');
      assert.equal(row.headers, 1);
      assert.equal(row.avatars, 1);
      assert.equal(row.human, false);
      assert.ok(row.avatarLeft < row.stackLeft);
      assert.ok(row.visible);
    }
  assert.equal(proof.rendered.find((r) => r.id === human.id).human, true);
  assert.equal(proof.rendered.find((r) => r.id === departure.id).system, true);
  await page.screenshot({ path: resolve(evidence, 'group-messages-light-1500.png') });
  const avatar = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const c = canvas.getContext('2d');
    c.fillStyle = '#246b63';
    c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#fff';
    c.font = 'bold 68px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('G', 64, 64);
    return canvas.toDataURL('image/webp');
  });
  await rpc('channelGroupAvatarSet', { channelId: scene.group.id, avatar });
  await rpc('pinsSet', { pins: [scene.group.id, scene.fallback.id] });
  await page.waitForSelector(
    '.bh-pinned[data-channel-id="' + scene.group.id + '"] .bh-group-avatar-image',
  );
  const selectors = {
    custom: '.bh-pinned[data-channel-id="' + scene.group.id + '"] .bh-pinned-channel-icon',
    fallback: '.bh-pinned[data-channel-id="' + scene.fallback.id + '"] .bh-pinned-channel-icon',
  };
  async function icons(selectors) {
    return await page.evaluate(
      ({ selectors, avatar }) =>
        Object.fromEntries(
          Object.entries(selectors).map(([key, selector]) => {
            const node = document.querySelector(selector),
              img = node?.querySelector('img');
            return [
              key,
              {
                exists: !!node,
                images: node?.querySelectorAll('img').length,
                hash: !!node?.querySelector('svg'),
                loaded: !!img?.complete && img.naturalWidth === 128,
                sourceMatches: img?.src === avatar,
                radius: node ? getComputedStyle(node).borderRadius : undefined,
                overflow: node ? getComputedStyle(node).overflow : undefined,
              },
            ];
          }),
        ),
      { selectors, avatar },
    );
  }
  function checkIcons(value) {
    assert.equal(value.custom.exists, true);
    assert.equal(value.custom.images, 1);
    assert.equal(value.custom.loaded, true);
    assert.equal(value.custom.sourceMatches, true);
    assert.equal(value.custom.hash, false);
    assert.equal(value.fallback.exists, true);
    assert.equal(value.fallback.images, 0);
    assert.equal(value.fallback.hash, true);
  }
  proof.pinned = await icons(selectors);
  checkIcons(proof.pinned);
  await page.screenshot({ path: resolve(evidence, 'pinned-avatars-light-1500.png') });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.bh-pinned[data-channel-id="' + scene.group.id + '"]');
  proof.pinnedReload = await icons(selectors);
  checkIcons(proof.pinnedReload);
  await page.click('button[aria-label="收起侧边栏"],button[aria-label="Collapse sidebar"]');
  const rail = {
    custom: '.bh-rail-channel[data-channel-id="' + scene.group.id + '"] .bh-rail-channel-icon',
    fallback: '.bh-rail-channel[data-channel-id="' + scene.fallback.id + '"] .bh-rail-channel-icon',
  };
  await page.waitForSelector(rail.custom);
  proof.rail = await icons(rail);
  checkIcons(proof.rail);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.screenshot({ path: resolve(evidence, 'pinned-rail-dark-1500.png') });
  await page.setViewport({ width: 420, height: 860 });
  await page.screenshot({ path: resolve(evidence, 'group-messages-dark-420.png') });
  await page.evaluate(() => {
    const body = document.querySelector('.bh-chat-body');
    body.scrollTop = body.scrollHeight;
  });
  await page.screenshot({ path: resolve(evidence, 'group-system-break-dark-420.png') });
  proof.narrow = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(proof.narrow.scrollWidth <= proof.narrow.width, 'no horizontal overflow');
  proof.errors = errors;
  assert.deepEqual(errors, []);
  assertGroupShellProof(proof);
  writeFileSync(resolve(evidence, 'runtime-proof.json'), JSON.stringify(proof, null, 2) + '\n');
  console.log(
    JSON.stringify({
      verified: true,
      group: scene.group.name,
      nativeSends: proof.native.length,
      messages: stored.length,
      screenshots: 5,
    }),
  );
} finally {
  await browser.close();
}
