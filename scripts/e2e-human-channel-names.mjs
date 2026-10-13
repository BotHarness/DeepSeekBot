import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const home = resolve(
  process.env.BH_NAMES_QA_HOME ?? resolve(tmpdir(), 'bh-622-human-channel-nickname'),
);
const url = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}-31991.log`), 'utf8').match(
  /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u,
)?.[0];
assert.ok(url, 'Launch the isolated #622 dev instance first');
const modules = resolve(repo, 'node_modules/.pnpm');
const pkg = readdirSync(modules).find((name) => name.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(modules, pkg, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 20000,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const out = resolve(
  repo,
  process.env.BH_NAMES_QA_EVIDENCE ?? '.humanlayer/tasks/issue-622/evidence',
);
mkdirSync(out, { recursive: true });
const selectAllModifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const save = (name, value) =>
  writeFileSync(resolve(out, name + '.json'), JSON.stringify(value, null, 2) + '\n');
const capture = (name) => page.screenshot({ path: resolve(out, name + '.png') });
const rpc = async (method, args = {}, client = page) => {
  const envelope = await client.evaluate(
    async ({ method, args }) => {
      const response = await fetch('/api/botharness/' + method, {
        method: 'POST',
        signal: AbortSignal.timeout(20000),
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
const clickText = async (selector, text, client = page) => {
  assert.ok(
    await client.evaluate(
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
const inbox = async (client = page) => {
  await client
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some(
          (button) => button.textContent?.trim() === '继续',
        ),
      { timeout: 8000 },
    )
    .catch(() => undefined);
  await client.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((node) => node.textContent?.trim() === '继续')
      ?.click(),
  );
  try {
    await client.waitForSelector('.bh-human-inbox-entry', { timeout: 8000 });
  } catch {
    await client.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((node) => node.textContent?.includes('Bot 模式'))
        ?.click(),
    );
    await client.waitForSelector('.bh-human-inbox-entry');
  }
  await client.evaluate(() => document.querySelector('.bh-human-inbox-entry')?.click());
  await client.waitForSelector('.bh-human-inbox-tabs');
  await clickText('.bh-human-inbox-tabs button', '提及与回复', client);
  console.log('Inbox opened');
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
const settings = async (client = page) => {
  await client.bringToFront();
  await client.evaluate(() => {
    const trigger = document.querySelector('button[aria-haspopup="dialog"]');
    if (trigger && trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
  });
  await client.waitForFunction(() =>
    [...document.querySelectorAll('button')].some(
      (button) => button.textContent?.trim() === 'Bot 设置',
    ),
  );
  await client.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Bot 设置')
      ?.click(),
  );
  await client.waitForSelector('#bh-human-default-name:not(:disabled)');
  await client.$eval('#bh-human-default-name', (input) =>
    input.scrollIntoView({ block: 'center' }),
  );
};
const setName = async (name) => {
  await settings();
  await page.click('#bh-human-default-name', { clickCount: 3 });
  await page.keyboard.down(selectAllModifier);
  await page.keyboard.press('A');
  await page.keyboard.up(selectAllModifier);
  await page.keyboard.press('Backspace');
  if (name) await page.type('#bh-human-default-name', name);
  console.log(
    'Save DOM: ' +
      JSON.stringify(
        await page.evaluate(() =>
          [...document.querySelectorAll('[data-human-name-setting] button')].map((b) => ({
            text: b.textContent,
            type: b.type,
            disabled: b.disabled,
            form: b.form?.className,
          })),
        ),
      ),
  );
  await page.press('#bh-human-default-name', 'Enter');
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-human-name-setting] [role="status"]')
        ?.textContent?.includes('已保存'),
    { polling: 100 },
  );
};
const closeSettings = async () => {
  await page.keyboard.press('Escape');
  await delay(350);
};
const openGroup = async (id, client = page) => {
  await client.bringToFront();
  await client.waitForSelector(`[data-channel-id="${id}"]`);
  await client.evaluate((id) => document.querySelector(`[data-channel-id="${id}"]`)?.click(), id);
  await client.waitForSelector('.bh-channel-options');
  console.log('Group opened');
  await delay(700);
};
const nickname = async (channelId, name) => {
  await openGroup(channelId);
  await page.click('.bh-channel-options button');
  await page.waitForSelector('[role="menuitem"]');
  await clickText('[role="menuitem"]', '我的昵称');
  await page.waitForSelector('#bh-human-channel-nickname');
  await page.click('#bh-human-channel-nickname', { clickCount: 3 });
  await page.keyboard.down(selectAllModifier);
  await page.keyboard.press('A');
  await page.keyboard.up(selectAllModifier);
  await page.keyboard.press('Backspace');
  if (name) await page.type('#bh-human-channel-nickname', name);
  await capture(name ? 'edit-' + (channelId.startsWith('dm-') ? 'dm' : 'group') : 'edit-reset');
  if (name) await page.keyboard.press('Enter');
  else await clickText('button', '恢复默认名字');
  await page.waitForSelector('#bh-human-channel-nickname', { hidden: true });
  const channels = (await rpc('channels')).channels;
  assert.equal(channels.find((c) => c.id === channelId).humanNickname, name || null);
};
const label = (client, name) =>
  client.waitForFunction(
    (name) =>
      document.querySelector('[data-human-id="local-human"]')?.textContent?.trim() === '@' + name,
    { polling: 100 },
    name,
  );
const source = (page) => ({
  revision: page.revision,
  messages: page.messages.map(({ humanReceipts: _humanReceipts, ...message }) => message),
});
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await inbox();
  const mode = process.argv[2] ?? 'check';
  if (mode === 'reset') {
    const scene = JSON.parse(readFileSync(resolve(out, 'scene.json'), 'utf8'));
    await nickname(scene.group.id, '');
    await label(page, '小熊 新');
    await capture('after-restore-button');
    await nickname(scene.group.id, '教授');
    await label(page, '教授');
    save('result', {
      ...JSON.parse(readFileSync(resolve(out, 'result.json'), 'utf8')),
      restoreButton: true,
    });
    console.log(
      'RESTORE BUTTON VERIFIED: inherited current default and restored independent nickname',
    );
  } else if (mode === 'restart') {
    const scene = JSON.parse(readFileSync(resolve(out, 'scene.json'), 'utf8'));
    const channels = (await rpc('channels')).channels;
    assert.equal(channels.find((c) => c.id === scene.dm.id).humanNickname, '船长');
    assert.equal(channels.find((c) => c.id === scene.group.id).humanNickname, '教授');
    assert.equal(channels.find((c) => c.id === scene.inheriting.id).humanNickname, null);
    assert.equal(
      channels.find((c) => c.id === scene.inheriting.id).humanMembers[0].displayName,
      '小熊 新',
    );
    assert.deepEqual(
      source(await rpc('channelMessages', { channelId: scene.group.id })),
      scene.source,
    );
    await openGroup(scene.group.id);
    await label(page, '教授');
    await capture('after-restart');
    save('result', {
      ...JSON.parse(readFileSync(resolve(out, 'result.json'), 'utf8')),
      restart: true,
    });
    console.log('RESTART VERIFIED: DM/Group overrides and inheritance reconstructed');
  } else {
    await setName('小熊');
    await closeSettings();
    const prepared = resolve(out, 'prepared.json');
    const scene = existsSync(prepared)
      ? JSON.parse(readFileSync(prepared, 'utf8'))
      : await (async () => {
          const bot = (
            await rpc('create', {
              displayName: 'Navigator QA',
              persona:
                'Follow the Human request precisely. Discover Channel and Human identities through channel_list and channel_query. Send the requested message with channel_send and mention_human_ids if asked. Do not create Assignments. Finish after the requested send.',
            })
          ).bot;
          const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
          const group = (
            await rpc('channelCreate', { name: 'Roleplay nicknames QA', members: [bot.slug] })
          ).channel;
          const inheriting = (
            await rpc('channelCreate', { name: 'Default name QA', members: [bot.slug] })
          ).channel;
          const sourceBody =
            '@Navigator QA Discover this Channel humanMembers with channel_list then send a trusted Human mention with body exactly "QA_NICKNAME_TRUSTED: Confirm Friday. Plain @Human stays ordinary." Use mention_human_ids and no reply_to.';
          await rpc('channelSend', {
            channelId: group.id,
            messageId: 'human-' + crypto.randomUUID(),
            body: sourceBody,
            mentions: [{ botSlug: bot.slug, label: 'Navigator QA', start: 0, end: 13 }],
          });
          const target = await waitMessage(group.id, 'QA_NICKNAME_TRUSTED:');
          assert.equal(target.humanMentions[0].humanId, 'local-human');
          return { bot, dm, group, inheriting, target };
        })();
    save('prepared', scene);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await inbox();
    await nickname(scene.dm.id, '船长');
    await capture('after-dm');
    await nickname(scene.group.id, '研究员');
    await label(page, '研究员');
    await capture('after-researcher');
    const secondContext = await browser.createBrowserContext();
    const second = await secondContext.newPage();
    await second.bringToFront();
    await second.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await second.goto(url, { waitUntil: 'domcontentloaded' });
    await second.goto(url, { waitUntil: 'domcontentloaded' });
    await inbox(second);
    await openGroup(scene.group.id, second);
    await page.bringToFront();
    const before = source(await rpc('channelMessages', { channelId: scene.group.id }));
    const personal = await rpc('humanAttention', { category: 'replies' });
    const attention = await rpc('humanAttentionStatus');
    await nickname(scene.group.id, '教授');
    await label(second, '教授');
    await label(page, '教授');
    assert.deepEqual(source(await rpc('channelMessages', { channelId: scene.group.id })), before);
    assert.deepEqual(await rpc('humanAttention', { category: 'replies' }), personal);
    assert.deepEqual(await rpc('humanAttentionStatus'), attention);
    await capture('after-group-light');
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
    await capture('after-group-dark');
    await inbox();
    await clickText('.bh-human-inbox-row button', '回复');
    await page.waitForSelector('.bh-human-inbox-reply-source [data-human-id="local-human"]');
    await label(page, '教授');
    await clickText('.bh-human-inbox-reply button', '查看附近消息');
    await capture('after-inbox-dark');
    assert.ok(
      await page.evaluate(() =>
        document
          .querySelector('.bh-human-inbox-reply')
          ?.textContent?.includes('Plain @Human stays ordinary.'),
      ),
    );
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    await capture('after-inbox-light');
    await setName('小熊 新');
    await closeSettings();
    const changed = (await rpc('channels')).channels;
    assert.equal(changed.find((c) => c.id === scene.group.id).humanMembers[0].displayName, '教授');
    assert.equal(changed.find((c) => c.id === scene.dm.id).humanMembers[0].displayName, '船长');
    assert.equal(
      changed.find((c) => c.id === scene.inheriting.id).humanMembers[0].displayName,
      '小熊 新',
    );
    await nickname(scene.group.id, '');
    await label(page, '小熊 新');
    await capture('after-inherit');
    await nickname(scene.group.id, '教授');
    await page.setViewport({ width: 900, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await capture('after-narrow');
    await page.setViewport({ width: 1440, height: 900 });
    const messageId = 'human-' + crypto.randomUUID();
    await rpc('channelSend', {
      channelId: scene.dm.id,
      messageId,
      body: 'Use channel_list to discover current humanMembers for your DM and the Group named Roleplay nicknames QA. Send exactly one DM reply using channel_send with reply_to this message. Body: QA_VISIBLE: DM=<actual DM Human displayName>; Group=<actual Group Human displayName>; ID=<Human ID>. Read the actual current names, never guess them.',
    });
    const visible = await waitMessage(scene.dm.id, 'QA_VISIBLE:');
    assert.ok(visible.body.includes('DM=船长'));
    assert.ok(visible.body.includes('Group=教授'));
    assert.ok(visible.body.includes('ID=local-human'));
    await openGroup(scene.dm.id);
    await capture('after-bot-context');
    await secondContext.close();
    await openGroup(scene.group.id);
    save('scene', {
      ...scene,
      source: source(await rpc('channelMessages', { channelId: scene.group.id })),
    });
    save('result', {
      realModel: true,
      nicknameMenus: true,
      dmAndGroupIndependent: true,
      defaultInheritance: true,
      clearNickname: true,
      historicalMentionLabels: true,
      sourceBodyAndOffsetsUnchanged: true,
      attentionUnchanged: true,
      secondWindow: true,
      sourceChannelInbox: true,
      botVisibleNames: true,
      narrowLayout: true,
      restart: false,
    });
    console.log(
      'LIVE DSH VERIFIED: nickname menus, DM/Group, inheritance, Inbox, two windows and real Bot names',
    );
  }
} catch (error) {
  await capture('failure').catch(() => undefined);
  console.log('E2E failed: ' + error.message);
  throw error;
} finally {
  await browser.close();
}
