#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { delimiter } from 'node:path';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { pnpmCommand } from './dev-package-manager.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

const actions = new Set([
  'init',
  'status',
  'claim',
  'release',
  'devices',
  'emulator',
  'build',
  'install',
  'metro',
  'open',
  'screenshot',
  'record',
  'mirror',
]);
const lanes = new Set(['emulator', 'phone']);
const namePattern = /^[a-z0-9][a-z0-9-]*$/;
const abis = new Set(['x86_64', 'arm64-v8a', 'armeabi-v7a', 'x86']);

function parseArgv(argv) {
  const options = {
    action: 'status',
    owner: '',
    batch: '',
    lane: 'emulator',
    serial: '',
    label: 'capture',
    viewOnly: false,
    metroPort: 8085,
    seconds: 30,
    queueRoot: '',
  };
  const names = new Map([
    ['owner', 'owner'],
    ['batch', 'batch'],
    ['lane', 'lane'],
    ['serial', 'serial'],
    ['label', 'label'],
    ['viewonly', 'viewOnly'],
    ['metroport', 'metroPort'],
    ['seconds', 'seconds'],
    ['queueroot', 'queueRoot'],
  ]);
  let actionSet = false;
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    const flag = /^(-{1,2})([^=]+)(=(.*))?$/.exec(token);
    if (flag && names.has(flag[2].toLowerCase())) {
      const key = names.get(flag[2].toLowerCase());
      if (key === 'viewOnly') {
        options.viewOnly = flag[4] === undefined ? true : !/^(0|false|no|off)$/i.test(flag[4]);
        continue;
      }
      let value = flag[4];
      if (value === undefined) {
        index += 1;
        if (index >= argv.length) throw new Error(`Missing value for ${token}.`);
        value = argv[index];
      }
      if (key === 'metroPort' || key === 'seconds') {
        const number = Number(value);
        if (!Number.isInteger(number)) throw new Error(`${token} must be an integer.`);
        options[key] = number;
      } else {
        options[key] = value;
      }
      continue;
    }
    if (!token.startsWith('-') && !actionSet) {
      options.action = token;
      actionSet = true;
      continue;
    }
    throw new Error(`Unknown argument ${token}.`);
  }
  return options;
}

function validateOptions(options) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Use Node 22 or newer.');
  if (!actions.has(options.action))
    throw new Error(
      `Unknown action ${options.action}. Use init, status, claim, release, devices, emulator, build, install, metro, open, screenshot, record or mirror.`,
    );
  if (!lanes.has(options.lane)) throw new Error('Use -Lane emulator or -Lane phone.');
  if (options.metroPort < 1024 || options.metroPort > 65535)
    throw new Error('Use -MetroPort between 1024 and 65535.');
  if (options.seconds < 1 || options.seconds > 180)
    throw new Error('Use -Seconds between 1 and 180.');
}

function run(exe, args, env = process.env) {
  const result = spawnSync(exe, args, {
    env,
    stdio: 'inherit',
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${exe} exited ${result.status}`);
}

function capture(exe, args, env = process.env) {
  const result = spawnSync(exe, args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${exe} exited ${result.status}`);
  return result.stdout;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJsonAtomic(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  renameSync(temporary, path);
}

function appendEvent(queueRoot, event) {
  appendFileSync(
    join(queueRoot, 'events.jsonl'),
    JSON.stringify({ time: new Date().toISOString(), ...event }) + '\n',
  );
}

function resolveQueueRoot(explicit) {
  if (explicit) return resolve(explicit);
  let common;
  try {
    common = capture('git', [
      '-C',
      repoRoot,
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ]).trim();
  } catch {
    throw new Error('Not a Git worktree');
  }
  return resolve(dirname(common), '.humanlayer', 'device-qa', 'windows');
}

function findOnPath(names) {
  const entries = (process.env.PATH ?? process.env.Path ?? '').split(delimiter);
  for (const entry of entries) {
    const directory = entry.replace(/^"|"$/g, '');
    if (!directory) continue;
    for (const name of names) {
      const candidate = join(directory, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return names[0];
}

function compareVersion(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index++) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function utcStamp() {
  const date = new Date();
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}${pad(date.getUTCMilliseconds(), 3)}Z`
  );
}

function queueTemplate() {
  return `# Windows Android QA queue

Owner: unassigned (the requesting Human/session assigns the owner).
Only the owner freezes batches and designates a runner. Read android-device-qa.md.

## Next batch

<!-- Copy per request: PR/issue, branch + head SHA, agent task, report destination,
native inputs changed?, emulator/phone, feature-map steps, visible/canonical proof,
light/dark screenshots, video, model/second Host/FCM/Human prerequisites. -->

## Active batch

None. Owner records batch branch + SHA, runner, lane, serial and ports before claim.

## Results

<!-- Batch + PR head + tested commit; each step pass/fail/untested with evidence;
native fingerprint/ABI, Host+Metro ownership, limitations and cleanup. -->
`;
}

function waitExit(child) {
  return new Promise((resolvePromise, rejectPromise) => {
    if (child.exitCode !== null) {
      resolvePromise(child.exitCode);
      return;
    }
    child.once('error', rejectPromise);
    child.once('close', resolvePromise);
  });
}

function actionInit(queueRoot) {
  mkdirSync(queueRoot, { recursive: true });
  const configPath = join(queueRoot, 'config.json');
  if (!existsSync(configPath)) {
    const localAppData = process.env.LOCALAPPDATA ?? '';
    const sdk =
      process.env.ANDROID_HOME ||
      process.env.ANDROID_SDK_ROOT ||
      (localAppData ? join(localAppData, 'Android', 'Sdk') : '');
    const scrcpy =
      process.platform === 'win32' ? findOnPath(['scrcpy.exe']) : findOnPath(['scrcpy']);
    writeJsonAtomic(configPath, {
      sdk,
      gradleHome: process.env.GRADLE_USER_HOME ?? null,
      javaHome: process.env.JAVA_HOME ?? null,
      scrcpy,
      avd: 'BotHarness_AX_Android',
      emulatorPort: 5580,
      nativeRoot: '',
      cmakeVersion: '3.22.1',
    });
  }
  const queuePath = join(queueRoot, 'queue.md');
  if (!existsSync(queuePath)) writeFileSync(queuePath, queueTemplate());
  console.log(JSON.stringify({ queue: queuePath, config: configPath }, null, 2));
}

function actionStatus(queueRoot) {
  const leasePath = join(queueRoot, 'active.json');
  console.log(
    JSON.stringify(
      {
        queue: join(queueRoot, 'queue.md'),
        config: join(queueRoot, 'config.json'),
        active: existsSync(leasePath) ? readJson(leasePath) : null,
      },
      null,
      2,
    ),
  );
}

function actionClaim(queueRoot, options) {
  if (!options.owner || !namePattern.test(options.batch) || !options.serial)
    throw new Error(
      'claim needs -Owner <task-id> -Batch <safe-name> -Serial <adb-serial> -Lane emulator|phone',
    );
  const leasePath = join(queueRoot, 'active.json');
  const lease = {
    owner: options.owner,
    batch: options.batch,
    lane: options.lane,
    serial: options.serial,
    worktree: repoRoot,
    metroPort: options.metroPort,
    started: new Date().toISOString(),
  };
  let fd;
  try {
    fd = openSync(leasePath, 'wx');
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('The active lease is already claimed.');
    throw error;
  }
  try {
    writeSync(fd, JSON.stringify(lease));
  } finally {
    closeSync(fd);
  }
  appendEvent(queueRoot, { phase: 'claimed', owner: options.owner, batch: options.batch });
  console.log(JSON.stringify(lease, null, 2));
}

function loadLease(queueRoot, options) {
  const leasePath = join(queueRoot, 'active.json');
  if (!existsSync(leasePath))
    throw new Error('No batch lease. The queue owner must designate a runner before claim.');
  const lease = readJson(leasePath);
  if (options.owner !== lease.owner || options.batch !== lease.batch || repoRoot !== lease.worktree)
    throw new Error('Owner, batch and worktree must match the active lease.');
  if (options.serial && options.serial !== lease.serial)
    throw new Error('Serial differs from the active lease.');
  return lease;
}

function platformEnv(config) {
  const env = {
    ...process.env,
    ANDROID_HOME: config.sdk,
    ANDROID_SDK_ROOT: config.sdk,
  };
  if (config.gradleHome) env.GRADLE_USER_HOME = config.gradleHome;
  if (config.javaHome) {
    env.JAVA_HOME = config.javaHome;
    env.PATH = `${config.javaHome}/bin${delimiter}${env.PATH ?? env.Path ?? ''}`;
  }
  return env;
}

function resolveAdb(config) {
  const binary = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const adb = join(config.sdk, 'platform-tools', binary);
  if (!existsSync(adb)) throw new Error(`Configured SDK has no platform-tools/${binary}`);
  return adb;
}

function actionEmulator(queueRoot, options, config, env, adb) {
  if (options.lane !== 'emulator' || options.serial !== `emulator-${config.emulatorPort}`)
    throw new Error('Lease must target the configured emulator port.');
  const connected = capture(adb, ['devices'], env);
  if (new RegExp(`^${escapeRegExp(options.serial)}\\s`, 'm').test(connected))
    throw new Error('Emulator already present; inspect it instead of starting another.');
  const binary = process.platform === 'win32' ? 'emulator.exe' : 'emulator';
  const child = spawn(
    join(config.sdk, 'emulator', binary),
    ['-avd', config.avd, '-port', String(config.emulatorPort), '-no-snapshot-save'],
    { env, cwd: config.sdk, detached: true, stdio: 'ignore', windowsHide: true },
  );
  child.unref();
  if (child.exitCode !== null && child.exitCode !== 0)
    throw new Error(`Emulator failed to start with exit ${child.exitCode}`);
  appendEvent(queueRoot, {
    phase: 'emulator-started',
    owner: options.owner,
    batch: options.batch,
  });
}

function actionMetro(options, env) {
  const metroEnv = {
    ...env,
    REACT_NATIVE_PACKAGER_HOSTNAME: '127.0.0.1',
    NODE_OPTIONS: `${env.NODE_OPTIONS ?? ''} --dns-result-order=ipv4first`.trim(),
    CI: '1',
  };
  const [exe, args] = pnpmCommand([
    '--dir',
    join(repoRoot, 'apps', 'mobile'),
    'start',
    '--localhost',
    '--port',
    String(options.metroPort),
  ]);
  run(exe, args, metroEnv);
}

function actionBuild(queueRoot, options, config, env, adb, serial) {
  if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
  if (repoRoot.length > 30)
    throw new Error(
      'Use a short physical batch worktree path (at most 30 characters, e.g. D:/bhqa/1). AGP launches prefab_command.bat inside pnpm dependencies; short CMake staging and modern Ninja alone cannot fix that Windows path limit.',
    );
  if (!config.javaHome || !config.nativeRoot)
    throw new Error('Set javaHome (JDK 17) and a short nativeRoot in config.json before building.');
  const abi = capture(adb, ['-s', serial, 'shell', 'getprop', 'ro.product.cpu.abi'], env).trim();
  if (!abis.has(abi)) throw new Error('Unsupported device ABI');
  const ninja =
    process.platform === 'win32'
      ? join(config.sdk, 'cmake', config.cmakeVersion, 'bin', 'ninja.exe')
      : join(config.sdk, 'cmake', config.cmakeVersion, 'bin', 'ninja');
  const ninjaVersion = capture(ninja, ['--version'], env).trim();
  if (compareVersion(ninjaVersion, '1.12.0') < 0)
    throw new Error('Windows long paths require Ninja 1.12+; see runbook.');
  const mobileDir = join(repoRoot, 'apps', 'mobile');
  const [prebuildExe, prebuildArgs] = pnpmCommand([
    '--dir',
    mobileDir,
    'exec',
    'expo',
    'prebuild',
    '--platform',
    'android',
    '--no-install',
  ]);
  run(prebuildExe, prebuildArgs, env);
  const hash = createHash('sha256')
    .update(repoRoot, 'utf8')
    .digest('hex')
    .toUpperCase()
    .slice(0, 8);
  const staging = join(config.nativeRoot, hash).replace(/\\/g, '/').replace(/'/g, "\\'");
  const evidence = join(queueRoot, 'evidence', options.batch, options.lane);
  const initScript = join(evidence, 'short-paths.gradle');
  writeFileSync(
    initScript,
    `allprojects { p ->
  ['com.android.application', 'com.android.library'].each { id ->
    p.plugins.withId(id) {
      p.android.externalNativeBuild.cmake.buildStagingDirectory = p.file('${staging}/' + p.name)
    }
  }
}
`,
  );
  appendEvent(queueRoot, {
    phase: 'build-started',
    owner: options.owner,
    batch: options.batch,
  });
  const androidDir = join(mobileDir, 'android');
  const gradle =
    process.platform === 'win32' ? join(androidDir, 'gradlew.bat') : join(androidDir, 'gradlew');
  const gradleResult = spawnSync(
    gradle,
    [
      '-p',
      androidDir,
      'app:assembleDebug',
      `-PreactNativeArchitectures=${abi}`,
      `-PreactNativeDevServerPort=${options.metroPort}`,
      '--init-script',
      initScript,
      '--max-workers',
      '4',
      '--build-cache',
      '--console=plain',
    ],
    {
      env,
      stdio: 'inherit',
      encoding: 'utf8',
      windowsHide: true,
      shell: process.platform === 'win32',
    },
  );
  if (gradleResult.error) throw gradleResult.error;
  if (gradleResult.status !== 0) throw new Error(`${gradle} exited ${gradleResult.status}`);
  writeJsonAtomic(join(evidence, 'build.json'), {
    commit: capture('git', ['-C', repoRoot, 'rev-parse', 'HEAD']).trim(),
    abi,
    time: new Date().toISOString(),
  });
  appendEvent(queueRoot, {
    phase: 'build-completed',
    owner: options.owner,
    batch: options.batch,
  });
}

function actionInstall(env, adb, serial) {
  run(
    adb,
    [
      '-s',
      serial,
      'install',
      '-r',
      join(
        repoRoot,
        'apps',
        'mobile',
        'android',
        'app',
        'build',
        'outputs',
        'apk',
        'debug',
        'app-debug.apk',
      ),
    ],
    env,
  );
}

function actionOpen(options, env, adb, serial) {
  run(adb, ['-s', serial, 'reverse', `tcp:${options.metroPort}`, `tcp:${options.metroPort}`], env);
  const url = `exp+deepseekbot://expo-development-client/?url=${encodeURIComponent(`http://127.0.0.1:${options.metroPort}`)}`;
  run(adb, ['-s', serial, 'shell', 'am', 'force-stop', 'ai.botharness.deepseekbot.dev'], env);
  run(
    adb,
    [
      '-s',
      serial,
      'shell',
      'am',
      'start',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      url,
      'ai.botharness.deepseekbot.dev',
    ],
    env,
  );
}

async function actionScreenshot(queueRoot, options, env, adb, serial, prefix) {
  const child = spawn(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  await pipeline(child.stdout, createWriteStream(`${prefix}.png`));
  if ((await waitExit(child)) !== 0) throw new Error('Screenshot failed');
  run(adb, ['-s', serial, 'shell', 'uiautomator', 'dump', '/sdcard/botharness-qa.xml'], env);
  run(adb, ['-s', serial, 'pull', '/sdcard/botharness-qa.xml', `${prefix}.ui.xml`], env);
  run(adb, ['-s', serial, 'shell', 'rm', '/sdcard/botharness-qa.xml'], env);
}

function actionRecordOrMirror(options, config, env, serial, prefix) {
  const version = capture(config.scrcpy, ['--version'], env);
  const match = /scrcpy (\d+\.\d+(?:\.\d+)?)/.exec(version);
  if (!match || compareVersion(match[1], '5.0') < 0)
    throw new Error('Configure official scrcpy 5.0+ in config.json.');
  const args = ['--serial', serial, '--no-audio', '--video-codec=h264', '--max-fps=60'];
  if (options.viewOnly) args.push('--no-control');
  if (options.action === 'record')
    args.push(`--record=${prefix}.mp4`, `--time-limit=${options.seconds}`);
  run(config.scrcpy, args, env);
}

async function actionCapture(queueRoot, options, config, env, adb, serial) {
  let focus = '';
  try {
    focus = capture(adb, ['-s', serial, 'shell', 'dumpsys', 'window'], env);
  } catch {
    focus = '';
  }
  if (!/mCurrentFocus=.*ai\.botharness\.deepseekbot\.dev\//i.test(focus))
    throw new Error(
      'QA_APP_NOT_FOREGROUND: open DeepSeekBot and finish any Human/system prompts before capture.',
    );
  if (!namePattern.test(options.label))
    throw new Error('Use a lowercase filename label with letters, digits and hyphens.');
  const prefix = join(
    queueRoot,
    'evidence',
    options.batch,
    options.lane,
    `${options.label}-${utcStamp()}`,
  );
  if (options.action === 'screenshot')
    await actionScreenshot(queueRoot, options, env, adb, serial, prefix);
  else actionRecordOrMirror(options, config, env, serial, prefix);
  writeJsonAtomic(`${prefix}.json`, {
    commit: capture('git', ['-C', repoRoot, 'rev-parse', 'HEAD']).trim(),
    batch: options.batch,
    lane: options.lane,
    serial,
    action: options.action,
    time: new Date().toISOString(),
  });
  appendEvent(queueRoot, {
    phase: `${options.action}-completed`,
    owner: options.owner,
    batch: options.batch,
  });
  console.log(prefix);
}

async function runAction(queueRoot, options) {
  if (options.action === 'init') {
    actionInit(queueRoot);
    return;
  }
  if (options.action === 'status') {
    actionStatus(queueRoot);
    return;
  }
  if (options.action === 'claim') {
    actionClaim(queueRoot, options);
    return;
  }
  const configPath = join(queueRoot, 'config.json');
  if (!existsSync(configPath))
    throw new Error('Run init, then fill in the machine-local config.json.');
  const config = readJson(configPath);
  if (options.action !== 'devices') {
    const lease = loadLease(queueRoot, options);
    if (options.action === 'release') {
      rmSync(join(queueRoot, 'active.json'));
      appendEvent(queueRoot, {
        phase: 'released',
        owner: options.owner,
        batch: options.batch,
      });
      return;
    }
    const serial = lease.serial;
    const env = platformEnv(config);
    const adb = resolveAdb(config);
    process.env.ADB = adb;
    if (options.action === 'emulator') {
      actionEmulator(queueRoot, { ...options, lane: lease.lane, serial }, config, env, adb);
      return;
    }
    mkdirSync(join(queueRoot, 'evidence', lease.batch, lease.lane), { recursive: true });
    const scoped = { ...options, lane: lease.lane, metroPort: lease.metroPort };
    if (options.action === 'metro') {
      actionMetro(scoped, env);
      return;
    }
    let state = '';
    try {
      state = capture(adb, ['-s', serial, 'get-state'], env).trim();
    } catch {
      state = '';
    }
    if (state !== 'device')
      throw new Error(
        'Selected device is missing/offline/unauthorized. Connect USB and accept its debugging prompt.',
      );
    let qemu = '';
    try {
      qemu = capture(adb, ['-s', serial, 'shell', 'getprop', 'ro.kernel.qemu'], env).trim();
    } catch {
      throw new Error('Cannot inspect device type');
    }
    if ((lease.lane === 'emulator') !== (qemu === '1'))
      throw new Error('Device type does not match the claimed lane.');
    if (options.action === 'build') {
      actionBuild(queueRoot, scoped, config, env, adb, serial);
      return;
    }
    if (options.action === 'install') {
      actionInstall(env, adb, serial);
      return;
    }
    if (options.action === 'open') {
      actionOpen(scoped, env, adb, serial);
      return;
    }
    await actionCapture(queueRoot, scoped, config, env, adb, serial);
    return;
  }
  const env = platformEnv(config);
  const adb = resolveAdb(config);
  process.env.ADB = adb;
  run(adb, ['devices', '-l'], env);
}

const context = {};
try {
  const options = parseArgv(process.argv.slice(2));
  validateOptions(options);
  context.options = options;
  context.queueRoot = resolveQueueRoot(options.queueRoot);
  await runAction(context.queueRoot, options);
} catch (error) {
  try {
    if (context.queueRoot && context.options && existsSync(context.queueRoot)) {
      appendEvent(context.queueRoot, {
        phase: 'failed',
        action: context.options.action,
        owner: context.options.owner,
        batch: context.options.batch,
        code: 'ANDROID_QA_FAILED',
      });
    }
  } catch (eventError) {
    console.error(`Failed to record failure event: ${eventError?.message ?? eventError}`);
  }
  console.error(error?.message ?? String(error));
  process.exitCode = 1;
}
