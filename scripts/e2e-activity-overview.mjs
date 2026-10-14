import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'check';
const port = Number(process.env.BH_OVERVIEW_QA_PORT ?? 32002);
const home = resolve(
  process.env.BH_OVERVIEW_QA_HOME ?? resolve(tmpdir(), 'bh-541-activity-overview'),
);
const out = resolve(repo, '.humanlayer/tasks/issue-541', mode === 'before' ? 'before' : 'evidence');
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
  protocolTimeout: 60000,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const shot = (name) =>
  page.screenshot({
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
};
const inbox = async (client = page) => {
  await client.bringToFront();
  await client.evaluate(() => document.querySelector('.bh-human-inbox-entry')?.click());
  await client.waitForSelector('.bh-human-inbox-tabs');
  await click('.bh-human-inbox-tabs button', '需要我处理', client);
  await delay(700);
};
const openDM = async (id, client = page) => {
  await client.bringToFront();
  await client.waitForSelector(`[data-channel-id="${id}"]`);
  await client.evaluate((id) => document.querySelector(`[data-channel-id="${id}"]`)?.click(), id);
  await client.waitForSelector('.bh-channel-options');
  await delay(700);
};
const waitFor = async (test, label) => {
  for (let n = 0; n < 60; n++) {
    const result = await test();
    if (result) return result;
    await delay(2000);
  }
  throw new Error('Timed out: ' + label);
};

const overview = async (client = page) => {
  await client.evaluate(() => document.querySelector('.bh-human-inbox-entry')?.click());
  await client.waitForSelector('.bh-overview');
  await client.waitForSelector('.bh-overview-bot');
};
try {
  await login(page);
  if (mode === 'before') {
    await inbox();
    assert.equal(await page.$('.bh-overview'), null);
    await theme(false);
    await shot('before-inbox-light');
    await theme(true);
    await shot('before-inbox-dark');
    await theme(false);
    await page.setViewport({ width: 420, height: 860, deviceScaleFactor: 1 });
    await shot('before-inbox-narrow');
    console.log('PASS: prior Inbox entry has no operational Overview.');
  } else {
    if (mode === 'work') {
      const all = (await rpc('list')).bots;
      const bot =
        all.find((b) => b.displayName === 'Overview Execution QA') ??
        (
          await rpc('create', {
            displayName: 'Overview Execution QA',
            persona:
              'Follow the Human precisely. Create only one requested Assignment. Use native pwsh only when explicitly requested. Never use bash. Await approval. Never answer the other Bots native questions.',
          })
        ).bot;
      const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
      const project = resolve(home, 'overview-qa-project');
      mkdirSync(project, { recursive: true });
      const workspace = (await rpc('create', { request: { path: project } }, page, 'workspace'))
        .workspace;
      if (
        !(await rpc('grants', { slug: bot.slug })).grants.some(
          (g) => !g.revokedAt && g.workspaceId === workspace.workspaceId,
        )
      )
        await rpc('grantCreate', { slug: bot.slug, workspaceId: workspace.workspaceId });
      await rpc('channelSend', {
        channelId: dm.id,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'First create_assignment exactly once using the existing active Grant. Purpose: use native pwsh to run node -e "setTimeout(()=>console.log(\'ASSIGNMENT_OVERVIEW_READY\'),90000)"; wait for approval, then after actual completion report_to_orchestrator state completed summary ASSIGNMENT_OVERVIEW_READY. Do not create child agents. After creating this Assignment, Orchestrator must use native pwsh itself to run node -e "setTimeout(()=>console.log(\'ORCHESTRATOR_OVERVIEW_READY\'),90000)". Await Human approval and actual completion, then send one DM with ORCHESTRATOR_OVERVIEW_READY. Use the native pwsh tool, never bash; omit workdir in the Orchestrator command so it uses its own Session cwd. These commands only wait and print a marker; do not run any other command.',
      });
      const approvals = await waitFor(async () => {
        const items = (
          await rpc('humanAttention', { category: 'action', botSlug: bot.slug })
        ).items.filter((i) => i.kind === 'tool-approval');
        return items.length >= 2 ? items : false;
      }, 'both native tool approvals');
      await overview();
      await shot('overview-waiting-approvals');
      for (const item of approvals)
        await rpc('toolApprovalDecide', {
          channelId: item.channelId,
          messageId: item.messageId,
          outcome: 'allowed-once',
        });
      const active = await waitFor(async () => {
        const current = (await rpc('activityOverview')).bots.find((b) => b.slug === bot.slug);
        return current?.sessions.length === 2 ? current : false;
      }, 'two executing root Sessions');
      assert.deepEqual(
        new Set(active.sessions.map((s) => s.role)),
        new Set(['orchestrator', 'assignment']),
      );
      await overview();
      await click('.bh-overview-toolbar button', '刷新');
      await page.waitForFunction(
        (slug) =>
          document
            .querySelector('[data-bot-id="' + slug + '"]')
            ?.querySelectorAll('[data-session-id]').length === 2,
        {},
        bot.slug,
      );
      await theme(false);
      await shot('overview-executing-light');
      await theme(true);
      await shot('overview-executing-dark');
      await theme(false);
      for (const session of active.sessions) {
        const observed = [];
        const observe = (request) => {
          if (request.url().includes('/api/')) observed.push(request.postData() ?? '');
        };
        page.on('request', observe);
        await page.click('[data-session-id="' + session.sessionId + '"] button');
        await page.waitForFunction(() => !document.querySelector('.bh-overview'));
        await page.waitForSelector('.bh-session-return-action');
        await delay(700);
        assert.ok(
          observed.some((body) => body.includes(session.sessionId)),
          'native exact Session request',
        );
        await shot('overview-native-' + session.role);
        page.off('request', observe);
        await login(page);
        await overview();
      }
      await waitFor(async () => {
        const current = (await rpc('activityOverview')).bots.find((b) => b.slug === bot.slug);
        return current?.sessions.length === 0;
      }, 'executions finish');
      await click('.bh-overview-toolbar button', '刷新');
      await page.waitForFunction(
        (slug) =>
          document
            .querySelector('[data-bot-id="' + slug + '"]')
            ?.querySelectorAll('[data-session-id]').length === 0,
        {},
        bot.slug,
      );
      await shot('overview-work-completed');
      console.log(
        'PASS: real model started both approved native timed commands, both root Sessions opened exactly, and completed work left execution list.',
      );
    }
    if (!['resume', 'snapshot'].includes(mode)) {
      const all = (await rpc('list')).bots;
      for (const name of ['Release Decision QA', 'Docs Decision QA']) {
        const bot =
          all.find((b) => b.displayName === name) ??
          (
            await rpc('create', {
              displayName: name,
              persona:
                'Follow the Human precisely. Use native ask_user_question once when requested. Await the answer. Do not create Assignments.',
            })
          ).bot;
        const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
        const pending = (
          await rpc('humanAttention', { category: 'action', botSlug: bot.slug })
        ).items.some((i) => i.kind === 'user-question');
        if (!pending) {
          await rpc('channelSend', {
            channelId: dm.id,
            messageId: 'human-' + crypto.randomUUID(),
            body: 'Call native ask_user_question once: id release-route; question "Which release channel should I use?"; options Canary and Stable. Wait for the Human answer; do not create an Assignment.',
          });
          await waitFor(
            async () =>
              (await rpc('humanAttention', { category: 'action', botSlug: bot.slug })).items.some(
                (i) => i.kind === 'user-question',
              ),
            'live question',
          );
        }
      }
    }
    await overview();
    const value = await rpc('activityOverview');
    assert.ok(value.bots.length >= 2);
    if (mode === 'resume') {
      const saved = JSON.parse(readFileSync(resolve(out, 'scene.json'), 'utf8'));
      assert.deepEqual(new Set(value.bots.map((bot) => bot.slug)), new Set(saved.bots));
      assert.ok(value.bots.every((bot) => bot.sessions.length === 0));
      await shot('overview-restarted');
      console.log('PASS: cold restart preserved Bot identities and omitted historical executions.');
    }
    const geometry = await page.evaluate(() => {
      const root = document.querySelector('.bh-overview');
      const card = document.querySelector('.bh-overview-bot');
      const style = getComputedStyle(card);
      return {
        width: root.clientWidth,
        scrollWidth: root.scrollWidth,
        padding: getComputedStyle(root).paddingLeft,
        font: style.fontSize,
        radius: style.borderRadius,
      };
    });
    assert.ok(geometry.scrollWidth <= geometry.width);
    assert.equal(geometry.padding, '24px');
    assert.equal(geometry.radius, '8px');
    console.log('Measured native Overview geometry: ' + JSON.stringify(geometry));
    let totalActions = 0;
    let actionPages = 0;
    let cursor;
    do {
      const result = await rpc('humanAttention', {
        category: 'action',
        limit: Number(process.env.BH_OVERVIEW_QA_ACTION_PAGE_SIZE ?? 100),
        cursor,
      });
      totalActions += result.items.length;
      actionPages++;
      cursor = result.nextCursor;
    } while (cursor !== undefined);
    assert.equal(value.actionCount, totalActions);
    console.log(
      'Paged canonical actions: ' + actionPages + ' pages, ' + totalActions + ' actions.',
    );
    assert.equal(
      await page.$eval('.bh-overview-action-count strong', (n) => Number(n.textContent)),
      value.actionCount,
    );
    const release = value.bots.find((b) => b.displayName === 'Release Decision QA');
    assert.ok(release);
    await theme(false);
    await shot('overview-light');
    await theme(true);
    await shot('overview-dark');
    await theme(false);
    await page.click(`.bh-overview-bot[data-bot-id="${release.slug}"] .bh-overview-bot-header`);
    await page.waitForSelector('.bh-channel-options');
    assert.equal(
      await page.$eval('.bh-topbar [data-conversation-title]', (n) => n.textContent),
      release.displayName,
    );
    await shot('overview-bot-dm');
    await overview();
    await page.click('.bh-overview-action-count');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.bh-human-inbox-tabs button')].some(
        (n) => n.textContent === '需要我处理' && n.getAttribute('aria-selected') === 'true',
      ),
    );
    await shot('overview-inbox-actions');
    await overview();
    await page.setViewport({ width: 420, height: 860, deviceScaleFactor: 1 });
    await shot('overview-narrow');
    assert.ok((await page.$eval('.bh-overview-bot', (n) => n.getBoundingClientRect().width)) > 180);
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    writeFileSync(
      resolve(out, 'scene.json'),
      JSON.stringify({ bots: value.bots.map((b) => b.slug) }, null, 2),
    );
    console.log(
      'PASS: canonical Overview count, Bot DM, Inbox actions, native themes and narrow layout.',
    );
  }
} catch (error) {
  await shot('failure').catch(() => undefined);
  throw error;
} finally {
  await browser.close();
}
