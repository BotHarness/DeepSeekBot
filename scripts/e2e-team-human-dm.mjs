import assert from 'node:assert/strict';
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPaths } from './verify-app.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[process.argv.indexOf('--name') + 1];
if (!process.argv.includes('--name') || !/^[a-z0-9][a-z0-9-]*$/u.test(name ?? ''))
  throw new Error('Usage: node scripts/e2e-team-human-dm.mjs --name <verify-app-instance>');
const paths = verifyPaths(name, root);
const instance = JSON.parse(readFileSync(paths.instance, 'utf8'));
assert.equal(realpathSync(instance.worktree), realpathSync(root));
const url = new URL(instance.url);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
const directory = join(paths.dir, 'team-human-dm', `attempt-${Date.now()}`);
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
const dmIds = (username) =>
  run(['--as', username, 'channels'])
    .channels.filter((channel) => channel.type === 'dm' && channel.humanParticipants)
    .map((channel) => channel.id);
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
  const alice = member('alice', ['member']);
  const bob = member('bob', ['member']);
  assert(run(['--as', bob, 'team-directory']).some((row) => row.displayName === 'Alice'));
  check('every member can be found from Message a person', null);
  const dm = run(['--as', alice, 'dm', bob]).channel.id;
  assert.equal(run(['--as', bob, 'dm', alice]).channel.id, dm);
  assert.deepEqual(dmIds(alice), []);
  assert.deepEqual(dmIds(bob), []);
  check('opening a person from the picker lists no DM for either side', null);

  const require = createRequire(import.meta.url);
  const { chromium } = require(
    require.resolve('playwright', {
      paths: [root, execSync('npm root -g', { encoding: 'utf8' }).trim()],
    }),
  );
  browser = await chromium.launch();
  const bobCookies = await signIn(bob);
  const contexts = [];
  const pages = new Map();
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      colorScheme: scheme,
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    contexts.push(context);
    await context.addCookies(bobCookies);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(new URL('/botharness-device/team/', url.origin).href);
    await page.locator('text=Channels >> visible=true').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('text=Alice >> visible=true').count(), 0);
    const file = join(directory, `before-first-message-${scheme}.png`);
    await page.screenshot({ path: file });
    report.screenshots.push({ label: 'before-first-message', scheme, file, pageErrors: errors });
    pages.set(scheme, { page, errors });
  }
  check('rendered member list has no DM before the first message', null);

  const marker = `hello-${suffix}`;
  run(['--as', alice, 'channels', 'send', dm, '--body-stdin'], marker);
  assert.deepEqual(dmIds(alice), [dm]);
  assert.deepEqual(dmIds(bob), [dm]);
  check('the first message lists the DM for both people', null);
  for (const [scheme, { page, errors }] of pages) {
    await page.locator('text=Alice >> visible=true').first().waitFor({ timeout: 30_000 });
    await page.locator('text=Alice >> visible=true').first().click();
    await page.locator(`text=${marker} >> visible=true`).first().waitFor({ timeout: 30_000 });
    const file = join(directory, `after-first-message-${scheme}.png`);
    await page.screenshot({ path: file });
    report.screenshots.push({ label: 'after-first-message', scheme, file, pageErrors: errors });
  }
  check('the recipient sees the DM appear live and can open it', null);
  for (const context of contexts) await context.close();

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
