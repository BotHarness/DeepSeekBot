import { execFile } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import {
  recordSchedulingDiagnostic,
  schedulingIdentity,
  schedulingScan,
} from './scheduling-diagnostics.js';

export interface OffThreadOptions {
  readonly cwd?: string | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly timeout?: number | undefined;
  readonly maxBuffer?: number | undefined;
  readonly windowsHide?: boolean | undefined;
  readonly stdio?: readonly ('ignore' | 'pipe')[] | undefined;
}

export interface OffThreadError extends Error {
  code?: string | number | null | undefined;
  killed?: boolean | undefined;
  signal?: string | null | undefined;
  stdout?: string | Buffer | undefined;
  stderr?: string | Buffer | undefined;
}

type Encoding = 'utf8' | 'buffer';
interface Reply {
  readonly id: number;
  readonly stdout: string | Uint8Array;
  readonly stderr: string | Uint8Array;
  readonly error?: {
    message: string;
    code?: string | number | null;
    killed?: boolean;
    signal?: string | null;
  };
}

const SOURCE = `
const { parentPort } = require('node:worker_threads');
const { execFile } = require('node:child_process');
parentPort.on('message', ({ id, file, args, options }) => {
  try {
    execFile(file, args, options, (error, stdout, stderr) => {
      parentPort.postMessage({
        id,
        stdout,
        stderr,
        error: error
          ? { message: error.message, code: error.code, killed: error.killed, signal: error.signal }
          : undefined,
      });
    });
  } catch (error) {
    parentPort.postMessage({ id, stdout: '', stderr: '', error: { message: String(error && error.message), code: error && error.code } });
  }
});
`;

let worker: Worker | undefined;
let unavailable = false;
let nextId = 1;
const pending = new Map<
  number,
  { encoding: Encoding; resolve: (reply: Reply) => void; reject: (error: Error) => void }
>();

function failAll(error: Error): void {
  for (const waiter of pending.values()) waiter.reject(error);
  pending.clear();
}

function ensureWorker(): Worker | undefined {
  if (worker !== undefined) return worker;
  if (unavailable) return undefined;
  try {
    const created = new Worker(SOURCE, { eval: true });
    created.unref();
    created.on('message', (reply: Reply) => {
      const waiter = pending.get(reply.id);
      if (waiter === undefined) return;
      pending.delete(reply.id);
      waiter.resolve(reply);
    });
    const lost = (error: Error) => {
      if (worker === created) worker = undefined;
      failAll(error);
    };
    created.on('error', lost);
    created.on('exit', () => lost(new Error('The process runner stopped.')));
    worker = created;
    return created;
  } catch {
    unavailable = true;
    return undefined;
  }
}

function decode(value: string | Uint8Array, encoding: Encoding): string | Buffer {
  if (encoding === 'utf8')
    return typeof value === 'string' ? value : Buffer.from(value).toString('utf8');
  return typeof value === 'string'
    ? Buffer.from(value, 'utf8')
    : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function settle(
  reply: Reply,
  encoding: Encoding,
): { stdout: string | Buffer; stderr: string | Buffer } {
  const stdout = decode(reply.stdout, encoding);
  const stderr = decode(reply.stderr, encoding);
  if (reply.error === undefined) return { stdout, stderr };
  const error = new Error(reply.error.message) as OffThreadError;
  error.code = reply.error.code;
  error.killed = reply.error.killed;
  error.signal = reply.error.signal;
  error.stdout = stdout;
  error.stderr = stderr;
  throw error;
}

function direct(
  file: string,
  args: readonly string[],
  options: OffThreadOptions,
  encoding: Encoding,
  diagnostic: { operation: number; scan: number },
): Promise<{ stdout: string | Buffer; stderr: string | Buffer }> {
  const { stdio: _stdio, ...rest } = options;
  return new Promise((resolve, reject) => {
    try {
      execFile(
        file,
        [...args],
        { ...rest, encoding: encoding === 'buffer' ? 'buffer' : 'utf8' },
        (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => {
          recordSchedulingDiagnostic({
            kind: 'exec-settle',
            ...diagnostic,
            outcome: error ? 'error' : 'ok',
          });
          if (error) {
            const failure = error as OffThreadError;
            failure.stdout = stdout;
            failure.stderr = stderr;
            reject(failure);
          } else resolve({ stdout, stderr });
        },
      );
    } catch (error) {
      recordSchedulingDiagnostic({ kind: 'exec-settle', ...diagnostic, outcome: 'error' });
      reject(error);
    }
  });
}

async function run(
  file: string,
  args: readonly string[],
  options: OffThreadOptions,
  encoding: Encoding,
): Promise<{ stdout: string | Buffer; stderr: string | Buffer }> {
  const runner = ensureWorker();
  const operation = schedulingIdentity();
  const scan = schedulingScan();
  recordSchedulingDiagnostic({
    kind: 'exec-dispatch',
    operation,
    scan,
    mode: runner === undefined ? 'direct' : 'worker',
  });
  if (runner === undefined) return direct(file, args, options, encoding, { operation, scan });
  let outcome: 'ok' | 'error' = 'error';
  try {
    const id = nextId++;
    const reply = await new Promise<Reply>((resolve, reject) => {
      pending.set(id, { encoding, resolve, reject });
      runner.postMessage({
        id,
        file,
        args: [...args],
        options: {
          ...options,
          env: options.env ?? { ...process.env },
          ...(options.stdio ? { stdio: [...options.stdio] } : {}),
          encoding: encoding === 'buffer' ? 'buffer' : 'utf8',
        },
      });
    });
    const result = settle(reply, encoding);
    outcome = 'ok';
    return result;
  } finally {
    recordSchedulingDiagnostic({ kind: 'exec-settle', operation, scan, outcome });
  }
}

export async function execFileText(
  file: string,
  args: readonly string[],
  options: OffThreadOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  return (await run(file, args, options, 'utf8')) as { stdout: string; stderr: string };
}

export async function execFileBuffer(
  file: string,
  args: readonly string[],
  options: OffThreadOptions = {},
): Promise<{ stdout: Buffer; stderr: Buffer }> {
  return (await run(file, args, options, 'buffer')) as { stdout: Buffer; stderr: Buffer };
}
