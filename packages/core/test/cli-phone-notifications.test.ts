import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createContext, runInContext, runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { phoneNotificationExpression } from '../src/bots/cli-phone-notifications.js';
import { connect } from '../src/bots/development-inspector.mjs';
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
  const fixture = await inspectorFixture({ owner });
  let result;
  try {
    result = await bounded(fixture.run('target', { ...disk, reply: false }), 'phone owner write');
  } finally {
    await fixture.close();
  }
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
    owner?: unknown;
    runtimeDev?: boolean;
    modules?: number;
    invalidReply?: unknown;
    disconnectAfterPending?: boolean;
    delayStart?: Promise<void>;
    delayFulfilled?: Promise<void>;
  } = {},
) {
  const received = deferred<unknown>();
  const discovered = deferred<void>();
  const pendingPoll = deferred<void>();
  const heldStart = deferred<void>();
  const heldFulfilled = deferred<void>();
  const slotWaiters = new Map<number, ReturnType<typeof deferred<void>>>();
  const runtimeTimers = new Set<ReturnType<typeof setTimeout>>();
  const owner =
    options.owner ??
    createDeviceNotificationPreferences({
      storage: { read: async () => DEFAULT_NOTIFICATION_PREFERENCES, write: vi.fn() },
      push: { settings: vi.fn(), setPreferences: vi.fn() },
    });
  const runtime = createContext({
    ...context(owner, options.runtimeDev, options.modules),
    setTimeout: (callback: () => void, delay: number) => {
      const timer = globalThis.setTimeout(() => {
        runtimeTimers.delete(timer);
        callback();
      }, delay);
      runtimeTimers.add(timer);
      return timer;
    },
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => {
      runtimeTimers.delete(timer);
      globalThis.clearTimeout(timer);
    },
  });
  const slotKeys = () =>
    Object.getOwnPropertyNames(runtime).filter((key) => key.startsWith('__botharnessInspector_'));
  let unawaitedPromises = 0;
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
      let result;
      let gate: Promise<void> | undefined;
      try {
        let value = runInContext(request.params.expression, runtime);
        slotWaiters.get(slotKeys().length)?.resolve();
        if (value && typeof value.then === 'function') {
          unawaitedPromises++;
          void value.catch(() => undefined);
          value = { _A: null, _x: 0, _y: 0, _z: null };
        }
        if (value?.state === 'pending') {
          pendingPoll.resolve();
          if (options.disconnectAfterPending) {
            socket.close();
            return;
          }
        }
        if (value?.state === 'started' && options.delayStart) {
          heldStart.resolve();
          gate = options.delayStart;
        }
        if (value?.state === 'fulfilled' && options.delayFulfilled) {
          heldFulfilled.resolve();
          gate = options.delayFulfilled;
        }
        result = { result: { value: options.invalidReply ?? value } };
      } catch (error) {
        result = { exceptionDetails: { exception: { description: String(error) } } };
      }
      const reply = () => {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ id: request.id, result }));
      };
      if (gate) void gate.then(reply);
      else reply();
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
  const run = async (target = 'target', preferences?: PushPreferences) => {
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
        ...(preferences ? ['--preferences-stdin'] : []),
      ],
      {
        env: {},
        readStdin: async () => JSON.stringify(preferences),
        stdout: (text) => output.push(text),
        stderr: () => {},
      },
    );
    return JSON.parse(output[0]!);
  };
  return {
    run,
    received: received.promise,
    discovered: discovered.promise,
    pendingPoll: pendingPoll.promise,
    heldStart: heldStart.promise,
    heldFulfilled: heldFulfilled.promise,
    port,
    slotKeys,
    unawaitedPromises: () => unawaitedPromises,
    slots(count: number) {
      if (slotKeys().length === count) return Promise.resolve();
      const waiter = deferred<void>();
      slotWaiters.set(count, waiter);
      return waiter.promise;
    },
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
        expect(slotKeys()).toEqual([]);
        expect(runtimeTimers.size).toBe(0);
      } finally {
        closeSpy.mockRestore();
        for (const key of slotKeys()) runtime[key].dispose();
      }
    },
  };
}

it('settles the owner when Runtime.evaluate ignores awaitPromise for JavaScript Promises', async () => {
  const fixture = await inspectorFixture();
  let client: Awaited<ReturnType<typeof connect>> | undefined;
  try {
    client = await connect(fixture.port, 'target', 'Assigned phone');
    expect(
      await client.send('Runtime.evaluate', {
        expression: phoneNotificationExpression(),
        awaitPromise: true,
        returnByValue: true,
      }),
    ).toEqual({ result: { value: { _A: null, _x: 0, _y: 0, _z: null } } });
    expect(await bounded(fixture.run(), 'polyfill settlement')).toEqual({
      owner: 'phone',
      developmentClient: true,
      saved: false,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      syncing: false,
      failedHostIds: [],
      syncStatus: 'complete',
    });
    expect(fixture.unawaitedPromises()).toBe(1);
    expect(fixture.slotKeys()).toEqual([]);
  } finally {
    client?.close();
    await fixture.close();
  }
});

it('waits for delayed owner readiness and consumes the fulfilled slot', async () => {
  const ready = deferred<void>();
  const owner = createDeviceNotificationPreferences({
    storage: {
      read: async () => {
        await ready.promise;
        return DEFAULT_NOTIFICATION_PREFERENCES;
      },
      write: vi.fn(),
    },
    push: { settings: vi.fn(), setPreferences: vi.fn() },
  });
  const fixture = await inspectorFixture({ owner });
  try {
    const pending = fixture.run();
    const settled = vi.fn();
    void pending.then(settled);
    await bounded(fixture.pendingPoll, 'pending owner');
    expect(settled).not.toHaveBeenCalled();
    expect(fixture.slotKeys()).toHaveLength(1);
    ready.resolve();
    expect(await bounded(pending, 'ready owner')).toMatchObject({
      owner: 'phone',
      syncStatus: 'complete',
    });
    expect(fixture.slotKeys()).toEqual([]);
  } finally {
    ready.resolve();
    await fixture.close();
  }
});

it('isolates concurrent request slots and clears both TTL timers on completion', async () => {
  const ready = deferred<void>();
  const fixture = await inspectorFixture({
    owner: {
      ready: ready.promise,
      set: vi.fn(),
      getSnapshot: () => ({
        preferences: DEFAULT_NOTIFICATION_PREFERENCES,
        syncing: false,
        failed: [],
      }),
    },
  });
  try {
    const first = fixture.run();
    const second = fixture.run();
    await bounded(fixture.slots(2), 'two pending slots');
    const keys = fixture.slotKeys();
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    ready.resolve();
    for (const result of await bounded(Promise.all([first, second]), 'concurrent settlements'))
      expect(result).toMatchObject({ owner: 'phone', syncStatus: 'complete' });
    expect(fixture.slotKeys()).toEqual([]);
  } finally {
    ready.resolve();
    await fixture.close();
  }
});

it('uses the same 20-second deadline for startup and final result delivery', async () => {
  const start = deferred<void>();
  const result = deferred<void>();
  const fixture = await inspectorFixture({
    delayStart: start.promise,
    delayFulfilled: result.promise,
  });
  let pending: Promise<unknown> | undefined;
  try {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pending = fixture.run();
    const settled = vi.fn();
    void pending.then(settled);
    await bounded(fixture.heldStart, 'held startup acknowledgement');
    await vi.advanceTimersByTimeAsync(7000);
    expect(settled).not.toHaveBeenCalled();
    start.resolve();
    await bounded(fixture.heldFulfilled, 'held fulfilled result');
    expect(fixture.slotKeys()).toEqual([]);
    await vi.advanceTimersByTimeAsync(12_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await bounded(pending, 'shared deadline')).toMatchObject({
      error: { code: 'inspector-timeout' },
    });
    result.resolve();
  } finally {
    start.resolve();
    result.resolve();
    try {
      await fixture.close();
      if (pending) await bounded(pending, 'pending CLI cleanup');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  }
});

it.each([
  { preferences: { _A: null, _x: 0, _y: 0, _z: null }, syncing: false, failed: [] },
  {
    preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, secret: 'private-token' },
    syncing: false,
    failed: [],
  },
  { preferences: DEFAULT_NOTIFICATION_PREFERENCES, syncing: 'false', failed: [] },
  { preferences: DEFAULT_NOTIFICATION_PREFERENCES, syncing: false, failed: [null] },
])('rejects an invalid settled owner snapshot without printing it', async (snapshot) => {
  const fixture = await inspectorFixture({
    owner: {
      ready: Promise.resolve(),
      set: vi.fn(),
      getSnapshot: () => snapshot,
    },
  });
  try {
    const result = await bounded(fixture.run(), 'invalid owner snapshot');
    expect(result).toMatchObject({ error: { code: 'inspector-result-required' } });
    expect(JSON.stringify(result)).not.toContain('private-token');
    expect(fixture.slotKeys()).toEqual([]);
  } finally {
    await fixture.close();
  }
});

it('redacts unexpected rejection reasons and disposes the rejected slot', async () => {
  const fixture = await inspectorFixture({
    owner: {
      ready: Promise.resolve(),
      set: vi.fn(),
      getSnapshot: () => {
        throw Error('private-token');
      },
    },
  });
  try {
    const result = await bounded(fixture.run(), 'rejected owner');
    expect(result).toMatchObject({ error: { code: 'inspector-evaluation-failed' } });
    expect(JSON.stringify(result)).not.toContain('private-token');
    expect(fixture.slotKeys()).toEqual([]);
  } finally {
    await fixture.close();
  }
});

it.each([false, true])(
  'expires a pending slot and ignores late settlement after disconnect=%s',
  async (disconnect) => {
    const ready = deferred<void>();
    const fixture = await inspectorFixture({
      disconnectAfterPending: disconnect,
      owner: {
        ready: ready.promise,
        set: vi.fn(),
        getSnapshot: () => ({
          preferences: DEFAULT_NOTIFICATION_PREFERENCES,
          syncing: false,
          failed: [],
        }),
      },
    });
    let pending: Promise<unknown> | undefined;
    try {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      pending = fixture.run();
      const settled = vi.fn();
      void pending.then(settled);
      await bounded(fixture.pendingPoll, 'accepted pending evaluation');
      if (disconnect)
        expect(await bounded(pending, 'disconnected evaluation')).toMatchObject({
          error: { code: 'inspector-closed' },
        });
      await vi.advanceTimersByTimeAsync(19_999);
      if (!disconnect) expect(settled).not.toHaveBeenCalled();
      expect(fixture.slotKeys()).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await bounded(pending, 'operation deadline')).toMatchObject({
        error: { code: disconnect ? 'inspector-closed' : 'inspector-timeout' },
      });
      expect(fixture.slotKeys()).toEqual([]);
      ready.resolve();
      await vi.advanceTimersByTimeAsync(100);
      expect(fixture.slotKeys()).toEqual([]);
    } finally {
      ready.resolve();
      try {
        await fixture.close();
        if (pending) await bounded(pending, 'pending CLI cleanup');
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    }
  },
);

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
  {
    name: 'non-development runtime',
    options: { runtimeDev: false },
    target: 'target',
    expected: { error: { code: 'debug-only' } },
  },
  {
    name: 'uninitialized notification owner',
    options: { modules: 0 },
    target: 'target',
    expected: { error: { code: 'notification-owner-unavailable' } },
  },
  {
    name: 'ambiguous notification owner',
    options: { modules: 2 },
    target: 'target',
    expected: { error: { code: 'notification-owner-unavailable' } },
  },
  {
    name: 'Promise internals instead of a settlement envelope',
    options: { invalidReply: { _A: null, _x: 0, _y: 0, _z: null } },
    target: 'target',
    expected: { error: { code: 'inspector-result-required' } },
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
      params: { returnByValue: true },
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
