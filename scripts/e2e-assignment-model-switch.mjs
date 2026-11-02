import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const screenshot = process.env.BH_E2E_SCREENSHOT;
if (!origin || !home || !screenshot)
  throw new Error('Set BH_E2E_ORIGIN, BH_E2E_HOME and BH_E2E_SCREENSHOT');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const cookie = readFileSync(
  resolve(tmpdir(), `dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`),
  'utf8',
).split(';')[0];

async function rpc(method, args = {}) {
  const endpoint = method.includes('/') ? method : `botharness/${method}`;
  const response = await fetch(`${origin}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `assignment-switch-${Date.now()}-${Math.random()}`,
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

function lastUsed(sessionId) {
  const path = resolve(home, 'storages/session_projcache/sessions', `${sessionId}.json`);
  return existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8')).record?.rows?.modelSelection?.val?.lastUsed
    : undefined;
}

async function sessionRoute(sessionId, route) {
  return until(
    `DSH route ${sessionId} ${route.model}`,
    async () => lastUsed(sessionId),
    (used) =>
      used?.provider === route.provider &&
      used?.model === route.model &&
      used?.reasoningEffort === route.reasoningEffort,
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
const key = `qa-switch-${stamp}`;
const name = `Assignment switch QA ${stamp}`;
const bot = (await rpc('create', { displayName: name })).bot;
await rpc('channelDm', { slug: bot.slug, displayName: name });
const firstPreset = (
  await rpc('modelPresetCreate', {
    name: `Flash first ${stamp}`,
    orchestrator: flashRoute,
    assignmentDefault: flashRoute,
  })
).preset;
await rpc('modelPresetApply', { slug: bot.slug, presetId: firstPreset.id });
const workspacePath = resolve(tmpdir(), `bh506-workspace-${stamp}`);
mkdirSync(workspacePath, { recursive: true });
const workspace = await rpc('workspace/create', { request: { path: workspacePath } });
const grant = (
  await rpc('grantCreate', { slug: bot.slug, workspaceId: workspace.workspace.workspaceId })
).grant;

await rpc('channelSend', {
  channelId: `dm-${bot.slug}`,
  body: `QA step 1: call create_assignment with active grant ${grant.id}, continuity key ${key}, omit all model fields. Purpose: call report_to_orchestrator with state completed and exact summary PHASE_ONE. Then call bot_send_message here to confirm the Assignment Session id.`,
});
const first = await assignment(bot.slug, key);
if (JSON.stringify(first.modelRoute) !== JSON.stringify(flashRoute))
  throw new Error(`Initial route mismatch: ${JSON.stringify(first.modelRoute)}`);
await report(bot.slug, key, 'PHASE_ONE');
const initialUsed = await sessionRoute(first.sessionId, flashRoute);

const nextPreset = (
  await rpc('modelPresetCreate', {
    name: `Pro only ${stamp}`,
    orchestrator: flashRoute,
    assignmentDefault: proRoute,
  })
).preset;
const currentPlan = (await rpc('modelPresetApply', { slug: bot.slug, presetId: nextPreset.id }))
  .plan;
if (JSON.stringify((await assignment(bot.slug, key)).modelRoute) !== JSON.stringify(flashRoute))
  throw new Error('Applying new preset changed the existing Assignment route');

await rpc('channelSend', {
  channelId: `dm-${bot.slug}`,
  body: `QA step 2: inspect_assignment ${first.sessionId}; its CURRENT route must still be ${flashRoute.provider}/${flashRoute.model}/low while the NEW Assignment default is ${proRoute.provider}/${proRoute.model}/off. Then call send_assignment_request for ${first.sessionId} with text "Call report_to_orchestrator state completed summary PHASE_TWO", OMIT provider/model/effort. Afterward call bot_send_message here reporting both routes.`,
});
await report(bot.slug, key, 'PHASE_TWO');
if (JSON.stringify((await assignment(bot.slug, key)).modelRoute) !== JSON.stringify(flashRoute))
  throw new Error('Unspecified followup changed the existing Assignment route');
const retainedUsed = await sessionRoute(first.sessionId, flashRoute);

await rpc('channelSend', {
  channelId: `dm-${bot.slug}`,
  body: `QA step 3: call send_assignment_request for ${first.sessionId} with text "Do not run", provider ${flashRoute.provider}, model ${flashRoute.model}, reasoning_effort low. This route is no longer permitted by the CURRENT Bot plan; report the rejection with bot_send_message here. Do not retry with a different model yet.`,
});
await until(
  'rejection message',
  async () => (await rpc('channelMessages', { channelId: `dm-${bot.slug}` })).messages,
  (messages) =>
    messages.some(
      (message) =>
        message.author?.kind === 'bot' && /not allowed|不允许|rejected|拒绝/iu.test(message.body),
    ),
);
if (JSON.stringify((await assignment(bot.slug, key)).modelRoute) !== JSON.stringify(flashRoute))
  throw new Error('Rejected choice changed the Assignment route');

await rpc('channelSend', {
  channelId: `dm-${bot.slug}`,
  body: `QA step 4: call list_assignment_models, then call send_assignment_request for existing Session ${first.sessionId}, text "Call report_to_orchestrator state completed summary PHASE_THREE", provider ${proRoute.provider}, model ${proRoute.model}, reasoning_effort off. Then call bot_send_message here with the switched route.`,
});
const switched = await report(bot.slug, key, 'PHASE_THREE');
if (JSON.stringify(switched.modelRoute) !== JSON.stringify(proRoute))
  throw new Error(`Switched Assignment route mismatch: ${JSON.stringify(switched.modelRoute)}`);
const switchedUsed = await sessionRoute(first.sessionId, proRoute);

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
  try {
    await page.waitForSelector(`.bh-root [data-channel-id="dm-${bot.slug}"]`, { timeout: 30000 });
  } catch (error) {
    await page.screenshot({ path: screenshot.replace(/\.png$/u, '-debug.png') });
    console.log(
      'Browser state:',
      (await page.evaluate(() => document.body.innerText)).slice(0, 1800),
    );
    throw error;
  }
  await page.click(`.bh-root [data-channel-id="dm-${bot.slug}"]`);
  await page.waitForFunction(() => document.body.innerText.includes('PHASE_THREE'), {
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
    sessionId: first.sessionId,
    currentPlan,
    initialRoute: flashRoute,
    switchedRoute: proRoute,
    dshLastUsed: [initialUsed, retainedUsed, switchedUsed],
    screenshot,
  }),
);
