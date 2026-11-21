import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { type CredentialProvider, type CredentialRecord } from '@deepseek-ai/dsh-credentials';
import { afterEach } from 'vitest';
import type { SpawnTunnel, TunnelProcess } from '../src/devices/connect.js';

type Credentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;

export function memoryCredentials(): Credentials & { records: Map<string, CredentialRecord> } {
  const records = new Map<string, CredentialRecord>();
  return {
    records,
    readRecord: async (key) => records.get(key),
    modifyRecord: async (key, mutate) => {
      const next = await mutate(records.get(key));
      if (next) records.set(key, next);
      else records.delete(key);
      return next;
    },
    deleteRecord: async (key) => {
      records.delete(key);
    },
  };
}

export function fakeCloudflared() {
  const runs: { args: readonly string[]; env: NodeJS.ProcessEnv; child: EventEmitter }[] = [];
  let address = 0;
  const spawn: SpawnTunnel = (_binary, args, env) => {
    const child = new EventEmitter() as EventEmitter & TunnelProcess;
    const stderr = new PassThrough();
    Object.assign(child, { stderr, kill: () => child.emit('exit', null) });
    runs.push({ args, env, child });
    address += 1;
    setTimeout(() => {
      if (args.includes('--url'))
        stderr.write(`INF |  https://quick-${String(address)}.trycloudflare.com  |\n`);
      stderr.write('INF Registered tunnel connection connIndex=0\n');
    }, 5);
    return child;
  };
  return { runs, spawn };
}

export const resolveBinary = async () => ({ binary: 'cloudflared', source: 'package' as const });
export const tunnels: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const tunnel of tunnels.splice(0)) await tunnel.close();
});
