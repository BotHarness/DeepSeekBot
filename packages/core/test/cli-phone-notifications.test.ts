import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { phoneNotificationExpression } from '../src/bots/cli-phone-notifications.js';
import {
  createDeviceNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../../../apps/mobile/src/host/device-notification-preferences.js';
import type { PushPreferences } from '../../../apps/mobile/src/host/push.js';

const { WebSocketServer } = createRequire(import.meta.url)('ws');

function context(owner: unknown, dev = true, copies = 1) {
  return {
    __DEV__: dev,
    __r: {
      getModules: () =>
        new Map(
          Array.from({ length: copies }, (_, i) => [
            i,
            { isInitialized: true, publicModule: { exports: { notificationPreferences: owner } } },
          ]),
        ),
    },
  };
}

it('the development CLI and UI use one persistent owner and distinguish pending Host copies', async () => {
  let disk: PushPreferences = DEFAULT_NOTIFICATION_PREFERENCES;
  const copies = new Map<string, PushPreferences>();
  const offline = new Set(['b']);
  const options = {
    storage: {
      read: async () => disk,
      write: (value: PushPreferences) => {
        disk = value;
      },
    },
    push: {
      settings: vi.fn(),
      setPreferences: vi.fn(async (host, preferences) => {
        if (offline.has(host.hostId)) throw Error('offline');
        copies.set(host.hostId, preferences);
        return { registered: false, enabled: true, preferences, quietChannelIds: [] };
      }),
    },
  };
  const owner = createDeviceNotificationPreferences(options);
  const hosts = ['a', 'b'].map((id) => ({
    hostId: id,
    hostName: id,
    deviceId: id,
    credential: 'private-secret',
    routes: [],
  }));
  await owner.sync(hosts);
  const ui = vi.fn();
  owner.subscribe(ui);
  const result = await runInNewContext(
    phoneNotificationExpression({ ...disk, reply: false }),
    context(owner),
  );
  expect(result).toMatchObject({
    owner: 'phone',
    saved: true,
    syncStatus: 'pending',
    failedHostIds: ['b'],
    preferences: { reply: false },
  });
  expect(ui).toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toContain('private-secret');
  expect(owner.getSnapshot().preferences?.reply).toBe(false);
  offline.clear();
  const reloaded = createDeviceNotificationPreferences(options);
  await reloaded.sync(hosts);
  expect(copies.get('b')?.reply).toBe(false);
  expect(await runInNewContext(phoneNotificationExpression(), context(reloaded))).toMatchObject({
    saved: false,
    syncStatus: 'complete',
    preferences: { reply: false },
  });
  for (const runtime of [context(owner, false), context(owner, true, 0), context(owner, true, 2)])
    await expect(runInNewContext(phoneNotificationExpression(), runtime)).rejects.toThrow();
  await expect(
    runInNewContext(
      phoneNotificationExpression(),
      context({ ...owner, ready: Promise.reject(Error('private error')) }),
    ),
  ).rejects.toThrow('NOTIFICATION_OWNER_NOT_READY');
});

it('requires an exact unique development target and reports release, disconnect and timeout refusals', async () => {
  let duplicates = false;
  let deviceName = 'Assigned phone';
  let release = false;
  let disconnect = false;
  let stall = false;
  const server = createServer((_request, response) => {
    const target = {
      id: 'target',
      deviceName,
      appId: release ? 'ai.botharness.deepseekbot' : 'ai.botharness.deepseekbot.dev',
      webSocketDebuggerUrl: `ws://127.0.0.1:${port}/inspector`,
    };
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(duplicates ? [target, target] : [target]));
  });
  const sockets = new WebSocketServer({ server });
  sockets.on('connection', (socket: any) => {
    socket.on('message', (raw: Buffer) => {
      if (disconnect) {
        socket.close();
        return;
      }
      if (stall) return;
      const request = JSON.parse(String(raw));
      socket.send(
        JSON.stringify({
          id: request.id,
          result: { result: { value: { owner: 'phone', saved: false } } },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('address required');
  const port = address.port;
  const run = async (target = 'target') => {
    const output: string[] = [];
    await runBotCreateCli(
      [
        'phone-notifications',
        '--metro-port',
        String(port),
        '--target-id',
        target,
        '--device-name',
        'Assigned phone',
      ],
      { env: {}, stdout: (text) => output.push(text), stderr: () => {} },
    );
    return JSON.parse(output[0]!);
  };
  try {
    expect(await run()).toMatchObject({ owner: 'phone' });
    expect(await run('missing')).toMatchObject({
      error: { code: 'explicit-unique-target-required' },
    });
    duplicates = true;
    expect(await run()).toMatchObject({ error: { code: 'explicit-unique-target-required' } });
    duplicates = false;
    deviceName = 'Wrong phone';
    expect(await run()).toMatchObject({
      error: { code: 'explicit-simulator-app-target-required' },
    });
    deviceName = 'Assigned phone';
    release = true;
    expect(await run()).toMatchObject({
      error: { code: 'explicit-simulator-app-target-required' },
    });
    release = false;
    disconnect = true;
    expect(await run()).toMatchObject({ error: { code: 'inspector-closed' } });
    disconnect = false;
    stall = true;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = run();
    await vi.waitUntil(() => sockets.clients.size === 1);
    await vi.advanceTimersByTimeAsync(20_100);
    expect(await pending).toMatchObject({ error: { code: 'inspector-timeout' } });
  } finally {
    vi.useRealTimers();
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
