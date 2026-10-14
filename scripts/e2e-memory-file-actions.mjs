import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const w = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(process.argv[2] ?? join(w, '.humanlayer/tasks/574-memory-files/e2e'));
mkdirSync(dir, { recursive: true });
const p = join(w, 'node_modules/.pnpm');
const puppeteer = createRequire(
  join(
    p,
    readdirSync(p).find((n) => n.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
if (!process.env.BH_E2E_INSTANCE)
  throw new Error('Set BH_E2E_INSTANCE to the private dev-instance JSON output');
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
let fixture = process.env.BH_E2E_FIXTURE
  ? JSON.parse(readFileSync(process.env.BH_E2E_FIXTURE, 'utf8'))
  : undefined;
const b = await puppeteer.launch({
  headless: true,
  executablePath:
    process.env.BH_E2E_CHROME ??
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : undefined),
  args: ['--no-sandbox'],
});
const page = await b.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.setViewport({ width: 1440, height: 960 });
const screenshot = async (name) => {
  await page.screenshot({ path: join(dir, name + '.png') });
};
const rpc = async (method, args = {}) =>
  page.evaluate(
    async (m, a) => {
      const e = await (
        await fetch('/api/botharness/' + m, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: 'qa-' + m,
            method: 'botharness/' + m,
            payload: { args: a },
          }),
        })
      ).json();
      if (!e.result?.ok) throw new Error(JSON.stringify(e.result));
      return e.result.value;
    },
    method,
    args,
  );
const buttonClick = async (pattern, selector = 'button') => {
  await page.waitForFunction(
    (s, p) => [...document.querySelectorAll(s)].some((e) => e.textContent?.includes(p)),
    { timeout: 20000 },
    selector,
    pattern,
  );
  await page.evaluate(
    (s, p) => [...document.querySelectorAll(s)].find((e) => e.textContent?.includes(p))?.click(),
    selector,
    pattern,
  );
};
const menuReady = () =>
  page.waitForFunction(
    () => {
      const m = document.querySelector('[role="menu"]');
      return m && !m.textContent.includes('正在检查') && m.querySelector('button[role="menuitem"]');
    },
    { timeout: 20000 },
  );
try {
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((x) => ['Continue', '继续'].includes(x.textContent.trim()))
      ?.click(),
  );
  if (!fixture) {
    const name = 'Memory Files QA ' + Date.now();
    const { bot } = await rpc('create', { displayName: name, roles: ['research'], workspaces: [] });
    const { channel } = await rpc('channelDm', { slug: bot.slug, displayName: name });
    const detail = (await rpc('get', { slug: bot.slug })).bot;
    if (!resolve(detail.memoryDir).startsWith(resolve(instance.home) + sep))
      throw new Error('Fixture escaped the isolated DSH home');
    const notes = join(detail.memoryDir, 'Project notes');
    mkdirSync(notes, { recursive: true });
    writeFileSync(join(notes, '你好 world.txt'), 'Memory file QA — original content\n');
    writeFileSync(join(notes, 'binary sample.bin'), Buffer.from([0, 1, 255, 0, 5, 128]));
    writeFileSync(join(notes, 'large file.bin'), Buffer.alloc(5 * 1024 * 1024, 0xa5));
    fixture = {
      slug: bot.slug,
      channelId: channel.id,
      memoryDir: detail.memoryDir,
      displayName: name,
    };
    await page.reload({ waitUntil: 'networkidle2' });
  }
  if (!resolve(fixture.memoryDir).startsWith(resolve(instance.home) + sep))
    throw new Error('Fixture escaped the isolated DSH home');
  const gitState = () => {
    let head;
    try {
      head = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
        cwd: fixture.memoryDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      head = 'unborn';
    }
    return {
      head,
      status: execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
        cwd: fixture.memoryDir,
        encoding: 'utf8',
      }).trim(),
    };
  };
  const beforeGit = gitState();
  await page.locator('button[aria-label="Bot 模式"],button[aria-label="Bot mode"]').click();
  await page.waitForSelector('.bh-root');
  await buttonClick(fixture.displayName ?? 'Memory Files QA');
  await page.waitForSelector('[data-panel-head]');
  await page.evaluate(() => {
    for (const h of document.querySelectorAll('[data-panel-head]'))
      if (
        /Workspace|工作区|Memory files|记忆文件/.test(h.textContent) &&
        h.getAttribute('aria-expanded') === 'false'
      )
        h.click();
  });
  await page.waitForSelector('.bh-workspace-folder-toggle');
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.bh-workspace-folder-toggle')].find((e) =>
      e.textContent.includes('Memory Repository'),
    );
    if (row?.getAttribute('aria-expanded') === 'false') row.click();
  });
  await page.waitForSelector('.bh-workspace-folder-path');
  await page.waitForSelector('[data-path="Project notes"]');
  await page.locator('[data-path="Project notes"]').click();
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.bh-workspace-folder-toggle')].find((e) =>
      e.textContent.includes('Memory Repository'),
    );
    if (row?.getAttribute('aria-expanded') === 'false') row.click();
  });
  await page.waitForSelector('.bh-workspace-folder-path', { visible: true });
  await screenshot('after-path-tree');
  await page.locator('.bh-workspace-folder-path').click();
  await menuReady();
  await screenshot('after-root-menu');
  await buttonClick('用 Finder 打开', '[role="menuitem"]');
  await page.waitForSelector('[role="menu"]', { hidden: true });
  const rootTarget = await rpc('memoryFileTarget', { slug: fixture.slug, path: '' });
  assert.equal(rootTarget.target.kind, 'directory');
  console.log('PASS root Finder launch acknowledged (OS window proof captured separately)');
  await page.locator('[data-path="Project notes"]').click({ button: 'right' });
  await menuReady();
  assert.equal(
    await page.$eval('[data-path="Project notes"]', (e) => e.getAttribute('aria-expanded')),
    'true',
  );
  await screenshot('after-directory-menu');
  await buttonClick('用 Finder 打开', '[role="menuitem"]');
  await page.waitForSelector('[role="menu"]', { hidden: true });
  await page.locator('[data-path="Project notes/你好 world.txt"]').click();
  await page.waitForSelector('.bh-memory-commit-code');
  await screenshot('after-reader');
  await page
    .locator('.bh-memory-commit-header .bh-memory-view-icon-button[aria-haspopup="menu"]')
    .click();
  await menuReady();
  await screenshot('after-reader-menu');
  const labels = await page.$$eval('[role="menuitem"]', (es) =>
    es.map((e) => e.textContent.trim()),
  );
  console.log(JSON.stringify({ fileHandlers: labels }));
  await buttonClick('显示文件位置', '[role="menuitem"]');
  await page.waitForSelector('[role="menu"]', { hidden: true });
  await page
    .locator('.bh-memory-commit-header .bh-memory-view-icon-button[aria-haspopup="menu"]')
    .click();
  await menuReady();
  const editor = labels.find((x) => /TextEdit|文本编辑|Visual Studio Code/.test(x));
  assert.ok(editor, 'installed editor missing from OS associations');
  await buttonClick(editor, '[role="menuitem"]');
  await page.waitForSelector('[role="menu"]', { hidden: true });
  console.log(
    'PASS registered file editor launch acknowledged (OS window and save proof captured separately)',
  );
  await page
    .browserContext()
    .overridePermissions(new URL(instance.url).origin, [
      'clipboard-read',
      'clipboard-sanitized-write',
    ]);
  await page.bringToFront();
  await page
    .locator('.bh-memory-commit-header .bh-memory-view-icon-button[aria-haspopup="menu"]')
    .click();
  await menuReady();
  let copySelected = false;
  for (const button of await page.$$('[role="menuitem"]')) {
    if ((await button.evaluate((element) => element.textContent))?.includes('复制 Host 路径')) {
      await button.click();
      copySelected = true;
      break;
    }
  }
  assert.equal(copySelected, true);
  await page.waitForSelector('[role="menu"]', { hidden: true });
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    join(fixture.memoryDir, 'Project notes/你好 world.txt'),
  );

  await page.locator('[data-path="Project notes/binary sample.bin"]').click({ button: 'right' });
  await menuReady();
  assert.match(await page.$eval('.bh-memory-commit-code', (e) => e.textContent), /Memory file QA/);
  await screenshot('after-file-context-menu');
  await page.keyboard.press('Escape');
  await page.focus('[data-path="Project notes/你好 world.txt"]');
  await page.keyboard.down('Shift');
  await page.keyboard.press('F10');
  await page.keyboard.up('Shift');
  await menuReady();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'menuitem');
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('data-path')),
    'Project notes/你好 world.txt',
  );
  const results = [];
  for (const path of [
    'Project notes/你好 world.txt',
    'Project notes/binary sample.bin',
    'Project notes/large file.bin',
  ]) {
    const expected = readFileSync(join(fixture.memoryDir, path));
    const downloaded = await page.evaluate(
      async (slug, p) => {
        const response = await fetch(
          './api/botharness/memory/file?' + new URLSearchParams({ slug, path: p }),
        );
        return {
          status: response.status,
          disposition: response.headers.get('content-disposition'),
          length: response.headers.get('content-length'),
          body: await response.text().then(() => null),
        };
      },
      fixture.slug,
      path,
    );
    const observed = await page.evaluate(
      async (slug, p) => {
        const response = await fetch(
          './api/botharness/memory/file?' + new URLSearchParams({ slug, path: p }),
        );
        const bytes = await response.arrayBuffer();
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        return {
          status: response.status,
          size: bytes.byteLength,
          sha256: [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join(''),
        };
      },
      fixture.slug,
      path,
    );
    assert.equal(observed.sha256, createHash('sha256').update(expected).digest('hex'));
    assert.equal(observed.size, expected.length);
    assert.equal(observed.status, 200);
    assert.ok(downloaded.disposition.includes("filename*=UTF-8''"));
    results.push({ path, ...observed });
  }
  const downloadPath = mkdtempSync(join(dir, 'downloads-'));
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath,
    eventsEnabled: true,
  });
  await page.locator('[data-path="Project notes/你好 world.txt"]').click({ button: 'right' });
  await menuReady();
  await buttonClick('下载到此设备', '[role="menuitem"]');
  await page.waitForFunction(() => !document.querySelector('[role="menu"]'));
  for (let i = 0; i < 50 && !readdirSync(downloadPath).includes('你好 world.txt'); i++)
    await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(
    readFileSync(join(downloadPath, '你好 world.txt')),
    readFileSync(join(fixture.memoryDir, 'Project notes/你好 world.txt')),
  );
  await screenshot('after-download');
  const rejected = [];
  for (const path of ['.git/config', '../outside', 'missing-file']) {
    const value = await page.evaluate(
      async (slug, p) => {
        const r = await fetch(
          './api/botharness/memory/file?' + new URLSearchParams({ slug, path: p }),
        );
        return r.status;
      },
      fixture.slug,
      path,
    );
    assert.ok([400, 404].includes(value));
    rejected.push({ path, status: value });
  }
  const anonymous = await fetch(
    new URL('/api/botharness/memory/file', instance.url).href +
      '?' +
      new URLSearchParams({ slug: fixture.slug, path: 'Project notes/你好 world.txt' }),
  );
  assert.equal(anonymous.status, 401);
  assert.deepEqual(gitState(), beforeGit);
  assert.deepEqual(errors, []);
  writeFileSync(
    join(dir, 'e2e-result.json'),
    JSON.stringify(
      {
        result: 'PASS',
        viewport: '1440x960',
        locale: 'zh',
        downloadRoundTrips: results,
        rejected,
        anonymousStatus: anonymous.status,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS browser menus, context/keyboard semantics, downloads and authenticated owner routes',
  );
} catch (e) {
  await screenshot('diagnostic');
  console.log(
    await page.evaluate(() => ({ text: document.body.innerText.slice(0, 3000), errors: [] })),
  );
  throw e;
} finally {
  await b.close();
}
