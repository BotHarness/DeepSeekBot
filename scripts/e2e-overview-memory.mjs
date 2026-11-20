import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const repo = process.env.BH_OVERVIEW_MEMORY_QA_REPO
  ? resolve(process.env.BH_OVERVIEW_MEMORY_QA_REPO)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'check';
const port = Number(process.env.BH_OVERVIEW_MEMORY_QA_PORT ?? 32024);
const home = resolve(
  process.env.BH_OVERVIEW_MEMORY_QA_HOME ?? resolve(tmpdir(), 'bh-716-overview-memory'),
);
const out = process.env.BH_OVERVIEW_MEMORY_QA_OUT
  ? resolve(process.env.BH_OVERVIEW_MEMORY_QA_OUT)
  : resolve(repo, '.humanlayer/tasks/issue-716', mode === 'before' ? 'before' : 'evidence');
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
const shot = async (name) => {
  await page.evaluate(() => {
    const overview = document.querySelector('.bh-overview');
    if (overview) overview.scrollTop = 0;
  });
  return page.screenshot({
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
  await client.waitForSelector('.bh-panel-activity', { timeout: 5000 }).catch(async () => {
    await client.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((n) => n.textContent?.includes('Bot 模式'))
        ?.click(),
    );
    await client.waitForSelector('.bh-panel-activity');
  });
};
const overview = async (client = page) => {
  await client.evaluate(() => document.querySelector('.bh-panel-activity')?.click());
  await client.waitForSelector('.bh-activity-center-header');
  await click('.bh-activity-center-header [role=tab]', '总览', client);
  await client.waitForSelector('.bh-overview');
};

try {
  await login(page);
  const sceneFile = resolve(repo, '.humanlayer/tasks/issue-716/scene.json');
  mkdirSync(dirname(sceneFile), { recursive: true });
  const git = (dir, args, at) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, ...(at ? { GIT_COMMITTER_DATE: at, GIT_AUTHOR_DATE: at } : {}) },
      shell: false,
    });
  if (mode === 'prepare') {
    const all = (await rpc('list')).bots;
    const bots = [];
    for (const name of ['Memory Curator QA', 'Memory Observer QA', 'Memory Offline QA']) {
      const bot =
        all.find((row) => row.displayName === name) ??
        (await rpc('create', { displayName: name, persona: 'Follow the Human request precisely.' }))
          .bot;
      const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
      const detail = (await rpc('get', { slug: bot.slug })).bot;
      assert.ok(detail.memoryDir.startsWith(home), 'QA repository belongs to isolated Profile');
      if (git(detail.memoryDir, ['status', '--porcelain']).trim()) {
        git(detail.memoryDir, ['add', '-A']);
        git(detail.memoryDir, ['commit', '--no-gpg-sign', '-m', 'Record QA Persona']);
      }
      const baseline = git(detail.memoryDir, ['log', '--all', '--format=%H'])
        .trim()
        .split('\n').length;
      bots.push({ slug: bot.slug, name, dm: dm.id, dir: detail.memoryDir, baseline });
    }
    const curator = bots[0];
    await rpc('memoryGitGraph', { channelId: curator.dm, offset: 0 });
    await rpc('memorySave', {
      channelId: curator.dm,
      path: 'customer.md',
      body: '# Customer\nPrefers concise updates.\n',
      expectedHead: git(curator.dir, ['rev-parse', 'HEAD']).trim(),
      editId: crypto.randomUUID(),
    });
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(12, 0, 0, 0);
    writeFileSync(resolve(curator.dir, 'notes.md'), '# Yesterday\nCustomer follow-up completed.\n');
    git(curator.dir, ['add', 'notes.md']);
    git(
      curator.dir,
      ['commit', '--no-gpg-sign', '-m', 'Record customer follow-up'],
      yesterday.toISOString(),
    );
    writeFileSync(resolve(curator.dir, 'draft.md'), '# Draft\nUncommitted follow-up.\n');
    writeFileSync(resolve(bots[2].dir, '.git/HEAD'), 'invalid QA repository head');
    writeFileSync(sceneFile, JSON.stringify({ bots }));
    console.log(
      'Prepared actual Memory repositories: committed Human edit, dated Git commit, untracked draft, clean and unavailable Bots.',
    );
  } else {
    const scene = JSON.parse(readFileSync(sceneFile, 'utf8'));
    await overview();
    if (
      (await page.$eval('.bh-statistics-toggle', (node) => node.getAttribute('aria-expanded'))) ===
      'false'
    )
      await page.click('.bh-statistics-toggle');
    await page.waitForSelector('[data-activity-total]');
    if (mode !== 'before') await page.waitForSelector('[data-memory-bot]');
    for (const dark of [false, true]) {
      await theme(dark);
      await shot('overview-' + (dark ? 'dark' : 'light'));
    }
    if (mode === 'before') {
      await page.setViewport({ width: 420, height: 960, deviceScaleFactor: 1 });
      await theme(false);
      await shot('overview-narrow');
    } else {
      const before = scene.bots
        .slice(0, 2)
        .map((bot) => [
          git(bot.dir, ['rev-parse', 'HEAD']),
          git(bot.dir, ['status', '--porcelain']),
          git(bot.dir, ['diff', '--cached']),
        ]);
      const data = await rpc('overviewMemory');
      const curator = data.bots.find((bot) => bot.slug === scene.bots[0].slug);
      const observer = data.bots.find((bot) => bot.slug === scene.bots[1].slug);
      const offline = data.bots.find((bot) => bot.slug === scene.bots[2].slug);
      assert.equal(curator.state, 'ready');
      assert.equal(curator.dirty, true);
      assert.equal(curator.total, scene.bots[0].baseline + 2);
      assert.deepEqual(curator.counts, [0, 0, 0, 0, 0, 1, scene.bots[0].baseline + 1]);
      const profile = await rpc('profileActivity', { channelId: scene.bots[0].dm });
      assert.deepEqual(
        data.days.map((day) => profile.memoryCommits.find((row) => row.day === day)?.count ?? 0),
        curator.counts,
      );
      assert.equal(observer.state, 'ready');
      assert.equal(observer.dirty, false);
      assert.equal(observer.total, scene.bots[1].baseline);
      assert.deepEqual(offline, {
        slug: scene.bots[2].slug,
        displayName: scene.bots[2].name,
        state: 'unavailable',
      });
      const unread = (await rpc('humanAttentionStatus')).unreadCount;
      await page.click('.bh-overview-memory button[aria-label="刷新 Memory 活动"]');
      await page.waitForFunction(
        () =>
          document.querySelector('.bh-overview-memory button[aria-label="刷新 Memory 活动"]')
            ?.disabled === false,
      );
      assert.equal((await rpc('humanAttentionStatus')).unreadCount, unread);
      assert.deepEqual(
        scene.bots
          .slice(0, 2)
          .map((bot) => [
            git(bot.dir, ['rev-parse', 'HEAD']),
            git(bot.dir, ['status', '--porcelain']),
            git(bot.dir, ['diff', '--cached']),
          ]),
        before,
      );
      const card = await page.$('.bh-overview-memory');
      await theme(true);
      await card.screenshot({ path: resolve(out, 'memory-compact-dark.png') });
      await theme(false);
      await card.screenshot({
        path: resolve(out, mode === 'resume' ? 'memory-restarted.png' : 'memory-compact.png'),
      });
      await page.click('.bh-overview-memory-details summary');
      const exactRows = await page.$$eval('.bh-overview-memory-details tbody tr', (rows) =>
        rows.map((row) => [...row.children].map((cell) => cell.textContent)),
      );
      for (const bot of data.bots) {
        const cells = exactRows.find((row) => row[0] === bot.displayName);
        assert.deepEqual(
          cells.slice(1),
          bot.state === 'ready' ? bot.counts.map(String) : Array(7).fill('—'),
        );
      }
      await card.screenshot({ path: resolve(out, 'memory-daily-details.png') });
      await page.click('.bh-overview-memory-details summary');
      await page.setViewport({ width: 420, height: 960, deviceScaleFactor: 1 });
      await shot('overview-narrow');
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      await card.screenshot({ path: resolve(out, 'memory-narrow.png') });
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      await page.click(`[data-memory-bot="${scene.bots[0].slug}"] button`);
      await page.waitForSelector('.bh-profile-view');
      assert.equal(
        (await page.$eval('.bh-profile-view', (node) => node.textContent)).includes(
          scene.bots[0].name,
        ),
        true,
      );
      await page.waitForFunction(
        (expected) =>
          [...document.querySelectorAll('.bh-profile-card')].some((card) => {
            const label = card.querySelector('.bh-profile-card-label')?.textContent ?? '';
            const total = card.querySelector('.bh-profile-card-total')?.textContent ?? '';
            const numbers = total.match(/\d+/g) ?? [];
            return label.includes('Memory') && Number(numbers.at(-1)) === expected;
          }),
        {},
        profile.memoryCommits.reduce((sum, row) => sum + row.count, 0),
      );
      await shot('memory-bot-navigation');
      writeFileSync(
        resolve(out, mode === 'resume' ? 'result-restart.json' : 'result.json'),
        JSON.stringify({
          start: data.start,
          end: data.end,
          bots: data.bots,
          readonly: true,
          unreadUnchanged: true,
          restart: mode === 'resume',
        }),
      );
      console.log(
        'PASS: actual Memory Git counts, dirty/unavailable, refresh read-only, exact daily detail, Profile navigation, light/dark/narrow' +
          (mode === 'resume' ? ', Host restart' : ''),
      );
    }
  }
} finally {
  await browser.close();
}
