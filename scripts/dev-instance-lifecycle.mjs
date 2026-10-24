import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('Invalid development Home owner');
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

function existingHost(home) {
  const windows = process.platform === 'win32';
  const result = windows
    ? spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress',
        ],
        { encoding: 'utf8' },
      )
    : spawnSync('ps', ['axeww', '-o', 'pid=,command='], { encoding: 'utf8' });
  if (result.error || result.status !== 0)
    throw new Error('Cannot verify development Home process ownership');
  const entries = windows
    ? []
        .concat(JSON.parse(result.stdout))
        .map((entry) => [entry.ProcessId, entry.CommandLine ?? ''])
    : result.stdout.split('\n').map((line) => {
        const match = /^\s*(\d+)\s+(.*)$/u.exec(line);
        return match ? [Number(match[1]), match[2]] : [0, ''];
      });
  return matchesHomeProcess(entries, home, windows);
}

export function matchesHomeProcess(entries, home, windows = false) {
  return entries.some(
    ([pid, command]) =>
      pid !== process.pid &&
      /[\\/]dsh[\\/]lib[\\/]bin\.js/u.test(command) &&
      (windows ||
        command.includes(join(home, 'ax-cli')) ||
        command.includes(join(home, 'packaged-cli')) ||
        command.includes(`DSH_HOME=${home} `) ||
        command.endsWith(`DSH_HOME=${home}`)),
  );
}

export function acquireHome(home) {
  mkdirSync(home, { recursive: true });
  const gate = join(home, '.botharness-launch-lock');
  const owner = join(home, '.botharness-host.json');
  try {
    mkdirSync(gate);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const recovery = join(home, '.botharness-launch-recovery');
    try {
      mkdirSync(recovery);
    } catch {
      throw new Error('Development Home launch is already in progress');
    }
    try {
      const lockOwner = join(gate, 'owner.json');
      if (!existsSync(lockOwner) || alive(JSON.parse(readFileSync(lockOwner, 'utf8')).pid))
        throw new Error(
          'Development Home launch is already in progress; preserve its lock until its owner has exited',
        );
      rmSync(gate, { recursive: true });
      mkdirSync(gate);
    } finally {
      rmSync(recovery, { recursive: true });
    }
  }
  try {
    writeFileSync(join(gate, 'owner.json'), JSON.stringify({ pid: process.pid }), { mode: 0o600 });
    const recorded = existsSync(owner) ? JSON.parse(readFileSync(owner, 'utf8')) : undefined;
    if (recorded?.cleanupIncomplete)
      throw new Error(
        'Development Home cleanup is unresolved; verify retained processes and ownership before recovery',
      );
    if (recorded && [recorded.pid, ...(recorded.children ?? [])].some(alive))
      throw new Error(
        'Development Home is in use; stop its Host before changing versions or profiles',
      );
    if (existingHost(home))
      throw new Error(
        'Development Home has an unrecorded Host; stop it before changing versions or profiles',
      );
    writeFileSync(owner, JSON.stringify({ pid: process.pid }), { mode: 0o600 });
  } catch (error) {
    rmSync(gate, { recursive: true });
    throw error;
  }
  let host;
  return {
    started(child, log) {
      host = child;
      writeFileSync(owner, JSON.stringify({ pid: child.pid, log }), { mode: 0o600 });
    },
    release() {
      if (
        !host ||
        ((host.exitCode !== null || host.signalCode !== null) &&
          !host.cleanupIncomplete &&
          !(host.cleanupPids ?? []).some(alive))
      )
        rmSync(owner, { force: true });
      else if (host.cleanupIncomplete || host.cleanupPids?.length)
        writeFileSync(
          owner,
          JSON.stringify({
            pid: host.pid,
            children: host.cleanupPids,
            cleanupIncomplete: host.cleanupIncomplete,
          }),
          {
            mode: 0o600,
          },
        );
      rmSync(gate, { recursive: true });
    },
  };
}

function descendants(pid, ownedProcessGroup) {
  const windows = process.platform === 'win32';
  const result = windows
    ? spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress',
        ],
        { encoding: 'utf8' },
      )
    : spawnSync('ps', ['-eo', 'pid=,ppid=,pgid='], { encoding: 'utf8' });
  if (result.error || result.status !== 0)
    throw new Error('Cannot verify Host child processes; preserve its Home and log');
  const entries = windows
    ? [].concat(JSON.parse(result.stdout)).map((entry) => [entry.ProcessId, entry.ParentProcessId])
    : result.stdout
        .trim()
        .split('\n')
        .map((line) => line.trim().split(/\s+/u).map(Number));
  const owned = new Set([pid]);
  let size;
  do {
    size = owned.size;
    for (const [child, parent, group] of entries)
      if (owned.has(parent) || (ownedProcessGroup && group === pid)) owned.add(child);
  } while (size !== owned.size);
  owned.delete(pid);
  return [...owned].reverse();
}

export async function verifyStartedHost(child, verify, timeoutMs = 15_000) {
  let spawnError;
  child.on('error', (error) => {
    spawnError = error;
  });
  const stopped = () =>
    (!child.pid && spawnError) || child.exitCode !== null || child.signalCode !== null;
  try {
    return await verify(() => {
      if (stopped()) throw new Error('DSH exited before startup verification completed');
    });
  } catch (error) {
    child.cleanupIncomplete = true;
    if (child.pid) {
      child.cleanupPids = descendants(child.pid, child.ownedProcessGroup === true);
      for (const pid of child.cleanupPids) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch (stopError) {
          if (stopError.code !== 'ESRCH') throw stopError;
        }
      }
      const childDeadline = Date.now() + timeoutMs / 2;
      while (child.cleanupPids.some(alive) && Date.now() < childDeadline)
        await new Promise((done) => setTimeout(done, 25));
      if (!stopped()) child.kill('SIGTERM');
    }
    const released = () => stopped() && !(child.cleanupPids ?? []).some(alive);
    const deadline = Date.now() + timeoutMs;
    while (!released() && Date.now() < deadline) await new Promise((done) => setTimeout(done, 25));
    if (!released())
      throw new Error(
        `${error.message}; Host ${child.pid} cleanup incomplete; preserve its Home and log`,
      );
    child.cleanupIncomplete = false;
    throw error;
  }
}
