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
  throw new Error('Usage: node scripts/e2e-team-auto-join.mjs --name <verify-app-instance>');
const paths = verifyPaths(name, root);
const instance = JSON.parse(readFileSync(paths.instance, 'utf8'));
assert.equal(realpathSync(instance.worktree), realpathSync(root));
const url = new URL(instance.url);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
const directory = join(paths.dir, 'team-auto-join', `attempt-${Date.now()}`);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const report = {
  source: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim(),
  startedAt: new Date().toISOString(),
  status: 'running',
  checks: [],
  screenshots: [],
  scope:
    'Real packaged Host, CLI member carrier and rendered member Web Client; no model or native mobile acceptance',
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
const channelIds = (username) =>
  run(['--as', username, 'channels'])
    .channels.filter((channel) => channel.type === 'group')
    .map((channel) => channel.id)
    .sort();
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
  const finance = run([
    'roles',
    'create',
    '--name',
    `Finance ${suffix}`,
    '--permissions',
    'dm.humans',
  ]).role.roleId;
  const lobby = run(['group-create', 'Lobby']).channel.id;
  const books = run(['group-create', 'Books']).channel.id;
  const secret = run(['group-create', 'Secret']).channel.id;
  run(['channels', 'visibility', lobby, 'public']);
  run(['channels', 'visibility', books, `roles:${finance}`]);
  const alice = member('alice', ['member', finance]);
  const bob = member('bob', ['member']);
  check('created member with role joins public and role Channels', null);
  assert.deepEqual(channelIds(alice), [books, lobby].sort());
  check('member without role joins only the public Channel', null);
  assert.deepEqual(channelIds(bob), [lobby]);
  run(['--as', bob, 'roster-batch', 'pin', lobby]);
  assert.deepEqual(run(['--as', bob, 'roster']).pins, [lobby]);
  assert.deepEqual(run(['--as', alice, 'roster']).pins, []);
  check('arrangement is per user through --as', null);

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
  const capture = async (label, scheme, cookies, action) => {
    const context = await browser.newContext({
      colorScheme: scheme,
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    await context.addCookies(cookies);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(new URL('/botharness-device/team/', url.origin).href);
    let result;
    try {
      await page.locator('text=Lobby >> visible=true').first().waitFor({ timeout: 30_000 });
      result = await action(page);
    } catch (error) {
      await page.screenshot({ path: join(directory, `${label}-${scheme}-failure.png`) });
      throw error;
    }
    const file = join(directory, `${label}-${scheme}.png`);
    await page.screenshot({ path: file });
    report.screenshots.push({ label, scheme, file, pageErrors: errors });
    await context.close();
    return result;
  };
  const bobCookies = await signIn(bob);
  for (const scheme of ['light', 'dark'])
    await capture('member-auto-joined', scheme, bobCookies, async (page) => {
      assert.equal(await page.getByText('Books').count(), 0);
      assert.equal(await page.getByText('Secret').count(), 0);
    });
  check('rendered member list shows the public Channel without a join step', null);

  for (const scheme of ['light', 'dark']) {
    run(['members', 'roles', bob, '--set', 'member']);
    await capture('member-granted', scheme, bobCookies, async (page) => {
      assert.equal(await page.locator('text=Books >> visible=true').count(), 0);
      run(['members', 'roles', bob, '--set', `member,${finance}`]);
      await page.locator('text=Books >> visible=true').first().waitFor({ timeout: 30_000 });
    });
    assert.deepEqual(channelIds(bob), [books, lobby].sort());
  }
  check('granting the role joins the role Channel and shows it without a reload', null);

  for (const scheme of ['light', 'dark']) {
    run(['members', 'roles', bob, '--set', `member,${finance}`]);
    const revoked = await capture('member-revoked-open', scheme, bobCookies, async (page) => {
      await page.locator('text=Books >> visible=true').first().click();
      await page.waitForTimeout(1500);
      run(['members', 'roles', bob, '--set', 'member']);
      await page
        .locator('text=Books >> visible=true')
        .first()
        .waitFor({ state: 'hidden', timeout: 30_000 });
      return page.locator('text=Books >> visible=true').count();
    });
    assert.equal(revoked, 0);
  }
  assert.deepEqual(channelIds(bob), [lobby]);
  check('revoking the role removes the open role Channel at once', null);

  const reading = run(['--as', alice, 'roster-section-create', 'Reading']);
  const readingId = reading.section?.id ?? run(['--as', alice, 'roster']).sections[0].id;
  run(['--as', alice, 'roster-batch', 'move', books, '--section', readingId]);
  assert.deepEqual(
    run(['--as', alice, 'roster']).sections.map((section) => section.name),
    ['Reading'],
  );
  assert.deepEqual(run(['--as', bob, 'roster']).sections, []);
  const aliceCookies = await signIn(alice);
  for (const scheme of ['light', 'dark'])
    await capture('member-own-sections', scheme, aliceCookies, async (page) => {
      await page
        .locator('.bh-section-name >> text=Reading >> visible=true')
        .first()
        .waitFor({ timeout: 30_000 });
    });
  check("wide member Web Client shows its own sections and not another member's", null);

  run(['channels', 'visibility', lobby, 'private']);
  assert.deepEqual(channelIds(bob), []);
  assert.deepEqual(channelIds(alice), [books]);
  check('making a Channel private removes every automatic member', null);
  assert.equal(channelIds(alice).includes(secret), false);

  for (const shot of report.screenshots) assert.deepEqual(shot.pageErrors, [], shot.label);
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
