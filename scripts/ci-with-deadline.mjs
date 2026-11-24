import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { constants } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

function attemptProcesses(scope, group) {
  return readdirSync('/proc').filter((pid) => {
    if (!/^\d+$/.test(pid)) return false;
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const [state, , processGroup] = stat.slice(stat.lastIndexOf(') ') + 2).split(' ');
      if (state === 'Z') return false;
      if (group !== undefined && Number(processGroup) === group) return true;
      const environment = readFileSync(`/proc/${pid}/environ`, 'utf8');
      return environment.split('\0').includes(`${scope}=1`);
    } catch {
      return false;
    }
  });
}

function reportProcesses(pids) {
  if (pids.length === 0) return;
  try {
    const tree = execFileSync(
      'ps',
      [
        '--forest',
        '-p',
        pids.join(','),
        '-o',
        'pid,ppid,pgid,stat,etime,pcpu,pmem,nlwp,wchan:24,comm',
      ],
      { encoding: 'utf8', timeout: 2000, shell: false, windowsHide: true },
    );
    process.stderr.write(tree);
  } catch {
    process.stderr.write('Process tree unavailable\n');
  }
  for (const pid of pids) {
    try {
      const handles = readdirSync(`/proc/${pid}/fd`).length;
      process.stderr.write(`PID ${pid}: ${handles} open file descriptors\n`);
    } catch {
      continue;
    }
  }
}

function signalProcess(pid, signal) {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function runAttempt(command, args, seconds, attempt, attempts) {
  process.stderr.write(`CI attempt ${attempt}/${attempts}: ${seconds}s deadline\n`);
  const scope = `BOTHARNESS_CI_ATTEMPT_${randomUUID().replaceAll('-', '')}`;
  const child = spawn(command, args, {
    detached: true,
    env: { ...process.env, [scope]: '1' },
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  });
  const finished = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      resolve({ code: code ?? 128 + constants.signals[signal] }),
    );
  });
  const terminate = (signal, pids = attemptProcesses(scope, child.pid)) => {
    if (child.pid) signalProcess(-child.pid, signal);
    for (const pid of pids) signalProcess(Number(pid), signal);
  };
  const cancel = (signal) => {
    terminate('SIGKILL');
    process.exit(128 + constants.signals[signal]);
  };
  const deadline = new AbortController();
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try {
    const result = await Promise.race([
      finished,
      delay(seconds * 1000, null, { signal: deadline.signal }),
    ]);
    if (result) return result;

    process.stderr.write(`CI timeout: attempt ${attempt}/${attempts} exceeded ${seconds}s\n`);
    const pids = attemptProcesses(scope, child.pid);
    reportProcesses(pids);
    terminate('SIGTERM', pids);
    await delay(1000);
    terminate('SIGKILL');
    child.unref();
    for (let wait = 0; wait < 100 && attemptProcesses(scope, child.pid).length > 0; wait += 1)
      await delay(100);
    const survivors = attemptProcesses(scope, child.pid);
    if (survivors.length > 0) {
      process.stderr.write(
        `CI timeout: ${survivors.length} processes survived SIGKILL; not retrying\n`,
      );
      reportProcesses(survivors);
      return { code: 124 };
    }
    return { code: 124, timedOut: true };
  } finally {
    deadline.abort();
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
  }
}

const [secondsArg, attemptsArg, command, ...args] = process.argv.slice(2);
const seconds = Number(secondsArg);
const attempts = Number(attemptsArg);
if (!Number.isInteger(seconds) || seconds < 1 || ![1, 2].includes(attempts) || !command) {
  throw new Error('Usage: node scripts/ci-with-deadline.mjs <seconds> <1|2> <command> [args...]');
}
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const result = await runAttempt(command, args, seconds, attempt, attempts);
  process.exitCode = result.code;
  if (!result.timedOut || attempt === attempts) break;
  process.stderr.write('CI retry: starting one more attempt after timeout\n');
}
