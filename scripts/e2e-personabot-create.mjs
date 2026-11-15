import { processIsRunning } from './dev-instance-lifecycle.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { assertDshVersion } from './dsh-compatibility.mjs';
import { prepareZipImportProof } from './e2e-zip-import-proof.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const helper = join(root, 'scripts', 'dev-instance.mjs');
const withDm = process.argv.includes('--with-dm');
const fixtureRoot = realpathSync(mkdtempSync(join(tmpdir(), 'bh-e2e-web-')));
const home = join(fixtureRoot, basename(fixtureRoot) + '-profile');
mkdirSync(home);
const workspacePath = join(fixtureRoot, 'workspace');
const env = {
  ...process.env,
  PATH: [join(root, 'node_modules', '.bin'), process.env.PATH ?? ''].join(delimiter),
};

function dshVersion() {
  const result = spawnSync('dsh', ['--version'], { cwd: root, env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Installed DSH CLI is unavailable');
  const version = result.stdout.trim();
  assertDshVersion(version);
  return version;
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No local port');
  await new Promise((resolveClose) => server.close(resolveClose));
  return address.port;
}

function launch(port, build) {
  const args = [helper, '--home', home, '--port', String(port), '--json'];
  if (build) args.push('--build');
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 600_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error !== undefined || result.status !== 0) {
    const detail = (result.stderr ?? result.error?.message ?? 'unknown error')
      .replace(/\?token=[^\s]+/gu, '?token=<redacted>')
      .trim()
      .slice(-800);
    throw new Error(`Isolated DSH launch failed (exit ${result.status ?? 'unknown'}): ${detail}`);
  }
  const instance = JSON.parse(result.stdout);
  if (instance.health?.ok !== true || !Number.isInteger(instance.pid)) {
    throw new Error('Isolated DSH Host did not pass the authenticated health probe');
  }
  return instance;
}

function cookie() {
  const file = join(tmpdir(), `dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`);
  const value = readFileSync(file, 'utf8').split(';')[0];
  if (!value.includes('=')) throw new Error('DSH authentication cookie is unavailable');
  return value;
}

async function rpc(port, namespace, method, args = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/${namespace}/${method}`, {
    signal: AbortSignal.timeout(10_000),
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookie() },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `e2e-create-${namespace}-${method}`,
      method: `${namespace}/${method}`,
      payload: { args },
    }),
  });
  const envelope = await response.json();
  if (response.status !== 200 || envelope.result?.ok !== true) {
    const code = envelope.result?.error?.code ?? 'unknown';
    throw new Error(`${namespace}/${method} failed: HTTP ${response.status}, ${code}`);
  }
  return envelope.result.value;
}

function creationCli(instance, command, input) {
  const login = new URL(instance.url);
  const token = login.searchParams.get('token');
  if (!token) throw new Error('Isolated Host login token is unavailable');
  const result = spawnSync(
    process.execPath,
    [
      join(root, 'packages', 'deepseekbot', 'dist', 'deepseekbot.mjs'),
      command,
      '--host',
      login.origin,
      '--timeout',
      '30',
      '--name',
      input.displayName,
      ...(input.gitUrl
        ? ['--from-git', input.gitUrl, '--expected-commit', input.expectedCommit]
        : ['--persona', input.persona]),
      '--description',
      input.description,
      '--role',
      input.roles[0],
      ...(input.operationKey ? ['--operation-key', input.operationKey] : []),
      ...(input.memoryLocation ? ['--memory-location', input.memoryLocation] : []),
    ],
    {
      cwd: root,
      env: { ...env, DEEPSEEKBOT_HOST_TOKEN: token },
      encoding: 'utf8',
      timeout: 45_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.error !== undefined || result.status !== 0)
    throw new Error(
      'Creation CLI ' + command + ' failed (exit ' + (result.status ?? 'unknown') + ')',
    );
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error('Creation CLI did not return one JSON document');
  }
}

function verificationCli(instance, as, command = ['spaces', 'audience-directory']) {
  const login = new URL(instance.url);
  const token = login.searchParams.get('token');
  const result = spawnSync(
    process.execPath,
    [
      join(root, 'packages/deepseekbot/dist/deepseekbot.mjs'),
      '--host',
      login.origin,
      ...(as ? ['--as', as] : []),
      ...command,
    ],
    {
      cwd: root,
      env: { ...env, DEEPSEEKBOT_HOST_TOKEN: token },
      encoding: 'utf8',
      timeout: 30_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.error) throw new Error('Verification CLI did not settle');
  return { status: result.status, value: JSON.parse(result.stdout) };
}
function minimalAudienceDirectory(value) {
  return (
    Array.isArray(value?.roles) &&
    Array.isArray(value?.members) &&
    Object.keys(value).sort().join(',') === 'members,roles' &&
    value.roles.every((role) => Object.keys(role).sort().join(',') === 'builtin,name,roleId') &&
    value.members.every((member) => Object.keys(member).sort().join(',') === 'displayName,humanId')
  );
}

function gitPreviewCli(instance, gitUrl) {
  const login = new URL(instance.url);
  const token = login.searchParams.get('token');
  if (!token) throw new Error('Isolated Host login token is unavailable');
  const result = spawnSync(
    process.execPath,
    [
      join(root, 'packages', 'deepseekbot', 'dist', 'deepseekbot.mjs'),
      'bot-import-preview',
      '--host',
      login.origin,
      '--from-git',
      gitUrl,
    ],
    {
      cwd: root,
      env: { ...env, DEEPSEEKBOT_HOST_TOKEN: token },
      encoding: 'utf8',
      timeout: 45000,
      windowsHide: true,
    },
  );
  if (result.status !== 0) throw new Error('Git source CLI inspection failed');
  return JSON.parse(result.stdout);
}

function sameReceipt(actual, expected) {
  if (
    actual?.operationKey !== expected.operationKey ||
    actual?.botSlug !== expected.botSlug ||
    actual?.status !== 'created' ||
    actual?.channelId !== expected.channelId
  )
    throw new Error('Creation recovery changed the original Bot or DM receipt');
}

async function creationCounts(port) {
  const [bots, channels] = await Promise.all([
    rpc(port, 'botharness', 'list'),
    rpc(port, 'botharness', 'channels'),
  ]);
  return { bots: bots.bots, channels: channels.channels };
}

async function verifyOneCreation(port, baseline, receipt, input) {
  const current = await creationCounts(port);
  if (
    current.bots.length !== baseline.bots.length + 1 ||
    current.channels.length !== baseline.channels.length + 1 ||
    current.bots.filter(
      (bot) => bot.slug === receipt.botSlug && bot.displayName === input.displayName,
    ).length !== 1 ||
    current.channels.filter(
      (channel) =>
        channel.id === receipt.channelId &&
        channel.type === 'dm' &&
        channel.botSlug === receipt.botSlug,
    ).length !== 1
  )
    throw new Error('Creation retry did not preserve exactly one new Bot and its DM');
}

async function waitForStop(port, hostPid) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) });
    } catch {
      if (!processIsRunning(hostPid)) return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('Isolated DSH Host did not stop');
}

function stop(pid) {
  if (pid === undefined) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

let pid;
const version = dshVersion();
const port = await availablePort();
try {
  mkdirSync(workspacePath);
  const gitSource = join(fixtureRoot, 'git-source');
  mkdirSync(gitSource);
  const git = (...args) =>
    execFileSync('git', ['-C', gitSource, ...args], { encoding: 'utf8', windowsHide: true }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Import QA');
  git('config', 'user.email', 'import@example.test');
  writeFileSync(join(gitSource, 'SOUL.md'), 'Immutable imported persona.');
  git('add', '.');
  git('commit', '--quiet', '-m', 'source fixture');
  const sourceCommit = git('rev-parse', 'HEAD');
  const gitUrl = 'https://import-fixture.example/source.git';
  const rewriteIndex = Number(env.GIT_CONFIG_COUNT ?? 0);
  env.GIT_CONFIG_COUNT = String(rewriteIndex + 1);
  env['GIT_CONFIG_KEY_' + rewriteIndex] = 'url.' + gitSource.replaceAll('\\', '/') + '/.insteadOf';
  env['GIT_CONFIG_VALUE_' + rewriteIndex] = gitUrl;
  let current = launch(port, true);
  pid = current.pid;

  const native = await rpc(port, 'workspace', 'create', { request: { path: workspacePath } });
  const workspaceId = native.workspace?.workspaceId;
  if (typeof workspaceId !== 'string') throw new Error('Native Workspace has no id');
  const options = await rpc(port, 'botharness', 'workspaceOptions');
  if (!options.workspaces.some((entry) => entry.id === workspaceId)) {
    throw new Error('Native Workspace is absent from BotHarness Workspace options');
  }

  const displayName = `Web QA ${Date.now()}`;
  const created = await rpc(port, 'botharness', 'create', {
    displayName,
    roles: ['research'],
    workspaces: [workspaceId],
  });
  const slug = created.bot?.slug;
  if (typeof slug !== 'string') throw new Error('PersonaBot creation returned no slug');
  await rpc(port, 'botharness', 'teamOwnerPasswordSet', { password: 'smoke-' + randomUUID() });
  await rpc(port, 'botharness', 'teamModeSet', { enabled: true });
  const member = await rpc(port, 'botharness', 'memberCreate', {
    username: 'memory-member',
    displayName: 'Memory member',
  });
  const customLocation = join(fixtureRoot, 'custom-memory');
  mkdirSync(customLocation);
  const customCli = creationCli(current, 'create', {
    displayName: 'Custom Memory',
    persona: 'Keep custom Memory.',
    description: 'Memory switch fixture',
    roles: ['qa'],
    memoryLocation: customLocation,
  });
  if (typeof customCli.bot?.id !== 'string') throw new Error('Custom Memory CLI returned no Bot');
  stop(pid);
  await waitForStop(port, pid);
  pid = undefined;
  const {
    createCore,
    OWNER_HUMAN_CONTEXT: owner,
    humanContext,
  } = await import('../packages/core/dist/index.mjs');
  const seed = createCore({ dshHome: home });
  let memories;
  try {
    const ownerTob = await seed.tob.ensure(owner);
    const memberHuman = humanContext(member.member.humanId);
    await seed.team.changePassword(
      memberHuman,
      member.initialPassword,
      'smoke-' + randomUUID(),
      false,
    );
    const manager = seed.team.roles.create(owner, 'Space audience manager', [
      'workspaces.manageShared',
    ]).role;
    seed.team.roles.set(owner, memberHuman.humanId, [manager.roleId]);
    if (seed.tob.slug(memberHuman) !== undefined) throw new Error('Member unexpectedly has a Tob');
    const formerTob = seed.registry.create({
      slug: 'former-member-tob-memory',
      displayName: 'Former member Tob',
      ownerHumanId: memberHuman.humanId,
    });
    if (!formerTob.ok) throw new Error('Former member Tob fixture could not be created');
    const custom = seed.registry.get(customCli.bot.id);
    const privateMember = seed.registry.create({
      slug: 'member-private-memory',
      displayName: 'Member Memory',
      ownerHumanId: memberHuman.humanId,
    });
    if (!custom || !privateMember.ok)
      throw new Error('Memory switch fixtures could not be created');
    memories = [
      slug,
      ownerTob.botSlug,
      custom.slug,
      privateMember.record.slug,
      formerTob.record.slug,
    ].map((botSlug) => {
      const path = seed.registry.memoryDirFor(botSlug);
      writeFileSync(join(path, 'switch-kept.txt'), botSlug);
      execFileSync('git', ['-C', path, 'add', 'switch-kept.txt'], { windowsHide: true });
      execFileSync(
        'git',
        [
          '-C',
          path,
          '-c',
          'user.name=QA',
          '-c',
          'user.email=qa@example.test',
          'commit',
          '-qm',
          'Memory switch fixture',
        ],
        { windowsHide: true },
      );
      return {
        slug: botSlug,
        ownerHumanId: seed.registry.get(botSlug)?.ownerHumanId ?? owner.humanId,
        path,
        history: execFileSync('git', ['-C', path, 'rev-list', 'HEAD'], {
          encoding: 'utf8',
          windowsHide: true,
        }).trim(),
      };
    });
  } finally {
    seed.schedules.close();
    seed.externalMessaging.close();
    await seed.runtime.close();
    seed.operationalDatabase.close();
  }
  const proofDatabase = () =>
    new DatabaseSync(join(home, 'botharness', 'botharness.db'), { readOnly: true });
  const baseline = proofDatabase();
  try {
    for (const memory of memories) {
      memory.proof = baseline
        .prepare('SELECT body FROM persona_bot_memory_ownership WHERE slug = ?')
        .get(memory.slug)?.body;
      const proof = JSON.parse(memory.proof);
      if (proof.path !== realpathSync(memory.path) || proof.device < 0 || proof.inode < 0)
        throw new Error('Memory switch fixture lacks a valid ownership proof');
    }
  } finally {
    baseline.close();
  }
  current = launch(port, false);
  pid = current.pid;
  const noTob = verificationCli(current, 'memory-member', ['tob-home']);
  if (
    noTob.status !== 0 ||
    noTob.value?.available !== false ||
    Object.keys(noTob.value).join(',') !== 'available'
  )
    throw new Error('Member Tob home did not report no Tob');
  const ownerDirectory = verificationCli(current);
  const memberDirectory = verificationCli(current, 'memory-member');
  if (
    ownerDirectory.status !== 0 ||
    memberDirectory.status !== 0 ||
    !minimalAudienceDirectory(ownerDirectory.value) ||
    !minimalAudienceDirectory(memberDirectory.value)
  )
    throw new Error('Audience directory CLI returned an invalid minimal directory');
  await rpc(port, 'botharness', 'memberRolesSet', {
    humanId: member.member.humanId,
    roleIds: ['member'],
  });
  const refusedDirectory = verificationCli(current, 'memory-member');
  if (
    refusedDirectory.status === 0 ||
    refusedDirectory.value?.error?.code !== 'permission-required' ||
    refusedDirectory.value.error.details?.permission !== 'workspaces.manageShared'
  )
    throw new Error('Audience directory CLI bypassed member permission checks');
  const archiveResponse = await fetch(
    `http://127.0.0.1:${port}/api/botharness/bot-zip?slug=${encodeURIComponent(slug)}`,
    { headers: { cookie: cookie() }, signal: AbortSignal.timeout(30_000) },
  );
  if (!archiveResponse.ok) throw new Error('Member import fixture export failed');
  const memberArchive = join(fixtureRoot, 'member-import.zip');
  writeFileSync(memberArchive, Buffer.from(await archiveResponse.arrayBuffer()));
  const memberUploadArgs = [
    'bot-zip-upload',
    '--upload-key',
    'member-smoke-upload',
    '--from-zip',
    memberArchive,
  ];
  const deniedImport = verificationCli(current, 'memory-member', memberUploadArgs);
  if (
    deniedImport.status === 0 ||
    deniedImport.value?.error?.code !== 'permission-required' ||
    deniedImport.value.error.details?.permission !== 'bots.createPrivate'
  )
    throw new Error(
      `Member import CLI refusal mismatch: exit=${deniedImport.status} code=${deniedImport.value?.error?.code} permission=${deniedImport.value?.error?.details?.permission}`,
    );
  const importer = await rpc(port, 'botharness', 'roleCreate', {
    name: 'Private importer',
    permissions: ['bots.createPrivate'],
  });
  await rpc(port, 'botharness', 'memberRolesSet', {
    humanId: member.member.humanId,
    roleIds: [importer.role.roleId],
  });
  const upload = verificationCli(current, 'memory-member', memberUploadArgs);
  if (upload.status !== 0 || upload.value.offset !== upload.value.sizeBytes)
    throw new Error('Granted member import CLI upload failed');
  const memberImportArgs = [
    'bot-zip-import',
    '--upload-key',
    'member-smoke-upload',
    '--archive-sha256',
    upload.value.sha256,
    '--archive-size',
    String(upload.value.sizeBytes),
    '--operation-key',
    'member-smoke-import',
    '--name',
    'Private imported Bot',
  ];
  const imported = verificationCli(current, 'memory-member', memberImportArgs);
  const retriedImport = verificationCli(current, 'memory-member', memberImportArgs);
  if (
    imported.status !== 0 ||
    imported.value?.bot?.ownerHumanId !== member.member.humanId ||
    imported.value?.receipt?.status !== 'created' ||
    retriedImport.status !== 0 ||
    retriedImport.value?.receipt?.botSlug !== imported.value.receipt.botSlug
  )
    throw new Error('Granted member import CLI did not preserve its private Bot and receipt');
  await rpc(port, 'botharness', 'memberRolesSet', {
    humanId: member.member.humanId,
    roleIds: ['member'],
  });
  const revokedImport = verificationCli(current, 'memory-member', memberImportArgs);
  if (
    revokedImport.status === 0 ||
    revokedImport.value?.error?.details?.permission !== 'bots.createPrivate'
  )
    throw new Error('Member import CLI ignored permission revocation');
  for (const [step, enabled] of [false, true, false, true].entries()) {
    await rpc(port, 'botharness', 'teamModeSet', { enabled });
    stop(pid);
    await waitForStop(port, pid);
    pid = undefined;
    current = launch(port, false);
    pid = current.pid;
    if (enabled) {
      const noTob = verificationCli(current, 'memory-member', ['tob-home']);
      if (noTob.status !== 0 || noTob.value?.available !== false)
        throw new Error('Team switch allocated a member Tob');
    }
    const currentOptions = await rpc(port, 'botharness', 'workspaceOptions');
    if (!currentOptions.workspaces.some((entry) => entry.id === workspaceId))
      throw new Error('Owner native Workspace option disappeared after changing Team mode');
    const granted = await rpc(port, 'botharness', 'grantCreate', { slug, workspaceId });
    if (granted.grant?.workspaceId !== workspaceId)
      throw new Error('Owner native Workspace Grant was refused after changing Team mode');
    const proofs = proofDatabase();
    const auditBefore = await rpc(port, 'botharness', 'auditLog');
    let privateOpens = 0;
    try {
      for (const memory of memories) {
        const detail = await rpc(port, 'botharness', 'get', { slug: memory.slug });
        if (enabled && memory.ownerHumanId !== owner.humanId && detail.metadataOnly !== true)
          throw new Error('Member Bot administration did not return metadata only');
        let profile = detail.bot;
        if (detail.metadataOnly === true) {
          if ('memoryDir' in profile || 'persona' in profile || 'sessions' in profile)
            throw new Error('Private Bot administration returned content');
          const view = await rpc(port, 'botharness', 'privateContentOpen', {
            kind: 'bot',
            objectId: memory.slug,
          });
          profile = view.object.profile;
          privateOpens++;
        }
        const history = execFileSync('git', ['-C', memory.path, 'rev-list', 'HEAD'], {
          encoding: 'utf8',
          windowsHide: true,
        }).trim();
        if (
          profile.memoryDir !== memory.path ||
          history !== memory.history ||
          readFileSync(join(memory.path, 'switch-kept.txt'), 'utf8') !== memory.slug ||
          proofs
            .prepare('SELECT body FROM persona_bot_memory_ownership WHERE slug = ?')
            .get(memory.slug)?.body !== memory.proof
        )
          throw new Error('Team switch/restart disturbed Bot Memory');
        for (let previous = 0; previous < step; previous++)
          if (readFileSync(join(memory.path, 'switch-' + previous + '.txt'), 'utf8') !== 'retained')
            throw new Error('Team switch lost a Memory write');
        writeFileSync(join(memory.path, 'switch-' + step + '.txt'), 'retained');
      }
    } finally {
      proofs.close();
    }
    const auditAfter = await rpc(port, 'botharness', 'auditLog');
    if (auditAfter.records.length !== auditBefore.records.length + privateOpens)
      throw new Error('Private Memory reads were not audited exactly once');
    const verified = await rpc(port, 'botharness', 'auditVerify');
    if (!verified.ok) throw new Error('Private Memory audit chain failed verification');
  }
  await rpc(port, 'botharness', 'teamModeSet', { enabled: false });
  const dm = await rpc(port, 'botharness', 'channelDm', { slug, displayName });
  const channelId = dm.channel?.id;
  if (typeof channelId !== 'string') throw new Error('PersonaBot DM Channel is unavailable');
  const before = await rpc(port, 'botharness', 'memorySnapshot', { channelId });
  const head = before.snapshot?.head;
  if (typeof head !== 'string' || !/^[0-9a-f]{40}$/u.test(head)) {
    throw new Error('Git Memory Repository has no accepted HEAD');
  }

  const dmBody = `Web DM restart check ${Date.now()}`;
  let sentMessageId;
  if (withDm) {
    const sent = await rpc(port, 'botharness', 'channelSend', { channelId, body: dmBody });
    sentMessageId = sent.message?.id;
    if (typeof sentMessageId !== 'string') throw new Error('DM send returned no message id');
    const history = await rpc(port, 'botharness', 'channelTimeline', { channelId });
    if (
      history.page.entries.filter(
        (entry) =>
          entry.id === sentMessageId && entry.body === dmBody && entry.author.kind === 'human',
      ).length !== 1
    ) {
      throw new Error('DM send did not commit exactly one Human message');
    }
  }

  const creationInput = {
    operationKey: 'e2e-blank-create-001',
    displayName: 'Blank recovery QA',
    persona: 'Keep replies short.',
    description: 'Creation recovery check',
    roles: ['qa'],
  };
  const creationBaseline = await creationCounts(port);
  const missing = await rpc(port, 'botharness', 'createLookup', creationInput);
  const missingCli = creationCli(current, 'create-status', creationInput);
  const afterLookup = await creationCounts(port);
  if (
    missing.receipt !== null ||
    missingCli.receipt !== null ||
    afterLookup.bots.length !== creationBaseline.bots.length ||
    afterLookup.channels.length !== creationBaseline.channels.length
  )
    throw new Error('Creation lookup mutated a previously absent operation');

  await rpc(port, 'botharness', 'create', creationInput);
  const recovered = await rpc(port, 'botharness', 'createLookup', creationInput);
  const receipt = recovered.receipt;
  if (
    receipt?.operationKey !== creationInput.operationKey ||
    receipt.status !== 'created' ||
    typeof receipt.botSlug !== 'string' ||
    typeof receipt.channelId !== 'string'
  )
    throw new Error('The Host did not return a completed blank creation receipt');
  sameReceipt(creationCli(current, 'create-status', creationInput).receipt, receipt);
  const retried = creationCli(current, 'create', creationInput);
  sameReceipt(retried.operation, receipt);
  if (retried.bot?.id !== receipt.botSlug || retried.dm?.channelId !== receipt.channelId)
    throw new Error('Creation CLI returned a different Bot or DM');
  await verifyOneCreation(port, creationBaseline, receipt, creationInput);

  const gitInput = {
    operationKey: 'e2e-git-import-001',
    displayName: 'Git recovery QA',
    gitUrl,
    expectedCommit: sourceCommit,
    description: 'Pinned Git source',
    roles: ['qa'],
  };
  const gitBaseline = await creationCounts(port);
  const gitPreview = gitPreviewCli(current, gitUrl);
  if (gitPreview.source?.commit !== sourceCommit || gitPreview.source?.gitUrl !== gitUrl)
    throw new Error('Git preview changed selected source');
  const gitMissing = await rpc(port, 'botharness', 'botImportLookup', gitInput);
  if (
    gitMissing.receipt !== null ||
    creationCli(current, 'create-status', gitInput).receipt !== null
  )
    throw new Error('Unexpected existing Git operation');
  await rpc(port, 'botharness', 'createFromGit', gitInput);
  const gitReceipt = (await rpc(port, 'botharness', 'botImportLookup', gitInput)).receipt;
  if (gitReceipt?.status !== 'created') throw new Error('Missing completed Git receipt');
  const importedDetail = await rpc(port, 'botharness', 'get', { slug: gitReceipt.botSlug });
  if (
    readFileSync(join(importedDetail.bot.memoryDir, 'SOUL.md'), 'utf8') !==
    'Immutable imported persona.'
  )
    throw new Error('Git import changed the selected personality');
  sameReceipt(creationCli(current, 'create', gitInput).operation, gitReceipt);
  await verifyOneCreation(port, gitBaseline, gitReceipt, gitInput);
  writeFileSync(join(gitSource, 'SOUL.md'), 'Remote source changed after accepted import.');
  git('add', '.');
  git('commit', '--quiet', '-m', 'move remote HEAD');
  const staleInput = { ...gitInput, operationKey: 'e2e-git-stale-source-001' };
  let staleRefused = false;
  try {
    await rpc(port, 'botharness', 'createFromGit', staleInput);
  } catch (error) {
    staleRefused = error instanceof Error && error.message.endsWith('git-source-changed');
  }
  if (!staleRefused) throw new Error('Changed Git source was not refused');
  const completeBaseline = await creationCounts(port);
  if (
    completeBaseline.bots.length !== gitBaseline.bots.length + 1 ||
    completeBaseline.channels.length !== gitBaseline.channels.length + 1
  )
    throw new Error('Stale source published a Bot or DM');

  const zipProof = await prepareZipImportProof({
    root,
    home,
    port,
    sourceSlug: receipt.botSlug,
    rpc,
    cookie,
    env,
  });

  stop(pid);
  await waitForStop(port, pid);
  pid = undefined;
  const restarted = launch(port, false);
  pid = restarted.pid;

  sameReceipt((await rpc(port, 'botharness', 'createLookup', creationInput)).receipt, receipt);
  sameReceipt(creationCli(restarted, 'create-status', creationInput).receipt, receipt);
  sameReceipt(creationCli(restarted, 'create', creationInput).operation, receipt);
  sameReceipt((await rpc(port, 'botharness', 'botImportLookup', gitInput)).receipt, gitReceipt);
  sameReceipt(creationCli(restarted, 'create-status', gitInput).receipt, gitReceipt);
  sameReceipt(creationCli(restarted, 'create', gitInput).operation, gitReceipt);
  if (
    readFileSync(join(importedDetail.bot.memoryDir, 'SOUL.md'), 'utf8') !==
    'Immutable imported persona.'
  )
    throw new Error('Git recovery replaced imported personality with changed remote source');
  const afterRecovery = await creationCounts(port);
  if (
    afterRecovery.bots.length !== completeBaseline.bots.length ||
    afterRecovery.channels.length !== completeBaseline.channels.length
  )
    throw new Error('Restart recovery duplicated a Bot or DM');

  const zipImported = await zipProof.finishAfterUploadRestart(restarted);
  stop(pid);
  await waitForStop(port, pid);
  pid = undefined;
  const zipRestarted = launch(port, false);
  pid = zipRestarted.pid;
  await zipImported.verifyAfterImportRestart(zipRestarted);

  const list = await rpc(port, 'botharness', 'list');
  const read = await rpc(port, 'botharness', 'get', { slug });
  const after = await rpc(port, 'botharness', 'memorySnapshot', { channelId });
  if (!list.bots.some((bot) => bot.slug === slug))
    throw new Error('PersonaBot missing after restart');
  if (read.bot?.displayName !== displayName || !read.bot.workspaces.includes(workspaceId)) {
    throw new Error('PersonaBot identity or Workspace changed after restart');
  }
  if (after.snapshot?.head !== head) throw new Error('Memory HEAD changed after restart');
  if (withDm) {
    const history = await rpc(port, 'botharness', 'channelTimeline', { channelId });
    if (
      history.page.entries.filter(
        (entry) =>
          entry.id === sentMessageId && entry.body === dmBody && entry.author.kind === 'human',
      ).length !== 1
    ) {
      throw new Error('Committed DM Human message missing or duplicated after restart');
    }
  }
  if (typeof read.bot.memoryDir !== 'string') throw new Error('Memory Repository path unavailable');
  const gitHead = execFileSync('git', ['-C', read.bot.memoryDir, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (gitHead !== head) throw new Error('Git HEAD differs from the public Memory snapshot');

  console.log(
    JSON.stringify({
      version,
      result: 'pass',
      workspaceCreated: true,
      ownerNativeGrantsInBothModes: true,
      spaceAudienceDirectoryCliParity: true,
      memberTobAbsent: true,
      memberPrivateImportCli: true,
      memoryStableAcrossTeamSwitchesAndRestarts: true,
      personaBotCreated: true,
      persistedAfterRestart: true,
      gitMemoryReady: true,
      blankCreationLookup: true,
      blankCreationCli: true,
      blankCreationRetry: true,
      blankCreationAfterRestart: true,
      gitImportPreview: true,
      gitImportCliRecovery: true,
      gitImportAfterRestart: true,
      zipUploadAfterRestart: true,
      zipImportCliRecovery: true,
      zipImportAfterRestart: true,
      ...(withDm ? { dmHistoryAfterRestart: true } : {}),
    }),
  );
} finally {
  stop(pid);
  if (pid !== undefined) await waitForStop(port, pid);
}
