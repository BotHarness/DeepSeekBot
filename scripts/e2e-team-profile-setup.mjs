import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPaths } from './verify-app.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[process.argv.indexOf('--name') + 1];
if (!process.argv.includes('--name') || !/^[a-z0-9][a-z0-9-]*$/u.test(name ?? ''))
  throw new Error('Usage: node scripts/e2e-team-profile-setup.mjs --name <verify-app-instance>');
const paths = verifyPaths(name, root);
const instance = JSON.parse(readFileSync(paths.instance, 'utf8'));
assert.equal(realpathSync(instance.worktree), realpathSync(root));
const url = new URL(instance.url);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
const directory = join(paths.dir, 'team-profile-setup', `attempt-${Date.now()}`);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const report = {
  source: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  }).trim(),
  startedAt: new Date().toISOString(),
  status: 'running',
  checks: [],
  screenshots: [],
  scope:
    'Real packaged Host, CLI member carrier and rendered member Web Client first sign-in; no model or native mobile acceptance',
};
const check = (label, value) => {
  report.checks.push({ label, ok: true });
  return value;
};
const run = (args, input) => {
  const result = spawnSync(
    process.execPath,
    ['packages/deepseekbot/dist/deepseekbot.mjs', ...args, '--compact'],
    {
      cwd: root,
      shell: false,
      windowsHide: true,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
      input,
      env: {
        ...process.env,
        DEEPSEEKBOT_HOST: url.origin,
        DEEPSEEKBOT_HOST_TOKEN: url.searchParams.get('token'),
      },
    },
  );
  let value;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    throw new Error(`cli-${args.join('-')}-no-json: ${result.stderr.slice(0, 400)}`);
  }
  assert.equal(result.status, 0, `${args.join(' ')}: ${value?.error?.code}`);
  return value;
};
const suffix = Date.now().toString(36);
const passwords = new Map();
const member = (label, roleIds) => {
  const username = `aj-${label}-${suffix}`;
  const secret = join(directory, `${username}.secret`);
  run([
    'members',
    'create',
    '--username',
    username,
    '--display-name',
    label[0].toUpperCase() + label.slice(1),
    '--role-ids',
    roleIds.join(','),
    '--initial-password-file',
    secret,
  ]);
  const next = randomUUID() + 'Aa!';
  run(
    ['--as', username, 'members', 'change-password', '--password-stdin'],
    JSON.stringify({ current: readFileSync(secret, 'utf8'), next }),
  );
  rmSync(secret);
  passwords.set(username, next);
  return username;
};
const signIn = async (username) => {
  const response = await fetch(new URL('/botharness-device/team/sign-in', url.origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: passwords.get(username) }),
  });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie().map((entry) => {
    const [pair] = entry.split(';');
    const index = pair.indexOf('=');
    return {
      name: pair.slice(0, index),
      value: pair.slice(index + 1),
      url: url.origin,
    };
  });
};

let browser;
try {
  run(['team-mode', 'owner-password', '--password-stdin'], randomUUID() + 'Aa!');
  run(['team-mode', 'on']);
  assert.equal(run(['human-identity']).profileSetup, undefined);
  check('the Owner is never asked', null);
  const mia = member('mia', ['member']);
  const leo = member('leo', ['member']);
  for (const username of [mia, leo])
    assert.equal(run(['--as', username, 'human-identity']).profileSetup, 'pending');
  check('a new member is asked for a chat name and photo', null);

  const require = createRequire(import.meta.url);
  const globalRoots = () =>
    [dirname(process.execPath), ...(process.env.PATH ?? process.env.Path ?? '').split(delimiter)]
      .map((entry) => entry.replace(/^"|"$/gu, ''))
      .filter(Boolean)
      .map((bin) =>
        process.platform === 'win32'
          ? join(bin, 'node_modules')
          : join(bin, '..', 'lib', 'node_modules'),
      );
  let playwright;
  try {
    playwright = require.resolve('playwright', { paths: [root] });
  } catch {
    playwright = require.resolve('playwright', { paths: globalRoots() });
  }
  const { chromium } = require(playwright);
  browser = await chromium.launch();
  const photo = join(root, 'apps/mobile/assets/app-icons/deepseekbot-light-preview.png');
  const open = async (username, scheme) => {
    const context = await browser.newContext({
      colorScheme: scheme,
      locale: 'zh-CN',
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    await context.addCookies(await signIn(username));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(new URL('/botharness-device/team/', url.origin).href);
    return { context, page, errors };
  };
  const shot = async (page, errors, label, scheme) => {
    const file = join(directory, `${label}-${scheme}.png`);
    await page.screenshot({ path: file });
    report.screenshots.push({ label, scheme, file, pageErrors: [...errors] });
  };

  for (const scheme of ['light', 'dark']) {
    const username = scheme === 'light' ? mia : leo;
    const { context, page, errors } = await open(username, scheme);
    const dialog = page.locator('[data-profile-setup]');
    await dialog.waitFor({ timeout: 30_000 });
    await page.waitForTimeout(800);
    await shot(page, errors, 'first-sign-in-prompt', scheme);
    if (scheme === 'light') {
      await page.locator('[data-profile-setup] input[type=file]').setInputFiles(photo);
      await page.getByRole('button', { name: /保存头像|Save avatar/u }).click();
      await page.locator('[data-profile-setup-preview] img').waitFor({ timeout: 30_000 });
      await page.locator('[data-profile-setup-name]').fill('Mia Chen');
      await page.waitForTimeout(500);
      await shot(page, errors, 'first-sign-in-filled', scheme);
      await page.locator('[data-profile-setup-done]').click();
    } else {
      await page
        .getByRole('button', { name: /^(稍后|Later)$/u })
        .first()
        .click();
    }
    await dialog.waitFor({ state: 'detached', timeout: 30_000 });
    await page.waitForTimeout(800);
    await shot(page, errors, 'after-prompt', scheme);
    await page.reload();
    await page
      .getByText(/^(频道列表|Channels)$/u)
      .first()
      .waitFor({ timeout: 30_000 });
    await page.waitForTimeout(2000);
    assert.equal(await dialog.count(), 0, `${scheme}: prompt came back after reload`);
    await context.close();
  }
  const saved = run(['--as', mia, 'human-identity']);
  assert.equal(saved.displayName, 'Mia Chen');
  assert.match(saved.avatarVersion ?? '', /^[a-f0-9]{16}$/u);
  assert.equal(saved.profileSetup, undefined);
  check('Done saves the name and photo on the Host and ends the prompt', null);
  const later = run(['--as', leo, 'human-identity']);
  assert.equal(later.displayName, 'Leo');
  assert.equal(later.avatarVersion, undefined);
  assert.equal(later.profileSetup, undefined);
  check('Later keeps the admin-set name and ends the prompt on every device', null);

  for (const entry of report.screenshots) assert.deepEqual(entry.pageErrors, [], entry.label);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(
    `${JSON.stringify({ status: report.status, error: report.error, directory })}\n`,
  );
}
