import { TeamError } from './error.js';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { z } from 'zod';

export const ARGON2_PARAMS = Object.freeze({ m: 19456, t: 2, p: 1, dkLen: 32, version: 19 });
export const passwordHashSchema = z.object({
  algorithm: z.literal('argon2id'),
  salt: z.string().regex(/^[a-f0-9]{32}$/u),
  hash: z.string().regex(/^[a-f0-9]{64}$/u),
  params: z.object({
    m: z.literal(19456),
    t: z.literal(2),
    p: z.literal(1),
    dkLen: z.literal(32),
    version: z.literal(19),
  }),
});
export type PasswordHash = z.infer<typeof passwordHashSchema>;

let running = 0;
const waiting: Array<() => void> = [];

async function derive(password: string, salt: string): Promise<Buffer> {
  if (waiting.length >= 16) throw new TeamError('rate-limited', 1);
  if (running >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  else running += 1;
  let worker: Worker | undefined;
  try {
    worker = new Worker(
      `
    const { parentPort, workerData } = require('node:worker_threads');
    import(workerData.module).then(({ argon2id }) => {
      const hash = argon2id(workerData.password, Buffer.from(workerData.salt, 'hex'), workerData.params);
      parentPort.postMessage(Buffer.from(hash).toString('hex'));
    }).catch(() => process.exit(1));
  `,
      {
        eval: true,
        workerData: {
          module: import.meta.resolve('@noble/hashes/argon2.js'),
          password,
          salt,
          params: ARGON2_PARAMS,
        },
      },
    );
    const activeWorker = worker;
    return await new Promise<Buffer>((resolve, reject) => {
      activeWorker.once('message', (hash: unknown) => {
        if (typeof hash === 'string' && /^[a-f0-9]{64}$/u.test(hash))
          resolve(Buffer.from(hash, 'hex'));
        else reject(new Error('password-hash-failed'));
      });
      activeWorker.once('error', () => reject(new Error('password-hash-failed')));
      activeWorker.once('exit', () => reject(new Error('password-hash-failed')));
    });
  } finally {
    await worker?.terminate();
    const next = waiting.shift();
    if (next) next();
    else running -= 1;
  }
}

export function strongPassword(password: string): boolean {
  return password.length >= 10 && Buffer.byteLength(password) <= 1024;
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16).toString('hex');
  return {
    algorithm: 'argon2id',
    salt,
    hash: (await derive(password, salt)).toString('hex'),
    params: ARGON2_PARAMS,
  };
}

export async function verifyPassword(password: string, hash: PasswordHash): Promise<boolean> {
  const actual = await derive(password, hash.salt);
  return timingSafeEqual(actual, Buffer.from(hash.hash, 'hex'));
}

export const DUMMY_PASSWORD_HASH: PasswordHash = {
  algorithm: 'argon2id',
  salt: '00000000000000000000000000000000',
  hash: '0000000000000000000000000000000000000000000000000000000000000000',
  params: ARGON2_PARAMS,
};
