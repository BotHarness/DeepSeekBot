import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
if (!origin || !home) throw new Error('Set BH_E2E_ORIGIN and BH_E2E_HOME');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const cookie = readFileSync(
  join(tmpdir(), `dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`),
  'utf8',
).split(';')[0];

async function rpc(method, args = {}) {
  const response = await fetch(`${origin}/api/botharness/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `group-profile-${method}-${Date.now()}`,
      method: `botharness/${method}`,
      payload: { args },
    }),
  });
  const envelope = await response.json();
  if (response.status !== 200 || envelope.result?.ok !== true) {
    throw new Error(`${method}: ${response.status} ${JSON.stringify(envelope.result?.error)}`);
  }
  return envelope.result.value;
}

const stamp = Date.now();
let bot;
let group;
if (process.env.BH_E2E_REUSE === '1') {
  group = (await rpc('channels')).channels
    .filter((channel) => channel.name.startsWith('Group Profile QA '))
    .at(-1);
  bot = { slug: group?.members[0], displayName: 'Group Profile Bot' };
} else {
  bot = (await rpc('create', { displayName: `Group Profile Bot ${stamp}` })).bot;
  if (!bot?.slug) throw new Error('QA Bot was not created');
  group = (
    await rpc('channelCreate', {
      name: `Group Profile QA ${stamp}`,
      members: [bot.slug],
    })
  ).channel;
}
if (!group?.id) throw new Error('QA Group was not created');
if (process.env.BH_E2E_REUSE !== '1') {
  await rpc('channelSend', {
    channelId: group.id,
    body: 'Group Profile QA first committed message',
  });
  await rpc('channelSend', {
    channelId: group.id,
    body: 'Group Profile QA second committed message',
  });
}
const activity = await rpc('groupProfileActivity', { channelId: group.id });
const count = activity.days.reduce((sum, day) => sum + day.count, 0);
if (
  count < 2 ||
  !activity.authors.some((entry) => entry.author.kind === 'human' && entry.total >= 2)
) {
  throw new Error('Group Profile did not aggregate committed Human messages');
}
const dm = await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName });
const dmResponse = await fetch(`${origin}/api/botharness/groupProfileActivity`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({
    type: 'client-request',
    rpcId: `group-profile-dm-reject-${stamp}`,
    method: 'botharness/groupProfileActivity',
    payload: { args: { channelId: dm.channel.id } },
  }),
});
const dmEnvelope = await dmResponse.json();
if (dmEnvelope.result?.ok !== false) throw new Error('DM must reject Group Profile activity');

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.log('Browser page error', error.message));
  await page.setViewport({ width: 1440, height: 960 });
  await page.setExtraHTTPHeaders({ cookie });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const botButton = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
  await page.waitForSelector(botButton);
  for (let attempt = 0; attempt < 3 && !(await page.$('.bh-root')); attempt += 1) {
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
        ?.click(),
    );
    await page.evaluate((selector) => document.querySelector(selector)?.click(), botButton);
    await new Promise((done) => setTimeout(done, 400));
  }
  try {
    await page.waitForSelector('.bh-root', { timeout: 10_000 });
  } catch (error) {
    console.log(
      JSON.stringify(
        await page.evaluate(() => ({
          text: document.body.textContent?.slice(0, 600),
          botButton: document.querySelector(
            'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]',
          )?.outerHTML,
        })),
      ),
    );
    throw error;
  }
  const openSidebar = await page.$('button[aria-label="Open sidebar"]');
  if (openSidebar) await openSidebar.click();
  await page.waitForSelector(`.bh-root [data-channel-id="${group.id}"]`);
  await page.click(`.bh-root [data-channel-id="${group.id}"]`);
  try {
    await page.waitForFunction(
      (name) => document.querySelector('.bh-channel-island')?.textContent?.includes(name),
      { timeout: 10_000 },
      group.name,
    );
  } catch (error) {
    console.log(
      JSON.stringify(
        await page.evaluate(() => ({
          island: document.querySelector('.bh-channel-island')?.outerHTML,
          selected: document.querySelector('.bh-root [data-channel-id][aria-current="page"]')
            ?.outerHTML,
          text: document.querySelector('.bh-root')?.textContent?.slice(0, 500),
        })),
      ),
    );
    throw error;
  }
  await page.waitForFunction(() =>
    document.querySelector('.bh-chat-pane')?.textContent?.includes('second committed message'),
  );
  await new Promise((done) => setTimeout(done, 500));
  const avatarPoint = await page.$eval('.bh-channel-island', (button) => {
    const bounds = button.getBoundingClientRect();
    return { x: bounds.x + 22, y: bounds.y + bounds.height / 2 };
  });
  await page.mouse.click(avatarPoint.x, avatarPoint.y);
  try {
    await page.waitForSelector('.bh-profile-view', { timeout: 10_000 });
  } catch (error) {
    console.log(
      JSON.stringify(
        await page.evaluate(() => ({
          island: document.querySelector('.bh-channel-island')?.outerHTML,
          body: document.querySelector('.bh-chat-pane')?.textContent?.slice(0, 400),
        })),
      ),
    );
    throw error;
  }
  if (!(await page.$('.bh-profile-view .bh-profile-heat-grid'))) {
    throw new Error('Group Profile view has no message heatmap');
  }
  await page.waitForSelector('.bh-profile-view .bh-group-profile-authors');
  const profileText = await page.$eval('.bh-profile-view', (node) => node.textContent ?? '');
  if (!profileText.includes(group.name) || !profileText.includes('2')) {
    throw new Error('Group Profile view is missing Group identity or message counts');
  }
  const screenshot = process.env.BH_E2E_SCREENSHOT;
  if (screenshot) {
    mkdirSync(dirname(screenshot), { recursive: true });
    await page.screenshot({ path: screenshot });
  }
  await page.click('.bh-profile-back');
  try {
    await page.waitForSelector('.bh-composer', { timeout: 10_000 });
  } catch (error) {
    console.log(
      JSON.stringify(
        await page.evaluate(() => ({
          view: document.querySelector('.bh-profile-view')?.outerHTML.slice(0, 200),
          pane: document.querySelector('.bh-chat-pane')?.textContent?.slice(0, 500),
          composer: document.querySelector('.bh-memory-chat-composer')?.outerHTML.slice(0, 200),
        })),
      ),
    );
    throw error;
  }
  await page.click(`.bh-root [data-channel-id="${dm.channel.id}"]`);
  await page.waitForFunction(() =>
    document.querySelector('.bh-channel-island')?.getAttribute('aria-label')?.includes('chat menu'),
  );
  console.log(
    JSON.stringify({
      groupId: group.id,
      botSlug: bot.slug,
      count,
      authors: activity.authors,
      screenshot,
      popoverScreenshot,
    }),
  );
} finally {
  await browser.close();
}
