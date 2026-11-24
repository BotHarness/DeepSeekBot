#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  closeSync,
  writeSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POLL_MS = 100;
const OWNER_START_MS = 10_000;

export function sharedRoot(tsdownPid) {
  return join(tmpdir(), `botharness-tsgo-${tsdownPid}`);
}

export function splitOutDir(args) {
  const index = args.indexOf('--outDir');
  if (index < 0 || index + 1 >= args.length) throw new Error('tsgo-once: missing --outDir');
  return {
    outDir: args[index + 1],
    withOutDir: (dir) => args.map((arg, i) => (i === index + 1 ? dir : arg)),
    key: createHash('sha256')
      .update(JSON.stringify(args.filter((_, i) => i !== index && i !== index + 1)))
      .digest('hex')
      .slice(0, 16),
  };
}

function realTsgo() {
  if (process.env.BOTHARNESS_TSGO_REAL) return process.env.BOTHARNESS_TSGO_REAL;
  const require = createRequire(join(ROOT, 'package.json'));
  const getExePath = require(
    join(dirname(require.resolve('typescript/package.json')), 'lib/getExePath.js'),
  );
  return (typeof getExePath === 'function' ? getExePath : getExePath.default)();
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function runOwner(base, args, split) {
  const shared = join(base, 'out');
  const child = spawn(realTsgo(), split.withOutDir(shared), {
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  });
  const finish = (code) => {
    writeFileSync(join(base, 'status.tmp'), String(code));
    renameSync(join(base, 'status.tmp'), join(base, 'status'));
    if (code === 0) cpSync(shared, split.outDir, { recursive: true });
    process.exit(code);
  };
  child.on('error', (error) => {
    process.stderr.write(`tsgo-once: could not start tsgo: ${error.message}\n`);
    finish(1);
  });
  child.on('close', (code, signal) => {
    if (signal) process.stderr.write(`tsgo-once: tsgo terminated by ${signal}\n`);
    finish(code ?? 1);
  });
}

function waitForOwner(base, split) {
  const started = Date.now();
  const tick = () => {
    const status = join(base, 'status');
    if (existsSync(status)) {
      const code = Number(readFileSync(status, 'utf8')) || 0;
      if (code === 0) cpSync(join(base, 'out'), split.outDir, { recursive: true });
      else
        process.stderr.write('tsgo-once: shared declaration emit failed; see its errors above\n');
      process.exit(code);
    }
    const pid = Number(readFileSync(join(base, 'owner'), 'utf8'));
    if (pid > 0 ? !alive(pid) : Date.now() - started > OWNER_START_MS) {
      process.stderr.write(
        'tsgo-once: the process running the shared tsgo emit exited without a result\n',
      );
      process.exit(1);
    }
    setTimeout(tick, POLL_MS);
  };
  tick();
}

function main(args) {
  const split = splitOutDir(args);
  const base = join(sharedRoot(process.ppid), split.key);
  mkdirSync(base, { recursive: true });
  let fd;
  try {
    fd = openSync(join(base, 'owner'), 'wx');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    waitForOwner(base, split);
    return;
  }
  writeSync(fd, String(process.pid));
  closeSync(fd);
  runOwner(base, args, split);
}

export function removeShared(tsdownPid) {
  rmSync(sharedRoot(tsdownPid), { recursive: true, force: true });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main(process.argv.slice(2));
