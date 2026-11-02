import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const [origin, home, screenshot] = process.argv.slice(2);
if (!origin || !home || !screenshot)
  throw new Error('Usage: node scripts/e2e-subagent-routing.mjs <origin> <DSH_HOME> <screenshot>');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const cookie = readFileSync(
  resolve(tmpdir(), `dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`),
  'utf8',
).split(';')[0];
const ownershipDatabase = new DatabaseSync(resolve(home, 'botharness/botharness.db'), {
  readOnly: true,
});

async function rpc(method, args = {}) {
  const endpoint = method.includes('/') ? method : `botharness/${method}`;
  const response = await fetch(`${origin}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `subagent-routing-${Date.now()}-${Math.random()}`,
      method: endpoint,
      payload: { args },
    }),
  });
  const raw = await response.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`${endpoint}: ${response.status} ${raw.slice(0, 300)}`);
  }
  if (response.status !== 200 || body.result?.ok !== true)
    throw new Error(`${endpoint}: ${response.status} ${JSON.stringify(body.result?.error)}`);
  return body.result.value;
}

async function until(label, read, match, attempts = 180) {
  for (let index = 0; index < attempts; index += 1) {
    const value = await read();
    if (match(value)) return value;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`Timed out: ${label}`);
}

async function assignment(slug, key) {
  return until(
    `Assignment ${key}`,
    async () =>
      (await rpc('assignments', { slug })).assignments.find((item) => item.continuityKey === key),
    (item) => item !== undefined,
  );
}

async function report(slug, key, marker) {
  return until(
    `Assignment report ${marker}`,
    () => assignment(slug, key),
    (item) => item.latestReport?.summary?.includes(marker) && item.activity === 'idle',
  );
}

function childSessions(parentSessionId) {
  return ownershipDatabase
    .prepare(
      'SELECT session_id FROM session_ownership WHERE parent_session_id = ? ORDER BY created_at',
    )
    .all(parentSessionId)
    .map((row) => ({ id: row.session_id, route: lastUsed(row.session_id) }));
}

function lastUsed(sessionId) {
  const path = resolve(home, 'storages/session_projcache/sessions', `${sessionId}.json`);
  return existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8')).record?.rows?.modelSelection?.val?.lastUsed
    : undefined;
}

async function waitForChild(parentSessionId, count, route) {
  return until(
    `Subagent ${count} ${route.model}`,
    async () => childSessions(parentSessionId),
    (children) =>
      children.length >= count &&
      children.some(
        (child) =>
          child.route?.provider === route.provider &&
          child.route?.model === route.model &&
          child.route?.reasoningEffort === route.reasoningEffort,
      ),
    90,
  );
}

const models = (await rpc('modelCatalog')).models;
const flash = models.find((entry) => entry.efforts.some((effort) => effort.id === 'low'));
const pro = models.find(
  (entry) => entry.model !== flash?.model && entry.efforts.some((effort) => effort.id === 'off'),
);
if (!flash || !pro) throw new Error('Live DSH catalog lacks two routes');
const flashRoute = { provider: flash.provider, model: flash.model, reasoningEffort: 'low' };
const proRoute = { provider: pro.provider, model: pro.model, reasoningEffort: 'off' };
const stamp = Date.now();
const key = `subagent-qa-${stamp}`;
const name = `Subagent route QA ${stamp}`;
const bot = (await rpc('create', { displayName: name })).bot;
await rpc('channelDm', { slug: bot.slug, displayName: name });
const firstPreset = (
  await rpc('modelPresetCreate', {
    name: `Subagent Flash ${stamp}`,
    orchestrator: flashRoute,
    assignmentDefault: flashRoute,
  })
).preset;
await rpc('modelPresetApply', { slug: bot.slug, presetId: firstPreset.id });
const workspacePath = resolve(tmpdir(), `bh508-workspace-${stamp}`);
mkdirSync(workspacePath, { recursive: true });
const workspace = await rpc('workspace/create', { request: { path: workspacePath } });
const grant = (
  await rpc('grantCreate', { slug: bot.slug, workspaceId: workspace.workspace.workspaceId })
).grant;

await rpc('channelSend', {
  channelId: `dm-${bot.slug}`,
  body: `QA step 1: create_assignment with grant ${grant.id}, continuity key ${key}, and no model override. Purpose: call bot_subagent with run_in_background false, description "Check inherited model", prompt "Reply exactly CHILD_ONE. Do not call any tools.", and omit model fields. Then call report_to_orchestrator state completed, summary CHILD_ONE_DONE followed by the Subagent tool result. Finally bot_send_message here with the Assignment Session id. Do not use shell tools in this QA.`,
});
const first = await report(bot.slug, key, 'CHILD_ONE_DONE');
console.log('Phase one report:', JSON.stringify(first.latestReport));
console.log('Phase one children:', JSON.stringify(childSessions(first.sessionId)));
if (!first.latestReport.summary.includes('CHILD_ONE'))
  throw new Error('The inherited child did not produce the requested real model reply');
await waitForChild(first.sessionId, 1, flashRoute);

await rpc('channelSend', {
  channelId: `dm-${bot.slug}`,
  body: `QA step 2: send_assignment_request to existing Session ${first.sessionId}, next-turn, with text: "Call bot_subagent with run_in_background false, description 'Reject old choice', prompt 'Do not run', provider ${proRoute.provider}, model ${proRoute.model}, reasoning_effort off. This model is outside the current Bot Assignment set. Then report_to_orchestrator state completed, summary DENIED and the exact Subagent tool error." Do not create another Assignment.`,
});
const denied = await report(bot.slug, key, 'DENIED');
if (childSessions(first.sessionId).length !== 1)
  throw new Error('Denied explicit selection created a child Session');

const nextPreset = (
  await rpc('modelPresetCreate', {
    name: `Subagent Pro ${stamp}`,
    orchestrator: flashRoute,
    assignmentDefault: proRoute,
  })
).preset;
await rpc('modelPresetApply', { slug: bot.slug, presetId: nextPreset.id });
if (JSON.stringify((await assignment(bot.slug, key)).modelRoute) !== JSON.stringify(flashRoute))
  throw new Error('Preset change altered the retained Assignment route');

await rpc('channelSend', {
  channelId: `dm-${bot.slug}`,
  body: `QA step 3: send_assignment_request to existing Session ${first.sessionId}, next-turn, with text: "Call bot_subagent with run_in_background false, description 'Check current default', prompt 'Reply exactly CHILD_TWO. Do not call any tools.', omit all model fields. Then report_to_orchestrator state completed, summary FALLBACK followed by the Subagent tool result, including its route notice." Do not create another Assignment or use shell tools.`,
});
const fallback = await report(bot.slug, key, 'FALLBACK');
const children = await waitForChild(first.sessionId, 2, proRoute);
if (!fallback.latestReport.summary.includes('Assignment default'))
  throw new Error('Parent Assignment did not report the effective-route notice');

await rpc('channelSend', {
  channelId: `dm-${bot.slug}`,
  body: `QA final: use bot_send_message here to summarize the verified Assignment ${first.sessionId} route results. Include marker SUBAGENT_ROUTE_QA, CHILD_ONE, DENIED, and CHILD_TWO, and state that the second child used ${proRoute.model}/off after the preset changed.`,
});
await until(
  'Bot QA summary',
  async () => (await rpc('channelMessages', { channelId: `dm-${bot.slug}` })).messages,
  (messages) =>
    messages.some(
      (message) =>
        message.author?.kind === 'bot' &&
        message.body.includes('SUBAGENT_ROUTE_QA') &&
        message.body.includes('CHILD_TWO'),
    ),
);

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1050 });
  await page.setExtraHTTPHeaders({ cookie });
  const mode = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(mode, { timeout: 30000 });
    await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('button')).some((button) =>
            ['Continue', '继续'].includes(button.textContent?.trim() ?? ''),
          ),
        { timeout: 3000 },
      )
      .catch(() => undefined);
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
        ?.click(),
    );
    try {
      await page.waitForSelector(mode, { timeout: 30000 });
      if (!(await page.$('.bh-root'))) await page.click(mode);
      await page.waitForFunction(
        () =>
          document.querySelector('.bh-root') !== null ||
          Array.from(document.querySelectorAll('button')).some((button) =>
            ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''),
          ),
        { timeout: 30000 },
      );
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .find((button) =>
            ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''),
          )
          ?.click(),
      );
      await page.waitForSelector('.bh-root', { timeout: 30000 });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  await page.waitForSelector(`.bh-root [data-channel-id="dm-${bot.slug}"]`, { timeout: 30000 });
  await page.click(`.bh-root [data-channel-id="dm-${bot.slug}"]`);
  await page.waitForFunction(() => document.body.innerText.includes('SUBAGENT_ROUTE_QA'), {
    timeout: 30000,
  });
  await page.screenshot({ path: screenshot, fullPage: false });
} finally {
  await browser.close();
}

console.log(
  JSON.stringify({
    ok: true,
    name,
    slug: bot.slug,
    assignmentSessionId: first.sessionId,
    retainedRoute: flashRoute,
    inheritedChildRoute: flashRoute,
    fallbackChildRoute: proRoute,
    children,
    deniedReport: denied.latestReport.summary,
    fallbackReport: fallback.latestReport.summary,
    screenshot,
  }),
);
