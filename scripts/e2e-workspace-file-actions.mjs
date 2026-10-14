import { createRequire } from 'node:module';
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  realpathSync,
  renameSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const worktree = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(
  process.argv[2] ?? join(worktree, '.humanlayer/tasks/575-workspace-open/e2e'),
);
mkdirSync(output, { recursive: true });
if (!process.env.BH_E2E_INSTANCE)
  throw new Error('Set BH_E2E_INSTANCE to private dev-instance JSON');
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
let fixture = process.env.BH_E2E_FIXTURE
  ? JSON.parse(readFileSync(process.env.BH_E2E_FIXTURE, 'utf8'))
  : undefined;
const unavailable = process.env.BH_E2E_UNAVAILABLE === '1';
const modules = join(worktree, 'node_modules/.pnpm');
const puppeteer = createRequire(
  join(
    modules,
    readdirSync(modules).find((name) => name.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const browser = await puppeteer.launch({
  headless: true,
  executablePath:
    process.env.BH_E2E_CHROME ??
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : undefined),
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.setViewport({ width: 1440, height: 960 });
const rpcResult = (namespace, method, args = {}) =>
  page.evaluate(
    async (ns, m, a) =>
      (
        await (
          await fetch('/api/' + ns + '/' + m, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              type: 'client-request',
              rpcId: 'qa-' + m,
              method: ns + '/' + m,
              payload: { args: a },
            }),
          })
        ).json()
      ).result,
    namespace,
    method,
    args,
  );
const rpc = async (method, args = {}, namespace = 'botharness') => {
  const result = await rpcResult(namespace, method, args);
  assert.equal(result?.ok, true, JSON.stringify(result));
  return result.value;
};
const clickLabel = async (label, selector = 'button') => {
  await page.waitForFunction(
    (s, text) =>
      [...document.querySelectorAll(s)].some((element) => element.textContent?.includes(text)),
    {},
    selector,
    label,
  );
  for (const element of await page.$$(selector))
    if (
      (await element.boundingBox()) &&
      (await element.evaluate((node) => node.textContent))?.includes(label)
    ) {
      await element.click();
      return;
    }
  throw new Error('Missing control: ' + label);
};
const menuReady = () =>
  page.waitForFunction(() => {
    const menu = document.querySelector('[role="menu"]');
    return (
      menu &&
      !menu.textContent.includes('正在检查') &&
      menu.querySelector('button[role="menuitem"]')
    );
  });
const capture = (name) => page.screenshot({ path: join(output, name + '.png') });
const pathSelector = () =>
  'button.bh-workspace-folder-path[title=' + JSON.stringify(fixture.workspacePath) + ']';
const pathButton = () => page.locator(pathSelector());
const menuLabels = () =>
  page.$$eval('[role="menuitem"]', (elements) =>
    elements.map((element) => element.textContent.trim()),
  );
const authority = async () => {
  const detail = (await rpc('get', { slug: fixture.slug })).bot;
  return {
    grants: await rpc('grants', { slug: fixture.slug }),
    sessions: await rpc('sessions', { slug: fixture.slug }),
    assignmentAccess: await rpc('assignmentAccessGet', { slug: fixture.slug }),
    bot: {
      slug: detail.slug,
      workspaces: detail.workspaces,
      paused: detail.paused,
      memoryDir: detail.memoryDir,
    },
  };
};
try {
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((element) => ['Continue', '继续'].includes(element.textContent.trim()))
      ?.click(),
  );
  if (!fixture) {
    const workspacePath = join(
      resolve(instance.home),
      'qa-workspaces',
      '工程 project ' + Date.now(),
    );
    mkdirSync(workspacePath, { recursive: true });
    writeFileSync(join(workspacePath, 'README.md'), 'Workspace menu QA\n');
    const { bot } = await rpc('create', {
      displayName: 'Workspace Open QA ' + Date.now(),
      roles: ['research'],
      workspaces: [],
    });
    await rpc('pause', { slug: bot.slug });
    const { channel } = await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName });
    const { workspace } = await rpc(
      'create',
      { request: { path: realpathSync(workspacePath) } },
      'workspace',
    );
    const { grant } = await rpc('grantCreate', {
      slug: bot.slug,
      workspaceId: workspace.workspaceId,
    });
    fixture = {
      slug: bot.slug,
      displayName: bot.displayName,
      channelId: channel.id,
      grantId: grant.id,
      workspaceId: workspace.workspaceId,
      workspacePath: grant.workspacePath,
      title: grant.workspaceTitle,
    };
    writeFileSync(join(output, 'fixture-private.json'), JSON.stringify(fixture));
    await page.reload({ waitUntil: 'networkidle2' });
  }
  assert.ok(
    resolve(fixture.workspacePath).startsWith(resolve(instance.home) + sep) ||
      resolve(fixture.workspacePath).startsWith(dirname(resolve(instance.home)) + sep),
    'Fixture must remain inside the task profile or its adjacent QA directory',
  );
  const before = await authority();
  const arbitraryPath = await rpcResult('botharness', 'workspaceFileTarget', {
    slug: fixture.slug,
    grantId: fixture.grantId,
    path: '/untrusted/client/path',
  });
  assert.equal(arbitraryPath.ok, false);
  assert.equal(arbitraryPath.error.code, 'gateway/arguments-invalid');
  const target = await rpc('workspaceFileTarget', { slug: fixture.slug, grantId: fixture.grantId });
  assert.deepEqual(target.target, {
    path: fixture.workspacePath,
    relativePath: '',
    kind: 'directory',
  });
  await page.locator('button[aria-label="Bot 模式"],button[aria-label="Bot mode"]').click();
  await clickLabel(fixture.displayName ?? 'Workspace Open QA', '.bh-root button');
  await page.waitForSelector('[data-panel-head]');
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('[data-panel-head]'))
      if (
        /工作区授权|Workspace/.test(element.textContent) &&
        element.getAttribute('aria-expanded') === 'false'
      )
        element.click();
  });
  await page.waitForFunction(
    (title) =>
      [...document.querySelectorAll('.bh-workspace-folder-toggle')].some((element) =>
        element.textContent.includes(title),
      ),
    {},
    fixture.title,
  );
  await page.waitForNetworkIdle({ idleTime: 500 });
  await clickLabel(fixture.title, '.bh-workspace-folder-toggle');
  await page.waitForSelector(pathSelector(), { visible: true });
  const theme = async (value) => {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value }]);
    await page.waitForFunction(
      (dark) => document.body.hasAttribute('data-ds-dark-theme') === dark,
      {},
      value === 'dark',
    );
  };
  await theme('dark');
  await capture(unavailable ? 'unavailable-path-dark' : 'after-dark');
  await pathButton().click();
  await menuReady();
  let labels = await menuLabels();
  assert.ok(
    labels.every((label) => !/下载|Download/.test(label)),
    'Directories cannot offer download',
  );
  await capture(unavailable ? 'unavailable-dark' : 'after-menu-dark');
  await theme('light');
  await capture(unavailable ? 'unavailable-light' : 'after-menu-light');
  await page.keyboard.press('Escape');
  await capture(unavailable ? 'unavailable-path-light' : 'after-light');
  await page
    .browserContext()
    .overridePermissions(new URL(instance.url).origin, [
      'clipboard-read',
      'clipboard-sanitized-write',
    ]);
  await page.bringToFront();
  await pathButton().click({ button: 'right' });
  await menuReady();
  assert.equal(
    await page.$eval(pathSelector(), (element) => element.getAttribute('aria-expanded')),
    'true',
  );
  await clickLabel('复制 Host 路径', '[role="menuitem"]');
  await page.waitForSelector('[role="menu"]', { hidden: true });
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), fixture.workspacePath);
  await page.focus(pathSelector());
  await page.keyboard.down('Shift');
  await page.keyboard.press('F10');
  await page.keyboard.up('Shift');
  await menuReady();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'menuitem');
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('title')),
    fixture.workspacePath,
  );
  if (unavailable) {
    assert.deepEqual(labels, ['复制 Host 路径']);
  } else {
    assert.ok(labels.includes('用 Finder 打开'), 'Run this native handoff proof on macOS');
    for (const label of ['用 Finder 打开', '用 Visual Studio Code 打开']) {
      assert.ok(labels.includes(label), 'Installed native app missing: ' + label);
      await pathButton().click();
      await menuReady();
      await clickLabel(label, '[role="menuitem"]');
      await page.waitForSelector('[role="menu"]', { hidden: true });
      console.log('PASS ' + label + ' acknowledged; native window proof captured separately');
    }
    await pathButton().click();
    await menuReady();
    const moved = fixture.workspacePath + '.temporarily-moved';
    renameSync(fixture.workspacePath, moved);
    try {
      await clickLabel('用 Finder 打开', '[role="menuitem"]');
      await page.waitForFunction(() =>
        document.querySelector('[role="menu"]')?.textContent.includes('unavailable'),
      );
      await capture('after-stale-target');
      const missing = await rpcResult('botharness', 'workspaceFileTarget', {
        slug: fixture.slug,
        grantId: fixture.grantId,
      });
      assert.equal(missing.ok, false);
      assert.equal(missing.error.code, 'unavailable-workspace');
    } finally {
      renameSync(moved, fixture.workspacePath);
    }
    await page.keyboard.press('Escape');
    assert.equal(
      (
        await rpcResult('botharness', 'workspaceFileTarget', {
          slug: fixture.slug,
          grantId: '/arbitrary/client/path',
        })
      ).error.code,
      'invalid-grant',
    );
    assert.equal(
      (
        await rpcResult('botharness', 'workspaceFileTarget', {
          slug: 'unknown-bot',
          grantId: fixture.grantId,
        })
      ).error.code,
      'not-found',
    );
  }
  assert.deepEqual(
    await authority(),
    before,
    'Native path actions must leave Grants, owned Session cwd/access and Bot authority unchanged',
  );
  assert.deepEqual(errors, []);
  const result = {
    result: 'PASS',
    platform: process.platform,
    viewport: '1440x960',
    locale: 'zh',
    mode: unavailable ? 'copy-only' : 'native',
    menuLabels: labels,
    ownerTargetVerified: true,
    grantsUnchanged: true,
    sessionsAndCwdUnchanged: true,
    assignmentAccessUnchanged: true,
    sessionCount: before.sessions.sessions.length,
    pageErrors: errors,
  };
  writeFileSync(
    join(output, unavailable ? 'unavailable-result.json' : 'e2e-result.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  await capture('diagnostic');
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
