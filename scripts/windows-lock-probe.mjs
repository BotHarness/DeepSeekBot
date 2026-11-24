import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { release } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const accountTypes = new Set(['local', 'microsoft', 'unknown']);
const stepFlags = new Set(['--observe-lock', '--read-policy']);
const outputDir = fileURLToPath(new URL('../output/windows-lock-probe/', import.meta.url));
const reportPath = join(outputDir, 'report.json');
const binaryPath = join(outputDir, 'build', 'release', 'windows-lock-probe.exe');
const usage =
  'Usage: node scripts/windows-lock-probe.mjs run [--observe-lock] [--read-policy] ' +
  '[--account-type local|microsoft|unknown] | collect | clean';

export function parseCommand(args) {
  const [command, ...flags] = args;
  if ((command === 'collect' || command === 'clean') && flags.length === 0) return { command };
  if (command !== 'run') throw new Error(usage);

  const steps = new Set();
  let accountType;
  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index];
    if (flag === '--account-type' && accountType === undefined) {
      accountType = flags[++index];
      if (!accountTypes.has(accountType)) throw new Error(usage);
    } else if (stepFlags.has(flag) && !steps.has(flag)) {
      steps.add(flag);
    } else {
      throw new Error(usage);
    }
  }
  if (steps.size === 0) steps.add('--observe-lock');
  return { command, steps: [...steps], accountType: accountType ?? 'unknown' };
}

function pickObservation(result) {
  if (result === null) return null;
  const { status, before, sawLock, after } = result;
  const started = before === 'unlocked' && typeof sawLock === 'boolean';
  let valid = false;
  switch (status) {
    case 'observed':
      valid = started && sawLock === true && after === 'unlocked';
      break;
    case 'timed-out':
      valid = started && after === null;
      break;
    case 'initially-locked':
      valid = before === 'locked' && sawLock === false && after === null;
      break;
    case 'console-changed':
    case 'session-changed':
    case 'session-unavailable':
      valid = after === null && (started || (before === null && sawLock === false));
      break;
  }
  if (!valid) throw new Error('Invalid lock observation');
  return { status, before, sawLock, after };
}

function isDword(value) {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function pickPolicyValue({ status, value, code }) {
  if (status === 'read' && isDword(value)) return { status, value };
  if (status === 'missing') return { status };
  if (status === 'unavailable' && isDword(code) && code > 0) return { status, code };
  throw new Error('Invalid policy reading');
}

export function redactReport({ windowsVersion, accountType, steps }) {
  if (
    typeof windowsVersion !== 'string' ||
    !/^\d{1,3}\.\d{1,3}\.\d{1,7}$/.test(windowsVersion) ||
    !accountTypes.has(accountType)
  ) {
    throw new Error('Invalid Windows version or account type');
  }
  const { lockObservation, policy } = steps;
  if (lockObservation === null && policy === null) throw new Error('Missing probe results');
  return {
    windowsVersion,
    accountType,
    steps: {
      lockObservation: pickObservation(lockObservation),
      policy:
        policy === null
          ? null
          : {
              disableCad: pickPolicyValue(policy.disableCad),
              softwareSasGeneration: pickPolicyValue(policy.softwareSasGeneration),
            },
    },
  };
}

function readNativeSteps(steps) {
  return new Promise((resolveSteps, reject) => {
    const child = execFile(
      binaryPath,
      steps,
      { shell: false, windowsHide: true, timeout: 125_000, maxBuffer: 4096 },
      (error, stdout) => {
        if (error) {
          reject(new Error('The native observer did not return a report'));
          return;
        }
        try {
          resolveSteps(JSON.parse(stdout));
        } catch {
          reject(new Error('The native observer returned an invalid report'));
        }
      },
    );
    child.stdin?.end();
    const lines = createInterface({ input: child.stderr });
    lines.once('line', (line) => {
      if (line === 'ready' && steps.includes('--observe-lock')) {
        process.stderr.write(
          'Ready. Press Win+L, wait five seconds, then sign back in manually.\n',
        );
      }
    });
  });
}

async function main(args) {
  let options;
  try {
    options = parseCommand(args);
  } catch {
    process.stderr.write(`${usage}\n`);
    return 1;
  }

  try {
    if (options.command === 'clean') {
      await rm(reportPath, { force: true });
    } else if (options.command === 'collect') {
      const report = redactReport(JSON.parse(await readFile(reportPath, 'utf8')));
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      const windowsVersion = release();
      if (process.platform !== 'win32' || Number(windowsVersion.split('.')[2]) < 22000) {
        process.stderr.write('Run the observer on the Windows 11 console.\n');
        return 1;
      }
      if (!existsSync(binaryPath)) {
        process.stderr.write(
          'Build the native observer first. See the runbook for the build command.\n',
        );
        return 1;
      }
      if (existsSync(reportPath)) {
        process.stderr.write(
          'A report already exists. Run collect and clean before another run.\n',
        );
        return 1;
      }
      const steps = await readNativeSteps(options.steps);
      const report = redactReport({ windowsVersion, accountType: options.accountType, steps });
      await mkdir(outputDir, { recursive: true });
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
      process.stderr.write('Report saved. Run collect to read it.\n');
    }
  } catch {
    process.stderr.write(
      `Probe ${options.command} failed. See the runbook for build and report paths.\n`,
    );
    return 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
