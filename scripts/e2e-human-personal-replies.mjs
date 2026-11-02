import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const home = resolve(tmpdir(), 'bh-548-human-qa');
const port = 31988;
const url = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}-${port}.log`), 'utf8').match(
  /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u,
)?.[0];
assert.ok(url, 'Launch the isolated #548 dev instance first');
const modules = resolve(repo, 'node_modules/.pnpm');
const pkg = readdirSync(modules).find((name) => name.startsWith('puppeteer@'));
assert.ok(pkg, 'Puppeteer dependency missing');
const puppeteer = createRequire(resolve(modules, pkg, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const out = resolve(repo, '.humanlayer/tasks/issue-548/evidence');
mkdirSync(out, { recursive: true });
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const save = (name, data) =>
  writeFileSync(resolve(out, name + '.json'), JSON.stringify(data, null, 2) + '\n');
const rpc = async (method, args = {}, client = page) => {
  const envelope = await client.evaluate(
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
  assert.equal(envelope.result?.ok, true, method + ': ' + JSON.stringify(envelope.result?.error));
  return envelope.result.value;
};
const clickText = async (selector, text) => {
  assert.ok(
    await page.evaluate(
      ({ selector, text }) => {
        const node = [...document.querySelectorAll(selector)].find(
          (node) => node.textContent?.trim() === text,
        );
        node?.click();
        return !!node;
      },
      { selector, text },
    ),
    'Missing control: ' + text,
  );
};
const inbox = async () => {
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((node) => node.textContent?.trim() === '继续')
      ?.click(),
  );
  try {
    await page.waitForSelector('.bh-human-inbox-entry', { timeout: 8000 });
  } catch {
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((node) => node.textContent?.includes('Bot 模式'))
        ?.click(),
    );
    await page.waitForSelector('.bh-human-inbox-entry');
  }
  await page.evaluate(() => document.querySelector('.bh-human-inbox-entry')?.click());
  await page.waitForSelector('.bh-human-inbox-tabs');
  await delay(900);
};
const capture = (name) => page.screenshot({ path: resolve(out, name + '.png') });
const waitReply = async (channelId, humanId) => {
  for (let n = 0; n < 40; n++) {
    const messages = (await rpc('channelMessages', { channelId })).messages;
    const reply = messages.find(
      (message) => message.author.kind === 'bot' && message.replyTo === humanId,
    );
    if (reply) return reply;
    await delay(3000);
  }
  throw new Error('Live Bot did not commit the requested source-addressed reply');
};
try {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  const mode = process.argv[2];
  if (mode === 'seed') {
    const scenes = [];
    for (const [name, channelName, role] of [
      ['Launch Planner QA', 'Launch review QA', 'launch planning'],
      ['Release Reviewer QA', 'Release checks QA', 'release verification'],
    ]) {
      const bot = (
        await rpc('create', {
          displayName: name,
          persona: `You coordinate ${role}. For each explicit Human request, call bot_send_message in the inbound Channel with the trusted source_event_id of the Human request. Reply in one concise sentence. Never create Assignments. If Human simply acknowledges your update, finish without sending another message.`,
        })
      ).bot;
      const group = (await rpc('channelCreate', { name: channelName, members: [bot.slug] }))
        .channel;
      const humanId = 'human-' + crypto.randomUUID();
      const mention = '@' + name;
      await rpc('channelSend', {
        channelId: group.id,
        messageId: humanId,
        body: `${mention} Review today's ${role} readiness and report one concrete remaining check.`,
        mentions: [{ botSlug: bot.slug, label: name, start: 0, end: mention.length }],
      });
      const reply = await waitReply(group.id, humanId);
      scenes.push({ bot, group, humanId, reply });
      console.log('LIVE MODEL VERIFIED', { bot: name, channel: group.id, reply: reply.id });
    }
    save('scene', scenes);
    await inbox();
    await clickText('.bh-human-inbox-tabs button', '提及与回复');
    await delay(700);
    await capture('qa-seeded');
  } else {
    const scenes = JSON.parse(readFileSync(resolve(out, 'scene.json'), 'utf8'));
    const scene = scenes[0];
    const before = await rpc('humanAttention', { category: 'replies' });
    console.log('PROJECTION VERIFIED: two personal replies');
    for (const entry of scenes)
      assert.equal(before.items.filter((item) => item.messageId === entry.reply.id).length, 1);
    const ordinary = await rpc('humanAttention', { category: 'unread' });
    assert.ok(
      scenes.every((entry) => !ordinary.items.some((item) => item.messageId === entry.reply.id)),
    );
    const filtered = await rpc('humanAttention', {
      category: 'replies',
      botSlug: scene.bot.slug,
      channelId: scene.group.id,
    });
    assert.equal(filtered.items.length, 1);
    const second = await browser.newPage();
    await second.goto(url, { waitUntil: 'networkidle2' });
    await second.goto(url, { waitUntil: 'networkidle2' });
    assert.deepEqual(await rpc('humanAttention', { category: 'replies' }, second), before);
    console.log('SECOND WINDOW VERIFIED: same Source Events');
    await page.bringToFront();
    if (mode === 'restart') {
      assert.equal(before.items.find((item) => item.messageId === scene.reply.id)?.isUnread, false);
      const result = JSON.parse(readFileSync(resolve(out, 'result.json'), 'utf8'));
      save('result', { ...result, restart: true });
      console.log('RESTART VERIFIED: canonical personal reply and read position');
    } else {
      await inbox();
      console.log('INBOX OPENED');
      await clickText('.bh-human-inbox-tabs button', '提及与回复');
      await delay(900);
      await capture('after-replies');
      assert.ok(
        await page.evaluate((slug) => {
          const select = document.querySelector('.bh-human-inbox-filters select');
          select.value = slug;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }, scene.bot.slug),
      );
      await page.waitForFunction(
        () => document.querySelectorAll('.bh-human-inbox-row').length === 1,
      );
      await clickText('.bh-human-inbox-row button', '回复');
      await page.waitForSelector('.bh-human-inbox-reply-source');
      assert.equal(
        await page.$eval('.bh-human-inbox-reply-source', (node) => node.dataset.messageId),
        scene.reply.id,
      );
      await clickText('.bh-human-inbox-reply button', '查看附近消息');
      const replyBody =
        'Reviewed. Thank you; I will handle the remaining check. QA checkpoint ' +
        new Date().toISOString().slice(11, 23) +
        '.';
      await page.type('.bh-human-inbox-reply textarea', replyBody);
      await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
      await capture('after-context-light');
      await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
      await capture('after-context-dark');
      await page.setViewport({ width: 900, height: 1100, deviceScaleFactor: 1 });
      await capture('after-narrow');
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Narrow layout overflows',
      );
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      const read = await rpc('humanAttention', { category: 'replies' }, second);
      assert.equal(read.items.find((item) => item.messageId === scene.reply.id)?.isUnread, false);
      await clickText('.bh-human-inbox-reply button', '发送回复');
      await page.waitForFunction(() =>
        document.querySelector('.bh-human-inbox-reply')?.textContent?.includes('回复已发送'),
      );
      await capture('after-sent');
      const matches = (await rpc('channelMessages', { channelId: scene.group.id })).messages.filter(
        (message) => message.body === replyBody,
      );
      assert.equal(matches.length, 1);
      assert.equal(matches[0].replyTo, scene.reply.id);
      assert.equal(matches[0].author.kind, 'human');
      await clickText('.bh-human-inbox-reply button', '查看来源');
      await page.waitForFunction(
        (id) => !!document.querySelector('[data-message-id="' + id + '"]'),
        {},
        matches[0].id,
      );
      await capture('after-source');
      save('result', {
        personalSource: scene.reply.id,
        humanReply: matches[0].id,
        duplicates: 0,
        secondWindow: true,
        canonicalRead: true,
        exactNavigation: true,
      });
      console.log(
        'E2E VERIFIED: two Bots/two Channels, filters, context, shared read state, canonical reply and exact navigation',
      );
    }
    await second.close();
  }
} catch (error) {
  await capture('error');
  console.log(
    'VISIBLE CONTROLS',
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .map((node) => node.textContent?.trim())
        .filter(Boolean)
        .slice(0, 25),
    ),
  );
  throw error;
} finally {
  await browser.close();
}
