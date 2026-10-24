import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assignmentProbe, installed, waitFor } from './e2e-assignment-probe.mjs';
import { compactNative } from './experiment-native-wait-proof.mjs';
import { checkApprovalCapacity } from './e2e-approval-capacity-proof.mjs';

const mode = process.argv[2] ?? 'candidate';
assert.ok(['baseline', 'candidate', 'revoked'].includes(mode));
const launch = JSON.parse(readFileSync(process.env.BH_WAIT_LAUNCH, 'utf8').replace(/^\uFEFF/u, ''));
const origin = new URL(launch.url).origin;
const { rpc, nativeSnapshot, cookie } = assignmentProbe({
  origin,
  home: launch.home,
  freshConnections: true,
});
const out = resolve(
  process.env.BH_CAPACITY_OUT ?? '.humanlayer/tasks/1037/runs',
  `${mode}-${Date.now()}`,
);
mkdirSync(out, { recursive: true });
const proof = { mode, startedAt: new Date().toISOString(), observations: [] };
const mark = (kind, value) => {
  proof.observations.push({ at: new Date().toISOString(), kind, value });
  writeFileSync(resolve(out, 'private.json'), JSON.stringify(proof, null, 2));
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const browser = await installed('puppeteer').launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (e) => {
  if (['error', 'warn'].includes(e.type())) errors.push(e.text());
});
const split = cookie.indexOf('=');
await browser.setCookie({
  name: cookie.slice(0, split),
  value: cookie.slice(split + 1),
  domain: new URL(origin).hostname,
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
});
await page.setViewport({ width: 1500, height: 1100 });
let scene;
const messages = async () =>
  (await rpc('channelMessages', { channelId: scene.channelId })).messages;
const send = async (body) => {
  const messageId = 'human-' + crypto.randomUUID();
  await rpc('channelSend', { channelId: scene.channelId, messageId, body });
  mark('human-submit', { messageId, body });
};
const reply = async (marker) =>
  (await messages()).find(
    (m) => m.author.kind === 'bot' && !m.toolApprovalRequest && m.body.includes(marker),
  );
const shot = async (name) => {
  await page.evaluate(() => {
    [...document.querySelectorAll('.bh-tool-approval-card')]
      .find((card) => card.textContent.includes('original.effect'))
      ?.scrollIntoView({ block: 'center' });
  });
  await page.evaluate((prefix) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent.includes(prefix))
        node.textContent = node.textContent.split(prefix).join('[isolated QA task]');
    }
  }, resolve('.humanlayer/tasks/1037'));
  for (const theme of ['light', 'dark']) {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
    await sleep(150);
    await page.screenshot({ path: resolve(out, `${name}-${theme}.png`) });
  }
};
const decide = async (marker) => {
  await page.waitForFunction(
    (marker) => {
      const card = [...document.querySelectorAll('.bh-tool-approval-card')].find((c) =>
        c.textContent.includes(marker),
      );
      return [...(card?.querySelectorAll('button') ?? [])].some(
        (b) => ['Allow once', '仅批准这一次'].includes(b.textContent.trim()) && !b.disabled,
      );
    },
    { timeout: 30000 },
    marker,
  );
  const response = page.waitForResponse((r) =>
    r.url().endsWith('/api/botharness/toolApprovalDecide'),
  );
  void response.catch(() => undefined);
  const clicked = await page.evaluate((marker) => {
    const card = [...document.querySelectorAll('.bh-tool-approval-card')].find((c) =>
      c.textContent.includes(marker),
    );
    const button = [...(card?.querySelectorAll('button') ?? [])].find((b) =>
      ['Allow once', '仅批准这一次'].includes(b.textContent.trim()),
    );
    button?.click();
    return button !== undefined;
  }, marker);
  assert.ok(clicked, 'live approval button is missing');
  mark('web-decision', await (await response).json());
};
try {
  const settings = await rpc('describe', {}, 'settings');
  const ns = settings.namespaces.find((n) => n.value?.assignmentConcurrencyLimit !== undefined);
  assert.ok(ns, 'native Assignment limit setting missing');
  const configured = await rpc(
    'update',
    { ns: ns.ns, patch: { assignmentConcurrencyLimit: 1 }, expectedRevision: ns.revision },
    'settings',
  );
  assert.equal(configured.value.assignmentConcurrencyLimit, 1);
  mark('running-limit', { limit: 1, namespace: ns.ns });
  const bot = (
    await rpc('create', {
      displayName: `Approval capacity ${mode}`,
      persona:
        'Follow Human instructions precisely. Create only the requested Assignment. Never wait_for_assignment or poll it unless explicitly requested. End your dispatch Turn after bot_send_message. Reply to unrelated requests normally. Do not retry rejected tools. Relay completed Assignment Reports through bot_send_message.',
    })
  ).bot;
  scene = { bot, channelId: (await rpc('channelDm', { slug: bot.slug })).channel.id };
  mark('scene', scene);
  const model = (await rpc('modelCatalog')).models.find(
    (m) => m.model.includes('flash') && m.efforts.some((e) => e.id === 'low'),
  );
  assert.ok(model, 'live low-effort Flash model missing');
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: `Capacity ${Date.now()}`,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
  const workspacePath = resolve(out, 'workspace');
  mkdirSync(workspacePath, { recursive: true });
  const workspace = await rpc('create', { request: { path: workspacePath } }, 'workspace');
  const grant = (
    await rpc('grantCreate', { slug: bot.slug, workspaceId: workspace.workspace.workspaceId })
  ).grant;
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]', {
    timeout: 60000,
  });
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((b) =>
          ['Continue', '继续'].includes(b.textContent.trim()),
        ),
      { timeout: 3000 },
    )
    .catch(() => undefined);
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((b) => ['Continue', '继续'].includes(b.textContent.trim()))
      ?.click(),
  );
  for (let n = 0; n < 3 && !(await page.$('[data-channel-id]')); n++) {
    await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
    await page
      .waitForFunction(
        () =>
          document.querySelector('[data-channel-id]') ||
          [...document.querySelectorAll('button')].some((b) =>
            ['Configure later', '稍后配置'].includes(b.textContent.trim()),
          ),
        { timeout: 5000 },
      )
      .catch(() => undefined);
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((b) => ['Configure later', '稍后配置'].includes(b.textContent.trim()))
        ?.click(),
    );
    await page.waitForSelector('[data-channel-id]', { timeout: 5000 }).catch(() => undefined);
  }
  await page.waitForSelector(`[data-channel-id="${scene.channelId}"]`);
  await page.click(`[data-channel-id="${scene.channelId}"]`);
  await send('Reply using bot_send_message with exactly CAPACITY_BASELINE. Use no other tools.');
  mark('model-baseline', await waitFor(() => reply('CAPACITY_BASELINE'), 'live DM reply'));
  const originalCommand = `node -e "require('fs').writeFileSync('original.effect','ORIGINAL_1037');console.log('ORIGINAL_1037')"`;
  const competitorCommand = `node -e "require('fs').writeFileSync('competitor.started','COMPETITOR_1037');setTimeout(()=>{console.log('COMPETITOR_1037')},45000)"`;
  const tool = process.platform === 'win32' ? 'pwsh' : 'bash';
  await send(
    `Create exactly one Assignment using Grant ${grant.id}, key original-1037. Purpose: call native ${tool} exactly once with command ${JSON.stringify(originalCommand)}. Await Human approval and actual result, then report_to_orchestrator state completed with summary containing ORIGINAL_1037 and actual stdout; report failed on error. No retry. Orchestrator: bot_send_message ORIGINAL_DISPATCHED and end your Turn immediately after create_assignment. Do not wait or inspect.`,
  );
  const original = await waitFor(
    async () =>
      (await messages()).find((m) => m.toolApprovalRequest?.input.includes('original.effect')),
    'original live native approval',
  );
  mark('original-request', original);
  await waitFor(() => reply('ORIGINAL_DISPATCHED'), 'dispatch Turn Channel reply');
  const originalId = original.toolApprovalRequest.sessionId;
  mark('original-before', compactNative(await nativeSnapshot(originalId)));
  assert.equal(existsSync(resolve(workspacePath, 'original.effect')), false);
  mark('effect-before', false);
  await send(
    'Unrelated conversation: bot_send_message exactly UNRELATED_1037 now. Do not approve or cancel the pending operation.',
  );
  mark(
    'unrelated-reply',
    await waitFor(() => reply('UNRELATED_1037'), 'unrelated live model reply'),
  );
  await send(
    `Create exactly one OTHER Assignment using Grant ${grant.id}, key competitor-1037. Purpose: call native ${tool} once with command ${JSON.stringify(competitorCommand)}, await actual result then report_to_orchestrator completed COMPETITOR_1037 plus actual stdout, failed on error, no retry. Orchestrator: if created bot_send_message COMPETITOR_DISPATCHED; if capacity refused bot_send_message CAPACITY_REFUSED. Then end your Turn. Do not wait or inspect.`,
  );
  if (mode === 'baseline') {
    mark(
      'baseline-refusal',
      await waitFor(() => reply('CAPACITY_REFUSED'), 'baseline capacity refusal'),
    );
    assert.equal((await rpc('assignments', { slug: bot.slug })).assignments.length, 1);
    await shot('before');
    await decide('original.effect');
  } else {
    const competitor = await waitFor(
      async () =>
        (await messages()).find((m) => m.toolApprovalRequest?.input.includes('competitor.started')),
      'competing real Assignment approval',
    );
    mark('competitor-request', competitor);
    await waitFor(() => reply('COMPETITOR_DISPATCHED'), 'second Assignment dispatched');
    await decide('competitor.started');
    await waitFor(
      () => existsSync(resolve(workspacePath, 'competitor.started')),
      'competitor actual native body',
    );
    mark(
      'competitor-executing',
      compactNative(await nativeSnapshot(competitor.toolApprovalRequest.sessionId)),
    );
    mark('competitor-body-started', {
      marker: readFileSync(resolve(workspacePath, 'competitor.started'), 'utf8'),
    });
    assert.equal(existsSync(resolve(workspacePath, 'original.effect')), false);
    await shot('waiting-human');
    await decide('original.effect');
    await waitFor(
      async () =>
        (await rpc('toolApprovalStatus', { channelId: scene.channelId, messageId: original.id }))
          .execution === 'waiting-capacity',
      'accepted original waiting for running permit',
    );
    assert.equal(existsSync(resolve(workspacePath, 'original.effect')), false);
    mark('capacity-wait', {
      originalEffect: existsSync(resolve(workspacePath, 'original.effect')),
      status: await rpc('toolApprovalStatus', {
        channelId: scene.channelId,
        messageId: original.id,
      }),
      original: compactNative(await nativeSnapshot(originalId)),
      assignments: await rpc('assignments', { slug: bot.slug }),
    });
    await page.waitForFunction(() =>
      /等待运行名额|waiting for a running slot/.test(document.body.innerText),
    );
    await shot('waiting-capacity');
    if (mode === 'revoked')
      mark('grant-revoked', await rpc('grantRevoke', { slug: bot.slug, grantId: grant.id }));
    await waitFor(
      async () =>
        (await rpc('assignments', { slug: bot.slug })).assignments.find(
          (a) => a.sessionId === competitor.toolApprovalRequest.sessionId,
        )?.activity !== 'working',
      'competitor finished',
    );
    mark(
      'competitor-after',
      compactNative(await nativeSnapshot(competitor.toolApprovalRequest.sessionId)),
    );
  }
  if (mode === 'revoked') {
    await waitFor(
      async () =>
        (await nativeSnapshot(originalId)).records.some(
          ({ event }) =>
            event?.type === 'tool/result' &&
            event.data.message.toolCallId === original.toolApprovalRequest.callId &&
            event.data.message.isError,
        ),
      'original operation refused after revoke',
    );
    assert.equal(existsSync(resolve(workspacePath, 'original.effect')), false);
    await waitFor(
      async () =>
        (await rpc('toolApprovalStatus', { channelId: scene.channelId, messageId: original.id }))
          .execution === 'needs-repair',
      'interrupted original execution projection',
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.bh-tool-approval-card')].some(
        (card) =>
          card.textContent.includes('original.effect') &&
          /事项已中断|Assignment was interrupted/.test(card.textContent),
      ),
    );
  } else {
    await waitFor(
      () => existsSync(resolve(workspacePath, 'original.effect')),
      'same original tool actual effect',
    );
    assert.equal(readFileSync(resolve(workspacePath, 'original.effect'), 'utf8'), 'ORIGINAL_1037');
    await waitFor(() => reply('ORIGINAL_1037'), 'actual original result Channel reply');
  }
  mark('original-after', compactNative(await nativeSnapshot(originalId)));
  mark('effect-after', existsSync(resolve(workspacePath, 'original.effect')));
  const owner = (await rpc('sessions', { slug: bot.slug })).sessions.find(
    (s) => s.role === 'orchestrator',
  );
  assert.ok(owner);
  mark('orchestrator-after', compactNative(await nativeSnapshot(owner.sessionId)));
  mark('messages-after', await messages());
  mark('assignments-after', await rpc('assignments', { slug: bot.slug }));
  mark(
    'execution-after',
    await rpc('toolApprovalStatus', { channelId: scene.channelId, messageId: original.id }),
  );
  await shot('after');
  mark('client', { errors, text: await page.$eval('body', (b) => b.innerText) });
  assert.deepEqual(errors, []);
  const verification = checkApprovalCapacity(proof);
  mark('verification', verification);
  writeFileSync(resolve(out, 'evidence.json'), JSON.stringify(verification, null, 2) + '\n');
  mark('passed', { mode });
  console.log(JSON.stringify({ mode, passed: true, out }));
} catch (error) {
  mark('failure', {
    message: error.message,
    errors,
    text: await page.$eval('body', (b) => b.innerText).catch(() => ''),
  });
  if (scene !== undefined) {
    const recovery = await Promise.allSettled(
      proof.observations
        .filter((o) => o.kind === 'original-request' || o.kind === 'competitor-request')
        .map((o) =>
          rpc(
            'cancel',
            { request: { sessionId: o.value.toolApprovalRequest.sessionId } },
            'session',
          ),
        ),
    );
    mark(
      'failed-attempt-cleanup',
      recovery.map((result) => ({ status: result.status })),
    );
  }
  throw error;
} finally {
  await browser.close();
}
