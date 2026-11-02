const { spawn } = require('node:child_process');
const [executable, entry, parentText, launchId] = process.argv.slice(2);
const parent = Number(parentText);
if (
  process.platform !== 'darwin' ||
  !Number.isSafeInteger(parent) ||
  parent < 1 ||
  !/^[a-f0-9-]{36}$/.test(launchId ?? '')
)
  process.exit(2);
const LIMIT = 256 * 1024;
let stopping = false,
  output = '',
  input = '',
  child,
  timer;
function emit(value) {
  const line = JSON.stringify({ ...value, launchId }) + '\n';
  if (process.stdout.writableLength + Buffer.byteLength(line) > LIMIT) return stop();
  process.stdout.write(line);
}
function groupAlive() {
  if (!child?.pid) return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}
function signalGroup(signal) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') process.exitCode = 2;
  }
}
function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  process.stdin.pause();
  child?.stdin.destroy();
  signalGroup('SIGTERM');
  const start = Date.now();
  const drain = setInterval(() => {
    if (!groupAlive()) {
      clearInterval(drain);
      emit({ event: 'tree-closed', version: 1, activeProcesses: 0 });
      process.stdout.end(() => process.exit(0));
    } else if (Date.now() - start > 1300) signalGroup('SIGKILL');
    if (Date.now() - start > 2000) {
      clearInterval(drain);
      process.exit(2);
    }
  }, 20);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('uncaughtException', stop);
process.on('unhandledRejection', stop);
process.stdout.on('error', stop);
process.stdin.on('end', stop);
process.stdin.on('error', stop);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
child = spawn(executable, [entry], { detached: true, stdio: ['pipe', 'pipe', 'pipe'], env });
child.on('spawn', () => emit({ event: 'tree-owned', version: 1, rootPid: child.pid }));
child.on('error', stop);
child.on('exit', stop);
child.stdin.on('error', stop);
child.stderr.on('data', () => {});
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  if (stopping) return;
  output += chunk;
  if (Buffer.byteLength(output) > LIMIT) return stop();
  let n;
  while ((n = output.indexOf('\n')) >= 0) {
    const json = output.slice(0, n);
    output = output.slice(n + 1);
    emit({ event: 'helper-message', json });
  }
});
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (stopping) return;
  input += chunk;
  if (Buffer.byteLength(input) > LIMIT) return stop();
  let n;
  while ((n = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, n + 1);
    input = input.slice(n + 1);
    if (child.stdin.writableLength + Buffer.byteLength(line) > LIMIT) return stop();
    child.stdin.write(line);
  }
});
timer = setInterval(() => {
  try {
    process.kill(parent, 0);
  } catch {
    stop();
  }
}, 500);
