import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const home = resolve(
  process.env.BH_NAMES_QA_HOME ?? resolve(tmpdir(), 'bh-621-human-default-name-main'),
);
const url = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}-31990.log`), 'utf8').match(
  /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u,
)?.[0];
assert.ok(url, 'Launch the isolated #621 dev instance first');
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
  process.env.BH_NAMES_QA_EVIDENCE ?? '.humanlayer/tasks/issue-621/evidence-main',
);
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
  await client.waitForSelector('.bh-bubble-wrap');
  console.log('Group opened');
  await delay(700);
};
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await inbox();
  const mode = process.argv[2] ?? 'check';
  if (mode === 'inspect') {
    console.log(JSON.stringify(await rpc('humanIdentity')));
  } else if (mode === 'restart') {
    const scene = JSON.parse(readFileSync(resolve(out, 'scene.json'), 'utf8'));
    assert.equal((await rpc('humanIdentity')).displayName, scene.finalName);
    assert.equal(
      (await rpc('channelMessages', { channelId: scene.group.id })).messages.find(
        (message) => message.id === scene.target.id,
      ).body,
      scene.target.body,
    );
    assert.equal(
      (await rpc('channelMessages', { channelId: scene.group.id })).revision,
      scene.revision,
    );
    await openGroup(scene.group.id);
    await page.waitForFunction(
      (name) =>
        document.querySelector('[data-human-id="local-human"]')?.textContent?.trim() === '@' + name,
      {},
      scene.finalName,
    );
    await capture('after-restart');
    save('result', {
      ...JSON.parse(readFileSync(resolve(out, 'result.json'), 'utf8')),
      restart: true,
    });
    console.log(
      'RESTART VERIFIED: one durable Human name, unchanged source and historical mention',
    );
  } else {
    await settings();
    if ((await rpc('humanIdentity')).defaultDisplayName !== null) {
      await clickText('[data-human-name-setting] button', '恢复默认');
      await page.waitForFunction(
        () => document.querySelector('#bh-human-default-name')?.value === '',
        { polling: 100 },
      );
    }
    await capture('before-settings');

    assert.equal((await rpc('humanIdentity')).displayName, 'Human');
    await closeSettings();
    const preparedPath = resolve(out, 'prepared.json');
    const { bot, group, target } = existsSync(preparedPath)
      ? JSON.parse(readFileSync(preparedPath, 'utf8'))
      : await (async () => {
          const bot = (
            await rpc('create', {
              displayName: 'Navigator QA',
              persona:
                'Follow the Human request precisely. First channel_list to discover humanMembers, then channel_send with mention_human_ids using the current stable Human ID. Never guess a Human ID or type a label for the trusted prefix. Do not create Assignments. Send exactly one requested Group message. After an acknowledgement, finish without sending.',
            })
          ).bot;
          const group = (
            await rpc('channelCreate', { name: 'Roleplay names QA', members: [bot.slug] })
          ).channel;
          const sourceBody =
            '@Navigator QA Use channel_list to discover humanMembers and channel_send to send one trusted Human mention. The body must be exactly "QA_NAME_TRUSTED: Please confirm Friday. Plain @Human stays ordinary." Use mention_human_ids; do not set reply_to.';
          await rpc('channelSend', {
            channelId: group.id,
            messageId: 'human-' + crypto.randomUUID(),
            body: sourceBody,
            mentions: [{ botSlug: bot.slug, label: 'Navigator QA', start: 0, end: 13 }],
          });
          const target = await waitMessage(group.id, 'QA_NAME_TRUSTED:');
          assert.equal(target.humanMentions[0].humanId, 'local-human');
          return { bot, group, target };
        })();
    save('prepared', { bot, group, target });
    console.log('Live Bot trusted mention created');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await inbox();
    await openGroup(group.id);
    await capture('before-channel');
    console.log('Opening second window');
    const secondContext = await browser.createBrowserContext();
    const second = await secondContext.newPage();
    await second.bringToFront();
    await second.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await second.goto(url, { waitUntil: 'domcontentloaded' });
    console.log('Second window loaded');
    await second.goto(url, { waitUntil: 'domcontentloaded' });
    await second.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((node) => node.textContent?.trim() === '继续')
        ?.click(),
    );
    await inbox(second);
    console.log('Second window Bot surface ready');
    await openGroup(group.id, second).catch(async (error) => {
      await second.screenshot({ path: resolve(out, 'second-failure.png') });
      throw error;
    });
    await page.bringToFront();
    const before = await rpc('channelMessages', { channelId: group.id });
    const attention = await rpc('humanAttentionStatus');
    const personal = await rpc('humanAttention', { category: 'replies' });
    const finalName = '教授 🐻';
    await setName(finalName);
    console.log('Human name saved through real settings');
    await capture('after-settings');
    await second.waitForFunction(
      (name) =>
        document.querySelector('[data-human-id="local-human"]')?.textContent?.trim() === '@' + name,
      { polling: 100 },
      finalName,
    );
    await rpc('update', { slug: bot.slug, patch: { displayName: finalName } });
    await second.waitForFunction(
      (id, name) => document.querySelector(`[data-bot-id="${id}"]`)?.textContent?.trim() === name,
      { polling: 100 },
      bot.slug,
      finalName,
    );
    await closeSettings();
    await openGroup(group.id);
    await page.waitForFunction(
      (name) => document.querySelector('.bh-bubble-author')?.textContent?.includes(name),
      { polling: 100 },
      finalName,
    );
    assert.equal((await rpc('humanIdentity')).humanId, 'local-human');
    const after = await rpc('channelMessages', { channelId: group.id });
    assert.equal(after.revision, before.revision);
    for (const old of before.messages) {
      const current = after.messages.find((message) => message.id === old.id);
      assert.equal(current.body, old.body);
      assert.deepEqual(current.mentions, old.mentions);
      assert.deepEqual(current.humanMentions, old.humanMentions);
    }
    assert.deepEqual(await rpc('humanAttentionStatus'), attention);
    assert.deepEqual(await rpc('humanAttention', { category: 'replies' }), personal);
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    await capture('after-channel-light');
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
    await capture('after-channel-dark');
    await inbox();
    await clickText('.bh-human-inbox-row button', '回复');
    await page.waitForSelector('.bh-human-inbox-reply-source [data-human-id="local-human"]');
    await clickText('.bh-human-inbox-reply button', '查看附近消息');
    await page.waitForFunction(
      (name) =>
        document
          .querySelector('.bh-human-inbox-reply-source [data-human-id="local-human"]')
          ?.textContent?.trim() ===
        '@' + name,
      { polling: 100 },
      finalName,
    );
    assert.ok(
      await page.evaluate(() =>
        document
          .querySelector('.bh-human-inbox-reply')
          ?.textContent?.includes('Plain @Human stays ordinary.'),
      ),
    );
    await capture('after-inbox-dark');
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    await capture('after-inbox-light');
    await page.setViewport({ width: 900, height: 1100, deviceScaleFactor: 1 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await capture('after-narrow');
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await settings();
    await clickText('[data-human-name-setting] button', '恢复默认');
    await page.waitForFunction(
      () => document.querySelector('#bh-human-default-name')?.value === '',
    );
    assert.equal((await rpc('humanIdentity')).displayName, 'Human');
    await capture('after-default');
    await closeSettings();
    await openGroup(group.id);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-human-id="local-human"]')?.textContent?.trim() === '@Human',
    );
    await setName(finalName);
    await closeSettings();
    await openGroup(group.id);
    save('scene', { bot, group, target, finalName, revision: before.revision });
    save('result', {
      realModel: true,
      settingsSave: true,
      currentAuthors: true,
      historicalHumanAndBotMentions: true,
      sameNameTypedActors: true,
      plainTextUnchanged: true,
      sourceBodyAndOffsetsUnchanged: true,
      attentionUnchanged: true,
      secondWindow: true,
      clearDefault: true,
      restart: false,
    });
    console.log(
      'LIVE DSH VERIFIED: settings, real trusted Human mention, historical labels, same names, second window, Inbox and reset',
    );
  }
} catch (error) {
  console.log('E2E failed: ' + error.message);
  console.log('Identity: ' + JSON.stringify(await rpc('humanIdentity').catch(() => null)));
  console.log(
    'Settings state: ' +
      JSON.stringify(
        await page
          .evaluate(() => ({
            input: document.querySelector('#bh-human-default-name')?.value,
            disabled: document.querySelector('#bh-human-default-name')?.disabled,
            buttons: [...document.querySelectorAll('[data-human-name-setting] button')].map(
              (b) => ({
                text: b.textContent,
                disabled: b.disabled,
              }),
            ),
            status: document.querySelector('[data-human-name-setting] [role=status]')?.textContent,
            error: document.querySelector('[data-human-name-setting] [role=alert]')?.textContent,
          }))
          .catch(() => null),
      ),
  );
  await capture('failure').catch(() => undefined);
  save(
    'failure-controls',
    await page
      .evaluate(() =>
        [...document.querySelectorAll('button')].map((button) => ({
          text: button.textContent?.trim(),
          label: button.getAttribute('aria-label'),
          popup: button.getAttribute('aria-haspopup'),
          children: button.childElementCount,
          spans: [...button.querySelectorAll(':scope > span')].map((span) => span.textContent),
        })),
      )
      .catch(() => null),
  );
  throw error;
} finally {
  await browser.close();
}
