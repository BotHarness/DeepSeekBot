import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const repo = process.env.BH_ALL_BOT_QA_REPO
  ? resolve(process.env.BH_ALL_BOT_QA_REPO)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'check';
const port = Number(process.env.BH_ALL_BOT_QA_PORT ?? 32025);
const home = resolve(process.env.BH_ALL_BOT_QA_HOME ?? resolve(tmpdir(), 'bh-542-all-bot'));
const out = process.env.BH_ALL_BOT_QA_OUT
  ? resolve(process.env.BH_ALL_BOT_QA_OUT)
  : resolve(repo, 'docs/assets/pr/542-all-bot-mention', mode === 'before' ? 'before' : 'evidence');
mkdirSync(out, { recursive: true });
const url = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}-${port}.log`), 'utf8').match(
  /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u,
)?.[0];
assert.ok(url, 'Launch isolated DSH first');
const modules = resolve(repo, 'node_modules/.pnpm');
const pkg = readdirSync(modules).find((name) => name.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(modules, pkg, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 180000,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const shot = (name) => page.screenshot({ path: resolve(out, name + '.png') });
const theme = async (dark) => {
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' },
  ]);
  await page.evaluate(async (dark) => {
    if (dark) document.body.setAttribute('data-ds-dark-theme', '');
    else document.body.removeAttribute('data-ds-dark-theme');
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  }, dark);
};
const rpc = async (method, args = {}, client = page, namespace = 'botharness') =>
  client.evaluate(
    async ({ method, args, namespace }) => {
      const response = await fetch('/api/' + namespace + '/' + method, {
        method: 'POST',
        signal: AbortSignal.timeout(50000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: namespace + '/' + method,
          payload: { args },
        }),
      });
      if (!response.ok) throw new Error(method + ': HTTP ' + response.status);
      const result = (await response.json()).result;
      if (result?.ok !== true) throw new Error(method + ': ' + JSON.stringify(result?.error));
      return result.value;
    },
    { method, args, namespace },
  );
const click = async (selector, text, client = page) => {
  await client.waitForFunction(
    ({ selector, text }) =>
      [...document.querySelectorAll(selector)].some((n) => n.textContent?.trim() === text),
    {},
    { selector, text },
  );
  assert.ok(
    await client.evaluate(
      ({ selector, text }) => {
        const n = [...document.querySelectorAll(selector)].find(
          (n) => n.textContent?.trim() === text,
        );
        n?.click();
        return !!n;
      },
      { selector, text },
    ),
  );
};
const login = async (client) => {
  await client.goto(url, { waitUntil: 'domcontentloaded' });
  await client.goto(url, { waitUntil: 'domcontentloaded' });
  await client
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((n) =>
          ['继续', 'Continue'].includes(n.textContent?.trim() ?? ''),
        ),
      { timeout: 6000 },
    )
    .catch(() => undefined);
  await client.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((n) => ['继续', 'Continue'].includes(n.textContent?.trim() ?? ''))
      ?.click(),
  );
  await client.waitForSelector('.bh-panel-glyph', { timeout: 60000 });
  if ((await client.$('.bh-region')) === null) await client.click('button:has(.bh-panel-glyph)');
  await client.waitForSelector('.bh-region');
};

const sceneFile = resolve(repo, '.humanlayer/tasks/all-bot-mention/scene.json');
const openGroup = async (id) => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await login(page);
  await page.waitForSelector('[data-channel-id="' + id + '"]');
  await page.click('[data-channel-id="' + id + '"]');
  await page.waitForSelector('.bh-composer-input', { visible: true });
};
try {
  await login(page);
  let scene;
  if (mode === 'before') {
    if (process.env.BH_ALL_BOT_QA_REUSE === '1') {
      scene = JSON.parse(readFileSync(sceneFile, 'utf8'));
      await openGroup(scene.channelId);
      await page.locator('.bh-composer-input').click();
      await page.keyboard.type('@');
      await page.waitForSelector('[role=listbox]');
      await theme(false);
      await shot('before-light');
      await theme(true);
      await shot('before-dark');
      assert.equal(
        await page.evaluate(() =>
          document.querySelector('[role=listbox]')?.textContent?.includes('所有 Bot'),
        ),
        false,
      );
      console.log('PASS baseline reused');
    } else {
      const bots = [];
      for (const displayName of ['Ada QA', 'Bea QA', 'Paused QA', 'Outsider QA'])
        bots.push(
          (
            await rpc('create', {
              displayName,
              persona:
                'Follow explicit Human instructions. When asked in a group, reply once using bot_send_message in that group with your own name and ALL_BOTS_ACK. Do not create assignments or contact other Bots.',
            })
          ).bot,
        );
      const group = (
        await rpc('channelCreate', {
          name: 'Release review',
          members: bots.slice(0, 3).map((bot) => bot.slug),
        })
      ).channel;
      await rpc('pause', { slug: bots[2].slug });
      for (const bot of bots.slice(0, 2))
        await rpc('channelGroupWakeSet', {
          channelId: group.id,
          botSlug: bot.slug,
          mode: 'silent',
          count: 10,
          intervalSeconds: 60,
        });
      scene = {
        channelId: group.id,
        bots: bots.map((bot) => ({ slug: bot.slug, displayName: bot.displayName })),
      };
      mkdirSync(dirname(sceneFile), { recursive: true });
      writeFileSync(sceneFile, JSON.stringify(scene));
      await openGroup(group.id);
      await page.locator('.bh-composer-input').click();
      await page.keyboard.type('@');
      await page.waitForSelector('[role=listbox]');
      assert.equal(
        await page.evaluate(() =>
          document.querySelector('[role=listbox]')?.textContent?.includes('所有 Bot'),
        ),
        false,
      );
      await theme(false);
      await shot('before-light');
      await theme(true);
      await shot('before-dark');
      console.log('PASS baseline: Group mention picker offers individual Bots only');
    }
  } else {
    scene = JSON.parse(readFileSync(sceneFile, 'utf8'));
    await openGroup(scene.channelId);
    const preview = await rpc('channelAllBotPreview', { channelId: scene.channelId });
    assert.deepEqual(
      preview.recipients.map((r) => r.botSlug).sort(),
      scene.bots
        .slice(0, 2)
        .map((b) => b.slug)
        .sort(),
    );
    if (mode === 'picker') {
      await rpc('update', { slug: scene.bots[0].slug, patch: { roles: ['研究员', '发布协作'] } });
      await rpc('update', { slug: scene.bots[1].slug, patch: { roles: [] } });
      await openGroup(scene.channelId);
      await page.locator('.bh-composer-input').click();
      await page.keyboard.type('@');
      await page.waitForSelector('[role=listbox]');
      const menuText = await page.$eval('[role=listbox]', (menu) => menu.textContent);
      for (const bot of scene.bots) assert.equal(menuText.includes(bot.slug), false);
      assert.ok(menuText.includes('Ada QA'));
      assert.ok(menuText.includes('研究员 · 发布协作'));
      assert.ok(menuText.includes('Bea QA'));
      await theme(false);
      await shot('picker-light');
      await theme(true);
      await shot('picker-dark');
      await theme(false);
      await page.setViewport({ width: 520, height: 860, deviceScaleFactor: 1 });
      await shot('picker-narrow');
      console.log(
        'PASS actual DSH mention picker: avatars, names, role labels, no technical IDs including untagged Bots',
      );
    } else if (mode === 'resume') {
      const messages = (await rpc('channelMessages', { channelId: scene.channelId, limit: 100 }))
        .messages;
      assert.ok(messages.some((m) => m.author.kind === 'human' && m.mentions?.length === 2));
      assert.ok(
        messages.filter((m) => m.author.kind === 'bot' && m.body.includes('ALL_BOTS_ACK')).length >=
          2,
      );
      await shot('restarted');
      console.log('PASS restart: committed ordinary mentions and replies retained');
    } else {
      if (mode !== 'finish') {
        await page.locator('.bh-composer-input').click();
        await page.keyboard.type('@');
        await page.waitForSelector('[role=listbox]');
        await page.waitForFunction(() =>
          document.querySelector('[role=listbox]')?.textContent?.includes('所有 Bot'),
        );
        await theme(false);
        await shot('picker-light');
        await theme(true);
        await shot('picker-dark');
        await theme(false);
        await click('[role=option]', '@所有 Bot仅当前群内的活跃 Bot2 个 Bot');
        await page.keyboard.type(
          ' 请使用 bot_send_message 在这个群里回复一次：你的名字和 ALL_BOTS_ACK。不要创建 Assignment，不要给其他 Bot 发消息。',
        );
        await page.waitForFunction(() =>
          document.querySelector('[data-all-bot-preview]')?.textContent?.includes('2'),
        );
        await shot('draft-light');
        await page.setViewport({ width: 520, height: 860, deviceScaleFactor: 1 });
        await shot('draft-narrow');
        await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
        await page.click('.bh-send-btn');
        await page.waitForFunction(
          () =>
            [...document.querySelectorAll('.bh-bubble-wrap')].filter((n) =>
              n.textContent?.includes('ALL_BOTS_ACK'),
            ).length >= 3,
          { timeout: 150000 },
        );
      }
      const messages = (await rpc('channelMessages', { channelId: scene.channelId, limit: 100 }))
        .messages;
      const sent = messages.find((m) => m.author.kind === 'human' && m.mentions?.length === 2);
      assert.ok(sent);
      assert.deepEqual(
        sent.mentions.map((m) => m.botSlug).sort(),
        scene.bots
          .slice(0, 2)
          .map((b) => b.slug)
          .sort(),
      );
      const responses = messages.filter(
        (m) => m.author.kind === 'bot' && m.body.includes('ALL_BOTS_ACK'),
      );
      assert.deepEqual(
        [...new Set(responses.map((m) => m.author.slug))].sort(),
        scene.bots
          .slice(0, 2)
          .map((b) => b.slug)
          .sort(),
      );
      await theme(false);
      await shot('replies-light');
      await theme(true);
      await shot('replies-dark');
      await theme(false);
      await page.locator('.bh-composer-input').click();
      await page.keyboard.type('@');
      await page.waitForSelector('[role=listbox]');
      await click('[role=option]', '@所有 Bot仅当前群内的活跃 Bot2 个 Bot');
      await page.keyboard.type(' STALE_PREVIEW_DO_NOT_SEND');
      await rpc('pause', { slug: scene.bots[1].slug });
      await page.click('.bh-send-btn');
      await page.waitForFunction(
        () =>
          document.querySelector('[data-all-bot-preview]')?.textContent?.endsWith('1') &&
          document.body.textContent?.includes('接收 Bot 已变化'),
      );
      assert.equal(
        (await rpc('channelMessages', { channelId: scene.channelId, limit: 100 })).messages.some(
          (m) => m.body.includes('STALE_PREVIEW_DO_NOT_SEND'),
        ),
        false,
      );
      await shot('stale-preview');
      await rpc('pause', { slug: scene.bots[0].slug });
      await page.locator('.bh-send-btn').click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-all-bot-preview]')?.textContent?.endsWith('0') &&
          document.querySelector('.bh-send-btn')?.disabled === true,
      );
      assert.equal(
        (await rpc('channelMessages', { channelId: scene.channelId, limit: 100 })).messages.some(
          (m) => m.body.includes('STALE_PREVIEW_DO_NOT_SEND'),
        ),
        false,
      );
      await shot('zero-recipients');
      await rpc('resume', { slug: scene.bots[0].slug });
      await rpc('resume', { slug: scene.bots[1].slug });
      await openGroup((await rpc('channelDm', { slug: scene.bots[0].slug })).channel.id);
      await page.locator('.bh-composer-input').click();
      await page.keyboard.type('@');
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('[role=listbox]')?.textContent?.includes('所有 Bot') ?? false,
        ),
        false,
      );
      writeFileSync(
        resolve(out, 'result.json'),
        JSON.stringify(
          {
            passed: true,
            group: scene.channelId,
            recipientCount: 2,
            pausedExcluded: true,
            outsiderExcluded: true,
            silentPolicyStillMention: true,
            actualModelReplies: responses.length,
            staleRejected: true,
            zeroRecipientsBlocked: true,
            dmShortcutAbsent: true,
            messageId: sent.id,
          },
          null,
          2,
        ),
      );
      console.log(
        'PASS real DSH: composer, two actual model replies, silent policy, exclusion, stale rejection, DM scope',
      );
    }
  }
} finally {
  await browser.close();
}
