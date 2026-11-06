import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const evidence = process.env.BH_E2E_EVIDENCE;
const mode = process.argv[2] ?? 'check';
assert.ok(origin && home && evidence, 'set BH_E2E_ORIGIN, HOME and EVIDENCE');
mkdirSync(evidence, { recursive: true });
const privateDir = resolve('.humanlayer/tasks/123-informational-attention');
mkdirSync(privateDir, { recursive: true });
const statePath = resolve(privateDir, 'qa-state.json');
const cookie = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(
  ';',
)[0];
async function rpc(method, args = {}, namespace = 'botharness') {
  const response = await fetch(`${origin}/api/${namespace}/${method}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: `${namespace}/${method}`,
      payload: { args },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const result = (await response.json()).result;
  assert.equal(
    result?.ok,
    true,
    `${namespace}/${method} failed: ${result?.error?.code}: ${result?.error?.message}`,
  );
  return result.value;
}
const pnpm = resolve('node_modules/.pnpm');
const pkg = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
assert.ok(pkg);
const puppeteer = createRequire(resolve(pnpm, pkg, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const clientErrors = [];
page.on('pageerror', (error) => clientErrors.push(error.message));
await page.setViewport({ width: 1500, height: 1000 });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
const separator = cookie.indexOf('=');
await browser.setCookie({
  name: cookie.slice(0, separator),
  value: cookie.slice(separator + 1),
  domain: new URL(origin).hostname,
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
});
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const frames = [];
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
cdp.on('Network.eventSourceMessageReceived', (event) => {
  if (event.eventName !== 'activity/snapshot') return;
  const value = JSON.parse(event.data);
  frames.push({
    generation: value.generation,
    revision: value.revision,
    bots: value.bots.map(({ slug, state, activity, sessions, attention }) => ({
      slug,
      state,
      activity,
      sessions,
      attention,
    })),
  });
});
async function waitFor(test, label) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const value = await test();
    if (value) return value;
    await delay(1000);
  }
  throw Error(`Timed out: ${label}`);
}
async function open(channelId) {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  await delay(500);
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  if (!(await page.$('.bh-main')))
    await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  for (let attempt = 0; attempt < 3 && !(await page.$('.bh-main')); attempt++) {
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((button) =>
          ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''),
        )
        ?.click(),
    );
    if (attempt > 0)
      await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
    await page.waitForSelector('.bh-main', { timeout: 10000 }).catch(() => {});
  }
  await page.waitForSelector(`[data-channel-id="${channelId}"]`);
  await page.click(`[data-channel-id="${channelId}"]`);
  await page.waitForSelector('.bh-composer-shell');
}
const shot = async (name) => {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent?.includes('bh123-wait-workspace-'))
        node.textContent = node.textContent.replace(
          /[A-Z]:\\Users\\[^\\]+\\AppData\\Local\\Temp\\bh123-wait-workspace-[^\s]+/g,
          '[isolated QA workspace]',
        );
    }
  });
  return page.screenshot({ path: resolve(evidence, `${name}.png`) });
};
async function host(slug) {
  const snapshot = await rpc('activitySnapshot');
  return {
    generation: snapshot.generation,
    revision: snapshot.revision,
    ...snapshot.bots.find((bot) => bot.slug === slug),
  };
}
async function prepare(displayName = 'Assignment report QA') {
  const bot = (
    await rpc('create', {
      displayName,
      persona:
        'Follow Human instructions precisely. Create the requested Assignment. Its only task is to call report_to_orchestrator with state completed and summary INFO_VERIFIED. Do not use other tools. Wait for its report then send INFO_VERIFIED to the Channel and end the Turn.',
    })
  ).bot;
  const channelId = (await rpc('channelDm', { slug: bot.slug })).channel.id;
  const model = (await rpc('modelCatalog')).models.find(
    (model) => model.model.includes('flash') && model.efforts.some((effort) => effort.id === 'low'),
  );
  assert.ok(model);
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: `${bot.displayName} ${bot.slug}`,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
  const folder = resolve(tmpdir(), `bh123-wait-workspace-${bot.slug}`);
  mkdirSync(folder, { recursive: true });
  const workspace = await rpc('create', { request: { path: folder } }, 'workspace');
  const grant = (
    await rpc('grantCreate', { slug: bot.slug, workspaceId: workspace.workspace.workspaceId })
  ).grant;
  return { slug: bot.slug, displayName: bot.displayName, channelId, grantId: grant.id };
}
async function start(scene) {
  await rpc('channelSend', {
    channelId: scene.channelId,
    messageId: `human-${crypto.randomUUID()}`,
    body: `Create exactly one new Assignment using Grant ${scene.grantId} and a new continuity key. Purpose: call report_to_orchestrator with state completed, summary INFO_VERIFIED, and expects_reply false, then end the Turn; do not use other tools. Immediately call wait_for_assignment with its session_id and timeout_seconds 120. Once returned send INFO_VERIFIED to this Channel and end.`,
  });
  const item = await waitFor(
    async () =>
      (await rpc('humanAttention', { category: 'info', botSlug: scene.slug })).items.find(
        (item) => item.kind === 'assignment-report',
      ),
    'real completed informational report',
  );
  await waitFor(async () => (await host(scene.slug)).state === 'idle', 'completed model Turn');
  return item;
}
async function assertUI(scene, present) {
  await page.waitForFunction(
    ({ channelId, present }) => {
      const avatars = [
        document.querySelector(`[data-channel-id="${channelId}"] .bh-persona-avatar`),
        document.querySelector('.bh-composer-activity-status .bh-persona-avatar'),
      ];
      return avatars.every((avatar) =>
        avatar === null
          ? !present
          : avatar.dataset.state === 'idle' &&
            !avatar.querySelector('.bh-avatar-attention') &&
            Boolean(avatar.querySelector('.bh-avatar-information')) === present,
      );
    },
    { timeout: 20000 },
    { channelId: scene.channelId, present },
  );
}
try {
  if (mode === 'overview-before') {
    const slug = (await rpc('list')).bots[0].slug;
    await open(`dm-${slug}`);
    await page.click('.bh-activity-list-entry');
    await page.waitForSelector('.bh-overview-bots');
    await delay(500);
    assert.equal(await page.$('.bh-overview-bot'), null);
    await shot('before-overview-information');
    console.log(JSON.stringify({ success: true, mode }));
  } else if (mode === 'rail' || mode === 'rail-before') {
    const scene =
      mode === 'rail' ? JSON.parse(readFileSync(statePath, 'utf8')).humanScene : (() => null)();
    const slug = scene?.slug ?? (await rpc('list')).bots[0].slug;
    const channelId = scene?.channelId ?? `dm-${slug}`;
    await open(channelId);
    await page.click('button[aria-label="收起侧边栏"],button[aria-label="Collapse sidebar"]');
    await page.waitForSelector('.bh-region-rail');
    const rail = `.bh-rail-channel[data-channel-id="${channelId}"]`;
    if (mode === 'rail') {
      await page.waitForSelector(`${rail} .bh-avatar-information`);
      const measured = await page.$eval(`${rail} .bh-avatar-information`, (badge) => {
        const r = badge.getBoundingClientRect();
        let clipped = false;
        for (let n = badge.parentElement; n; n = n.parentElement) {
          const css = getComputedStyle(n),
            box = n.getBoundingClientRect();
          if (
            ['auto', 'scroll', 'hidden', 'clip'].includes(css.overflowX) &&
            (r.left < box.left || r.right > box.right)
          )
            clipped = true;
          if (
            ['auto', 'scroll', 'hidden', 'clip'].includes(css.overflowY) &&
            (r.top < box.top || r.bottom > box.bottom)
          )
            clipped = true;
        }
        return {
          clipped,
          background: getComputedStyle(badge).backgroundColor,
          width: r.width,
          height: r.height,
        };
      });
      assert.equal(measured.clipped, false);
      await page.hover(rail);
      await page.waitForSelector('.bh-rail-preview');
      await page.waitForFunction(() =>
        document.querySelector('.bh-rail-preview')?.textContent.includes('1 条任务信息更新'),
      );
      writeFileSync(resolve(evidence, 'rail-proof.json'), JSON.stringify(measured, null, 2));
    }
    await shot(mode === 'rail' ? 'rail-information' : 'before-rail-information');
    console.log(JSON.stringify({ success: true, mode }));
  } else if (mode === 'prepare-restart') {
    const saved = JSON.parse(readFileSync(statePath, 'utf8'));
    const item = await start(saved.scene);
    writeFileSync(
      statePath,
      JSON.stringify({ ...saved, item, beforeRestart: await host(saved.scene.slug) }, null, 2),
    );
    console.log(JSON.stringify({ success: true, mode }));
  } else if (mode === 'capture-before') {
    const failed = JSON.parse(readFileSync(resolve(privateDir, 'failure.json'), 'utf8'));
    const slug = failed.frames.at(-1).bots[0].slug;
    await open(`dm-${slug}`);
    await shot('before-report-not-indicated');
    console.log(JSON.stringify({ success: true, mode }));
  } else if (mode === 'restarted') {
    const saved = JSON.parse(readFileSync(statePath, 'utf8'));
    const scene = saved.scene;
    const restarted = await host(scene.slug);
    assert.notEqual(restarted.generation, saved.beforeRestart.generation);
    assert.deepEqual(restarted.attention, { approvalCount: 0, informationalCount: 1 });
    assert.equal(restarted.state, 'idle');
    await open(scene.channelId);
    await assertUI(scene, true);
    await shot('restart-informational-idle');
    await rpc('humanAttentionIgnore', { sourceEventId: saved.item.sourceEventId });
    await assertUI(scene, false);
    await shot('restart-ignored-idle');
    const humanScene = await prepare(`Assignment report Human QA ${Date.now()}`);
    const humanItem = await start(humanScene);
    await open(humanScene.channelId);
    await assertUI(humanScene, true);
    await shot('human-qa-informational');
    writeFileSync(statePath, JSON.stringify({ ...saved, humanScene, humanItem }, null, 2));
    writeFileSync(
      resolve(evidence, 'restart-proof.json'),
      JSON.stringify(
        {
          restarted,
          cleared: await host(scene.slug),
          human: await host(humanScene.slug),
          clientErrors,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ success: true, humanQA: humanScene.displayName }));
  } else {
    const failedSlug =
      mode === 'resume'
        ? JSON.parse(readFileSync(resolve(privateDir, 'failure.json'), 'utf8')).frames.at(-1)
            .bots[0].slug
        : undefined;
    const scene = failedSlug
      ? {
          slug: failedSlug,
          displayName: 'Assignment report QA',
          channelId: `dm-${failedSlug}`,
          grantId: (await rpc('grants', { slug: failedSlug })).grants[0].id,
        }
      : await prepare();
    writeFileSync(statePath, JSON.stringify({ scene }, null, 2));
    const item = failedSlug
      ? (await rpc('humanAttention', { category: 'info', botSlug: scene.slug })).items[0]
      : await start(scene);
    await open(scene.channelId);
    const baseline = await host(scene.slug);
    if (mode === 'before') {
      assert.equal(baseline.attention, undefined);
      await assertUI(scene, false);
      await shot('before-report-not-indicated');
      console.log(JSON.stringify({ success: true, mode }));
    } else {
      assert.deepEqual(baseline.attention, { approvalCount: 0, informationalCount: 1 });
      await assertUI(scene, true);
      await shot('informational-idle-light');
      await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
      await delay(500);
      await shot('informational-idle-dark');
      await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await open(scene.channelId);
      await assertUI(scene, true);
      assert.equal((await host(scene.slug)).revision, baseline.revision);
      await page.click('.bh-activity-list-entry');
      await page.waitForSelector('.bh-overview-bot');
      const overview = (await rpc('activityOverview')).bots.find((bot) => bot.slug === scene.slug);
      assert.deepEqual(overview.attention, baseline.attention);
      await page.waitForFunction(() =>
        document.querySelector('.bh-overview-bot .bh-avatar-information'),
      );
      await shot('overview-informational');
      await open(scene.channelId);
      await page.setOfflineMode(true);
      await rpc('humanAttentionIgnore', { sourceEventId: item.sourceEventId });
      assert.equal((await host(scene.slug)).attention, undefined);
      await page.setOfflineMode(false);
      await assertUI(scene, false);
      await shot('reconnected-ignored-idle');
      const restartItem = await start(scene);
      const beforeRestart = await host(scene.slug);
      await open(scene.channelId);
      await assertUI(scene, true);
      writeFileSync(
        statePath,
        JSON.stringify({ scene, item: restartItem, beforeRestart }, null, 2),
      );
      writeFileSync(
        resolve(evidence, 'proof.json'),
        JSON.stringify(
          {
            baseline,
            overview: { state: overview.state, attention: overview.attention },
            cleared: frames
              .filter((frame) =>
                frame.bots.some((bot) => bot.slug === scene.slug && bot.attention === undefined),
              )
              .slice(-2),
            beforeRestart,
            clientErrors,
          },
          null,
          2,
        ),
      );
      assert.deepEqual(clientErrors, []);
      console.log(JSON.stringify({ success: true, mode }));
    }
  }
} catch (error) {
  await page.screenshot({ path: resolve(privateDir, 'failure.png') });
  writeFileSync(
    resolve(privateDir, 'failure.json'),
    JSON.stringify({ error: String(error), frames, clientErrors }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
