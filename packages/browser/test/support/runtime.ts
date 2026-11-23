import { EventEmitter } from 'node:events';

import { vi, type Mock } from 'vitest';

import type { CdpClient } from '../../src/runtime/browser.js';

export interface FakeChild {
  readonly proc: EventEmitter & {
    stderr: EventEmitter;
    exitCode: number | null;
    killed: boolean;
    kill: Mock;
  };
  ready(): void;
}

export function fakeChild(): FakeChild {
  const stderr = new EventEmitter();
  const proc = new EventEmitter() as FakeChild['proc'];
  proc.stderr = stderr;
  proc.exitCode = null;
  proc.killed = false;
  proc.kill = vi.fn(() => {
    proc.exitCode = 0;
    proc.emit('exit', 0);
    proc.emit('close', 0);
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

export function fakeClient(): CdpClient & { calls: { method: string; sessionId?: string }[] } {
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
