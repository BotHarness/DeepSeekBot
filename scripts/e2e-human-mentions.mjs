import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const home = resolve(tmpdir(), 'bh-549-human-mentions');
const url = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}-31989.log`), 'utf8').match(
  /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u,
)?.[0];
assert.ok(url, 'Launch the isolated #549 dev instance first');
const modules = resolve(repo, 'node_modules/.pnpm');
const pkg = readdirSync(modules).find((name) => name.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(modules, pkg, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const out = resolve(repo, '.humanlayer/tasks/issue-549/evidence');
mkdirSync(out, { recursive: true });
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const save = (name, value) =>
  writeFileSync(resolve(out, name + '.json'), JSON.stringify(value, null, 2) + '\n');
const capture = (name) => page.screenshot({ path: resolve(out, name + '.png') });
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
  await clickText('.bh-human-inbox-tabs button', '提及与回复');
  await delay(900);
};
const waitMessage = async (channelId, marker) => {
  for (let n = 0; n < 50; n++) {
    const message = (await rpc('channelMessages', { channelId })).messages.find(
      (message) => message.author.kind === 'bot' && message.body.includes(marker),
    );
    if (message) return message;
    await delay(3000);
  }
  throw new Error('Live Bot did not commit ' + marker);
};
try {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  const mode = process.argv[2];
  if (mode === 'seed') {
    await inbox();
    await capture('before-empty');
    const scenes = [];
    for (const [name, channelName, both] of [
      ['Launch Coordinator QA', 'Launch decisions QA', true],
      ['Release Observer QA', 'Release verification QA', false],
    ]) {
      const bot = (
        await rpc('create', {
          displayName: name,
          persona:
            'You coordinate release QA. Follow the Human request precisely. For a trusted mention, first call channel_list to discover humanMembers, then bot_send_message with mention_human_ids using that stable Human ID. Do not put @Human manually in a trusted body. When asked for plain text, do not supply mention_human_ids; use explicit channel_id without source_event_id. Never create Assignments. Acknowledgments need no response.',
        })
      ).bot;
      const group = (await rpc('channelCreate', { name: channelName, members: [bot.slug] }))
        .channel;
      const send = async (body) => {
        const humanId = 'human-' + crypto.randomUUID();
        const mention = '@' + name;
        await rpc('channelSend', {
          channelId: group.id,
          messageId: humanId,
          body: mention + ' ' + body,
          mentions: [{ botSlug: bot.slug, label: name, start: 0, end: mention.length }],
        });
        return humanId;
      };
      await send(
        'Send exactly one Group message with body "QA_PLAIN: @Human release note, no decision needed." Use explicit channel_id, no mention_human_ids and no source_event_id.',
      );
      const plain = await waitMessage(group.id, 'QA_PLAIN:');
      assert.equal(plain.humanMentions, undefined);
      assert.equal(plain.replyTo, undefined);
      const humanId = await send(
        'Send exactly one trusted Human mention in this Group with body "QA_TRUSTED: Please confirm the release window is Friday." Discover humanMembers using channel_list and use mention_human_ids. ' +
          (both
            ? 'Reply using this request’s trusted source_event_id.'
            : 'Use explicit channel_id for a proactive message, without source_event_id.'),
      );
      const mention = await waitMessage(group.id, 'QA_TRUSTED:');
      assert.equal(mention.humanMentions?.[0]?.humanId, 'local-human');
      assert.equal(mention.replyTo, both ? humanId : undefined);
      scenes.push({ bot, group, humanId, mention, plain });
      console.log('LIVE MODEL VERIFIED: trusted mention and plain-text control in', channelName);
    }
    save('scene', scenes);
    await inbox();
    await capture('after-list');
  } else {
    const scenes = JSON.parse(readFileSync(resolve(out, 'scene.json'), 'utf8'));
    const scene = scenes[0];
    const personal = await rpc('humanAttention', { category: 'replies' });
    assert.equal(personal.items.length, 2);
    for (const entry of scenes) {
      assert.equal(
        personal.items.filter(
          (item) => item.messageId === entry.mention.id && item.kind === 'channel-mention',
        ).length,
        1,
      );
      assert.ok(!personal.items.some((item) => item.messageId === entry.plain.id));
    }
    const unread = await rpc('humanAttention', { category: 'unread' });
    if (mode === 'check') {
      assert.equal(unread.items.length, 2);
      assert.ok(unread.items.every((item) => item.unreadCount === 1));
    }
    const filtered = await rpc('humanAttention', {
      category: 'replies',
      botSlug: scene.bot.slug,
      channelId: scene.group.id,
    });
    assert.equal(filtered.items.length, 1);
    const second = await browser.newPage();
    await second.goto(url, { waitUntil: 'networkidle2' });
    await second.goto(url, { waitUntil: 'networkidle2' });
    assert.deepEqual(await rpc('humanAttention', { category: 'replies' }, second), personal);
    await page.bringToFront();
    if (mode === 'restart') {
      assert.equal(
        personal.items.find((item) => item.messageId === scene.mention.id)?.isUnread,
        false,
      );
      save('result', {
        ...JSON.parse(readFileSync(resolve(out, 'result.json'), 'utf8')),
        restart: true,
      });
      console.log('RESTART VERIFIED: stable Human target and canonical read state');
    } else {
      await inbox();
      await page.select('.bh-human-inbox-filters select', scene.bot.slug);
      await page.waitForFunction(
        () => document.querySelectorAll('.bh-human-inbox-row').length === 1,
      );
      await clickText('.bh-human-inbox-row button', '回复');
      await page.waitForSelector('.bh-human-inbox-reply-source [data-human-id="local-human"]');
      await clickText('.bh-human-inbox-reply button', '查看附近消息');
      const replyBody = 'Confirmed: Friday release window. Thank you; no further reply needed.';
      await page.type('.bh-human-inbox-reply textarea', replyBody);
      await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
      await capture('after-context-light');
      await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
      await capture('after-context-dark');
      await page.setViewport({ width: 900, height: 1100, deviceScaleFactor: 1 });
      await capture('after-narrow');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      assert.equal(
        (await rpc('humanAttention', { category: 'replies' }, second)).items.find(
          (item) => item.messageId === scene.mention.id,
        )?.isUnread,
        false,
      );
      if (mode !== 'capture') {
        await clickText('.bh-human-inbox-reply button', '发送回复');
        await page.waitForFunction(() =>
          document.querySelector('.bh-human-inbox-reply')?.textContent?.includes('回复已发送'),
        );
        await capture('after-sent');
        const replies = (
          await rpc('channelMessages', { channelId: scene.group.id })
        ).messages.filter((message) => message.body === replyBody);
        assert.equal(replies.length, 1);
        assert.equal(replies[0].replyTo, scene.mention.id);
        await clickText('.bh-human-inbox-reply button', '查看来源');
        await page.waitForFunction(
          (id) => !!document.querySelector('[data-message-id="' + id + '"]'),
          {},
          replies[0].id,
        );
        await capture('after-source');
        save('result', {
          trustedTargets: true,
          plainTextExcluded: true,
          bothReasonsDeduplicated: true,
          filters: true,
          canonicalReply: true,
          exactNavigation: true,
          secondWindow: true,
          canonicalRead: true,
        });
        console.log(
          'E2E VERIFIED: trusted mentions, plain-text exclusion, deduplication, inline reply and exact navigation',
        );
      }
    }
    await second.close();
  }
} catch (error) {
  await capture('error');
  throw error;
} finally {
  await browser.close();
}
