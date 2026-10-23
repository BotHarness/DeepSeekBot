const { spawn, execFile } = require('node:child_process');
const { readFile, mkdtemp, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { promisify } = require('node:util');
const run = promisify(execFile);
const LIMIT = 128 * 1024;

async function identity(pid) {
  const text = await readFile(`/proc/${pid}/stat`, 'utf8');
  return text.slice(text.lastIndexOf(')') + 2).split(' ')[19];
}

async function main() {
  const [mode, host, launchId, executable, ...args] = process.argv.slice(2);
  if (
    !['media', 'display'].includes(mode) ||
    process.platform !== 'linux' ||
    process.getuid() === 0 ||
    !/^\d+$/.test(host) ||
    !/^[0-9a-f-]{36}$/.test(launchId)
  )
    throw new Error('arguments');
  const expected = await identity(host);
  const managerEnv = {
    ...process.env,
    DBUS_SESSION_BUS_ADDRESS: `unix:path=${process.env.XDG_RUNTIME_DIR}/bus`,
  };
  const privateDir = await mkdtemp(join(tmpdir(), 'botharness-media-env-'));
  const environmentFile = join(privateDir, 'environment');
  const environment = Object.entries(process.env)
    .filter(([key]) => /^[A-Z_][A-Z0-9_]*$/.test(key))
    .map(([key, value]) => {
      if (/[\r\n\0]/.test(value)) throw new Error('environment');
      return `${key}="${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
    })
    .join('\n');
  await writeFile(environmentFile, environment, { mode: 0o600 });
  const unit = `botharness-${mode}-${launchId}.service`;
  const receipt = mode === 'media' ? process.stdout : process.stderr;
  const emit = (value) => {
    const line = JSON.stringify({ ...value, launchId }) + '\n';
    if (receipt.writableLength + Buffer.byteLength(line) > LIMIT) throw new Error('output');
    receipt.write(line);
  };
  const control = (...options) =>
    run('systemctl', ['--user', ...options, unit], {
      timeout: 350,
      maxBuffer: 16384,
      env: managerEnv,
    });
  const properties = async () => {
    const { stdout } = await control(
      'show',
      '--property=MainPID,ControlGroup,ActiveState,LoadState',
    ).catch((error) => {
      if (typeof error.stdout === 'string' && /^LoadState=not-found$/m.test(error.stdout))
        return error;
      throw error;
    });
    return Object.fromEntries(
      stdout
        .trim()
        .split('\n')
        .map((line) => {
          const offset = line.indexOf('=');
          return [line.slice(0, offset), line.slice(offset + 1)];
        }),
    );
  };
  let group;
  let owned = false;
  let closing;
  let rejected = false;
  let output = '';
  let first = true;
  let streamQueue = Promise.resolve();
  let hostTimer;
  let settled = false;
  let finish;
  let queuedBytes = 0;
  let startup;
  const completion = new Promise((resolve) => {
    finish = resolve;
  });
  const child = spawn(
    'systemd-run',
    [
      '--user',
      '--quiet',
      '--pipe',
      '--wait',
      '--collect',
      `--unit=${unit}`,
      '--service-type=notify',
      '--property=NotifyAccess=main',
      '--property=KillMode=control-group',
      '--property=TimeoutStopSec=1s',
      '--property=WatchdogSec=2s',
      '--property=TimeoutAbortSec=1s',
      '--property=SendSIGKILL=yes',
      '--property=Delegate=no',
      `--property=EnvironmentFile=${environmentFile}`,
      'python3',
      join(__dirname, 'linux-worker.py'),
      host,
      expected,
      launchId,
      executable,
      ...args.map((value) => value.replaceAll('$', '$$')),
    ],
    { stdio: ['pipe', 'pipe', 'pipe'], env: managerEnv },
  );

  const empty = async () => {
    if (!group) return false;
    const state = await properties();
    if (state.LoadState !== 'not-found' && !['inactive', 'failed'].includes(state.ActiveState))
      return false;
    try {
      const events = await readFile(join('/sys/fs/cgroup', group, 'cgroup.events'), 'utf8');
      return /^populated 0$/m.test(events);
    } catch (error) {
      return error.code === 'ENOENT';
    }
  };
  const stop = () => {
    closing ??= (async () => {
      const deadline = Date.now() + 1900;
      clearInterval(hostTimer);
      child.stdin.destroy();
      await control('stop', '--no-block').catch(() => undefined);
      while (Date.now() < deadline) {
        if (owned && (await empty().catch(() => false))) {
          emit({ event: 'tree-closed', version: 1, activeProcesses: 0 });
          settled = true;
          finish(0);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      settled = true;
      finish(1);
    })();
    return closing;
  };
  process.on('SIGTERM', stop);
  process.stdin.on('end', stop);
  process.stdin.on('error', stop);
  receipt.on('error', stop);
  child.stdin.on('error', stop);
  child.stderr.on('data', () => {});
  child.on('error', stop);
  child.on('close', () => {
    void streamQueue.finally(stop);
  });
  hostTimer = setInterval(() => {
    void identity(host).then((value) => {
      if (value !== expected) void stop();
    }, stop);
  }, 200);
  process.stdin.on('data', (data) => {
    if (closing) return;
    if (child.stdin.writableLength + data.length > LIMIT) {
      void stop();
      return;
    }
    child.stdin.write(data);
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    if (rejected || closing) return;
    if (queuedBytes + Buffer.byteLength(output) + Buffer.byteLength(chunk) > LIMIT) {
      rejected = true;
      void stop();
      return;
    }
    output += chunk;
    let index;
    while ((index = output.indexOf('\n')) >= 0) {
      const line = output.slice(0, index);
      output = output.slice(index + 1);
      queuedBytes += Buffer.byteLength(line);
      streamQueue = streamQueue
        .then(async () => {
          if (closing) return;
          if (first) {
            first = false;
            const header = JSON.parse(line);
            const state = await properties();
            if (
              header.launchId !== launchId ||
              String(header.worker) !== state.MainPID ||
              !state.ControlGroup?.endsWith('/' + unit) ||
              state.ControlGroup.includes('..')
            )
              throw new Error('ownership');
            group = state.ControlGroup;
            owned = true;
            clearTimeout(startup);
            await rm(privateDir, { recursive: true, force: true });
            emit({ event: 'tree-owned', version: 1, rootPid: header.worker });
          } else if (mode === 'media') {
            emit({ event: 'helper-message', json: line });
          } else {
            if (process.stdout.writableLength + Buffer.byteLength(line) > LIMIT)
              throw new Error('output');
            process.stdout.write(line + '\n');
          }
        })
        .catch(() => {
          rejected = true;
          void stop();
        })
        .finally(() => {
          queuedBytes -= Buffer.byteLength(line);
        });
    }
  });
  startup = setTimeout(stop, 8000);
  const code = await completion;
  clearTimeout(startup);
  clearInterval(hostTimer);
  await rm(privateDir, { recursive: true, force: true });
  await Promise.race([
    new Promise((resolve) => receipt.write('', resolve)),
    new Promise((resolve) => setTimeout(resolve, 100)),
  ]);
  if (!settled) return 1;
  return code;
}

main().then(
  (code) => process.exit(code),
  () => process.exit(1),
);
