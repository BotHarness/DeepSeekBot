import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IM_TEST_SLOTS, protectImTestApps } from './dev-im-test-apps.mjs';
import { qqConnectionRequest, readQqCredential, runQqNative } from './dev-qq-native.mjs';

export function qqTestClientsPath(environment = process.env) {
  return resolve(
    environment.BOTHARNESS_QQ_TEST_CLIENTS_FILE ||
      join(homedir(), '.config', 'botharness', 'qq-test-clients.json'),
  );
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/u.test(value))
    throw new Error(`Invalid ${field}`);
  return value.trim();
}

function slotName(slot) {
  if (!IM_TEST_SLOTS.includes(slot)) throw new Error('Select QA1, QA2 or QA3');
  return slot;
}

function read(path) {
  if (!existsSync(path)) return { version: 1, clients: {} };
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data.version !== 1 || !data.clients || Array.isArray(data.clients))
    throw new Error('Invalid QQ test client registry');
  return data;
}

function update(path, operation) {
  protectImTestApps(path);
  const lock = `${path}.lock`;
  try {
    mkdirSync(lock, { mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error('QQ registry busy; inspect the current writer before recovering its lock', {
        cause: error,
      });
    throw error;
  }
  const temporary = join(dirname(path), `.qq-test-clients-${randomUUID()}.tmp`);
  try {
    const data = read(path);
    const result = operation(data);
    writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
    return result;
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
    rmdirSync(lock);
  }
}

export function registerQqTestClient(slot, configuration, { path = qqTestClientsPath() } = {}) {
  slotName(slot);
  const allowed = new Set([
    'name',
    'appId',
    'testGroup',
    'home',
    'profile',
    'location',
    'sourceHome',
  ]);
  if (Object.keys(configuration).some((key) => !allowed.has(key)))
    throw new Error(
      'QQ registry accepts metadata only; authorize credentials in native IM settings',
    );
  const client = {
    name: text(configuration.name, 'name'),
    appId: configuration.appId ? text(configuration.appId, 'AppID') : null,
    testGroup: text(configuration.testGroup, 'test group'),
    home: text(configuration.home, 'DSH home'),
    profile: text(configuration.profile ?? 'web-dev', 'Profile'),
    location: configuration.location ?? 'local',
    sourceHome: configuration.sourceHome
      ? resolve(text(configuration.sourceHome, 'native authorization home'))
      : null,
    claim: null,
  };
  if (!/^\d+$/u.test(client.testGroup) || (client.appId && !/^\d+$/u.test(client.appId)))
    throw new Error('QQ AppID and group number must be numeric strings');
  if (!['local', 'remote'].includes(client.location)) throw new Error('Select local or remote');
  if (!/^[A-Za-z0-9_-]+$/u.test(client.profile)) throw new Error('Invalid Profile');
  if (client.location === 'local') client.home = resolve(client.home);
  return update(path, (data) => {
    if (data.clients[slot]?.claim)
      throw new Error(
        'QQ slot is claimed; stop and release its receiver before replacing metadata',
      );
    for (const [otherSlot, other] of Object.entries(data.clients)) {
      if (otherSlot === slot) continue;
      if (
        other.name === client.name ||
        (client.appId && other.appId === client.appId) ||
        (other.location === client.location && other.home === client.home)
      )
        throw new Error('QQ slots require independent Apps and DSH homes');
    }
    data.clients[slot] = client;
    return { slot, registered: true, appIdentityKnown: Boolean(client.appId) };
  });
}

export function claimQqTestClient(
  slot,
  { task, receiver, worktree, branch, confirmedIdle },
  { path = qqTestClientsPath() } = {},
) {
  slotName(slot);
  if (confirmedIdle !== true)
    throw new Error('Confirm the current receiver is stopped on every machine before claiming');
  const claim = {
    task: text(task, 'task reference'),
    receiver: text(receiver, 'receiver label'),
    worktree: resolve(text(worktree, 'worktree')),
    branch: text(branch, 'branch'),
    claimedAt: new Date().toISOString(),
  };
  return update(path, (data) => {
    const client = data.clients[slot];
    if (!client) throw new Error('QQ slot is not registered');
    if (client.claim)
      throw new Error('QQ slot already claimed; inspect its owner and exact receiver');
    client.claim = claim;
    return { slot, claimed: true, task: claim.task };
  });
}

export function releaseQqTestClient(
  slot,
  { task, worktree, confirmedStopped },
  { path = qqTestClientsPath() } = {},
) {
  slotName(slot);
  if (confirmedStopped !== true)
    throw new Error('Verify the exact receiver has stopped before releasing');
  return update(path, (data) => {
    const client = data.clients[slot];
    if (!client?.claim) throw new Error('QQ slot has no claim');
    if (client.claim.task !== task || client.claim.worktree !== resolve(worktree))
      throw new Error('Only the claiming task and worktree can release this QQ slot');
    client.claim = null;
    return { slot, released: true };
  });
}

export function listQqTestClients({ path = qqTestClientsPath() } = {}) {
  const data = read(path);
  return IM_TEST_SLOTS.map((slot) => {
    const client = data.clients[slot];
    return {
      slot,
      name: client?.name ?? null,
      appIdentityKnown: Boolean(client?.appId),
      location: client?.location ?? null,
      availability: client?.claim
        ? 'claimed'
        : client
          ? 'requires-current-receiver-check'
          : 'unconfigured',
      claim: client?.claim ?? null,
    };
  });
}

export function identifyQqTestClient(slot, appId, owner, { path = qqTestClientsPath() } = {}) {
  appId = text(appId, 'AppID');
  if (!/^\d+$/u.test(appId)) throw new Error('QQ AppID must be a numeric string');
  return update(path, (data) => {
    const client = selectedQqTestClient(slot, owner, { path });
    if (client.appId && client.appId !== appId)
      throw new Error(
        'Application identity changed; inspect the receiver before replacing metadata',
      );
    for (const [otherSlot, other] of Object.entries(data.clients))
      if (otherSlot !== slot && other.appId === appId)
        throw new Error('QQ slots require independent Apps');
    data.clients[slot].appId = appId;
    return { slot, appIdentityKnown: true };
  });
}

export function selectedQqTestClient(
  slot,
  { task, worktree, branch },
  { path = qqTestClientsPath() } = {},
) {
  slotName(slot);
  const client = read(path).clients[slot];
  if (
    !client?.claim ||
    client.claim.task !== task ||
    client.claim.worktree !== resolve(worktree) ||
    client.claim.branch !== branch
  )
    throw new Error('Claim this QQ slot for the current task, worktree and branch before launch');
  return client;
}

export function markQqTestLaunch(slot, owner, { path = qqTestClientsPath() } = {}) {
  return update(path, (data) => {
    const client = selectedQqTestClient(slot, owner, { path });
    if (client.location !== 'local') throw new Error('Remote QQ client: local launch refused');
    if (client.claim.launchRequestedAt)
      throw new Error(
        'Launch already requested; inspect and stop the exact Host before releasing and claiming again',
      );
    const lease = join(client.home, 'botharness.writer.json');
    if (existsSync(lease))
      throw new Error('Existing Profile writer record; inspect its exact Host before launching');
    data.clients[slot].claim.launchRequestedAt = new Date().toISOString();
    return client;
  });
}

export function markQqTestConnect(slot, owner, { path = qqTestClientsPath() } = {}) {
  return update(path, (data) => {
    selectedQqTestClient(slot, owner, { path });
    if (data.clients[slot].claim.connectRequestedAt)
      throw new Error(
        'Connect already requested; inspect native status before handing off or retrying',
      );
    data.clients[slot].claim.connectRequestedAt = new Date().toISOString();
  });
}

function git(...arguments_) {
  return execFileSync('git', ['rev-parse', ...arguments_], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  }).trim();
}

async function main(argv) {
  const [command = 'list', slot, ...rest] = argv;
  if (command === 'list' && !slot) return listQqTestClients();
  const flags = {};
  const booleans = new Set([
    '--confirmed-idle',
    '--confirmed-stopped',
    '--remote',
    '--confirmed-source-idle',
  ]);
  const valueFlags = new Set([
    '--name',
    '--app-id',
    '--group',
    '--home',
    '--profile',
    '--task',
    '--receiver',
    '--port',
    '--source-home',
    '--token-file',
    '--ssh-config',
    '--remote-node',
  ]);
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index];
    if (Object.hasOwn(flags, flag)) throw new Error('Duplicate option');
    if (booleans.has(flag)) flags[flag] = true;
    else if (valueFlags.has(flag) && rest[index + 1] && !rest[index + 1].startsWith('--'))
      flags[flag] = rest[++index];
    else throw new Error('Unknown or incomplete option');
  }
  if (command === 'register')
    return registerQqTestClient(slot, {
      name: flags['--name'],
      appId: flags['--app-id'],
      testGroup: flags['--group'],
      home:
        flags['--home'] ?? join(homedir(), `.dsh-botharness-qq-${slotName(slot).toLowerCase()}`),
      profile: flags['--profile'],
      location: flags['--remote'] ? 'remote' : 'local',
      sourceHome: flags['--source-home'],
    });
  const task =
    flags['--task'] ??
    (process.env.CODEX_THREAD_ID ? `codex/local/${process.env.CODEX_THREAD_ID}` : undefined);
  const worktree = git('--show-toplevel');
  const branch = git('--abbrev-ref', 'HEAD');
  if (branch === 'HEAD') throw new Error('QQ QA requires a named branch');
  if (command === 'identify')
    return identifyQqTestClient(slot, flags['--app-id'], { task, worktree, branch });
  if (command === 'claim')
    return claimQqTestClient(slot, {
      task,
      receiver: flags['--receiver'],
      worktree,
      branch,
      confirmedIdle: flags['--confirmed-idle'],
    });
  if (command === 'release')
    return releaseQqTestClient(slot, {
      task,
      worktree,
      confirmedStopped: flags['--confirmed-stopped'],
    });
  if (command === 'connect' || command === 'status') {
    const owner = { task, worktree, branch };
    const client = selectedQqTestClient(slot, owner);
    if ((client.location === 'remote') !== Boolean(flags['--ssh-config']))
      throw new Error('Remote slots require explicit --ssh-config; local slots refuse SSH');
    const request = qqConnectionRequest(client, {
      port: Number(flags['--port']),
      tokenFile: flags['--token-file'],
      connect: command === 'connect',
    });
    if (command === 'connect') {
      const sourceHome = flags['--source-home'] ?? client.sourceHome;
      if (!sourceHome) throw new Error('Provide or register an authorized native --source-home');
      request.appSecret = readQqCredential(
        sourceHome,
        client.appId,
        flags['--confirmed-source-idle'],
      );
      markQqTestConnect(slot, owner);
    }
    return {
      slot,
      ...(await runQqNative(request, {
        sshConfig: flags['--ssh-config'],
        remoteNode: flags['--remote-node'],
      })),
    };
  }
  if (command === 'launch') {
    const client = selectedQqTestClient(slot, { task, worktree, branch });
    if (client.location !== 'local')
      throw new Error(
        'Remote QQ client: deploy/restart only its claimed remote unit; local launch refused',
      );
    const port = Number(flags['--port']);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('Provide an explicit --port');
    markQqTestLaunch(slot, { task, worktree, branch });
    const result = spawnSync(
      process.execPath,
      [
        join(worktree, 'scripts/dev-instance.mjs'),
        '--home',
        client.home,
        '--profile',
        client.profile,
        '--port',
        String(port),
        '--worktree',
        worktree,
        '--im-provider',
      ],
      { stdio: 'inherit', shell: false, windowsHide: true },
    );
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
    return undefined;
  }
  throw new Error(
    'usage: dev-qq-test-clients.mjs list | register|identify|claim|launch|connect|status|release QA1|QA2|QA3 [options]',
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await main(process.argv.slice(2));
    if (result !== undefined) console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
