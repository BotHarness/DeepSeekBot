import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { fixtureExpression, targetSocket } from '../scripts/tob-mobile-driver.mjs';
import { publicInstance, MOBILE_REDIRECT_URI } from '../src/cloud/instance-contract';
const config = publicInstance({
  instanceId: 'test-uat',
  environment: 'uat',
  server: 'https://uat.example.test',
  clientId: 'client_test',
  issuer: 'https://api.workos.com/user_management/client_test',
  authkitDomain: 'test-staging.authkit.app',
  mobileRedirectUri: MOBILE_REDIRECT_URI,
});
const fixture = {
  config,
  userId: 'user_test',
  accessToken: 'private-access',
  refreshToken: 'private-refresh',
};
function runtime({
  busy = false,
  signedIn = false,
  wrongConfig = false,
  dev = true,
  verifiedRole = '',
} = {}) {
  let value = JSON.stringify({
    version: 1,
    entries: [
      {
        config: wrongConfig ? { ...config, server: 'https://other.example.test' } : config,
        ...(signedIn ? { session: { accessToken: 'existing', refreshToken: 'existing' } } : {}),
      },
      { config: { ...config, instanceId: 'other-uat' } },
    ],
  });
  let writes = 0;
  const client = {
    load: async () => {},
    getSnapshot: () => ({
      busy,
      rows: verifiedRole
        ? [{ config, identity: { userId: fixture.userId, instanceRole: verifiedRole } }]
        : [],
    }),
    rt: {
      read: async () => value,
      write: async (next: string) => {
        writes++;
        value = next;
      },
    },
  };
  const context = {
    __DEV__: dev,
    __r: {
      getModules: () =>
        new Map([[1, { isInitialized: true, publicModule: { exports: { cloudClient: client } } }]]),
    },
  };
  return { context, read: () => JSON.parse(value), writes: () => writes };
}
describe('local native UAT fixture driver', () => {
  it('requires a development runtime and an already-trusted exact UAT config', async () => {
    for (const opts of [{ dev: false }, { wrongConfig: true }]) {
      const rt = runtime(opts);
      await expect(
        runInNewContext(fixtureExpression('inject', fixture), rt.context),
      ).rejects.toThrow();
      expect(rt.writes()).toBe(0);
    }
    expect(() =>
      fixtureExpression('inject', { ...fixture, config: { ...config, environment: 'prod' } }),
    ).toThrow('UAT_FIXTURE_REQUIRED');
  });
  it('refuses an existing session and concurrent app operation without replacing data', async () => {
    for (const opts of [{ signedIn: true }, { busy: true }]) {
      const rt = runtime(opts);
      await expect(
        runInNewContext(fixtureExpression('inject', fixture), rt.context),
      ).rejects.toThrow();
      expect(rt.writes()).toBe(0);
    }
  });
  it('writes only the selected session and never returns credentials', async () => {
    const rt = runtime();
    const other = rt.read().entries[1];
    const result = await runInNewContext(fixtureExpression('inject', fixture), rt.context);
    expect(result).toEqual({ injected: true, restartRequired: true });
    expect(rt.read().entries[1]).toEqual(other);
    expect(rt.read().entries[0].session.userId).toBe('user_test');
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it('safely resumes only the identical prepared fixture after a lost debugger response', async () => {
    const rt = runtime();
    await runInNewContext(fixtureExpression('inject', fixture), rt.context);
    const again = await runInNewContext(fixtureExpression('inject', fixture), rt.context);
    expect(again).toEqual({ injected: true, alreadyPrepared: true, restartRequired: true });
    expect(rt.writes()).toBe(1);
  });
  it('rejects the phone, another app and a non-loopback debugger on the same Metro', () => {
    const target = {
      deviceName: 'QA Simulator',
      appId: 'ai.botharness.deepseekbot.dev',
      webSocketDebuggerUrl: 'ws://127.0.0.1:8091/inspector/debug',
    };
    expect(targetSocket(target, 8091, 'QA Simulator').hostname).toBe('127.0.0.1');
    for (const changed of [
      { deviceName: 'iPhone' },
      { appId: 'other.app' },
      { webSocketDebuggerUrl: 'ws://external.example:8091/debug' },
    ]) {
      expect(() => targetSocket({ ...target, ...changed }, 8091, 'QA Simulator')).toThrow();
    }
  });
  it('does not accept seeded storage alone as verified native login', async () => {
    const rt = runtime({ signedIn: true });
    await expect(
      runInNewContext(fixtureExpression('checkpoint', fixture), rt.context),
    ).rejects.toThrow('VERIFIED_NATIVE_IDENTITY_REQUIRED');
  });
  it('requires both native memory and persisted storage to be signed out', async () => {
    const signedIn = runtime({ signedIn: true });
    await expect(
      runInNewContext(fixtureExpression('signed-out', fixture), signedIn.context),
    ).rejects.toThrow('LOCAL_SESSION_REMAINS');
    const signedOut = runtime();
    await expect(
      runInNewContext(fixtureExpression('signed-out', fixture), signedOut.context),
    ).resolves.toEqual({ signedOut: true, configRetained: true });
  });
});

it('ordinary-user checkpoints assert the expected role without accepting administrator elevation', async () => {
  const ordinary = runtime({ signedIn: true, verifiedRole: 'user' });
  const result = await runInNewContext(
    fixtureExpression('checkpoint', { ...fixture, instanceRole: 'user' }),
    ordinary.context,
  );
  expect(result.accessToken).toBe('existing');
  const elevated = runtime({ signedIn: true, verifiedRole: 'admin' });
  await expect(
    runInNewContext(
      fixtureExpression('checkpoint', { ...fixture, instanceRole: 'user' }),
      elevated.context,
    ),
  ).rejects.toThrow('VERIFIED_NATIVE_IDENTITY_REQUIRED');
});
