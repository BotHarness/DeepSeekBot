import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const home = resolve(tmpdir(), 'bh-547-reply');
const port = 31987;
const url = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}-${port}.log`), 'utf8').match(
  /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u,
)?.[0];
if (!url) throw new Error('Isolated launch unavailable');
const root = resolve(repo, 'node_modules/.pnpm');
const pkg = readdirSync(root).find((name) => name.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(root, pkg, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const out = resolve(repo, '.humanlayer/tasks/issue-547/evidence');
mkdirSync(out, { recursive: true });
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const rpc = async (method, args = {}) => {
  const envelope = await page.evaluate(
    async ({ method, args }) => {
      const response = await fetch('/api/botharness/' + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: 'botharness/' + method,
          payload: { args },
        }),
      });
      return response.json();
    },
    { method, args },
  );
  if (!envelope.result?.ok)
    throw new Error(method + ': ' + JSON.stringify(envelope.result?.error).slice(0, 300));
  return envelope.result.value;
};
const clickText = async (selector, text) => {
  const clicked = await page.evaluate(
    ({ selector, text }) => {
      const node = [...document.querySelectorAll(selector)].find(
        (node) => node.textContent?.trim() === text,
      );
      if (!node) return false;
      node.click();
      return true;
    },
    { selector, text },
  );
  if (!clicked) throw new Error('Missing control: ' + text);
};
const inbox = async () => {
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === '继续')
      ?.click(),
  );
  await delay(700);
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Bot 模式'))
      ?.click(),
  );
  await page.waitForSelector('.bh-human-inbox-entry');
  await page.click('.bh-human-inbox-entry');
  await delay(1200);
  await clickText('.bh-human-inbox-tabs button', '其他未读');
  await delay(1200);
};
const replyRow = async (name) => {
  const clicked = await page.evaluate((name) => {
    const row = [...document.querySelectorAll('.bh-human-inbox-row')].find((row) =>
      row.textContent?.includes(name),
    );
    const button = [...(row?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.trim() === '回复',
    );
    button?.click();
    return !!button;
  }, name);
  if (!clicked) throw new Error('Missing reply row: ' + name);
  await page.waitForSelector('.bh-human-inbox-reply-source');
};
const capture = (name) => page.screenshot({ path: resolve(out, name + '.png') });
const waitBot = async (channelId, excluded = []) => {
  for (let n = 0; n < 36; n++) {
    const messages = (await rpc('channelMessages', { channelId })).messages;
    const source = messages.findLast(
      (message) => message.author.kind === 'bot' && !excluded.includes(message.id),
    );
    if (source) return source;
    await delay(3000);
  }
  throw new Error('No live-model Channel reply');
};
try {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await delay(1500);
  const mode = process.argv[2];
  if (mode === 'probe') {
    const bots = (await rpc('list')).bots;
    const channels = (await rpc('channels')).channels;
    console.log(
      'BOTS',
      bots.map(({ slug, displayName, status }) => ({ slug, displayName, status })),
    );
    for (const channel of channels)
      console.log(
        'CHANNEL',
        channel.id,
        channel.name,
        (await rpc('channelMessages', { channelId: channel.id })).messages.map(
          ({ id, body, author, deliveries }) => ({ id, body, author, deliveries }),
        ),
      );
  }
  if (mode === 'seed') {
    const bot = (
      await rpc('create', {
        displayName: 'Launch Planner QA',
        persona:
          'You coordinate a product launch. Reply concisely to the source Channel with bot_send_message. Never create assignments. When asked about launch readiness, say the launch plan is ready for Human review, with documentation and release checks remaining.',
      })
    ).bot;
    const group = (await rpc('channelCreate', { name: 'Launch review QA', members: [bot.slug] }))
      .channel;
    const dm = (await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName })).channel;
    const mention = '@' + bot.displayName;
    await rpc('channelSend', {
      channelId: group.id,
      body: mention + ' Give a brief launch readiness update here.',
      mentions: [{ botSlug: bot.slug, label: bot.displayName, start: 0, end: mention.length }],
    });
    await waitBot(group.id);
    await rpc('channelSend', {
      channelId: dm.id,
      body: 'Give a short launch review checklist in this private Channel ' + dm.id + '.',
    });
    const dmSource = await waitBot(dm.id);
    const item = (await rpc('humanAttention', { category: 'unread' })).items.find(
      (item) => item.channelId === group.id,
    );
    const groupSource = (await rpc('channelMessages', { channelId: group.id })).messages.find(
      (message) => message.id === item.messageId,
    );
    writeFileSync(
      resolve(out, 'scene.json'),
      JSON.stringify({ bot, group, dm, groupSource, dmSource }, null, 2),
    );
    console.log('LIVE MODEL VERIFIED', { group: group.id, dm: dm.id });
  } else if (mode === 'seed-dm') {
    const bot = (await rpc('list')).bots.find((bot) => bot.displayName === 'Launch Planner QA');
    const group = (await rpc('channels')).channels.find(
      (channel) => channel.name === 'Launch review QA',
    );
    const dm = (await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName })).channel;
    await rpc('channelSend', {
      channelId: dm.id,
      body:
        'Reply in this private Channel ' +
        dm.id +
        ' using bot_send_message: give a short launch review checklist.',
    });
    const dmSource = await waitBot(dm.id);
    const item = (await rpc('humanAttention', { category: 'unread' })).items.find(
      (item) => item.channelId === group.id,
    );
    const groupSource = (await rpc('channelMessages', { channelId: group.id })).messages.find(
      (message) => message.id === item.messageId,
    );
    writeFileSync(
      resolve(out, 'scene.json'),
      JSON.stringify({ bot, group, dm, groupSource, dmSource }, null, 2),
    );
    console.log('LIVE MODEL VERIFIED: sequential Group and DM');
  } else if (mode === 'before') {
    await inbox();
    await capture('before');
    console.log('BASELINE CAPTURED');
  } else if (mode === 'reply') {
    const scene = JSON.parse(readFileSync(resolve(out, 'scene.json'), 'utf8'));
    await inbox();
    await replyRow(scene.group.name);
    const sourceId = await page.$eval(
      '.bh-human-inbox-reply-source',
      (node) => node.dataset.messageId,
    );
    if (sourceId !== scene.groupSource.id) throw new Error('Wrong Group source');
    const body = 'Friday launch approved. Please finish the documentation review today.';
    await page.type('.bh-human-inbox-reply textarea', body);
    await clickText('.bh-human-inbox-reply button', '查看附近消息');
    await capture('after-draft');
    await clickText('.bh-human-inbox-reply button', '发送回复');
    await page.waitForFunction(() =>
      document.querySelector('.bh-human-inbox-reply')?.textContent?.includes('回复已发送'),
    );
    await capture('after-sent');
    const matches = (await rpc('channelMessages', { channelId: scene.group.id })).messages.filter(
      (message) => message.body === body,
    );
    if (
      matches.length !== 1 ||
      matches[0].replyTo !== sourceId ||
      matches[0].author.kind !== 'human'
    )
      throw new Error('Noncanonical Group reply');
    await clickText('.bh-human-inbox-reply button', '查看来源');
    await page.waitForFunction(
      (id) => !!document.querySelector('[data-message-id="' + id + '"]'),
      {},
      matches[0].id,
    );
    await capture('after-source');
    await page.click('.bh-human-inbox-entry');
    await delay(1300);
    await clickText('.bh-human-inbox-tabs button', '其他未读');
    await delay(1000);
    await replyRow(scene.bot.displayName);
    const dmBody = 'Checklist reviewed. Thank you.';
    await page.type('.bh-human-inbox-reply textarea', dmBody);
    await clickText('.bh-human-inbox-reply button', '发送回复');
    await page.waitForFunction(() =>
      document.querySelector('.bh-human-inbox-reply')?.textContent?.includes('回复已发送'),
    );
    const dmMatches = (await rpc('channelMessages', { channelId: scene.dm.id })).messages.filter(
      (message) => message.body === dmBody,
    );
    if (dmMatches.length !== 1 || dmMatches[0].replyTo !== scene.dmSource.id)
      throw new Error('Noncanonical DM reply');
    await capture('after-dm');
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
    await capture('after-dark');
    writeFileSync(
      resolve(out, 'result.json'),
      JSON.stringify(
        {
          groupSource: sourceId,
          groupReply: matches[0].id,
          dmSource: scene.dmSource.id,
          dmReply: dmMatches[0].id,
          duplicates: 0,
        },
        null,
        2,
      ) + '\n',
    );
    console.log('E2E VERIFIED: Group + DM canonical inline replies and exact navigation');
  } else if (mode === 'light') {
    const scene = JSON.parse(readFileSync(resolve(out, 'scene.json'), 'utf8'));
    const old = (await rpc('channelMessages', { channelId: scene.dm.id })).messages.map(
      (message) => message.id,
    );
    await rpc('channelSend', {
      channelId: scene.dm.id,
      body:
        'Please post a fresh one-sentence launch readiness update in this private Channel ' +
        scene.dm.id +
        '.',
    });
    await waitBot(scene.dm.id, old);
    await inbox();
    await replyRow(scene.bot.displayName);
    await page.type(
      '.bh-human-inbox-reply textarea',
      'Ready for Human QA: review this reply in the Inbox or open its source.',
    );
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    await capture('after-light');
    console.log(
      'SHELL MEASUREMENTS',
      await page.evaluate(() => {
        const controls = [...document.querySelectorAll('button')];
        const native = controls.find((button) => button.textContent?.includes('新会话'));
        const custom = document.querySelector('.bh-human-inbox-reply button');
        const pane = document.querySelector('.bh-human-inbox-reply');
        return {
          native: native && {
            height: native.getBoundingClientRect().height,
            font: getComputedStyle(native).fontFamily,
            radius: getComputedStyle(native).borderRadius,
          },
          custom: custom && {
            height: custom.getBoundingClientRect().height,
            font: getComputedStyle(custom).fontFamily,
            radius: getComputedStyle(custom).borderRadius,
          },
          surface: pane && {
            color: getComputedStyle(pane).color,
            background: getComputedStyle(document.body).backgroundColor,
          },
        };
      }),
    );
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
    await capture('after-dark-draft');
  } else if (mode === 'error') {
    const scene = JSON.parse(readFileSync(resolve(out, 'scene.json'), 'utf8'));
    const channel = (
      await rpc('channelCreate', { name: 'Expired review QA', members: [scene.bot.slug] })
    ).channel;
    const mention = '@' + scene.bot.displayName;
    await rpc('channelSend', {
      channelId: channel.id,
      body: mention + ' Give a short readiness update.',
      mentions: [
        { botSlug: scene.bot.slug, label: scene.bot.displayName, start: 0, end: mention.length },
      ],
    });
    await waitBot(channel.id);
    await inbox();
    await replyRow(channel.name);
    const draft = 'Keep this draft if the Channel disappears.';
    await page.type('.bh-human-inbox-reply textarea', draft);
    await rpc('channelGroupDelete', { channelId: channel.id });
    await clickText('.bh-human-inbox-reply button', '发送回复');
    await page.waitForFunction(() =>
      document
        .querySelector('.bh-human-inbox-reply [role="alert"]')
        ?.textContent?.includes('草稿已保留'),
    );
    if ((await page.$eval('.bh-human-inbox-reply textarea', (node) => node.value)) !== draft)
      throw new Error('Lost draft');
    await capture('after-error');
    console.log('E2E VERIFIED: deleted source rejects reply and preserves draft');
    await clickText('.bh-human-inbox-reply button', '查看来源');
    await page.waitForFunction(() =>
      document
        .querySelector('.bh-human-inbox-reply [role="alert"]')
        ?.textContent?.includes('来源已不可用'),
    );
    if ((await page.$eval('.bh-human-inbox-reply textarea', (node) => node.value)) !== draft)
      throw new Error('Failed navigation lost draft');
    await capture('after-navigation-error');
    console.log('E2E VERIFIED: failed exact navigation remains in Inbox with draft');
  }
} finally {
  await browser.close();
}
