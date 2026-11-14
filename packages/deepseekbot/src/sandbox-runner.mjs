#!/usr/bin/env node
// Team mode execution isolation, phase 1 (docs/ops/team-vps.md).
//
// `@deepseek-ai/dsh-sandbox-local` runs this file as its `runnerCommand`:
//
//   node sandbox-runner.mjs --config <file> --dsh-profile <bwrap profile args> -- <command>
//
// DSH's bwrap profile mounts the host root read-only, so reads are unconfined.
// This runner keeps DSH's profile, then hides the Host data directory, the
// space roots and /home behind tmpfs, re-binds only the roots BotHarness
// allowed for this workspace (an allowlist file BotHarness writes before every
// tool execution), isolates the network so only the public internet is
// reachable, and charges the process tree to its account's cgroup.
// Every failure exits 125 with a `deepseekbot-sandbox: ` line before the
// command starts, which DSH reports as an unavailable sandbox (fail closed).

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FAILURE_PREFIX = 'deepseekbot-sandbox: ';
export const FAILURE_EXIT = 125;
export const ALLOWLIST_VERSION = 1;
/** TEST-NET-1 address pasta answers DNS on; never a real destination. */
export const DNS_FORWARD_ADDRESS = '192.0.2.53';

export class RunnerRefusal extends Error {}

const refuse = (message) => {
  throw new RunnerRefusal(message);
};

/** Destinations the sandbox may never reach: loopback, link-local and cloud metadata, RFC1918, CGNAT/Tailscale, multicast. */
export const BLOCKED_IPV4 = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '224.0.0.0/4',
  '240.0.0.0/4',
];
export const BLOCKED_IPV6 = [
  '::/127',
  '::ffff:0:0/96',
  '64:ff9b::/96',
  'fc00::/7',
  'fe80::/10',
  'ff00::/8',
];

/** nftables ruleset loaded into the sandbox's own network namespace. */
export function networkRules() {
  return [
    'table inet deepseekbot_sandbox {',
    '  chain output {',
    '    type filter hook output priority 0; policy accept;',
    '    oifname "lo" accept',
    `    ip daddr ${DNS_FORWARD_ADDRESS} meta l4proto { tcp, udp } th dport 53 accept`,
    `    ip daddr { ${BLOCKED_IPV4.join(', ')} } reject with icmpx admin-prohibited`,
    `    ip6 daddr { ${BLOCKED_IPV6.join(', ')} } reject with icmpx admin-prohibited`,
    '  }',
    '}',
    '',
  ].join('\n');
}

export function stateDirFor(dshHome) {
  return join(dshHome, 'botharness', 'sandbox');
}

export function allowlistPath(stateDir, root) {
  return join(stateDir, 'allow', `${createHash('sha256').update(root).digest('hex')}.json`);
}

function cleanAbsolute(value, label) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0'))
    refuse(`${label} must be an absolute path`);
  const clean = normalize(value);
  return clean.length > 1 && clean.endsWith(sep) ? clean.slice(0, -1) : clean;
}

/** True when `parent` is `child` or one of its ancestors. */
export function covers(parent, child) {
  const tail = relative(parent, child);
  return tail === '' || (tail !== '..' && !tail.startsWith(`..${sep}`) && !isAbsolute(tail));
}

const depth = (path) => (path === sep ? 0 : path.split(sep).length);

/** Split this runner's own options, DSH's bwrap profile and the command. */
export function parseRunnerArgv(argv) {
  const marker = argv.indexOf('--dsh-profile');
  if (marker < 0) refuse('missing --dsh-profile marker; check runnerCommand');
  const own = argv.slice(0, marker);
  const rest = argv.slice(marker + 1);
  const separator = rest.indexOf('--');
  if (separator < 0) refuse('missing -- before the command');
  const command = rest.slice(separator + 1);
  if (command.length === 0) refuse('missing command');
  let configPath;
  for (let index = 0; index < own.length; index += 1) {
    if (own[index] === '--config' && index + 1 < own.length) configPath = own[++index];
    else refuse(`unknown runner option ${own[index]}`);
  }
  if (configPath === undefined) refuse('missing --config');
  return { configPath, profile: rest.slice(0, separator), command };
}

const PROFILE_ARITY = new Map([
  ['--ro-bind', 2],
  ['--bind', 2],
  ['--dev', 1],
  ['--proc', 1],
  ['--tmpfs', 1],
  ['--unshare-pid', 0],
  ['--die-with-parent', 0],
]);

/**
 * Parse the bwrap profile DSH appended. Unknown flags refuse: a DSH upgrade
 * that changes the profile must be reviewed before members run commands again.
 */
export function parseDshProfile(profile) {
  const writable = [];
  let tmp = false;
  let rootReadOnly = false;
  for (let index = 0; index < profile.length;) {
    const flag = profile[index];
    const arity = PROFILE_ARITY.get(flag);
    if (arity === undefined) refuse(`unsupported DSH sandbox profile argument ${flag}`);
    const values = profile.slice(index + 1, index + 1 + arity);
    if (values.length !== arity) refuse(`incomplete DSH sandbox profile argument ${flag}`);
    if (flag === '--ro-bind' && values[0] === '/' && values[1] === '/') rootReadOnly = true;
    if (flag === '--bind') {
      if (values[0] !== values[1]) refuse('DSH writable bind source and target differ');
      writable.push(cleanAbsolute(values[0], 'DSH writable root'));
    }
    if (flag === '--tmpfs' && values[0] === '/tmp') tmp = true;
    index += 1 + arity;
  }
  if (!rootReadOnly) refuse('DSH sandbox profile does not mount the host root read-only');
  return { writable, tmp };
}

export function parseConfig(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    refuse('sandbox config is not valid JSON');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    refuse('sandbox config must be an object');
  const dshHome = cleanAbsolute(value.dshHome, 'dshHome');
  const extra = value.hide ?? [];
  if (!Array.isArray(extra)) refuse('hide must be a list of absolute paths');
  const hide = [...new Set([dshHome, ...extra.map((path) => cleanAbsolute(path, 'hide entry'))])];
  if (hide.some((path) => path === sep)) refuse('hide may not contain /');
  const network = value.network ?? 'filtered';
  if (!['filtered', 'none', 'host'].includes(network))
    refuse('network must be filtered, none or host');
  const limits = value.accountLimits;
  let accountLimits;
  if (limits !== undefined) {
    if (typeof limits !== 'object' || limits === null) refuse('accountLimits must be an object');
    accountLimits = cgroupLimits(limits);
  }
  const cgroupParent = value.cgroupParent ?? 'auto';
  if (cgroupParent !== 'auto') cleanAbsolute(cgroupParent, 'cgroupParent');
  const binary = (name) => {
    const configured = value.binaries?.[name];
    return configured === undefined ? name : cleanAbsolute(configured, `binaries.${name}`);
  };
  return {
    dshHome,
    stateDir: stateDirFor(dshHome),
    hide,
    network,
    accountLimits,
    cgroupParent,
    binaries: {
      bwrap: binary('bwrap'),
      pasta: binary('pasta'),
      nsenter: binary('nsenter'),
      nft: binary('nft'),
    },
  };
}

const SIZE = /^(\d+)([KMGT]?)$/u;

/** Translate `{ cpu: '200%', memory: '2G', pids: 1024 }` into cgroup v2 files. */
export function cgroupLimits(limits) {
  const files = {};
  if (limits.cpu !== undefined) {
    const match = /^(\d+)%$/u.exec(String(limits.cpu));
    if (match === null || Number(match[1]) <= 0) refuse('accountLimits.cpu must look like 200%');
    files['cpu.max'] = `${Number(match[1]) * 1000} 100000`;
  }
  if (limits.memory !== undefined) {
    const match = SIZE.exec(String(limits.memory));
    if (match === null) refuse('accountLimits.memory must look like 2G');
    const unit = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }[match[2]];
    files['memory.max'] = String(Number(match[1]) * unit);
  }
  if (limits.pids !== undefined) {
    if (!Number.isInteger(limits.pids) || limits.pids <= 0)
      refuse('accountLimits.pids must be a positive integer');
    files['pids.max'] = String(limits.pids);
  }
  return files;
}

export function parseAllowlist(text, root) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    refuse('allowlist is not valid JSON');
  }
  if (value?.version !== ALLOWLIST_VERSION) refuse('allowlist version is not supported');
  if (value.root !== root) refuse('allowlist belongs to a different workspace');
  const list = (key) => {
    if (!Array.isArray(value[key])) refuse(`allowlist ${key} must be a list`);
    return value[key].map((path) => cleanAbsolute(path, `allowlist ${key} entry`));
  };
  const account =
    typeof value.account === 'string' && value.account !== '' ? value.account : 'unassigned';
  return { root, read: list('read'), mask: list('mask'), account };
}

/** Default file-system seam; tests replace it. */
export const hostFs = {
  canonical: (path) => realpathSync.native(path),
  exists: (path) => existsSync(path),
  isDirectory: (path) => {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  },
  read: (path) => {
    const stat = statSync(path);
    if (!stat.isFile()) refuse(`${path} is not a regular file`);
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid())
      refuse(`${path} is not owned by the Host account`);
    if ((stat.mode & 0o022) !== 0) refuse(`${path} is writable by other accounts`);
    return readFileSync(path, 'utf8');
  },
};

/**
 * Find the allowlist for this execution. The workspace root is DSH's first
 * writable bind; a read-only profile has none, so the nearest allowlisted
 * ancestor of the working directory is used.
 */
export function locateAllowlist(stateDir, writable, cwd, fs = hostFs) {
  const candidates = [];
  if (writable.length > 0) candidates.push(writable[0]);
  else
    for (let directory = fs.canonical(cwd); ; directory = dirname(directory)) {
      candidates.push(directory);
      if (directory === dirname(directory)) break;
    }
  for (const root of candidates) {
    const file = allowlistPath(stateDir, root);
    if (fs.exists(file)) return parseAllowlist(fs.read(file), root);
  }
  return refuse(`no BotHarness allowlist for workspace ${candidates[0]}`);
}

/** Build the complete bwrap argv (without the command) for one execution. */
export function planBwrap({ config, profile, parsed, allowlist, fs = hostFs, resolvConf }) {
  const hidden = config.hide
    .filter((path) => fs.isDirectory(path))
    .sort((a, b) => depth(a) - depth(b))
    .filter((path, index, all) => !all.slice(0, index).some((outer) => covers(outer, path)));
  const guard = [...config.hide, config.stateDir];
  const checked = (path, kind) => {
    let canonical;
    try {
      canonical = fs.canonical(path);
    } catch {
      return undefined;
    }
    if (canonical !== path) refuse(`${kind} ${path} is not canonical (symlink or alias)`);
    if (guard.some((secret) => covers(path, secret)))
      refuse(`${kind} ${path} would expose a hidden root`);
    return path;
  };
  const binds = new Map();
  for (const path of allowlist.read) {
    if (checked(path, 'read root') !== undefined && fs.isDirectory(path))
      binds.set(path, '--ro-bind');
  }
  for (const path of parsed.writable) {
    if (checked(path, 'writable root') === undefined) refuse(`writable root ${path} is missing`);
    binds.set(path, '--bind');
  }
  const args = [config.binaries.bwrap, ...profile];
  if (!parsed.tmp) args.push('--tmpfs', '/tmp');
  for (const path of hidden) args.push('--tmpfs', path);
  for (const [path, flag] of [...binds].sort(([a], [b]) => depth(a) - depth(b))) {
    if (hidden.some((secret) => covers(secret, path))) args.push(flag, path, path);
  }
  for (const path of allowlist.mask) {
    if (fs.isDirectory(path) && [...binds.keys()].some((root) => covers(root, path)))
      args.push('--tmpfs', path);
  }
  args.push('--unshare-ipc');
  if (config.network !== 'host') args.push('--unshare-net');
  if (config.network === 'filtered') {
    args.push('--unshare-user', '--info-fd', '3', '--block-fd', '4');
    if (resolvConf !== undefined) args.push('--ro-bind', resolvConf.source, resolvConf.target);
  }
  return args;
}

function ensureFile(path, content) {
  try {
    if (readFileSync(path, 'utf8') === content) return;
  } catch {
    /* rewrite below */
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content, { mode: 0o600 });
  renameSync(temporary, path);
}

function resolvConfBinding(stateDir) {
  let target;
  try {
    target = realpathSync.native('/etc/resolv.conf');
  } catch {
    return undefined;
  }
  const source = join(stateDir, 'resolv.conf');
  ensureFile(source, `nameserver ${DNS_FORWARD_ADDRESS}\n`);
  return { source, target };
}

export function accountCgroupName(account) {
  return /^[A-Za-z0-9_-]{1,64}$/u.test(account)
    ? `acct-${account}`
    : `acct-${createHash('sha256').update(account).digest('hex').slice(0, 24)}`;
}

/** Move this runner (and so every child) into its account's cgroup with the configured limits. */
function enterAccountCgroup(config, account) {
  if (config.accountLimits === undefined) return;
  let parent = config.cgroupParent;
  if (parent === 'auto') {
    const line = readFileSync('/proc/self/cgroup', 'utf8')
      .split('\n')
      .find((entry) => entry.startsWith('0::'));
    if (line === undefined) refuse('cgroup v2 is required for account limits');
    // The Host runs in a delegated leaf (systemd DelegateSubgroup=host); its
    // parent is the service cgroup the account groups live beside.
    parent = join('/sys/fs/cgroup', dirname(line.slice(3)));
  }
  try {
    const enabled = readFileSync(join(parent, 'cgroup.subtree_control'), 'utf8');
    const wanted = Object.keys(config.accountLimits).map((file) => file.split('.')[0]);
    const missing = wanted.filter((controller) => !enabled.split(/\s+/u).includes(controller));
    if (missing.length > 0)
      writeFileSync(
        join(parent, 'cgroup.subtree_control'),
        missing.map((controller) => `+${controller}`).join(' '),
      );
    const group = join(parent, accountCgroupName(account));
    mkdirSync(group, { recursive: true });
    for (const [file, value] of Object.entries(config.accountLimits))
      writeFileSync(join(group, file), value);
    writeFileSync(join(group, 'cgroup.procs'), String(process.pid));
  } catch (error) {
    refuse(`account cgroup unavailable under ${parent}: ${error.message}`);
  }
}

function readInfo(stream) {
  return new Promise((resolve, reject) => {
    let text = '';
    const done = (error) => {
      stream.off('data', onData);
      stream.off('end', onEnd);
      stream.off('error', onEnd);
      if (error) reject(error);
    };
    const onData = (chunk) => {
      text += chunk;
      const match = /"child-pid"\s*:\s*(\d+)/u.exec(text);
      if (match !== null) {
        done();
        resolve(Number(match[1]));
      }
    };
    const onEnd = (error) => done(error ?? new Error('bwrap exited before reporting its child'));
    stream.setEncoding('utf8');
    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onEnd);
  });
}

function run(binary, args, input) {
  const result = spawnSync(binary, args, {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'ignore', 'pipe'],
    timeout: 10_000,
  });
  if (result.error !== undefined) refuse(`${binary} unavailable: ${result.error.message}`);
  if (result.status !== 0)
    refuse(`${binary} failed (${result.status ?? result.signal}): ${result.stderr.trim()}`);
}

/** Give the blocked sandbox a filtered route to the public internet. */
function connectNetwork(config, pid, pidFile) {
  run(config.binaries.pasta, [
    '--config-net',
    '--quiet',
    '--no-map-gw',
    '--dns-forward',
    DNS_FORWARD_ADDRESS,
    '-t',
    'none',
    '-u',
    'none',
    '-T',
    'none',
    '-U',
    'none',
    '--pid',
    pidFile,
    String(pid),
  ]);
  run(
    config.binaries.nsenter,
    [
      '--target',
      String(pid),
      '--user',
      '--net',
      '--preserve-credentials',
      '--keep-caps',
      config.binaries.nft,
      '-f',
      '-',
    ],
    networkRules(),
  );
}

function stopPasta(pidFile) {
  try {
    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 1) process.kill(pid, 'SIGTERM');
  } catch {
    /* pasta exits with its namespace */
  }
  rmSync(pidFile, { force: true });
}

/** Run one confined command; resolves to the exit status DSH should observe. */
export async function execute(argv, { cwd = process.cwd() } = {}) {
  const { configPath, profile, command } = parseRunnerArgv(argv);
  if (process.platform !== 'linux') refuse('the Team sandbox runner supports Linux only');
  const config = parseConfig(readFileSync(configPath, 'utf8'));
  const parsed = parseDshProfile(profile);
  const allowlist = locateAllowlist(config.stateDir, parsed.writable, cwd);
  const resolvConf = config.network === 'filtered' ? resolvConfBinding(config.stateDir) : undefined;
  const bwrap = planBwrap({ config, profile, parsed, allowlist, resolvConf });
  enterAccountCgroup(config, allowlist.account);
  const filtered = config.network === 'filtered';
  const child = spawn(bwrap[0], [...bwrap.slice(1), '--', ...command], {
    cwd,
    stdio: filtered ? ['inherit', 'inherit', 'inherit', 'pipe', 'pipe'] : 'inherit',
  });
  const exited = new Promise((resolve) => {
    child.on('error', (error) =>
      resolve({ error: `${config.binaries.bwrap} unavailable: ${error.message}` }),
    );
    child.on('exit', (code, signal) => resolve({ code, signal }));
  });
  const forward = (signal) => child.kill(signal);
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, forward);
  const pidFile = join(config.stateDir, 'run', `pasta-${process.pid}.pid`);
  try {
    if (filtered) {
      const pid = await Promise.race([
        readInfo(child.stdio[3]),
        exited.then((status) => refuse(status.error ?? 'bwrap exited before the command started')),
      ]);
      try {
        mkdirSync(dirname(pidFile), { recursive: true, mode: 0o700 });
        connectNetwork(config, pid, pidFile);
      } catch (error) {
        child.kill('SIGKILL');
        throw error;
      }
      child.stdio[4].end('1');
    }
    const status = await exited;
    if (status.error !== undefined) refuse(status.error);
    return status;
  } finally {
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.off(signal, forward);
    if (filtered) stopPasta(pidFile);
  }
}

/**
 * Operator self-check: confines a probe in a scratch workspace and proves the
 * hidden roots are empty and loopback is unreachable. Prints one JSON document.
 */
export async function selfCheck(configPath) {
  const config = parseConfig(readFileSync(configPath, 'utf8'));
  const workspace = mkdtempSync(join(tmpdir(), 'deepseekbot-sandbox-check-'));
  const server = createServer((socket) => socket.end('reachable\n'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const root = realpathSync.native(workspace);
  const allowFile = allowlistPath(config.stateDir, root);
  ensureFile(
    allowFile,
    JSON.stringify({ version: ALLOWLIST_VERSION, root, read: [root], mask: [], account: 'check' }),
  );
  const probes = [
    ...config.hide.map((path) => ({
      name: `hidden ${path}`,
      script: `test -z "$(ls -A ${JSON.stringify(path)} 2>/dev/null)"`,
    })),
    {
      name: `loopback 127.0.0.1:${port} unreachable`,
      script: `! (exec 3<>/dev/tcp/127.0.0.1/${port}) 2>/dev/null`,
    },
  ];
  const results = [];
  const runnerPath = fileURLToPath(import.meta.url);
  for (const probe of probes) {
    const outcome = await new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [
          runnerPath,
          '--config',
          configPath,
          '--dsh-profile',
          '--ro-bind',
          '/',
          '/',
          '--dev',
          '/dev',
          '--unshare-pid',
          '--proc',
          '/proc',
          '--die-with-parent',
          '--tmpfs',
          '/tmp',
          '--bind',
          root,
          root,
          '--',
          'bash',
          '-c',
          probe.script,
        ],
        { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] },
      );
      let stderr = '';
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.on('exit', (code) => resolve({ code, stderr: stderr.trim() }));
    });
    results.push({ name: probe.name, ok: outcome.code === 0, detail: outcome.stderr || undefined });
  }
  server.close();
  rmSync(allowFile, { force: true });
  rmSync(workspace, { recursive: true, force: true });
  return { ok: results.every((result) => result.ok), network: config.network, checks: results };
}

async function main(argv) {
  if (argv[0] === 'check') {
    const index = argv.indexOf('--config');
    const report = await selfCheck(argv[index + 1] ?? refuse('missing --config'));
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return report.ok ? 0 : 1;
  }
  const status = await execute(argv);
  if (status.signal) {
    process.kill(process.pid, status.signal);
    return 128;
  }
  return status.code ?? FAILURE_EXIT;
}

if (
  process.argv[1] !== undefined &&
  realpathSync.native(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(
        `${FAILURE_PREFIX}${error instanceof RunnerRefusal ? error.message : String(error?.stack ?? error)}\n`,
      );
      process.exit(FAILURE_EXIT);
    },
  );
}
