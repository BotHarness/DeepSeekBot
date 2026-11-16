import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPaths } from './verify-app.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[process.argv.indexOf('--name') + 1];
if (!process.argv.includes('--name') || !/^[a-z0-9][a-z0-9-]*$/u.test(name ?? ''))
  throw new Error('Usage: node scripts/e2e-team-bot-memory.mjs --name <verify-app-instance>');
const paths = verifyPaths(name, root);
const instance = JSON.parse(readFileSync(paths.instance, 'utf8'));
assert.equal(realpathSync(instance.worktree), realpathSync(root));
const url = new URL(instance.url);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
const directory = join(paths.dir, 'team-memory', `attempt-${Date.now()}`);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const report = {
  source: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim(),
  startedAt: new Date().toISOString(),
  status: 'running',
  actions: [],
  scope: 'Real packaged Host and CLI member carrier; no rendered UI or model acceptance',
};
const run = (args, input, expectedError) => {
  const started = performance.now();
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
    throw new Error(`cli-${args[0]}-no-json`);
  }
  report.actions.push({
    command: args.filter((arg) => !arg.startsWith(directory)),
    elapsedMs: Math.round(performance.now() - started),
    exitCode: result.status,
    error: value?.error?.code,
  });
  if (expectedError) {
    assert.notEqual(result.status, 0);
    assert.equal(value?.error?.code, expectedError);
  } else assert.equal(result.status, 0, `${args[0]}: ${value?.error?.code}`);
  return value;
};
const secrets = [];
try {
  run(['team-mode', 'owner-password', '--password-stdin'], randomUUID() + 'Aa!');
  run(['team-mode', 'on']);
  const role = run([
    'roles',
    'create',
    '--name',
    'M4200 creators',
    '--permissions',
    'bots.createPrivate',
  ]).role;
  const suffix = Date.now().toString(36);
  const users = ['alice', 'bob'].map((label) => `m4200-${label}-${suffix}`);
  const members = [];
  const passwords = new Map();
  for (const username of users) {
    const secret = join(directory, `${username}.secret`);
    secrets.push(secret);
    const created = run([
      'members',
      'create',
      '--username',
      username,
      '--display-name',
      username,
      '--role-ids',
      role.roleId,
      '--initial-password-file',
      secret,
    ]);
    members.push(created.member);
    const next = randomUUID() + 'Aa!';
    passwords.set(username, next);
    run(
      ['--as', username, 'members', 'change-password', '--password-stdin'],
      JSON.stringify({ current: readFileSync(secret, 'utf8'), next }),
    );
    rmSync(secret);
  }
  const [alice, bob] = users;
  const created = run([
    '--as',
    alice,
    'create',
    '--name',
    'M4200 private',
    '--operation-key',
    randomUUID(),
  ]);
  const slug = created.bot.id ?? created.bot.slug;
  assert.equal(run(['--as', alice, 'show', slug]).bot.ownerHumanId, members[0].humanId);
  report.bot = slug;
  report.humanId = members[0].humanId;
  const memory = (user, command, ...args) => run(['--as', user, command, slug, ...args]);

  const initial = memory(alice, 'memory-snapshot').snapshot;
  assert(initial.head);
  const save = (body, head) =>
    run(
      [
        '--as',
        alice,
        'memory-save',
        slug,
        '--path',
        'm4200.md',
        '--body-stdin',
        '--expected-head',
        head,
      ],
      body,
    ).commit;
  const first = save('M4200 version one', initial.head);
  const second = save('M4200 version two', first.sha);
  assert.equal(memory(alice, 'memory-file', '--path', 'm4200.md').file.body, 'M4200 version two');
  assert(memory(alice, 'memory-history').commits.some((commit) => commit.sha === first.sha));
  memory(alice, 'memory-commit-diff', '--sha', first.sha);
  const version = memory(
    alice,
    'memory-version-name',
    '--sha',
    first.sha,
    '--name',
    'M4200 first',
  ).version;
  assert(memory(alice, 'memory-versions').versions.some((entry) => entry.tag === version.tag));
  memory(alice, 'memory-version-unname', '--tag', version.tag);
  memory(alice, 'memory-restore-commit', '--sha', first.sha, '--expected-head', second.sha);
  assert.equal(memory(alice, 'memory-file', '--path', 'm4200.md').file.body, 'M4200 version one');
  assert(memory(alice, 'memory-checkpoints').checkpoints.length > 0);
  const headBeforeRefusal = memory(alice, 'memory-snapshot').snapshot.head;
  const bodyBeforeRefusal = memory(alice, 'memory-file', '--path', 'm4200.md').file.body;
  run(
    [
      '--as',
      alice,
      'memory-restore-commit',
      slug,
      '--sha',
      first.sha,
      '--expected-head',
      second.sha,
    ],
    undefined,
    'memory-conflict',
  );
  assert.equal(memory(alice, 'memory-snapshot').snapshot.head, headBeforeRefusal);
  assert.equal(memory(alice, 'memory-file', '--path', 'm4200.md').file.body, bodyBeforeRefusal);
  const imageBot = slug;
  const imageBytes = readFileSync(
    join(root, 'packages/core/test/fixtures/memory-images/green.svg'),
  );
  run(
    [
      '--as',
      alice,
      'memory-save',
      slug,
      '--path',
      'image.svg',
      '--body-stdin',
      '--expected-head',
      memory(alice, 'memory-snapshot').snapshot.head,
    ],
    imageBytes.toString('utf8'),
  );
  const image = run(['--as', alice, 'memory-file', imageBot, '--path', 'image.svg']).file.image;
  assert.equal(image.status, 'ready');
  const imageOut = join(directory, 'image-export.svg');
  run([
    '--as',
    alice,
    'memory-image',
    imageBot,
    '--path',
    'image.svg',
    '--image-source',
    image.source,
    '--image-revision',
    image.revision,
    '--out',
    imageOut,
  ]);
  assert.deepEqual(readFileSync(imageOut), imageBytes);
  const imageUrl = new URL('/botharness-device/team/api/botharness/memory/image', url.origin);
  imageUrl.search = new URLSearchParams({
    slug: imageBot,
    path: 'image.svg',
    source: image.source,
    revision: image.revision,
  });
  for (const username of users) {
    const signIn = await fetch(new URL('/botharness-device/team/sign-in', url.origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: passwords.get(username) }),
    });
    assert.equal(signIn.status, 200);
    const cookie = signIn.headers
      .getSetCookie()
      .map((entry) => entry.split(';')[0])
      .join('; ');
    const response = await fetch(imageUrl, { headers: { cookie } });
    if (username === alice) {
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), imageBytes);
    } else {
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, 'bot-not-found');
    }
  }
  report.memberImageCliAndHttp = 'pass';
  for (const args of [
    ['memory-snapshot'],
    ['memory-file', '--path', 'm4200.md'],
    ['memory-history'],
    ['memory-save', '--path', 'm4200.md', '--body', 'foreign', '--expected-head', first.sha],
    ['memory-restore-commit', '--sha', first.sha, '--expected-head', second.sha],
    ['memory-versions'],
  ]) {
    const [command, ...flags] = args;
    run(['--as', bob, command, slug, ...flags], undefined, 'bot-not-found');
  }
  const ownedPath = join(
    instance.home,
    'spaces',
    members[0].humanId,
    'bots',
    slug,
    'memory',
    'm4200.md',
  );
  assert.equal(readFileSync(ownedPath, 'utf8'), 'M4200 version one');
  run(['team-mode', 'off']);
  run(['--as', alice, 'memory-snapshot', slug], undefined, 'team-mode-off');
  run(['team-mode', 'on']);
  assert.equal(memory(alice, 'memory-file', '--path', 'm4200.md').file.body, 'M4200 version one');
  assert.equal(readFileSync(ownedPath, 'utf8'), 'M4200 version one');
  report.status = 'pass';
} catch (error) {
  report.status = 'fail';
  report.failure = error instanceof Error ? error.message : 'unknown';
  process.exitCode = 1;
} finally {
  for (const secret of secrets) rmSync(secret, { force: true });
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      status: report.status,
      report: join(directory, 'report.json'),
      failure: report.failure,
    }),
  );
}
