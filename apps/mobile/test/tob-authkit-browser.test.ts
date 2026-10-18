import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import {
  installExpression,
  statusExpression,
  fixtureConfig,
  callback,
} from '../scripts/tob-authkit-browser.mjs';
import { parseInstance } from '../src/cloud/instance-contract';
function runtime({ dev = true, session = false, busy = false, environment = 'uat' } = {}) {
  const calls: string[] = [];
  let writes = 0;
  const originalVault = { version: 1, entries: [] };
  const client = {
    vault: originalVault,
    identities: new Map(),
    rt: {
      read: async () => 'original-private-store',
      write: async () => {
        writes++;
      },
      request: async (url: string) => {
        calls.push(url);
        return new Response('{}');
      },
      authorize: async (url: string, _callback?: string) => {
        calls.push(url);
        return callback + '?state=fixture&code=fixture';
      },
    },
    getSnapshot: () => ({
      ready: true,
      busy,
      rows: [{ config: { environment }, hasSession: session }],
    }),
    publish: () => {},
  };
  const original = client.rt;
  const context = {
    __DEV__: dev,
    URL,
    Map,
    __r: {
      getModules: () =>
        new Map([[1, { isInitialized: true, publicModule: { exports: { cloudClient: client } } }]]),
    },
  };
  return { client, context, calls, writes: () => writes, original, originalVault };
}
describe('isolated native AuthKit browser fixture', () => {
  it('uses a valid, clearly labeled fictional instance', () => {
    expect(parseInstance(fixtureConfig).name).toBe('LOCAL EMULATOR - not UAT');
  });
  it('refuses release, active sessions, busy operations, Prod and remote endpoints', () => {
    for (const opts of [
      { dev: false },
      { session: true },
      { busy: true },
      { environment: 'prod' },
    ]) {
      const rt = runtime(opts);
      expect(() =>
        runInNewContext(installExpression('http://127.0.0.1:12345'), rt.context),
      ).toThrow();
      expect(rt.client.rt).toBe(rt.original);
    }
    for (const origin of [
      'https://external.example',
      'http://localhost:12345',
      'http://127.0.0.1:12345/path',
      'http://x@127.0.0.1:12345',
    ])
      expect(() => installExpression(origin)).toThrow('LOOPBACK_FIXTURE_REQUIRED');
  });
  it('routes only allowed fixture requests to loopback and keeps storage in memory', async () => {
    const rt = runtime();
    runInNewContext(installExpression('http://127.0.0.1:12345'), rt.context);
    const config = parseInstance(fixtureConfig);
    await rt.client.rt.request(config.auth.tokenEndpoint);
    await rt.client.rt.request(config.server + '/api/me');
    expect(rt.calls).toEqual([
      'http://127.0.0.1:12345/user_management/authenticate',
      'http://127.0.0.1:12345/api/me',
    ]);
    await expect(
      rt.client.rt.request('https://api.workos.com/user_management/users'),
    ).rejects.toThrow('FIXTURE_EGRESS_REFUSED');
    await rt.client.rt.write();
    expect(rt.writes()).toBe(0);
  });
  it('retains the real browser adapter and restores the original runtime without persistence', async () => {
    const rt = runtime();
    runInNewContext(installExpression('http://127.0.0.1:12345'), rt.context);
    await rt.client.rt.authorize(
      'https://api.workos.com/user_management/authorize?state=fixture',
      callback,
    );
    const status = runInNewContext(statusExpression(true), rt.context);
    expect(status.restored).toBe(true);
    expect(rt.client.rt).toBe(rt.original);
    expect(rt.client.vault).toBe(rt.originalVault);
    expect(rt.writes()).toBe(0);
    expect(() => runInNewContext(statusExpression(), rt.context)).toThrow('FIXTURE_IDLE_REQUIRED');
  });
});
