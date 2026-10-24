import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

export function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('Invalid development Home owner');
  try {
    process.kill(pid, 0);
    if (process.platform === 'linux') {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      if (stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z')) return false;
    }
    return true;
  } catch (error) {
    if (error.code === 'ESRCH' || error.code === 'ENOENT') return false;
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
  return entries.some(([pid, command]) => {
    if (pid === process.pid || !/[\\/]dsh[\\/]lib[\\/]bin\.js/iu.test(command)) return false;
    if (windows) {
      const cli =
        /(?:"([^"\n]+[\\/]dsh[\\/]lib[\\/]bin\.js)"|([^\s"]+[\\/]dsh[\\/]lib[\\/]bin\.js))/iu.exec(
          command,
        );
      const managed =
        cli &&
        /^(.*)[\\/](?:ax-cli|packaged-cli)[\\/]node_modules[\\/]@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js$/iu.exec(
          cli[1] ?? cli[2],
        );
      return (
        !managed || win32.resolve(managed[1]).toLowerCase() === win32.resolve(home).toLowerCase()
      );
    }
    return (
      command.includes(join(home, 'ax-cli')) ||
      command.includes(join(home, 'packaged-cli')) ||
      command.includes(`DSH_HOME=${home} `) ||
      command.endsWith(`DSH_HOME=${home}`)
    );
  });
}

function resourceLive(resource) {
  return (
    processIsRunning(resource.pid) ||
    descendants(resource.pid, resource.ownedProcessGroup === true).length > 0
  );
}

function resourceRecord(child) {
  return { pid: child.pid, ownedProcessGroup: child.ownedProcessGroup === true };
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
      if (
        !existsSync(lockOwner) ||
        processIsRunning(JSON.parse(readFileSync(lockOwner, 'utf8')).pid)
      )
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
    if (
      recorded &&
      ([recorded.pid, ...(recorded.children ?? [])].some(processIsRunning) ||
        (recorded.resources ?? []).some(resourceLive))
    )
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
  const resources = [];
  const save = () =>
    writeFileSync(
      owner,
      JSON.stringify({
        pid: host?.pid ?? process.pid,
        resources,
        log: host?.log,
        cleanupIncomplete: host?.cleanupIncomplete,
      }),
      { mode: 0o600 },
    );
  const lease = {
    started(child, log) {
      host = child;
      host.log = log;
      if (child.pid) resources.push(resourceRecord(child));
      save();
    },
    async run(command, args, options = {}) {
      const child = spawn(
        process.execPath,
        [fileURLToPath(new URL('./dev-instance-command.mjs', import.meta.url))],
        { ...options, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
      );
      child.ownedProcessGroup = process.platform !== 'win32';
      let stdout = '',
        stderr = '';
      const completion = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', () => {
          try {
            if (child.pid && descendants(child.pid, child.ownedProcessGroup).length)
              reject(new Error('Preparation left running descendants'));
          } catch (error) {
            reject(error);
          }
        });
        child.once('close', (status) =>
          status === 0
            ? resolve()
            : reject(new Error(`${command} failed (${status}): ${stderr.trim()}`)),
        );
        child.stdout.on('data', (data) => {
          stdout += data;
          if (stdout.length > 8 * 1024 * 1024)
            reject(new Error('Preparation output exceeded limit'));
        });
        child.stderr.on('data', (data) => {
          stderr += data;
          if (stderr.length > 8 * 1024 * 1024)
            reject(new Error('Preparation error output exceeded limit'));
        });
      });
      completion.catch(() => {});
      try {
        return await verifyStartedHost(child, async () => {
          if (child.pid) resources.push(resourceRecord(child));
          save();
          if (child.pid) child.send({ command, args });
          await completion;
          if (descendants(child.pid, child.ownedProcessGroup).length)
            throw new Error('Preparation left running descendants');
          return stdout;
        });
      } finally {
        if (child.cleanupIncomplete) {
          host = child;
          save();
        }
      }
    },
    release() {
      if (!host?.cleanupIncomplete && !resources.some(resourceLive)) rmSync(owner, { force: true });
      else save();
      rmSync(gate, { recursive: true });
    },
  };
  return lease;
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
  return [...owned].reverse().filter(processIsRunning);
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
    const deadline = Date.now() + timeoutMs;
    const observed = new Set();
    const signal = (pid) => {
      try {
        process.kill(pid, 'SIGTERM');
      } catch (stopError) {
        if (stopError.code !== 'ESRCH') throw stopError;
      }
    };
    if (child.pid) {
      for (const pid of descendants(child.pid, child.ownedProcessGroup === true)) observed.add(pid);
      if (!stopped()) child.kill('SIGTERM');
    }
    let released = false;
    do {
      if (child.pid)
        for (const pid of descendants(child.pid, child.ownedProcessGroup === true))
          observed.add(pid);
      child.cleanupPids = [...observed].filter(processIsRunning);
      for (const pid of child.cleanupPids) signal(pid);
      if (stopped() && child.cleanupPids.length === 0) {
        released = true;
        break;
      }
      await new Promise((done) => setTimeout(done, 25));
    } while (Date.now() < deadline);
    if (!released)
      throw new Error(
        `${error.message}; Host ${child.pid} cleanup incomplete; preserve its Home and log`,
      );
    child.cleanupIncomplete = false;
    throw error;
  }
}
