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
    shell: false,
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
  assert(run(['--as', alice, 'team-directory']).some((row) => row.displayName === 'Bob'));
  check('every member can be found from Message a person', null);

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
  const bobId = run(['members', 'list']).find((row) => row.username === bob).humanId;
  browser = await chromium.launch();
  const cookies = new Map([
    [alice, await signIn(alice)],
    [bob, await signIn(bob)],
  ]);
  const contexts = [];
  const open = async (username, scheme) => {
    const context = await browser.newContext({
      colorScheme: scheme,
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    contexts.push(context);
    await context.addCookies(cookies.get(username));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(new URL('/botharness-device/team/', url.origin).href);
    await page.locator('text=Channels >> visible=true').first().waitFor({ timeout: 30_000 });
    const later = page
      .getByRole('dialog', { name: 'Choose your name and photo' })
      .getByText('Later', { exact: true });
    await later
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => later.click())
      .catch(() => undefined);
    await later.waitFor({ state: 'hidden', timeout: 5_000 });
    return { page, errors };
  };
  const shoot = async ({ page, errors }, label, scheme) => {
    const file = join(directory, `${label}-${scheme}.png`);
    await page.screenshot({ path: file });
    report.screenshots.push({ label, scheme, file, pageErrors: errors });
  };
  const composer = (page) => page.locator('.bh-composer-input >> visible=true').first();
  const schemes = ['light', 'dark'];
  const senders = new Map();
  const recipients = new Map();
  for (const scheme of schemes) {
    const sender = await open(alice, scheme);
    await sender.page.getByRole('button', { name: 'New', exact: true }).first().click();
    await sender.page.getByRole('menuitem', { name: 'Message a person' }).click();
    const person = sender.page.locator(`[data-team-person="${bobId}"] button`);
    await person.waitFor({ timeout: 30_000 });
    await person.click();
    await person.waitFor({ state: 'detached', timeout: 30_000 });
    await composer(sender.page).waitFor({ timeout: 30_000 });
    await shoot(sender, 'picker-opens-empty-dm', scheme);
    senders.set(scheme, sender);
    const recipient = await open(bob, scheme);
    await recipient.page.waitForTimeout(1500);
    assert.equal(await recipient.page.locator('text=Alice >> visible=true').count(), 0);
    await shoot(recipient, 'recipient-before-first-message', scheme);
    recipients.set(scheme, recipient);
  }
  check('picking a person in the Web Client opens an empty DM with a composer', null);
  const dm = run(['--as', alice, 'dm', bob]).channel.id;
  assert.equal(run(['--as', bob, 'dm', alice]).channel.id, dm);
  assert.deepEqual(dmIds(alice), []);
  assert.deepEqual(dmIds(bob), []);
  check('opening a person from the picker lists no DM for either side', null);

  const marker = `hello-${suffix}`;
  const first = senders.get('light').page;
  await composer(first).click();
  await first.keyboard.type(marker);
  await first.keyboard.press('Enter');
  await first.locator(`text=${marker} >> visible=true`).first().waitFor({ timeout: 30_000 });
  for (const username of [alice, bob]) {
    const deadline = Date.now() + 30_000;
    while (JSON.stringify(dmIds(username)) !== JSON.stringify([dm]) && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 250));
    assert.deepEqual(dmIds(username), [dm]);
  }
  check('the first message from the picker DM lists it for both people', null);
  for (const [scheme, sender] of senders) {
    await sender.page
      .locator(`text=${marker} >> visible=true`)
      .first()
      .waitFor({ timeout: 30_000 });
    await shoot(sender, 'sender-after-first-message', scheme);
  }
  for (const [scheme, recipient] of recipients) {
    const row = recipient.page.locator('text=Alice >> visible=true').first();
    await row.waitFor({ timeout: 30_000 });
    await row.click();
    await recipient.page
      .locator(`text=${marker} >> visible=true`)
      .first()
      .waitFor({ timeout: 30_000 });
    await shoot(recipient, 'recipient-after-first-message', scheme);
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
