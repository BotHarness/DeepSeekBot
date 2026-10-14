import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'check';
const port = Number(process.env.BH_INBOX_QA_PORT ?? 32006);
const home = resolve(process.env.BH_INBOX_QA_HOME ?? resolve(tmpdir(), 'bh-687-inbox-list'));
const out = resolve(repo, '.humanlayer/tasks/issue-687', mode === 'before' ? 'before' : 'evidence');
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
    const specs = [
      ['inbox-release', 'Release Bot'],
      ['inbox-docs', 'Docs Bot'],
      ['inbox-review', 'Review Bot'],
    ];
    for (const [slug, displayName] of specs) {
      if (!core.registry.get(slug)) core.registry.create({ slug, displayName });
      const dm = core.channels.getOrCreateDm(slug, displayName);
      for (let i = 0; i < 4; i++)
        await core.channels.appendMessageOnce(dm.id, {
          id: 'inbox-history-' + slug + '-' + i,
          at: new Date(Date.now() - (4 - i) * 1000).toISOString(),
          author: { kind: 'bot', slug },
          body: 'Earlier context ' + (i + 1) + ': launch review findings for ' + displayName,
        });
      await core.channels.appendMessageOnce(dm.id, {
        id: 'inbox-grant-' + slug,
        at: new Date().toISOString(),
        author: { kind: 'bot', slug },
        grantRequest: true,
        body:
          'Please choose the ' +
          displayName +
          ' workspace before I begin reviewing the launch plan.',
      });
      for (let i = 0; i < 4; i++)
        await core.channels.appendMessageOnce(dm.id, {
          id: 'inbox-newer-' + slug + '-' + i,
          at: new Date(Date.now() + i * 1000).toISOString(),
          author: { kind: 'bot', slug },
          body: 'Newer context ' + (i + 1) + ': update to the launch review for ' + displayName,
        });
    }
    const group =
      core.channels.list().find((c) => c.name === 'Launch Coordination') ??
      core.channels.createGroup({
        name: 'Launch Coordination',
        members: specs.map(([slug]) => slug),
      });
    for (let i = 0; i < 8; i++)
      await core.channels.appendMessageOnce(group.id, {
        id: 'inbox-group-' + i,
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: specs[i % 3][0] },
        body:
          'Launch update ' + (i + 1) + ': review the release checklist and documentation handoff.',
      });
    console.log(
      JSON.stringify({ unread: core.humanAttention.status().unreadCount, bots: specs.length }),
    );
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
const shot = async (name) => {
  await page.bringToFront();
  return page.screenshot({
    waitForFonts: false,
    path: resolve(
      out,
      name + (mode === 'resume' && name !== 'overview-restarted' ? '-restart' : '') + '.png',
    ),
  });
};
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
const requestEvidence = [];
page.on('request', (request) => {
  if (!request.url().includes('/api/botharness/humanAttention')) return;
  try {
    const payload = JSON.parse(request.postData());
    requestEvidence.push({ method: payload.method, args: payload.payload.args });
  } catch {}
});
const openInbox = async (client = page) => {
  await client.waitForSelector('.bh-panel-activity[data-wide="true"]');
  await client.click('.bh-panel-activity');
  await client.waitForSelector('.bh-activity-center-header', { timeout: 5000 }).catch(async () => {
    await client.waitForSelector('.bh-panel-activity');
    await client.click('.bh-panel-activity');
    await client.waitForSelector('.bh-activity-center-header');
  });
  await click('.bh-activity-center-header [role="tab"]', '收件箱', client);
  await click('.bh-human-inbox-tabs button', '需要我处理', client);
  await client.waitForSelector('.bh-human-inbox-row-open');
};
const selectFilter = async (index, label) => {
  const controls = await page.$$('.bh-human-inbox-selector');
  await controls[index].click();
  await page.waitForSelector('[role="menu"]', { visible: true });
  await click('[role="menu"] button', label);
  await page.waitForFunction(
    (label) =>
      [...document.querySelectorAll('.bh-human-inbox-selector')].some((button) =>
        button.textContent.includes(label),
      ),
    {},
    label,
  );
};
if (mode === 'row-actions') {
  try {
    await login(page);
    await openInbox();
    const canonical = await rpc('humanAttention', {
      category: 'action',
      sort: 'oldest',
      limit: 50,
    });
    const repair = canonical.items.find(
      (item) => item.kind === 'bot-message-needs-repair' && item.channelName && item.messageId,
    );
    assert.ok(repair, 'Use a task QA Profile with an actual repair admission and source placement');
    const rowGeometry = await page.evaluate(() =>
      [...document.querySelectorAll('.bh-human-inbox-row')].map((row) => {
        const source = row.querySelector('.bh-human-inbox-source-link');
        const box = row.getBoundingClientRect();
        const sourceBox = source.getBoundingClientRect();
        const others = [...row.querySelectorAll('.bh-human-inbox-row-actions button')].filter(
          (button) => button !== source,
        );
        return {
          sourceRightInset: box.right - sourceBox.right,
          sourceRightmost: others.every(
            (button) => button.getBoundingClientRect().right <= sourceBox.left + 1,
          ),
          repairTextButtonAbsent: others.every(
            (button) => !['查看 Bot 收件箱', 'Open Bot Inbox'].includes(button.textContent.trim()),
          ),
        };
      }),
    );
    assert.ok(rowGeometry.length > 0);
    for (const row of rowGeometry) {
      assert.equal(row.sourceRightmost, true);
      assert.equal(row.repairTextButtonAbsent, true);
      assert.ok(Math.abs(row.sourceRightInset - 16) < 1);
    }
    await theme(false);
    await shot('row-source-rightmost-light');
    await theme(true);
    await shot('row-source-rightmost-dark');
    const selector =
      '.bh-human-inbox-row[data-attention-id="' + repair.id + '"] .bh-human-inbox-row-open';
    await page.click(selector);
    await page.waitForSelector('.bh-human-inbox-detail .bh-human-inbox-reply-source');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.bh-human-inbox-detail button')].some(
        (button) => button.textContent.trim() === '查看 Bot 收件箱',
      ),
    );
    await shot('repair-maintenance-details-dark');
    await click('.bh-human-inbox-detail button', '查看 Bot 收件箱');
    await page.waitForFunction(() => !document.querySelector('.bh-human-inbox-detail'));
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-sidebar-entry]')].some(
        (node) =>
          node.querySelector('[data-panel-label]')?.textContent.includes('收件箱') &&
          node.querySelector('[data-panel-head]')?.getAttribute('aria-expanded') === 'true',
      ),
    );
    const inboxEntry = await page.evaluateHandle(() =>
      [...document.querySelectorAll('[data-sidebar-entry]')].find(
        (node) => node.querySelector('[data-panel-label]')?.textContent === 'Bot 收件箱',
      ),
    );
    assert.ok(inboxEntry.asElement());
    await inboxEntry
      .asElement()
      .screenshot({ path: resolve(out, 'repair-bot-inbox-dark.png'), waitForFonts: false });
    await inboxEntry.dispose();
    const stillPending = (
      await rpc('humanAttention', { category: 'action', sort: 'oldest', limit: 50 })
    ).items;
    assert.ok(stillPending.some((item) => item.id === repair.id));
    writeFileSync(
      resolve(out, 'row-actions-verification.json'),
      JSON.stringify(
        {
          viewport: { width: 1440, height: 900 },
          actualRepairAdmission: true,
          rowGeometry,
          sourceAlwaysRightmost: true,
          repairMaintenanceOnlyInDetails: true,
          opensOwningBotInbox: true,
          requestNotReplayedOrIgnored: true,
          lightAndDark: true,
        },
        null,
        2,
      ),
    );
    console.log(
      'PASS: rightmost source navigation, repair maintenance in details, owning Bot Inbox navigation without replay or ignore.',
    );
  } catch (error) {
    console.error(error);
    await shot('row-actions-failure').catch(() => undefined);
    throw error;
  } finally {
    await browser.close();
  }
  process.exit(0);
}

try {
  await login(page);
  await openInbox();
  await theme(false);
  await page.waitForFunction(() => document.querySelectorAll('.bh-human-inbox-row').length === 3);
  assert.equal(await page.$('.bh-human-inbox-detail'), null);
  assert.equal(await page.$('.bh-human-inbox-filters select'), null);
  assert.equal(await page.$('button button'), null);
  await shot('list-light');
  const geometry = await page.evaluate(() =>
    [...document.querySelectorAll('.bh-human-inbox-row')].map((row) => {
      const box = row.getBoundingClientRect(),
        text = row.querySelector('.bh-human-inbox-row-main').getBoundingClientRect();
      const button = row.querySelector('.bh-human-inbox-row-actions button'),
        style = getComputedStyle(button);
      return {
        height: box.height,
        textInset: text.x - box.x,
        rightInset:
          box.right -
          row.querySelector('.bh-human-inbox-row-actions').getBoundingClientRect().right,
        primaryFill: style.backgroundColor,
        primaryToken: getComputedStyle(document.body)
          .getPropertyValue('--dsw-alias-button-primary-fill')
          .trim(),
      };
    }),
  );
  for (const row of geometry) {
    assert.ok(row.textInset >= 16);
    assert.ok(row.rightInset >= 16);
    assert.ok(row.height <= 100);
  }
  await theme(true);
  await shot('list-dark');
  const controls = await page.$$('.bh-human-inbox-selector');
  await controls[0].click();
  await page.waitForSelector('[role="menu"]', { visible: true });
  await shot('native-bot-selector-dark');
  await click('[role="menu"] button', 'Review Bot');
  await page.waitForFunction(() => document.querySelectorAll('.bh-human-inbox-row').length === 1);
  assert.ok(requestEvidence.some((value) => value.args.botSlug === 'inbox-review'));
  await shot('filtered-bot-dark');
  await selectFilter(1, 'Review Bot');
  await page.waitForFunction(() => document.querySelectorAll('.bh-human-inbox-row').length === 1);
  await selectFilter(0, '全部 Bot');
  await selectFilter(1, '全部频道');
  await page.waitForFunction(() => document.querySelectorAll('.bh-human-inbox-row').length === 3);
  const sort = await page.$$('.bh-human-inbox-selector');
  await sort[2].click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.bh-human-inbox-selector')].some((button) =>
      button.textContent.includes('最新在前'),
    ),
  );
  assert.ok(requestEvidence.some((value) => value.args.sort === 'newest'));
  await selectFilter(2, '最早在前');
  await page.waitForFunction(() => document.querySelectorAll('.bh-human-inbox-row').length === 3);
  const firstId = await page.$eval('.bh-human-inbox-row', (row) =>
    row.getAttribute('data-attention-id'),
  );
  await page.click('.bh-human-inbox-row-main');
  await page.waitForSelector('.bh-human-inbox-detail .bh-grant-request-card');
  assert.equal(
    await page.$eval('.bh-human-inbox-row-open', (row) => row.getAttribute('aria-expanded')),
    'true',
  );
  await shot('row-details-dark');
  const detailPadding = await page.$eval('.bh-human-inbox-message', (message) =>
    parseFloat(getComputedStyle(message).paddingLeft),
  );
  assert.ok(detailPadding >= 16);
  await theme(false);
  await shot('row-details-light');
  await page.click('.bh-human-inbox-row-open[aria-expanded="true"]');
  await page.waitForFunction(() => !document.querySelector('.bh-human-inbox-detail'));
  await page.focus('.bh-human-inbox-row-open');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.bh-human-inbox-detail .bh-grant-request-card');
  await shot('keyboard-details-light');
  await page.click('.bh-human-inbox-row-open[aria-expanded="true"]');
  await page.click('.bh-human-inbox-row-actions button');
  assert.equal(await page.$('.bh-human-inbox-detail'), null);
  await page.waitForSelector('[data-folder-browser]', { visible: true, timeout: 15000 });
  assert.equal(await page.$('.bh-human-inbox-detail'), null);
  assert.equal(await page.$('.bh-human-inbox-row-open[aria-expanded="true"]'), null);
  await shot('list-action-picker-light');
  await click('[role="dialog"]:has([data-folder-browser]) button', '取消');
  await page.waitForFunction(() => !document.querySelector('[data-folder-browser]'));
  await page.click('.bh-human-inbox-row-actions button');
  await page.waitForSelector('[data-folder-browser]', { visible: true, timeout: 15000 });
  await theme(true);
  await shot('list-action-picker-dark');
  await click('[role="dialog"]:has([data-folder-browser]) button', '取消');
  await page.waitForFunction(() => !document.querySelector('[data-folder-browser]'));
  await theme(false);
  await shot('primary-action-details-light');
  assert.equal(await page.$('.bh-human-inbox-detail'), null);
  const sourceItem = (
    await rpc('humanAttention', { category: 'action', sort: 'oldest', limit: 50 })
  ).items.find((item) => item.id === firstId);
  await page.click('.bh-human-inbox-source-link');
  await page.waitForSelector('[data-message-id="' + sourceItem.messageId + '"]');
  assert.equal(await page.$('.bh-human-inbox-detail'), null);
  await shot('exact-source-light');
  await openInbox();
  await click('.bh-human-inbox-tabs button', '其他未读');
  await page.waitForSelector('.bh-human-inbox-channel-avatar');
  await shot('unread-channel-avatar-light');
  await page.click(
    '.bh-human-inbox-row:has(.bh-human-inbox-channel-avatar) .bh-human-inbox-row-open',
  );
  await page.waitForSelector('.bh-human-inbox-detail .bh-human-inbox-message');
  await shot('unread-context-light');

  await click('.bh-human-inbox-tabs button', '需要我处理');
  await page.waitForFunction(() => document.querySelectorAll('.bh-human-inbox-row').length === 3);
  const pending = (await rpc('humanAttention', { category: 'action', sort: 'oldest', limit: 50 }))
    .items[0];
  await page.click('.bh-human-inbox-row-main');
  await page.waitForSelector('.bh-human-inbox-detail .bh-human-inbox-reply-source');
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('.bh-human-inbox-detail [data-message-id]').length,
    ),
    1,
  );
  assert.equal(
    await page.$eval('.bh-human-inbox-message-source', (node) => getComputedStyle(node).opacity),
    '0',
  );
  await page.click('.bh-human-inbox-context-older');
  await page.waitForFunction(
    () => document.querySelectorAll('.bh-human-inbox-detail [data-message-id]').length === 3,
  );
  assert.equal(
    await page.$eval('.bh-human-inbox-detail', (node) =>
      node.textContent.includes('Newer context'),
    ),
    false,
  );
  await page.click('.bh-human-inbox-context-older');
  await page.waitForFunction(
    () => document.querySelectorAll('.bh-human-inbox-detail [data-message-id]').length === 5,
  );
  await page.click('.bh-human-inbox-context-newer');
  await page.waitForFunction(
    () => document.querySelectorAll('.bh-human-inbox-detail [data-message-id]').length === 7,
  );
  await page.click('.bh-human-inbox-context-newer');
  await page.waitForFunction(
    () => document.querySelectorAll('.bh-human-inbox-detail [data-message-id]').length === 9,
  );
  const contextGeometry = await page.$eval('.bh-human-inbox-context-window', (node) => {
    const upper = node.querySelector('.bh-human-inbox-context-older').getBoundingClientRect(),
      flow = node.querySelector('.bh-human-inbox-message-flow').getBoundingClientRect(),
      lower = node.querySelector('.bh-human-inbox-context-newer').getBoundingClientRect();
    return {
      upperGap: flow.top - upper.bottom,
      lowerGap: lower.top - flow.bottom,
      upperWidth: upper.width,
      flowWidth: flow.width,
      lowerWidth: lower.width,
    };
  });
  assert.ok(Math.abs(contextGeometry.upperGap) < 1 && Math.abs(contextGeometry.lowerGap) < 1);
  assert.ok(
    Math.abs(contextGeometry.upperWidth - contextGeometry.flowWidth) < 1 &&
      Math.abs(contextGeometry.lowerWidth - contextGeometry.flowWidth) < 1,
  );
  await page.hover('.bh-human-inbox-reply-source');
  assert.equal(
    await page.$eval(
      '.bh-human-inbox-reply-source .bh-human-inbox-message-source',
      (node) => getComputedStyle(node).opacity,
    ),
    '1',
  );
  const sourceGeometry = await page.$eval('.bh-human-inbox-reply-source', (node) => {
    const parent = node.getBoundingClientRect(),
      button = node.querySelector('.bh-human-inbox-message-source').getBoundingClientRect();
    return { topInset: button.top - parent.top, rightInset: parent.right - button.right };
  });
  assert.ok(
    sourceGeometry.topInset >= 7 &&
      sourceGeometry.rightInset >= 7 &&
      sourceGeometry.rightInset < 12,
  );
  await theme(false);
  await shot('detail-context-light');
  await theme(true);
  await shot('detail-context-dark');
  await page.click('.bh-human-inbox-reply-source .bh-human-inbox-message-source');
  await page.waitForFunction(() => !document.querySelector('.bh-human-inbox-detail'));
  await page.waitForSelector('[data-message-id="' + pending.messageId + '"]');
  assert.equal(await page.$('.bh-human-inbox-detail'), null);
  await openInbox();
  const peerContext = await browser.createBrowserContext();
  const peer = await peerContext.newPage();
  await peer.setViewport({ width: 1440, height: 900 });
  await login(peer);
  await openInbox(peer);
  await peer.waitForFunction(() => document.querySelectorAll('.bh-human-inbox-row').length === 3);
  await page.click('.bh-human-inbox-row-main');
  await page.waitForSelector('.bh-human-inbox-detail .bh-human-inbox-reply-source');
  await click('.bh-human-inbox-detail .bh-human-inbox-reply-header button', '移除');
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.bh-human-inbox-row').length === 2 &&
      !document.querySelector('.bh-human-inbox-detail'),
  );
  await peer.waitForFunction(() => document.querySelectorAll('.bh-human-inbox-row').length === 2);
  assert.ok(
    !(await rpc('humanAttention', { category: 'action', sort: 'oldest', limit: 50 })).items.some(
      (item) => item.id === pending.id,
    ),
  );
  const original = (
    await rpc('channelTimeline', {
      channelId: pending.channelId,
      direction: 'around',
      around: pending.messageId,
      olderLimit: 0,
      newerLimit: 0,
    })
  ).page.entries[0];
  assert.equal(original.grantRequest, true);
  assert.notEqual(original.grantRequestResolved, true);
  await shot('detail-dismissed-dark');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.bh-panel-activity');
  await openInbox();
  await page.waitForFunction(() => document.querySelectorAll('.bh-human-inbox-row').length === 2);
  await peerContext.close();

  writeFileSync(
    resolve(out, 'verification.json'),
    JSON.stringify(
      {
        viewport: { width: 1440, height: 900 },
        canonicalFixture: {
          bots: 3,
          workspaceRequests: 3,
          groupMessages: 8,
          dmContextMessages: 24,
        },
        geometry,
        detailPadding,
        nativeSelectors: true,
        nativeKeyboardSelection: true,
        channelAndBotFiltering: true,
        compactOneRowPerItem: true,
        rowClickAndKeyboardOpenDetails: true,
        sourceLinkIndependentAndExact: true,
        primaryActions: true,
        directPrimaryRequestAction: true,
        listActionOpensBrowsePicker: true,
        listActionReopensAfterCancel: true,
        actionDoesNotExpandRow: true,
        channelAvatarNavigation: true,
        lightAndDark: true,
        contextGeometry,
        sourceGeometry,
        independentDirectionalContext: true,
        hoverMessageSourceExact: true,
        persistentInboxOnlyDismiss: true,
        dismissalAcrossWindowsAndReload: true,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: native DSH filtering and keyboard selection, padded compact rows, whole-row details, native primary actions and exact avatar source navigation.',
  );
} catch (error) {
  console.error(error);
  await shot('failure').catch(() => undefined);
  console.log(
    JSON.stringify(
      await page.evaluate(() => ({
        titles: [...document.querySelectorAll('h1,h2')].map((n) => n.textContent),
        buttons: [...document.querySelectorAll('.bh-activity-center button')].map(
          (n) => n.textContent,
        ),
        entries: [...document.querySelectorAll('.bh-panel-activity')].map((n) => ({
          active: n.getAttribute('data-active'),
          unread: n.getAttribute('data-unread'),
        })),
      })),
    ),
  );
  throw error;
} finally {
  await browser.close();
}
