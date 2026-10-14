import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'check';
const port = Number(process.env.BH_ENTRY_QA_PORT ?? 32003);
const home = resolve(process.env.BH_ENTRY_QA_HOME ?? resolve(tmpdir(), 'bh-679-activity-entry'));
const out = resolve(repo, '.humanlayer/tasks/issue-679', mode === 'before' ? 'before' : 'evidence');
mkdirSync(out, { recursive: true });

if (mode === 'seed') {
  const { createCore } = await import('../packages/core/dist/index.mjs');
  const core = createCore({
    dshHome: home,
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('QA fixture must not execute');
      },
    },
  });
  try {
    for (const [slug, displayName] of [
      ['entry-release', 'Release Bot'],
      ['entry-docs', 'Docs Bot'],
      ['entry-review', 'Review Bot'],
    ])
      if (!core.registry.get(slug)) core.registry.create({ slug, displayName });
    const group =
      core.channels.list().find((c) => c.name === 'Launch Coordination') ??
      core.channels.createGroup({
        name: 'Launch Coordination',
        members: ['entry-release', 'entry-docs', 'entry-review'],
      });
    for (let i = 0; i < 110; i++)
      await core.channels.appendMessageOnce(group.id, {
        id: 'entry-qa-' + i,
        at: new Date(Date.now() + i).toISOString(),
        author: { kind: 'bot', slug: i % 2 === 0 ? 'entry-release' : 'entry-docs' },
        body:
          'Launch update ' +
          (i + 1) +
          ': ' +
          (i % 2 === 0
            ? 'Release checks complete; awaiting the documentation handoff.'
            : 'Documentation section reviewed; recording the next release checkpoint.'),
      });
    const dm = core.channels.getOrCreateDm('entry-review', 'Review Bot');
    await core.channels.appendMessageOnce(dm.id, {
      id: 'entry-grant-qa',
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: 'entry-review' },
      body: 'Please choose the review workspace before I begin.',
      grantRequest: true,
    });
    console.log(JSON.stringify({ status: core.humanAttention.status(), groupId: group.id }));
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
  process.exit(0);
}

const url = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}-${port}.log`), 'utf8').match(
  /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u,
)?.[0];
assert.ok(url, 'Launch isolated DSH first');
const modules = resolve(repo, 'node_modules/.pnpm');
const pkg = readdirSync(modules).find((name) => name.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(modules, pkg, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 60000,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const shot = (name) =>
  page.screenshot({
    waitForFonts: false,
    path: resolve(
      out,
      name + (mode === 'resume' && name !== 'overview-restarted' ? '-restart' : '') + '.png',
    ),
  });
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
  await client.waitForSelector('.bh-human-inbox-entry', { timeout: 5000 }).catch(async () => {
    await client.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((n) => n.textContent?.includes('Bot 模式'))
        ?.click(),
    );
    await client.waitForSelector('.bh-human-inbox-entry');
  });
  const expand = await client.$('button[aria-label="打开侧边栏"]');
  if (expand) await expand.click();
  await client.waitForSelector('.bh-panel-activity[data-wide="true"]');
};

try {
  await login(page);
  console.log('Authenticated isolated DSH');
  if (mode === 'empty') {
    const status = await rpc('humanAttentionStatus');
    assert.equal(status.unreadCount, 0);
    assert.equal(status.hasAction, false);
    if (await page.$('.bh-panel-gear')) await page.click('button:has(.bh-panel-glyph)');
    await page.waitForSelector('.bh-panel-activity[data-active="false"]');
    await page.hover('button:has(.bh-panel-glyph)');
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('.bh-panel-activity')).opacity === '0',
    );
    assert.equal(await page.$eval('.bh-panel-activity', (node) => node.tabIndex), -1);
    assert.equal(
      await page.$eval('.bh-panel-activity', (node) => node.getAttribute('aria-hidden')),
      'true',
    );
    await theme(false);
    await shot('empty-off-hover-light');
    await theme(true);
    await shot('empty-off-hover-dark');
    await page.click('button[aria-label="收起侧边栏"]');
    await page.waitForSelector('.bh-panel-activity[data-wide="false"]');
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('.bh-panel-activity')).display === 'none',
    );
    await shot('empty-off-collapsed-dark');
    await theme(false);
    await shot('empty-off-collapsed-light');
    await page.click('button[aria-label="打开侧边栏"]');
    await page.waitForSelector('.bh-panel-activity[data-wide="true"]');
    await page.click('button:has(.bh-panel-glyph)');
    await page.waitForSelector('.bh-panel-gear');
    await page.mouse.click(800, 400);
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('.bh-panel-activity')).opacity === '0',
    );
    assert.equal(await page.$('.bh-panel-activity .bh-human-inbox-count'), null);
    assert.equal(await page.$('.bh-panel-activity .bh-human-inbox-notification-dot'), null);
    await theme(false);
    await shot('empty-hidden-light');
    await theme(true);
    await shot('empty-hidden-dark');
    await page.hover('button:has(.bh-panel-glyph)');
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('.bh-panel-activity')).opacity === '1',
    );
    await shot('empty-hover-dark');
    await theme(false);
    await shot('empty-hover-light');
    const box = await page.$eval('.bh-panel-activity', (node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    assert.equal(
      await page.$eval('.bh-panel-activity', (node) => getComputedStyle(node).opacity),
      '1',
    );
    await page.click('.bh-panel-activity');
    await page.waitForSelector('.bh-overview');
    await page.mouse.click(800, 400);
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('.bh-panel-activity')).opacity === '0',
    );
    await page.focus('button:has(.bh-panel-glyph)');
    for (let step = 0; step < 5; step++) {
      if (await page.evaluate(() => document.activeElement?.matches('.bh-panel-activity'))) break;
      await page.keyboard.press('Tab');
    }
    assert.equal(
      await page.evaluate(() => document.activeElement?.matches('.bh-panel-activity')),
      true,
    );
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('.bh-panel-activity')).opacity === '1',
    );
    await shot('empty-keyboard-focus-light');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.bh-overview');
    writeFileSync(
      resolve(out, 'empty-verification.json'),
      JSON.stringify(
        {
          status,
          hiddenAtRest: true,
          modeOffHoverDoesNotReveal: true,
          modeOffHiddenEntryNotTabbable: true,
          modeOffCollapsedEntryHidden: true,
          revealedByBotHover: true,
          staysClickableAcrossPointerTransfer: true,
          revealedByKeyboardFocus: true,
          noDuplicateIndicators: true,
        },
        null,
        2,
      ),
    );
    console.log(
      'PASS: no-unread entry stays hidden on hover while mode off, hidden at rest while mode on, revealed by Bot hover, stays clickable, and reveals for keyboard focus in real DSH.',
    );
  } else {
    await page.waitForSelector('.bh-panel-activity[data-unread="true"]');
    if (await page.$('.bh-panel-gear')) {
      await page.click('button:has(.bh-panel-glyph)');
      await page.waitForFunction(() => !document.querySelector('.bh-panel-gear'));
    }
    await theme(true);
    await shot('native-mode-dark');
    console.log('Opening activity entry');
    await page.click('.bh-panel-activity');
    await page.waitForSelector('.bh-overview').catch(async (error) => {
      await shot('diagnostic');
      console.log(
        await page.evaluate(() => ({
          panel: document
            .querySelector('button:has(.bh-panel-glyph)')
            ?.getAttribute('aria-current'),
          headers: [...document.querySelectorAll('h1,h2,[data-conversation-title]')].map(
            (n) => n.textContent,
          ),
          inbox: !!document.querySelector('.bh-human-inbox-inner'),
          text: document.querySelector('.bh-main')?.textContent?.slice(0, 400),
        })),
      );
      throw error;
    });
    await page.waitForFunction(
      () => document.querySelector('.bh-human-inbox-count')?.textContent?.trim() === '99+',
    );
    const status = await rpc('humanAttentionStatus');
    assert.ok(status.unreadCount > 99);
    assert.equal(status.hasAction, true);
    assert.equal(await page.$('.bh-panel-activity .bh-human-inbox-notification-dot'), null);
    assert.equal(await page.$('.bh-panel-activity .bh-human-inbox-action-dot'), null);
    const geometry = await page.evaluate(() => {
      const box = (n) => {
        const r = n.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const chip = document.querySelector('.bh-panel-activity');
      const bot = document.querySelector('.bh-panel-glyph').closest('button');
      const gear = document.querySelector('.bh-panel-gear');
      return {
        chip: box(chip),
        bot: box(bot),
        gear: box(gear),
        label: chip.getAttribute('aria-label'),
        entries: document.querySelectorAll('.bh-human-inbox-entry').length,
      };
    });
    assert.equal(geometry.entries, 1);
    assert.ok(geometry.label.includes(String(status.unreadCount)));
    assert.ok(geometry.chip.x + geometry.chip.width <= geometry.gear.x);
    assert.equal(
      geometry.chip.y + geometry.chip.height / 2,
      geometry.bot.y + geometry.bot.height / 2,
    );
    await page.hover('button:has(.bh-panel-glyph)');
    await theme(false);
    await shot('expanded-overview-light');
    await theme(true);
    await shot('expanded-overview-dark');
    await theme(false);
    await click('.bh-activity-center-header .bh-human-inbox-tabs button', '收件箱');
    await page.waitForSelector('.bh-human-inbox-inner');
    await shot('expanded-inbox-light');
    await page.click('[data-channel-id="dm-entry-review"]');
    await page.waitForSelector('.bh-channel-options');
    await page.click('.bh-panel-activity');
    await page.waitForSelector('.bh-human-inbox-inner');
    assert.equal(await page.$('.bh-overview'), null);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.bh-panel-activity');
    await page.click('.bh-panel-activity');
    await page.waitForSelector('.bh-human-inbox-inner');
    await shot('remembered-inbox-reloaded');
    await click('.bh-activity-center-header .bh-human-inbox-tabs button', '总览');
    await page.waitForSelector('.bh-overview');
    await page.click('button[aria-label="收起侧边栏"]');
    await delay(400);
    const collapsed = await page.evaluate(() => {
      const box = (n) => {
        const r = n.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return {
        bot: box(document.querySelector('.bh-panel-glyph').closest('button')),
        chip: box(document.querySelector('.bh-panel-activity')),
        dot: box(document.querySelector('.bh-human-inbox-notification-dot')),
        dotColor: getComputedStyle(document.querySelector('.bh-human-inbox-notification-dot'))
          .backgroundColor,
      };
    });
    assert.equal(await page.$('.bh-panel-activity .bh-human-inbox-count'), null);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelectorAll('.bh-panel-activity .bh-human-inbox-notification-dot').length,
      ),
      1,
    );
    assert.equal(collapsed.dot.width, 6);
    assert.equal(collapsed.dot.height, 6);
    assert.ok(collapsed.dot.x > collapsed.chip.x + collapsed.chip.width / 2);
    assert.ok(
      collapsed.dot.y + collapsed.dot.height < collapsed.chip.y + collapsed.chip.height / 2,
    );
    assert.equal(collapsed.bot.width, 36);
    assert.equal(collapsed.chip.width, 36);
    assert.equal(collapsed.chip.height, collapsed.bot.height);
    assert.equal(collapsed.chip.x, collapsed.bot.x);
    assert.equal(collapsed.chip.y - (collapsed.bot.y + collapsed.bot.height), 4);
    await shot('collapsed-light');
    await theme(true);
    await shot('collapsed-dark');
    await theme(false);
    await page.click('button:has(.bh-panel-glyph)');
    await page.waitForFunction(() => !document.querySelector('.bh-activity-center'));
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('.bh-panel-activity')).display === 'none',
    );
    await shot('collapsed-off-light');
    await theme(true);
    await shot('collapsed-off-dark');
    await theme(false);
    await page.focus('button:has(.bh-panel-glyph)');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.bh-overview');
    await page.focus('button:has(.bh-panel-glyph)');
    for (let step = 0; step < 5; step++) {
      if (await page.evaluate(() => document.activeElement?.matches('.bh-panel-activity'))) break;
      await page.keyboard.press('Tab');
    }
    assert.equal(
      await page.evaluate(() => document.activeElement?.matches('.bh-panel-activity')),
      true,
    );
    await page.keyboard.press('Enter');
    await page.waitForSelector('.bh-overview');
    await page.click('button[aria-label="打开侧边栏"]');
    await delay(400);
    await page.click('button:has(.bh-panel-glyph)');
    await page.waitForFunction(() => !document.querySelector('.bh-activity-center'));
    assert.equal(
      await page.$eval('.bh-panel-activity', (node) => getComputedStyle(node).opacity),
      '1',
    );
    await page.focus('button:has(.bh-panel-glyph)');
    for (let step = 0; step < 5; step++) {
      if (await page.evaluate(() => document.activeElement?.matches('.bh-panel-activity'))) break;
      await page.keyboard.press('Tab');
    }
    assert.equal(
      await page.evaluate(() => document.activeElement?.matches('.bh-panel-activity')),
      true,
    );
    await page.keyboard.press('Space');
    await page.waitForSelector('.bh-overview');
    await page.hover('button:has(.bh-panel-glyph)');
    await page.click('.bh-panel-gear');
    await delay(500);
    assert.ok(
      await page.evaluate(() =>
        [...document.querySelectorAll('[role="dialog"]')].some((n) =>
          n.textContent?.includes('Bot'),
        ),
      ),
    );
    await shot('settings-independent');
    await page.keyboard.press('Escape');
    await delay(300);
    const action = await rpc('humanAttention', { category: 'action' });
    assert.equal(action.items.length, 1);
    writeFileSync(
      resolve(out, 'verification.json'),
      JSON.stringify(
        {
          status,
          geometry,
          collapsed,
          expandedBadgeOnly: true,
          collapsedTopRightDotOnly: true,
          collapsedModeOffHiddenEvenWithUnread: true,
          rememberedInboxAcrossDMAndReload: true,
          overviewRestoredFromNativeModeByKeyboard: true,
          settingsIndependent: true,
        },
        null,
        2,
      ),
    );
    console.log(
      'PASS: real DSH expanded badge only, 99+, collapsed top-right red dot only, 36px alignment / 4px gap, remembered tabs across DM and reload, native-mode keyboard activation and independent settings.',
    );
  }
} finally {
  await browser.close();
}
