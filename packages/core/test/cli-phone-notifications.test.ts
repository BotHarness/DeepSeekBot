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

const { WebSocketServer, WebSocket } = createRequire(import.meta.url)('ws');
const schedule = globalThis.setTimeout;
const cancel = globalThis.clearTimeout;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((ready) => {
    resolve = ready;
  });
  return { promise, resolve };
}

async function bounded<T>(pending: Promise<T>, phase: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = schedule(() => reject(Error(`inspector fixture stalled: ${phase}`)), 2000);
      }),
    ]);
  } finally {
    cancel(timer);
  }
}

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

async function inspectorFixture(
  options: {
    duplicates?: boolean;
    deviceName?: string;
    release?: boolean;
    disconnect?: boolean;
    stall?: boolean;
    discovery?: Promise<void>;
  } = {},
) {
  const received = deferred<unknown>();
  const discovered = deferred<void>();
  const server = createServer((_request, response) => {
    const target = {
      id: 'target',
      deviceName: options.deviceName ?? 'Assigned phone',
      appId: options.release ? 'ai.botharness.deepseekbot' : 'ai.botharness.deepseekbot.dev',
      webSocketDebuggerUrl: `ws://127.0.0.1:${port}/inspector`,
    };
    discovered.resolve();
    response.setHeader('content-type', 'application/json');
    const reply = () =>
      response.end(JSON.stringify(options.duplicates ? [target, target] : [target]));
    if (options.discovery) void options.discovery.then(reply);
    else reply();
  });
  const sockets = new WebSocketServer({ server });
  sockets.on('connection', (socket: any) => {
    socket.on('message', (raw: Buffer) => {
      const request = JSON.parse(String(raw));
      received.resolve(request);
      if (options.disconnect) {
        socket.close();
        return;
      }
      if (options.stall) return;
      socket.send(
        JSON.stringify({
          id: request.id,
          result: { result: { value: { owner: 'phone', saved: false } } },
        }),
      );
    });
  });
  await bounded(new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)), 'listen');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('address required');
  const port = address.port;
  const peersClosed: Promise<void>[] = [];
  const originalClose = WebSocket.prototype.close;
  const closeSpy = vi.spyOn(WebSocket.prototype, 'close').mockImplementation(function (
    this: any,
    ...args: any[]
  ) {
    if (this.readyState !== WebSocket.CLOSED)
      peersClosed.push(new Promise<void>((resolve) => this.once('close', resolve)));
    return originalClose.apply(this, args);
  });
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
  return {
    run,
    received: received.promise,
    discovered: discovered.promise,
    async idleConnection() {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/inspector`);
      peersClosed.push(new Promise<void>((resolve) => socket.once('close', resolve)));
      await bounded(
        new Promise<void>((resolve) => socket.once('open', resolve)),
        'idle connection',
      );
      return socket;
    },
    async close() {
      try {
        for (const socket of sockets.clients) socket.terminate();
        const closed = new Promise<void>((resolve) => sockets.close(() => resolve()));
        server.closeAllConnections();
        await bounded(
          Promise.all([closed, new Promise<void>((resolve) => server.close(() => resolve()))]),
          'server cleanup',
        );
        await bounded(Promise.all(peersClosed), 'inspector peers close');
        expect(sockets.clients.size).toBe(0);
        expect(server.listening).toBe(false);
      } finally {
        closeSpy.mockRestore();
      }
    },
  };
}

it.each([
  {
    name: 'assigned development target',
    options: {},
    target: 'target',
    expected: { owner: 'phone' },
  },
  {
    name: 'missing target',
    options: {},
    target: 'missing',
    expected: { error: { code: 'explicit-unique-target-required' } },
  },
  {
    name: 'duplicate targets',
    options: { duplicates: true },
    target: 'target',
    expected: { error: { code: 'explicit-unique-target-required' } },
  },
  {
    name: 'wrong device',
    options: { deviceName: 'Wrong phone' },
    target: 'target',
    expected: { error: { code: 'explicit-simulator-app-target-required' } },
  },
  {
    name: 'release app',
    options: { release: true },
    target: 'target',
    expected: { error: { code: 'explicit-simulator-app-target-required' } },
  },
  {
    name: 'disconnected inspector',
    options: { disconnect: true },
    target: 'target',
    expected: { error: { code: 'inspector-closed' } },
  },
])('$name returns its exact CLI result', async ({ name, options, target, expected }) => {
  const fixture = await inspectorFixture(options);
  try {
    expect(await bounded(fixture.run(target), name)).toMatchObject(expected);
  } finally {
    await fixture.close();
  }
});

it('times out the received evaluation at 20 seconds despite an idle socket and delayed discovery', async () => {
  const discovery = deferred<void>();
  const fixture = await inspectorFixture({ stall: true, discovery: discovery.promise });
  let pending: Promise<unknown> | undefined;
  try {
    await fixture.idleConnection();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pending = fixture.run();
    const settled = vi.fn();
    void pending.then(settled);
    await bounded(fixture.discovered, 'target discovery');
    await vi.advanceTimersByTimeAsync(20_100);
    expect(settled).not.toHaveBeenCalled();
    discovery.resolve();
    expect(await bounded(fixture.received, 'Runtime.evaluate delivery')).toMatchObject({
      id: 1,
      method: 'Runtime.evaluate',
      params: { awaitPromise: true, returnByValue: true },
    });
    await vi.advanceTimersByTimeAsync(19_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await bounded(pending, 'evaluation deadline result')).toMatchObject({
      error: { code: 'inspector-timeout' },
    });
  } finally {
    discovery.resolve();
    try {
      await fixture.close();
      if (pending) await bounded(pending, 'pending CLI cleanup');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  }
});
