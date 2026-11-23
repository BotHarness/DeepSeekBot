import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  browserCandidates,
  buildLaunchArgs,
  createBotBrowserRuntime,
  discoverBrowserBinary,
  parseDevToolsUrl,
  type CdpClient,
} from '../src/runtime/browser.js';
import { fakeChild, fakeClient } from './support/runtime.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

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

  it('brings the Bot tab to the front when headed on the Local Computer desktop (#3378)', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const client = fakeClient();
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      connect: async () => client,
      headless: () => false,
      foregroundTabs: () => true,
    });
    const ensuring = runtime.ensure();
    child.ready();
    await ensuring;
    await runtime.open('https://example.com');
    const activations = (): number =>
      client.calls.filter((call) => call.method === 'Target.activateTarget').length;
    expect(client.send).toHaveBeenCalledWith('Target.activateTarget', { targetId: 'tab-1' });
    expect(activations()).toBe(1);
    await runtime.observe('tab-1');
    expect(activations()).toBe(2);
    await runtime.stop();
  });

  it('keeps Bot tabs in the background when headless even if the desktop asks for foreground', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const client = fakeClient();
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      connect: async () => client,
      headless: () => true,
      foregroundTabs: () => true,
    });
    const ensuring = runtime.ensure();
    child.ready();
    await ensuring;
    await runtime.open('https://example.com');
    await runtime.observe('tab-1');
    expect(client.calls.map((call) => call.method)).not.toContain('Target.activateTarget');
    await runtime.stop();
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
});
