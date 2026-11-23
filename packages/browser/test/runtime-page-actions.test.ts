import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createBotBrowserRuntime, type CdpClient } from '../src/runtime/browser.js';
import { fakeChild, fakeClient } from './support/runtime.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

const spawnMock = vi.mocked(spawn);

beforeEach(() => {
  spawnMock.mockReset();
});

describe('runtime lifecycle', () => {
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

  it('streams screencast frames with acknowledgements and stops the screencast', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const base = fakeClient();
    const listeners = new Map<string, (params: Record<string, unknown>) => void>();
    const client: CdpClient = {
      send: (method, params, sessionId) => base.send(method, params, sessionId),
      subscribe: (method, sessionId, listener) => {
        listeners.set(`${method}@${sessionId}`, listener);
        return () => listeners.delete(`${method}@${sessionId}`);
      },
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
    const frames: unknown[] = [];
    const stop = await runtime.streamFrames!('tab-1', (frame) => frames.push(frame));
    expect(base.send).toHaveBeenCalledWith(
      'Page.startScreencast',
      expect.objectContaining({ format: 'jpeg' }),
      'session-1',
    );
    listeners.get('Page.screencastFrame@session-1')?.({
      data: 'YmFy',
      sessionId: 41,
      metadata: { deviceWidth: 1280, deviceHeight: 720 },
    });
    expect(frames).toEqual([
      { data: 'YmFy', mimeType: 'image/jpeg', viewport: { width: 1280, height: 720 } },
    ]);
    expect(base.send).toHaveBeenCalledWith(
      'Page.screencastFrameAck',
      { sessionId: 41 },
      'session-1',
    );
    await stop();
    expect(listeners.has('Page.screencastFrame@session-1')).toBe(false);
    expect(base.calls.map((call) => call.method)).toContain('Page.stopScreencast');
    await runtime.stop();
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
