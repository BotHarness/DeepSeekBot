import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CdpClient } from '../src/runtime/browser.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'node:child_process';

import {
  browserCandidates,
  buildLaunchArgs,
  connectCdp,
  createBotBrowserRuntime,
  discoverBrowserBinary,
  parseDevToolsUrl,
} from '../src/runtime/browser.js';
import {
  LINUX_CHROME_LIB_REQUIREMENTS,
  type BrowserProvisionError,
} from '../src/runtime/provision.js';

const FULL_LDCONFIG = LINUX_CHROME_LIB_REQUIREMENTS.map(
  (entry) => `\t${entry.soname} (libc6,x86-64) => /lib/x86_64-linux-gnu/${entry.soname}`,
).join('\n');

const spawnMock = vi.mocked(spawn);

beforeEach(() => {
  spawnMock.mockReset();
});

describe('binary discovery and launch arguments', () => {
  it('lists platform candidates in preference order', () => {
    expect(browserCandidates('darwin')[0]).toContain('Google Chrome.app');
    expect(browserCandidates('win32')[0]).toContain('chrome.exe');
    expect(browserCandidates('linux')).toContain('/usr/bin/google-chrome');
    expect(browserCandidates('linux')).toContain('/usr/bin/microsoft-edge');
  });

  it('prefers an explicit browserPath and reports a missing one as absent', () => {
    const exists = (path: string): boolean => path === '/opt/chrome';
    expect(discoverBrowserBinary('/opt/chrome', 'linux', {}, exists)).toBe('/opt/chrome');
    expect(discoverBrowserBinary('/opt/missing', 'linux', {}, exists)).toBeUndefined();
    expect(discoverBrowserBinary('', 'linux', {}, (path) => path === '/usr/bin/chromium')).toBe(
      '/usr/bin/chromium',
    );
  });

  it('launches with a dedicated profile, an ephemeral debugging port, and optional headless', () => {
    const args = buildLaunchArgs({ userDataDir: '/data/browser' });
    expect(args).toContain('--user-data-dir=/data/browser');
    expect(args).toContain('--remote-debugging-port=0');
    expect(args).toContain('--disable-blink-features=AutomationControlled');
    expect(args).toContain('--new-window');
    expect(args).not.toContain('--headless=new');
    expect(buildLaunchArgs({ userDataDir: '/data/browser', headless: true })).toContain(
      '--headless=new',
    );
  });

  it('extracts the DevTools endpoint from Chromium stderr', () => {
    const line =
      'DevTools listening on ws://127.0.0.1:49531/devtools/browser/6b0f1e2a-1111-2222-3333-444455556666';
    expect(parseDevToolsUrl(`noise\n${line}\nmore`)).toBe(
      'ws://127.0.0.1:49531/devtools/browser/6b0f1e2a-1111-2222-3333-444455556666',
    );
    expect(parseDevToolsUrl('nothing here')).toBeUndefined();
  });
});

class FakeWebSocket {
  static last: FakeWebSocket | undefined;
  readonly sent: string[] = [];
  private readonly handlers = new Map<string, (event: { data?: unknown }) => void>();

  constructor(readonly url: string) {
    FakeWebSocket.last = this;
  }

  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    this.handlers.set(type, listener);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.handlers.get('close')?.({});
  }

  open(): void {
    this.handlers.get('open')?.({});
  }

  message(payload: unknown): void {
    this.handlers.get('message')?.({ data: JSON.stringify(payload) });
  }
}

describe('minimal CDP client', () => {
  it('frames requests and resolves replies by id', async () => {
    const connecting = connectCdp('ws://127.0.0.1:1/devtools/browser/x', FakeWebSocket);
    const socket = FakeWebSocket.last!;
    socket.open();
    const client = await connecting;
    const pending = client.send('Target.getTargetInfo', { targetId: 'tab-1' });
    expect(JSON.parse(socket.sent[0]!)).toEqual({
      id: 1,
      method: 'Target.getTargetInfo',
      params: { targetId: 'tab-1' },
    });
    socket.message({ id: 1, result: { targetInfo: { targetId: 'tab-1' } } });
    await expect(pending).resolves.toEqual({ targetInfo: { targetId: 'tab-1' } });
  });

  it('routes chooser events only to the subscribed session and disposes listeners', async () => {
    const connecting = connectCdp('ws://127.0.0.1:1/devtools/browser/x', FakeWebSocket);
    const socket = FakeWebSocket.last!;
    socket.open();
    const client = await connecting;
    const listener = vi.fn();
    const dispose = client.subscribe('Page.fileChooserOpened', 'session-1', listener);
    socket.message({
      method: 'Page.fileChooserOpened',
      sessionId: 'session-2',
      params: { backendNodeId: 99 },
    });
    socket.message({ method: 'Page.loadEventFired', sessionId: 'session-1', params: {} });
    expect(listener).not.toHaveBeenCalled();
    socket.message({
      method: 'Page.fileChooserOpened',
      sessionId: 'session-1',
      params: { backendNodeId: 42 },
    });
    expect(listener).toHaveBeenCalledExactlyOnceWith({ backendNodeId: 42 });
    dispose();
    socket.message({
      method: 'Page.fileChooserOpened',
      sessionId: 'session-1',
      params: { backendNodeId: 43 },
    });
    expect(listener).toHaveBeenCalledOnce();
    client.subscribe('Page.fileChooserOpened', 'session-1', listener);
    socket.close();
    socket.message({
      method: 'Page.fileChooserOpened',
      sessionId: 'session-1',
      params: { backendNodeId: 44 },
    });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('fails requests on CDP errors and on connection loss', async () => {
    const connecting = connectCdp('ws://127.0.0.1:1/devtools/browser/x', FakeWebSocket);
    const socket = FakeWebSocket.last!;
    socket.open();
    const client = await connecting;
    const failed = client.send('Page.navigate');
    socket.message({ id: 1, error: { message: 'Cannot navigate' } });
    await expect(failed).rejects.toThrow('Cannot navigate');
    const pending = client.send('Page.navigate');
    socket.close();
    await expect(pending).rejects.toThrow(/websocket closed/);
    expect(client.isConnected?.()).toBe(false);
    await expect(client.send('Target.createTarget')).rejects.toThrow(/websocket closed/);
    expect(socket.sent).toHaveLength(2);
  });

  it('bounds an unanswered action without replaying it', async () => {
    vi.useFakeTimers();
    try {
      const connecting = connectCdp('ws://127.0.0.1:1/devtools/browser/x', FakeWebSocket);
      FakeWebSocket.last!.open();
      const client = await connecting;
      const result = expect(client.send('Input.dispatchMouseEvent')).rejects.toThrow(
        'inspect the page before retrying',
      );
      await vi.advanceTimersByTimeAsync(30_000);
      await result;
      expect(FakeWebSocket.last!.sent).toHaveLength(1);
      client.close();
    } finally {
      vi.useRealTimers();
    }
  });
});

interface FakeChild {
  readonly proc: EventEmitter & {
    stderr: EventEmitter;
    exitCode: number | null;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
  };
  ready(): void;
}

function fakeChild(): FakeChild {
  const stderr = new EventEmitter();
  const proc = new EventEmitter() as FakeChild['proc'];
  proc.stderr = stderr;
  proc.exitCode = null;
  proc.killed = false;
  proc.kill = vi.fn(() => {
    proc.exitCode = 0;
    proc.emit('exit', 0);
  });
  return {
    proc,
    ready: () =>
      stderr.emit(
        'data',
        Buffer.from('DevTools listening on ws://127.0.0.1:1/devtools/browser/a\n'),
      ),
  };
}

function fakeClient(): CdpClient & { calls: { method: string; sessionId?: string }[] } {
  const calls: { method: string; sessionId?: string }[] = [];
  let clientSend = (_m: string, _p?: Record<string, unknown>, _sid?: string): void => {};
  return {
    calls,
    send: vi.fn(async (method: string, params?: Record<string, unknown>, sessionId?: string) => {
      clientSend(method, params, sessionId);
      calls.push({ method, ...(sessionId === undefined ? {} : { sessionId }) });
      if (method === 'Runtime.evaluate') {
        const expression = String(params?.['expression'] ?? '');
        if (expression === 'document.readyState') return { result: { value: 'complete' } };
        if (expression.startsWith('({ width:')) {
          return { result: { value: { width: 1280, height: 800 } } };
        }
        if (expression.startsWith('({ url:')) {
          return { result: { value: { url: 'https://example.com/', title: 'Example' } } };
        }
        if (expression.includes('const el = document.querySelector(')) {
          return { result: { value: { ok: true } } };
        }
        return {
          result: {
            value: {
              url: 'https://example.com/',
              title: 'Example',
              elements: [{ ref: 'e1', role: 'a', name: 'More' }],
              text: 'Hello world',
            },
          },
        };
      }
      if (method === 'Page.captureScreenshot') return { data: 'Zm9v' };
      if (method === 'Target.createTarget') return { targetId: 'tab-1' };
      if (method === 'Target.attachToTarget') return { sessionId: 'session-1' };
      if (method === 'Page.setInterceptFileChooserDialog') return {};
      if (method === 'DOM.getDocument') return { root: { nodeId: 1 } };
      if (method === 'DOM.querySelector') return { nodeId: 7 };
      if (method === 'DOM.querySelectorAll') return { nodeIds: [7] };
      if (method === 'DOM.setFileInputFiles') return {};
      if (method === 'Target.activateTarget') return {};
      if (method === 'Target.closeTarget') return {};
      if (method === 'Target.getTargetInfo') {
        return { targetInfo: { url: 'https://example.com/', title: 'Example' } };
      }
      if (method === 'Target.getTargets') {
        return {
          targetInfos: [
            { type: 'page', targetId: 'tab-2', url: 'https://example.org/', title: 'Other' },
            { type: 'service_worker', targetId: 'worker-1', url: 'sw.js', title: '' },
          ],
        };
      }
      return {};
    }),
    subscribe: (method, sessionId, listener) => {
      const original = clientSend;
      clientSend = (m, p, sid) => {
        if (
          m === 'Input.dispatchMouseEvent' &&
          p?.['type'] === 'mouseReleased' &&
          sid === sessionId &&
          method === 'Page.fileChooserOpened'
        )
          listener({ backendNodeId: 7 });
        return original(m, p, sid);
      };
      return () => {
        clientSend = original;
      };
    },
    close: vi.fn(),
  };
}

describe('runtime lifecycle', () => {
  it('errors readably when no browser is installed and the Host stays up', async () => {
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: () => false,
    });
    await expect(runtime.ensure()).rejects.toThrow(/No Chrome, Edge, or Chromium/);
    expect(runtime.isRunning()).toBe(false);
  });

  it('launches, opens, reuses the tab, observes, and stops', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const client = fakeClient();
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      connect: async () => client,
    });

    const ensuring = runtime.ensure();
    child.ready();
    await ensuring;
    expect(runtime.isRunning()).toBe(true);
    expect(runtime.binaryPath()).toBe('/usr/bin/google-chrome');
    expect(spawnMock).toHaveBeenCalledWith(
      '/usr/bin/google-chrome',
      expect.arrayContaining(['--remote-debugging-port=0']),
      expect.objectContaining({ stdio: ['ignore', 'ignore', 'pipe'] }),
    );

    const opened = await runtime.open('https://example.com');
    expect(opened).toEqual({ tabId: 'tab-1', url: 'https://example.com/', title: 'Example' });
    expect(client.calls.map((call) => call.method)).toContain('Target.createTarget');
    expect(client.calls.map((call) => call.method)).toContain('Page.navigate');

    const reopened = await runtime.open('https://example.org', 'tab-1');
    expect(reopened.tabId).toBe('tab-1');
    expect(client.calls.filter((call) => call.method === 'Target.createTarget')).toHaveLength(1);

    const observation = await runtime.observe('tab-1');
    expect(observation.elements).toEqual([{ ref: 'e1', role: 'a', name: 'More' }]);
    expect(runtime.currentUrl()).toBe('https://example.com/');

    expect(client.calls.map((call) => call.method)).not.toContain('Target.activateTarget');
    expect(client.calls.map((call) => call.method)).not.toContain('Page.bringToFront');
    await runtime.stop();
    expect(runtime.isRunning()).toBe(false);
    expect(child.proc.kill).toHaveBeenCalled();
  });

  it('shares a single startup for concurrent Browser consumers', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const connect = vi.fn(async () => fakeClient());
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      browserPath: '/opt/chrome',
      fileExists: () => true,
      connect,
    });
    const consumers = Promise.all([runtime.ensure(), runtime.ensure()]);
    child.ready();
    await consumers;
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(runtime.isRunning()).toBe(true);
    await runtime.stop();
  });

  it('permits one fresh retry after shared startup fails', async () => {
    const first = fakeChild();
    const retry = fakeChild();
    spawnMock.mockReturnValue(first.proc as never);
    const connect = vi.fn().mockRejectedValue(new Error('Connection unavailable'));
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      browserPath: '/opt/chrome',
      fileExists: () => true,
      connect,
    });
    const failed = Promise.allSettled([runtime.ensure(), runtime.ensure()]);
    first.ready();
    const outcomes = await failed;
    expect(outcomes).toEqual([
      {
        status: 'rejected',
        reason: expect.objectContaining({ message: 'Connection unavailable' }),
      },
      {
        status: 'rejected',
        reason: expect.objectContaining({ message: 'Connection unavailable' }),
      },
    ]);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    spawnMock.mockReturnValue(retry.proc as never);
    connect.mockResolvedValueOnce(fakeClient());
    const pending = runtime.ensure();
    retry.ready();
    await pending;
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(runtime.isRunning()).toBe(true);
    await runtime.stop();
  });

  it.each(['reuse', 'open', 'new tab'] as const)(
    'rejects a failed %s navigation and permits retry without losing the original error',
    async (kind) => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child.proc as never);
      const client = fakeClient();
      const send = client.send;
      client.send = vi.fn(async (method, params, sessionId) => {
        if (method === 'Page.navigate' && params?.['url'] === 'https://fail.test') {
          return { errorText: 'net::ERR_EMPTY_RESPONSE' };
        }
        return send(method, params, sessionId);
      });
      const runtime = createBotBrowserRuntime({
        userDataDir: '/tmp/browser-test',
        browserPath: '/opt/chrome',
        fileExists: () => true,
        connect: async () => client,
      });
      const ready = runtime.ensure();
      child.ready();
      await ready;
      if (kind === 'reuse') await runtime.open('https://example.com');
      const previous = runtime.currentUrl();
      const failed =
        kind === 'new tab'
          ? runtime.createTab('https://fail.test')
          : runtime.open('https://fail.test', kind === 'reuse' ? 'tab-1' : undefined);
      await expect(failed).rejects.toThrow(
        /navigation failed.*ERR_EMPTY_RESPONSE.*retry browser_open/,
      );
      expect(runtime.currentUrl()).toBe(previous);
      expect(
        vi.mocked(client.send).mock.calls.filter(([method]) => method === 'Target.closeTarget'),
      ).toHaveLength(kind === 'reuse' ? 0 : 1);
      await expect(
        runtime.open('https://example.com', kind === 'reuse' ? 'tab-1' : undefined),
      ).resolves.toMatchObject({ tabId: 'tab-1' });
      await runtime.stop();
    },
  );

  it.each(['reject', 'refuse'])(
    'keeps the navigation error when cleanup fails by %s and records a bounded diagnostic',
    async (failure) => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child.proc as never);
      const client = fakeClient();
      const send = client.send;
      client.send = vi.fn(async (method, params, sessionId) => {
        if (method === 'Page.navigate') return { errorText: 'net::ERR_EMPTY_RESPONSE' };
        if (method === 'Target.closeTarget') {
          if (failure === 'refuse') return { success: false };
          throw new Error('cleanup unavailable');
        }
        return send(method, params, sessionId);
      });
      const onEvent = vi.fn();
      const runtime = createBotBrowserRuntime({
        userDataDir: '/tmp/browser-test',
        browserPath: '/opt/chrome',
        fileExists: () => true,
        connect: async () => client,
        onEvent,
      });
      const ready = runtime.ensure();
      child.ready();
      await ready;
      await expect(runtime.createTab('https://fail.test')).rejects.toThrow(/ERR_EMPTY_RESPONSE/);
      expect(
        vi.mocked(client.send).mock.calls.filter(([method]) => method === 'Target.closeTarget'),
      ).toHaveLength(1);
      expect(onEvent).toHaveBeenCalledWith(expect.stringContaining('navigation cleanup failed'));
      await runtime.stop();
    },
  );

  it.each(['reuse', 'new tab', 'key', 'type', 'delayed navigation', 'context loss'] as const)(
    'reports an unsettled page within the readiness bound after %s',
    async (operation) => {
      vi.useFakeTimers();
      try {
        const child = fakeChild();
        spawnMock.mockReturnValue(child.proc as never);
        const client = fakeClient();
        const send = client.send;
        let loading = false;
        let readinessReads = 0;
        client.send = vi.fn(async (method, params, sessionId) => {
          if (
            loading &&
            method === 'Runtime.evaluate' &&
            params?.['expression'] === 'document.readyState'
          ) {
            readinessReads += 1;
            if (operation === 'context loss' && readinessReads === 1)
              throw new Error('Execution context was destroyed');
            return {
              result: {
                value:
                  operation === 'delayed navigation' && readinessReads === 1
                    ? 'complete'
                    : 'loading',
              },
            };
          }
          return send(method, params, sessionId);
        });
        const runtime = createBotBrowserRuntime({
          userDataDir: '/tmp/browser-test',
          browserPath: '/opt/chrome',
          fileExists: () => true,
          connect: async () => client,
        });
        const ready = runtime.ensure();
        child.ready();
        await ready;
        const opened = runtime.open('https://example.com');
        await vi.advanceTimersByTimeAsync(200);
        await opened;
        loading = true;
        const started = Date.now();
        const pending =
          operation === 'reuse'
            ? runtime.open('https://loading.test', 'tab-1')
            : operation === 'new tab'
              ? runtime.createTab('https://loading.test')
              : operation === 'key' ||
                  operation === 'delayed navigation' ||
                  operation === 'context loss'
                ? runtime.pressKey('tab-1', 'Enter')
                : runtime.type('tab-1', 'e1', 'synthetic query');
        const outcome = pending.then(
          () => undefined,
          (error: unknown) => error,
        );
        await vi.advanceTimersByTimeAsync(15000);
        expect(await outcome).toMatchObject({
          message: expect.stringMatching(/did not settle within 15000ms.*browser_observe/),
        });
        expect(Date.now() - started).toBe(15000);
        expect(
          vi.mocked(client.send).mock.calls.filter(([method]) => method === 'Target.closeTarget'),
        ).toHaveLength(operation === 'new tab' ? 1 : 0);
        loading = false;
        await expect(runtime.observe('tab-1')).resolves.toMatchObject({ text: 'Hello world' });
        const retry = runtime.open('https://example.com', 'tab-1');
        await vi.advanceTimersByTimeAsync(200);
        await expect(retry).resolves.toMatchObject({ tabId: 'tab-1' });
        await runtime.stop();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('bounds a stalled new-target cleanup and still returns the navigation error', async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild();
      spawnMock.mockReturnValue(child.proc as never);
      const client = fakeClient();
      const send = client.send;
      client.send = vi.fn(async (method, params, sessionId) => {
        if (method === 'Page.navigate') return { errorText: 'net::ERR_EMPTY_RESPONSE' };
        if (method === 'Target.closeTarget') return new Promise<never>(() => {});
        return send(method, params, sessionId);
      });
      const onEvent = vi.fn();
      const runtime = createBotBrowserRuntime({
        userDataDir: '/tmp/browser-test',
        browserPath: '/opt/chrome',
        fileExists: () => true,
        connect: async () => client,
        onEvent,
      });
      const ready = runtime.ensure();
      child.ready();
      await ready;
      const failed = runtime.createTab('https://fail.test').then(
        () => undefined,
        (error: unknown) => error,
      );
      await vi.advanceTimersByTimeAsync(2000);
      expect(await failed).toMatchObject({
        message: expect.stringContaining('ERR_EMPTY_RESPONSE'),
      });
      expect(onEvent).toHaveBeenCalledWith(expect.stringContaining('navigation cleanup failed'));
      await runtime.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts successful same-document navigation without a loader ID', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const client = fakeClient();
    const send = client.send;
    client.send = vi.fn(async (method, params, sessionId) => {
      if (method === 'Page.navigate') return { frameId: 'frame-1' };
      return send(method, params, sessionId);
    });
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      browserPath: '/opt/chrome',
      fileExists: () => true,
      connect: async () => client,
    });
    const ready = runtime.ensure();
    child.ready();
    await ready;
    await expect(runtime.open('https://example.com/#section', 'tab-1')).resolves.toMatchObject({
      tabId: 'tab-1',
    });
    expect(
      vi.mocked(client.send).mock.calls.some(([method]) => method === 'Target.closeTarget'),
    ).toBe(false);
    await runtime.stop();
  });

  it('reveals the existing Human tab and restores a minimized window without a new target', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const client = fakeClient();
    const send = client.send;
    client.send = vi.fn(async (method, params, sessionId) => {
      if (method === 'Browser.getWindowForTarget') {
        return { windowId: 7, bounds: { windowState: 'minimized' } };
      }
      return send(method, params, sessionId);
    });
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'darwin',
      env: {},
      fileExists: (path) => path.includes('Google Chrome.app'),
      connect: async () => client,
    });
    const ensuring = runtime.ensure();
    child.ready();
    await ensuring;
    await expect(runtime.openWindow('tab-2')).resolves.toMatchObject({
      tabId: 'tab-2',
      title: 'Example',
    });
    expect(client.send).toHaveBeenCalledWith('Browser.setWindowBounds', {
      windowId: 7,
      bounds: { windowState: 'normal' },
    });
    expect(client.send).toHaveBeenCalledWith('Target.activateTarget', { targetId: 'tab-2' });
    expect(client.send).toHaveBeenCalledWith('Page.bringToFront', {}, 'session-1');
    expect(client.calls.some((call) => call.method === 'Target.createTarget')).toBe(false);
  });

  it('opens the Human sign-in window', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const client = fakeClient();
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'darwin',
      env: {},
      fileExists: (path) => path.includes('Google Chrome.app'),
      connect: async () => client,
    });
    const ensuring = runtime.ensure();
    child.ready();
    await ensuring;
    const window = await runtime.openWindow();
    expect(window.tabId).toBe('tab-1');
  });

  it('opens background tabs in the Bot window and lists or closes them', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const base = fakeClient();
    const sent: { method: string; params?: Record<string, unknown> }[] = [];
    const client: CdpClient = {
      send: async (method, params, sessionId) => {
        sent.push({ method, ...(params === undefined ? {} : { params }) });
        if (method === 'Target.createTarget') return { targetId: 'tab-2' };
        return base.send(method, params, sessionId);
      },
      subscribe: (method, sessionId, listener) => base.subscribe(method, sessionId, listener),
      close: () => base.close(),
    };
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      connect: async () => client,
    });
    const ensuring = runtime.ensure();
    child.ready();
    await ensuring;
    await runtime.open('https://example.com');
    const tab = await runtime.createTab('https://example.org');
    expect(tab.tabId).toBe('tab-2');
    expect(sent.some((call) => call.method === 'Target.activateTarget')).toBe(false);
    const create = sent.find(
      (call) => call.method === 'Target.createTarget' && call.params?.['background'] === true,
    );
    expect(create?.params).toEqual({
      url: 'about:blank',
      background: true,
      focus: false,
    });
    const tabs = await runtime.listTabs();
    expect(tabs).toEqual([{ targetId: 'tab-2', url: 'https://example.org/', title: 'Other' }]);
    const info = await runtime.tabInfo('tab-2');
    expect(info.url).toBe('https://example.com/');
    await runtime.closeTab('tab-2');
    expect(sent.some((call) => call.method === 'Target.closeTarget')).toBe(true);
  });

  it('opens its first background tab before the startup window exists', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const base = fakeClient();
    const targets: Record<string, unknown>[] = [];
    const client: CdpClient = {
      send: async (method, params, sessionId) => {
        if (method === 'Target.createTarget') {
          if (targets.length === 0 && params?.['newWindow'] === false)
            throw new Error('Failed to open new tab - no browser is open');
          targets.push(params ?? {});
        }
        return base.send(method, params, sessionId);
      },
      subscribe: (method, sessionId, listener) => base.subscribe(method, sessionId, listener),
      close: () => base.close(),
    };
    const runtime = createBotBrowserRuntime({
      userDataDir: join(tmpdir(), 'browser-startup-window'),
      platform: 'win32',
      browserPath: 'chrome.exe',
      fileExists: () => true,
      connect: async () => client,
    });
    const opening = runtime.open('https://example.com');
    child.ready();
    try {
      expect((await opening).tabId).toBe('tab-1');
      await runtime.createTab('https://example.org');
      expect(targets).toEqual([
        { url: 'about:blank', background: true, focus: false },
        { url: 'about:blank', background: true, focus: false },
      ]);
      expect(base.calls.some((call) => call.method === 'Target.activateTarget')).toBe(false);
      expect(base.calls.some((call) => call.method === 'Page.bringToFront')).toBe(false);
    } finally {
      await runtime.stop();
    }
  });

  it('uploads a Host file into the page file input, and reports a page without one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'browser-upload-'));
    const file = join(dir, 'shot.jpg');
    writeFileSync(file, 'x');
    try {
      const child = fakeChild();
      spawnMock.mockReturnValue(child.proc as never);
      const base = fakeClient();
      const sent: { method: string; params?: Record<string, unknown> }[] = [];
      let inputs: number[] = [7];
      const client: CdpClient = {
        send: async (method, params, sessionId) => {
          sent.push({ method, ...(params === undefined ? {} : { params }) });
          if (method === 'DOM.querySelector') return { nodeId: inputs[0] };
          return base.send(method, params, sessionId);
        },
        subscribe: (method, sessionId, listener) => base.subscribe(method, sessionId, listener),
        close: () => base.close(),
      };
      const runtime = createBotBrowserRuntime({
        userDataDir: '/tmp/browser-test',
        platform: 'linux',
        env: {},
        fileExists: (path) => path === '/usr/bin/google-chrome',
        connect: async () => client,
      });
      const ensuring = runtime.ensure();
      child.ready();
      await ensuring;
      await runtime.open('https://example.com');
      await runtime.uploadFile('tab-1', { ref: 'e3', path: file });
      const setFiles = sent.find((call) => call.method === 'DOM.setFileInputFiles');
      expect(setFiles?.params).toEqual({ files: [file], backendNodeId: 7 });
      expect(sent.some((call) => call.method === 'Page.setInterceptFileChooserDialog')).toBe(true);

      inputs = [];
      await expect(runtime.uploadFile('tab-1', { path: file })).rejects.toThrow(/no file input/);
      await expect(runtime.uploadFile('tab-1', { path: join(dir, 'missing.jpg') })).rejects.toThrow(
        /does not exist/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    { name: 'exact input', nodeId: 7, ref: 'e3', kind: 'file' },
    { name: 'missing input', nodeId: 0, ref: 'e3', kind: 'missing' },
    { name: 'invalid input node', nodeId: -1, ref: 'e3', kind: 'missing' },
    { name: 'unavailable input node', nodeId: undefined, ref: 'e3', kind: 'missing' },
    { name: 'stale input ref', nodeId: 7, ref: 'e3', kind: 'stale' },
    { name: 'input transport failure', nodeId: 7, ref: 'e3', kind: 'transport' },
    { name: 'omitted ref fallback', nodeId: 7, ref: undefined, kind: 'fallback' },
  ])('targets an upload without silently changing fields: $name', async ({ nodeId, ref, kind }) => {
    const dir = mkdtempSync(join(tmpdir(), 'browser-upload-target-'));
    const file = join(dir, 'target.txt');
    writeFileSync(file, 'target');
    try {
      const child = fakeChild();
      spawnMock.mockReturnValue(child.proc as never);
      const base = fakeClient();
      const sent: { method: string; params?: Record<string, unknown>; sessionId?: string }[] = [];
      const runtime = createBotBrowserRuntime({
        userDataDir: '/tmp/browser-test',
        platform: 'linux',
        env: {},
        fileExists: (path) => path === '/usr/bin/google-chrome',
        connect: async () => ({
          send: async (method, params, sessionId) => {
            sent.push({
              method,
              ...(params === undefined ? {} : { params }),
              ...(sessionId === undefined ? {} : { sessionId }),
            });
            if (
              method === 'Runtime.evaluate' &&
              String(params?.['expression']).includes('fileInput')
            )
              return {
                result: {
                  value:
                    kind === 'stale'
                      ? { ok: false, reason: 'stale-ref' }
                      : { ok: true, fileInput: true },
                },
              };
            if (method === 'DOM.querySelector') return { nodeId };
            if (method === 'DOM.querySelectorAll') return { nodeIds: [7, 9] };
            if (method === 'DOM.setFileInputFiles' && kind === 'transport')
              throw new Error('file input transport failed');
            return base.send(method, params, sessionId);
          },
          subscribe: (method, sessionId, listener) => base.subscribe(method, sessionId, listener),
          close: () => base.close(),
        }),
      });
      const ensuring = runtime.ensure();
      child.ready();
      await ensuring;
      const uploading = runtime.uploadFile('tab-1', {
        path: file,
        ...(ref === undefined ? {} : { ref }),
      });
      if (kind === 'missing')
        await expect(uploading).rejects.toThrow(/referenced file input.*unavailable/i);
      else if (kind === 'stale') await expect(uploading).rejects.toThrow(/stale/);
      else if (kind === 'transport')
        await expect(uploading).rejects.toThrow('file input transport failed');
      else await uploading;
      const files = sent.filter((call) => call.method === 'DOM.setFileInputFiles');
      if (kind === 'missing' || kind === 'stale') expect(files).toEqual([]);
      else
        expect(files).toEqual([
          {
            method: 'DOM.setFileInputFiles',
            params: { files: [file], nodeId: 7 },
            sessionId: 'session-1',
          },
        ]);
      if (kind !== 'fallback') {
        expect(sent.some((call) => call.method === 'DOM.querySelectorAll')).toBe(false);
        expect(sent.some((call) => call.method === 'Input.dispatchMouseEvent')).toBe(false);
        expect(sent.some((call) => call.method === 'Page.setInterceptFileChooserDialog')).toBe(
          false,
        );
      }
      if (kind === 'file')
        expect(sent.find((call) => call.method === 'DOM.querySelector')).toEqual({
          method: 'DOM.querySelector',
          params: { nodeId: 1, selector: 'input[type="file"][data-botharness-ref="e3"]' },
          sessionId: 'session-1',
        });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects coordinate clicks outside the viewport with a re-screenshot hint', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const base = fakeClient();
    const client: CdpClient = {
      send: async (method, params, sessionId) => base.send(method, params, sessionId),
      subscribe: (method, sessionId, listener) => base.subscribe(method, sessionId, listener),
      close: () => base.close(),
    };
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      connect: async () => client,
    });
    const ensuring = runtime.ensure();
    child.ready();
    await ensuring;
    await runtime.open('https://example.com');
    await expect(runtime.clickAt('tab-1', 2000, 10)).rejects.toThrow(/outside the viewport/);
    await expect(runtime.clickAt('tab-1', 1280, 0)).rejects.toThrow(/outside the viewport/);
    await expect(runtime.clickAt('tab-1', 0, 800)).rejects.toThrow(/outside the viewport/);
    await expect(runtime.clickAt('tab-1', 1279, 799)).resolves.toMatchObject({ tabId: 'tab-1' });
    expect(base.calls.map((call) => call.method)).toContain('Input.dispatchMouseEvent');
  });

  it.each(['opened', 'missing', 'transport'] as const)(
    'uses the chooser input instead of an unrelated field and cleans up: %s',
    async (kind) => {
      const dir = mkdtempSync(join(tmpdir(), 'browser-upload-chooser-'));
      const file = join(dir, 'shot.jpg');
      writeFileSync(file, 'x');
      try {
        const child = fakeChild();
        spawnMock.mockReturnValue(child.proc as never);
        const base = fakeClient();
        const dispose = vi.fn();
        let listener: ((params: Record<string, unknown>) => void) | undefined;
        const sent: { method: string; params?: Record<string, unknown> }[] = [];
        const runtime = createBotBrowserRuntime({
          userDataDir: '/tmp/browser-test',
          platform: 'linux',
          env: {},
          fileExists: (path) => path === '/usr/bin/google-chrome',
          connect: async () => ({
            subscribe: (method, sessionId, callback) => {
              expect(method).toBe('Page.fileChooserOpened');
              expect(sessionId).toBe('session-1');
              listener = callback;
              return dispose;
            },
            send: async (method, params, sessionId) => {
              sent.push({ method, ...(params === undefined ? {} : { params }) });
              if (method === 'DOM.querySelectorAll') return { nodeIds: [7, 9] };
              if (
                method === 'Input.dispatchMouseEvent' &&
                params?.['type'] === 'mouseReleased' &&
                kind !== 'missing'
              )
                setTimeout(() => listener?.({ backendNodeId: 42 }), 20);
              if (method === 'DOM.setFileInputFiles' && kind === 'transport')
                throw Error('upload transport failed');
              return base.send(method, params, sessionId);
            },
            close: () => base.close(),
          }),
        });
        const ensuring = runtime.ensure();
        child.ready();
        await ensuring;
        const uploading = runtime.uploadFile('tab-1', { ref: 'e3', path: file });
        if (kind === 'missing')
          await expect(uploading).rejects.toThrow(/did not open a file input/);
        else if (kind === 'transport')
          await expect(uploading).rejects.toThrow('upload transport failed');
        else await uploading;
        expect(sent.filter((c) => c.method === 'DOM.setFileInputFiles')).toEqual(
          kind === 'missing'
            ? []
            : [{ method: 'DOM.setFileInputFiles', params: { files: [file], backendNodeId: 42 } }],
        );
        expect(sent.some((c) => c.method === 'DOM.querySelectorAll')).toBe(false);
        expect(sent.some((c) => c.method === 'Page.enable')).toBe(true);
        expect(
          sent
            .filter((c) => c.method === 'Page.setInterceptFileChooserDialog')
            .map((c) => c.params),
        ).toEqual([{ enabled: true }, { enabled: false }]);
        expect(dispose).toHaveBeenCalledOnce();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it.each([
    ['Enter', 'Enter', 'Enter', 13, '\r'],
    ['Tab', 'Tab', 'Tab', 9, ''],
    ['Backspace', 'Backspace', 'Backspace', 8, ''],
    ['ArrowDown', 'ArrowDown', 'ArrowDown', 40, ''],
    ['Escape', 'Escape', 'Escape', 27, ''],
    ['Space', ' ', 'Space', 32, ' '],
    ['z', 'z', 'KeyZ', 90, 'z'],
    ['Z', 'Z', 'KeyZ', 90, 'Z'],
    ['7', '7', 'Digit7', 55, '7'],
    ['!', '!', 'Digit1', 49, '!'],
  ])(
    'dispatches native %s key down/up with editing metadata',
    async (input, key, code, vk, text) => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child.proc as never);
      const base = fakeClient();
      const sent: { params: Record<string, unknown>; sessionId: string | undefined }[] = [];
      const client: CdpClient = {
        send: async (method, params, sessionId) => {
          if (method === 'Input.dispatchKeyEvent') sent.push({ params: params ?? {}, sessionId });
          return base.send(method, params, sessionId);
        },
        subscribe: (method, sessionId, listener) => base.subscribe(method, sessionId, listener),
        close: () => base.close(),
      };
      const runtime = createBotBrowserRuntime({
        userDataDir: '/tmp/browser-test',
        platform: 'linux',
        env: {},
        fileExists: (path) => path === '/usr/bin/google-chrome',
        connect: async () => client,
      });
      const ensuring = runtime.ensure();
      child.ready();
      await ensuring;
      await runtime.open('https://example.com');
      const page = await runtime.pressKey('tab-1', input);
      expect(page.tabId).toBe('tab-1');
      expect(sent).toEqual([
        {
          params: {
            type: text ? 'keyDown' : 'rawKeyDown',
            key,
            code,
            windowsVirtualKeyCode: vk,
            ...(text ? { text, unmodifiedText: text } : {}),
          },
          sessionId: 'session-1',
        },
        { params: { type: 'keyUp', key, code, windowsVirtualKeyCode: vk }, sessionId: 'session-1' },
      ]);
    },
  );

  it('updates the current URL when a native Enter navigates the page', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const base = fakeClient();
    let navigated = false;
    const client: CdpClient = {
      send: async (method, params, sessionId) => {
        if (method === 'Input.dispatchKeyEvent' && params?.['type'] === 'keyDown') navigated = true;
        if (
          method === 'Runtime.evaluate' &&
          String(params?.['expression']).startsWith('({ url:') &&
          navigated
        ) {
          return {
            result: { value: { url: 'https://example.com/submitted', title: 'Submitted' } },
          };
        }
        return base.send(method, params, sessionId);
      },
      subscribe: (method, sessionId, listener) => base.subscribe(method, sessionId, listener),
      close: () => base.close(),
    };
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      connect: async () => client,
    });
    const ensuring = runtime.ensure();
    child.ready();
    await ensuring;
    await runtime.open('https://example.com');
    expect(runtime.currentUrl()).toBe('https://example.com/');
    const page = await runtime.pressKey('tab-1', 'Enter');
    expect(page.url).toBe('https://example.com/submitted');
    expect(runtime.currentUrl()).toBe(page.url);
  });

  it.each(['Control+Enter', 'UnrecognizedKey', '', '\n', '😀'])(
    'rejects unsupported key %j before any CDP operation',
    async (key) => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child.proc as never);
      const client = fakeClient();
      const runtime = createBotBrowserRuntime({
        userDataDir: '/tmp/browser-test',
        platform: 'linux',
        env: {},
        fileExists: (path) => path === '/usr/bin/google-chrome',
        connect: async () => client,
      });
      const ensuring = runtime.ensure();
      child.ready();
      await ensuring;
      client.calls.length = 0;
      await expect(runtime.pressKey('tab-1', key)).rejects.toThrow(/unsupported.*key/i);
      expect(client.calls).toEqual([]);
    },
  );

  it('releases the native key when key-down transport fails and preserves the original error', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const base = fakeClient();
    const types: unknown[] = [];
    const client: CdpClient = {
      send: async (method, params, sessionId) => {
        if (method === 'Input.dispatchKeyEvent') {
          types.push(params?.['type']);
          throw new Error(params?.['type'] === 'keyUp' ? 'release refused' : 'input disconnected');
        }
        return base.send(method, params, sessionId);
      },
      subscribe: (method, sessionId, listener) => base.subscribe(method, sessionId, listener),
      close: () => base.close(),
    };
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      connect: async () => client,
    });
    const ensuring = runtime.ensure();
    child.ready();
    await ensuring;
    await expect(runtime.pressKey('tab-1', 'Enter')).rejects.toThrow('input disconnected');
    expect(types).toEqual(['keyDown', 'keyUp']);
  });

  it.each([
    ['down', 600],
    ['up', -600],
  ] as const)('dispatches a native %s wheel at the viewport center', async (direction, deltaY) => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const base = fakeClient();
    const wheels: { params: Record<string, unknown>; sessionId?: string }[] = [];
    const expressions: string[] = [];
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      connect: async () => ({
        send: async (method, params, sessionId) => {
          if (method === 'Input.dispatchMouseEvent' && params?.['type'] === 'mouseWheel')
            wheels.push({
              params: params ?? {},
              ...(sessionId === undefined ? {} : { sessionId }),
            });
          if (method === 'Runtime.evaluate') expressions.push(String(params?.['expression']));
          return base.send(method, params, sessionId);
        },
        subscribe: (method, sessionId, listener) => base.subscribe(method, sessionId, listener),
        close: () => base.close(),
      }),
    });
    const ensuring = runtime.ensure();
    child.ready();
    await ensuring;
    const page = await runtime.scroll('tab-1', direction, 600);
    expect(wheels).toEqual([
      { params: { type: 'mouseWheel', x: 640, y: 400, deltaX: 0, deltaY }, sessionId: 'session-1' },
    ]);
    expect(expressions.some((expression) => expression.includes('window.scrollBy'))).toBe(false);
    expect(page).toEqual({ tabId: 'tab-1', url: 'https://example.com/', title: 'Example' });
    expect(runtime.currentUrl()).toBe('https://example.com/');
    expect(
      base.calls.filter(
        (call) =>
          call.method === 'Emulation.setFocusEmulationEnabled' ||
          call.method === 'Input.dispatchMouseEvent',
      ),
    ).toEqual([
      { method: 'Emulation.setFocusEmulationEnabled', sessionId: 'session-1' },
      { method: 'Input.dispatchMouseEvent', sessionId: 'session-1' },
      { method: 'Input.dispatchMouseEvent', sessionId: 'session-1' },
    ]);
    await runtime.scroll('tab-1', direction, 600);
    expect(
      base.calls.filter((call) => call.method === 'Emulation.setFocusEmulationEnabled'),
    ).toHaveLength(1);
  });

  it('surfaces a wheel transport failure instead of returning success', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const base = fakeClient();
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      connect: async () => ({
        send: async (method, params, sessionId) => {
          if (method === 'Input.dispatchMouseEvent' && params?.['type'] === 'mouseWheel')
            throw new Error('wheel transport failed');
          return base.send(method, params, sessionId);
        },
        subscribe: (method, sessionId, listener) => base.subscribe(method, sessionId, listener),
        close: () => base.close(),
      }),
    });
    const ensuring = runtime.ensure();
    child.ready();
    await ensuring;
    await expect(runtime.scroll('tab-1', 'down', 600)).rejects.toThrow('wheel transport failed');
  });

  it.each([
    { width: 0, height: 800 },
    { width: 1280, height: 0 },
    { width: NaN, height: 800 },
    { height: 800 },
  ])('refuses unavailable viewport bounds before wheel dispatch: %j', async (bounds) => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const base = fakeClient();
    const wheel = vi.fn();
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      connect: async () => ({
        send: async (method, params, sessionId) => {
          if (
            method === 'Runtime.evaluate' &&
            String(params?.['expression']).startsWith('({ width:')
          )
            return { result: { value: bounds } };
          if (method === 'Input.dispatchMouseEvent') wheel();
          return base.send(method, params, sessionId);
        },
        subscribe: (method, sessionId, listener) => base.subscribe(method, sessionId, listener),
        close: () => base.close(),
      }),
    });
    const ensuring = runtime.ensure();
    child.ready();
    await ensuring;
    await expect(runtime.scroll('tab-1', 'down', 600)).rejects.toThrow(/viewport/);
    expect(wheel).not.toHaveBeenCalled();
  });

  it('acts on observed refs and surfaces a stale ref readably', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const base = fakeClient();
    const expressions: string[] = [];
    let stale = false;
    const client: CdpClient = {
      send: async (method, params, sessionId) => {
        if (method === 'Runtime.evaluate') {
          const expression = String(params?.['expression'] ?? '');
          expressions.push(expression);
          if (expression.includes('const el = document.querySelector(')) {
            return { result: { value: stale ? { ok: false, reason: 'stale-ref' } : { ok: true } } };
          }
        }
        return base.send(method, params, sessionId);
      },
      subscribe: (method, sessionId, listener) => base.subscribe(method, sessionId, listener),
      close: () => base.close(),
    };
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      connect: async () => client,
    });
    const ensuring = runtime.ensure();
    child.ready();
    await ensuring;
    await runtime.open('https://example.com');
    const page = await runtime.click('tab-1', 'e3');
    expect(page.url).toBe('https://example.com/');
    expect(expressions.some((expression) => expression.includes('data-botharness-ref'))).toBe(true);
    await runtime.type('tab-1', 'e2', 'hello');
    expect(expressions.some((expression) => expression.includes('hello'))).toBe(true);
    stale = true;
    await expect(runtime.click('tab-1', 'e9')).rejects.toThrow(/stale/);
  });

  it.each(['click', 'key'] as const)(
    'prepares a background Session before native %s input without foreground activation',
    async (operation) => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child.proc as never);
      const base = fakeClient();
      let prepared = false;
      const runtime = createBotBrowserRuntime({
        userDataDir: '/tmp/browser-test',
        browserPath: '/opt/chrome',
        fileExists: () => true,
        connect: async () => ({
          send: async (method, params, sessionId) => {
            if (method === 'Emulation.setFocusEmulationEnabled') prepared = true;
            if (method.startsWith('Input.') && !prepared)
              throw new Error('Background page is not focused for input');
            if (
              method === 'Runtime.evaluate' &&
              String(params?.['expression']).includes('const el = document.querySelector(')
            )
              return { result: { value: { ok: true, x: 100, y: 100 } } };
            return base.send(method, params, sessionId);
          },
          subscribe: (method, sessionId, listener) => base.subscribe(method, sessionId, listener),
          close: () => base.close(),
        }),
      });
      const ensuring = runtime.ensure();
      child.ready();
      await ensuring;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await expect(
          operation === 'click' ? runtime.click('tab-1', 'e1') : runtime.pressKey('tab-1', 'Enter'),
        ).resolves.toMatchObject({ tabId: 'tab-1' });
      }
      expect(base.calls.some((call) => call.method === 'Target.activateTarget')).toBe(false);
      await runtime.stop();
    },
  );

  it('captures a JPEG frame and retries with focus emulation when the first take fails', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const base = fakeClient();
    let captures = 0;
    const client: CdpClient = {
      send: async (method, params, sessionId) => {
        if (method === 'Page.captureScreenshot') {
          captures += 1;
          if (captures === 1) throw new Error('no frame');
        }
        return base.send(method, params, sessionId);
      },
      subscribe: (method, sessionId, listener) => base.subscribe(method, sessionId, listener),
      close: () => base.close(),
    };
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      connect: async () => client,
    });
    const ensuring = runtime.ensure();
    child.ready();
    await ensuring;
    await runtime.open('https://example.com');
    const shot = await runtime.captureScreenshot('tab-1');
    expect(shot).toEqual({ data: 'Zm9v', mimeType: 'image/jpeg' });
    expect(base.calls.map((call) => call.method)).toContain('Emulation.setFocusEmulationEnabled');
  });

  it('retries input preparation after a best-effort screenshot focus failure', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const base = fakeClient();
    let captures = 0;
    let preparations = 0;
    let prepared = false;
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      browserPath: '/opt/chrome',
      fileExists: () => true,
      connect: async () => ({
        send: async (method, params, sessionId) => {
          if (method === 'Page.captureScreenshot' && ++captures === 1)
            throw new Error('No initial frame');
          if (method === 'Emulation.setFocusEmulationEnabled') {
            if (++preparations === 1) throw new Error('Temporary focus failure');
            prepared = true;
          }
          if (method.startsWith('Input.') && !prepared)
            throw new Error('Background page is not focused for input');
          return base.send(method, params, sessionId);
        },
        subscribe: (method, sessionId, listener) => base.subscribe(method, sessionId, listener),
        close: () => base.close(),
      }),
    });
    const ensuring = runtime.ensure();
    child.ready();
    await ensuring;
    await expect(runtime.captureScreenshot('tab-1')).resolves.toMatchObject({
      mimeType: 'image/jpeg',
    });
    await expect(runtime.pressKey('tab-1', 'Enter')).resolves.toMatchObject({ tabId: 'tab-1' });
    expect(preparations).toBe(2);
    expect(base.calls.some((call) => call.method === 'Target.activateTarget')).toBe(false);
    await runtime.stop();
  });

  it('installs the pinned fallback when no system browser exists', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const client = fakeClient();
    const installs: string[] = [];
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: () => false,
      installDir: '/tmp/browser-cache',
      installFallback: async (installDir) => {
        installs.push(installDir);
        return '/tmp/browser-cache/chrome-linux64/chrome';
      },
      connect: async () => client,
    });
    const ensuring = runtime.ensure();
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
    child.ready();
    await ensuring;
    expect(installs).toEqual(['/tmp/browser-cache']);
    expect(runtime.binaryPath()).toBe('/tmp/browser-cache/chrome-linux64/chrome');
    expect(spawnMock).toHaveBeenCalledWith(
      '/tmp/browser-cache/chrome-linux64/chrome',
      expect.anything(),
      expect.anything(),
    );
  });

  it('reports a readable error when the pinned fallback cannot install', async () => {
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: () => false,
      installDir: '/tmp/browser-cache',
      installFallback: async () => {
        throw new Error('network down');
      },
      preflight: { run: () => FULL_LDCONFIG },
    });
    const failure = await runtime.ensure().then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({ code: 'provision-no-network' });
    expect(String((failure as Error).message)).toMatch(/looks offline/);
    expect((failure as { detail?: string }).detail).toBe('network down');
  });
});

describe('first-run provisioning UX', () => {
  it('reports download progress and settles it after install', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const client = fakeClient();
    const progress: [number, number][] = [];
    const settled = vi.fn();
    const events: string[] = [];
    const installs: string[] = [];
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: () => false,
      installDir: '/tmp/browser-cache',
      installFallback: async (installDir, hooks) => {
        installs.push(installDir);
        hooks?.onProgress?.(30, 100);
        hooks?.onProgress?.(100, 100);
        return '/tmp/browser-cache/chrome-linux64/chrome';
      },
      preflight: { run: () => FULL_LDCONFIG },
      onEvent: (detail) => events.push(detail),
      onInstallProgress: (downloaded, total) => progress.push([downloaded, total]),
      onInstallSettled: settled,
      connect: async () => client,
    });
    const ensuring = runtime.ensure();
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
    child.ready();
    await ensuring;
    expect(installs).toEqual(['/tmp/browser-cache']);
    expect(progress).toEqual([
      [0, 0],
      [30, 100],
      [100, 100],
    ]);
    expect(settled).toHaveBeenCalledOnce();
    expect(events.some((event) => event.includes('installing Chrome for Testing'))).toBe(true);
    expect(events.some((event) => event.includes('install progress'))).toBe(true);
    expect(events.some((event) => event.startsWith('installed '))).toBe(true);
    expect(runtime.binaryPath()).toBe('/tmp/browser-cache/chrome-linux64/chrome');
    await runtime.stop();
  });

  it('refuses to download when system libraries are missing, before any install', async () => {
    const installer = vi.fn(async () => '/tmp/browser-cache/chrome');
    const onProgress = vi.fn();
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: () => false,
      installDir: '/tmp/browser-cache',
      installFallback: installer,
      preflight: { run: () => '\tlibc.so.6 (libc6,x86-64) => /lib/libc.so.6\n' },
      onInstallProgress: onProgress,
    });
    const failure = (await runtime.ensure().then(
      () => undefined,
      (error: unknown) => error,
    )) as BrowserProvisionError;
    expect(failure.code).toBe('provision-missing-libs');
    expect(failure.message).toMatch(/nothing was downloaded/);
    expect(failure.message).toMatch(/libatk-1\.0\.so\.0/);
    expect(failure.detail).toContain('sudo apt install -y');
    expect(installer).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it.each([
    ['network', new Error('getaddrinfo EAI_AGAIN storage.googleapis.com'), 'provision-no-network'],
    [
      'disk',
      Object.assign(new Error('write error'), { code: 'ENOSPC' }),
      'provision-no-disk-space',
    ],
    ['permission', new Error('EACCES: permission denied, mkdir'), 'provision-no-permission'],
  ])('maps a %s download failure to its cause and action', async (_kind, error, code) => {
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: () => false,
      installDir: '/tmp/browser-cache',
      installFallback: async () => {
        throw error;
      },
      preflight: { run: () => FULL_LDCONFIG },
    });
    const failure = (await runtime.ensure().then(
      () => undefined,
      (cause: unknown) => cause,
    )) as BrowserProvisionError;
    expect(failure.code).toBe(code);
    expect(failure.message).not.toContain((error as Error).message);
  });

  it('diagnoses exit 127 with the missing libraries instead of the bare code', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      preflight: {
        run: (command) => (command === 'ldd' ? '\tlibatk-1.0.so.0 => not found\n' : FULL_LDCONFIG),
      },
      connect: async () => fakeClient(),
    });
    const ensuring = runtime.ensure();
    child.proc.emit('exit', 127);
    const failure = (await ensuring.then(
      () => undefined,
      (error: unknown) => error,
    )) as BrowserProvisionError;
    expect(failure.code).toBe('provision-missing-libs');
    expect(failure.message).toMatch(/libatk-1\.0\.so\.0/);
    expect(failure.detail).toContain('exit code 127');
    expect(failure.detail).toContain('sudo apt install -y');
  });

  it('detects a sandbox refusal from startup stderr', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      preflight: { run: () => '' },
      connect: async () => fakeClient(),
    });
    const ensuring = runtime.ensure();
    child.proc.stderr.emit(
      'data',
      Buffer.from('[42:42] Running as root without --no-sandbox is not supported.\n'),
    );
    child.proc.emit('exit', 1);
    const failure = (await ensuring.then(
      () => undefined,
      (error: unknown) => error,
    )) as BrowserProvisionError;
    expect(failure.code).toBe('startup-sandbox');
    expect(failure.message).not.toMatch(/headless/);
  });

  it('bounds a browser that never reports its endpoint', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      launchTimeoutMs: 50,
      connect: async () => fakeClient(),
    });
    const failure = (await runtime.ensure().then(
      () => undefined,
      (error: unknown) => error,
    )) as BrowserProvisionError;
    expect(failure.code).toBe('startup-timeout');
    expect(failure.message).toMatch(/took longer/);
    await runtime.stop();
  });

  it('reports an explicit missing binary path with its cause', async () => {
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      browserPath: '/opt/missing-chrome',
      fileExists: () => false,
    });
    const failure = (await runtime.ensure().then(
      () => undefined,
      (error: unknown) => error,
    )) as BrowserProvisionError;
    expect(failure.code).toBe('startup-missing-binary');
    expect(failure.message).toContain('/opt/missing-chrome');
  });

  it('maps a spawn refusal for a vanished binary to antivirus-or-permissions guidance', async () => {
    const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
    spawnMock.mockImplementation(((...args: unknown[]) =>
      (actual.spawn as (...inner: unknown[]) => unknown)(...args)) as typeof spawn);
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: () => false,
      installDir: '/tmp/browser-cache',
      installFallback: async () => '/tmp/browser-cache-removed/chrome',
      preflight: { run: () => FULL_LDCONFIG },
    });
    const failure = (await runtime.ensure().then(
      () => undefined,
      (error: unknown) => error,
    )) as BrowserProvisionError;
    expect(failure.code).toBe('startup-spawn-failed');
    expect(failure.message).toMatch(/antivirus/);
    expect(failure.detail).toMatch(/ENOENT/);
  });
});

describe('Container upload execution paths', () => {
  it('validates the Host source once and sends the transferred path to CDP', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'browser-container-upload-'));
    const file = join(directory, 'synthetic.txt');
    writeFileSync(file, 'synthetic upload');
    const remote = '/tmp/botharness-container-only/synthetic.txt';
    const base = fakeClient();
    const dispose = vi.fn(async () => undefined);
    const prepareUpload = vi.fn(async () => ({ path: remote, dispose }));
    const setFiles = vi.fn();
    const runtime = createBotBrowserRuntime({
      userDataDir: directory,
      execution: {
        start: async () => ({ endpoint: 'ws://fixture', binary: 'container' }),
        isRunning: () => true,
        stop: async () => undefined,
        prepareUpload,
      },
      connect: async () => ({
        ...base,
        send: async (method, params, sessionId) => {
          if (method === 'DOM.setFileInputFiles') setFiles(params);
          return base.send(method, params, sessionId);
        },
      }),
    });
    try {
      await runtime.ensure();
      await runtime.uploadFile('tab-1', { path: file });
      expect(prepareUpload).toHaveBeenCalledExactlyOnceWith(file);
      expect(setFiles).toHaveBeenCalledWith({ files: [remote], nodeId: 7 });
      expect(dispose).toHaveBeenCalledOnce();
      await expect(
        runtime.uploadFile('tab-1', { path: join(directory, 'missing') }),
      ).rejects.toThrow('does not exist on the Host');
      expect(prepareUpload).toHaveBeenCalledOnce();
    } finally {
      await runtime.stop();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('Container profile shutdown', () => {
  it('requests graceful Chrome close before releasing transport and owned execution even after a close error', async () => {
    const order: string[] = [];
    let active = false;
    const runtime = createBotBrowserRuntime({
      userDataDir: '/qa/container',
      execution: {
        start: async () => {
          active = true;
          return { endpoint: 'ws://127.0.0.1:1/owned', binary: 'pinned-image' };
        },
        isRunning: () => active,
        stop: async () => {
          order.push('container-stop');
          active = false;
        },
      },
      connect: async () => ({
        send: async (method) => {
          order.push(method);
          throw new Error('already disconnected');
        },
        close: () => {
          order.push('transport-close');
        },
        subscribe: () => () => undefined,
      }),
    });
    await runtime.ensure();
    await runtime.stop();
    expect(order).toEqual(['Browser.close', 'transport-close', 'container-stop']);
    expect(runtime.isRunning()).toBe(false);
  });
  it('still releases owned execution after a debugger that never acknowledges close', async () => {
    vi.useFakeTimers();
    const stopExecution = vi.fn(async () => undefined);
    const close = vi.fn();
    const runtime = createBotBrowserRuntime({
      userDataDir: '/qa/container',
      execution: {
        start: async () => ({ endpoint: 'ws://127.0.0.1:1/owned', binary: 'pinned-image' }),
        isRunning: () => true,
        stop: stopExecution,
      },
      connect: async () => ({
        send: () => new Promise(() => undefined),
        close,
        subscribe: () => () => undefined,
      }),
    });
    try {
      await runtime.ensure();
      const stopped = runtime.stop();
      await vi.advanceTimersByTimeAsync(1_999);
      expect(stopExecution).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await stopped;
      expect(close).toHaveBeenCalledOnce();
      expect(stopExecution).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
