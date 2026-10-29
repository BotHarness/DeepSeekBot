import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConversationSnapshot } from '../../../apps/mobile/src/host/conversation.js';
import { observeRemoteRead } from '../src/client/remote-conversation-read.js';

const {
  JSDOM,
}: {
  JSDOM: new (
    html: string,
    options: { pretendToBeVisual: boolean },
  ) => {
    window: Window & typeof globalThis;
  };
} = createRequire(import.meta.url)('jsdom');

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('visible remote read acknowledgement', () => {
  it('marks only live visible latest messages and cancels on scrolling, hiding, interruption and disposal', async () => {
    vi.useFakeTimers();
    const dom = new JSDOM('<div></div>', { pretendToBeVisual: true });
    const node = dom.window.document.querySelector('div')!;
    let visible = true;
    Object.defineProperty(node, 'getClientRects', { value: () => ({ length: visible ? 1 : 0 }) });
    let resized = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const listeners = new Set<() => void>();
    let snapshot: ConversationSnapshot = {
      status: 'live',
      fromCache: false,
      hasOlder: false,
      loadingOlder: false,
      drafts: [],
      messages: [],
    };
    const publish = (id: string) => {
      snapshot = {
        ...snapshot,
        messages: [
          {
            id,
            at: '2026-10-21T00:00:00Z',
            author: 'bot',
            body: id,
            delivery: 'committed',
            attachments: [],
          },
        ],
      };
      listeners.forEach((listener) => listener());
    };
    const mark = vi.fn(async () => {});
    const stop = observeRemoteRead(
      node,
      {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      },
      mark,
    );
    publish('first');
    await vi.advanceTimersByTimeAsync(250);
    expect(mark).toHaveBeenCalledExactlyOnceWith('first');
    publish('away');
    node.scrollTop = -100;
    node.dispatchEvent(new dom.window.Event('scroll'));
    await vi.advanceTimersByTimeAsync(250);
    expect(mark).toHaveBeenCalledTimes(1);
    node.scrollTop = 0;
    node.dispatchEvent(new dom.window.Event('scroll'));
    visible = false;
    resized();
    await vi.advanceTimersByTimeAsync(250);
    expect(mark).toHaveBeenCalledTimes(1);
    visible = true;
    resized();
    await vi.advanceTimersByTimeAsync(250);
    expect(mark).toHaveBeenLastCalledWith('away');
    publish('interrupted');
    snapshot = { ...snapshot, status: 'interrupted' };
    resized();
    await vi.advanceTimersByTimeAsync(250);
    expect(mark).toHaveBeenCalledTimes(2);
    snapshot = { ...snapshot, status: 'live', fromCache: true };
    publish('cache');
    await vi.advanceTimersByTimeAsync(250);
    expect(mark).toHaveBeenCalledTimes(2);
    snapshot = { ...snapshot, fromCache: false };
    publish('unmounted');
    stop();
    await vi.advanceTimersByTimeAsync(250);
    expect(mark).toHaveBeenCalledTimes(2);
    expect(listeners.size).toBe(0);
    expect(disconnect).toHaveBeenCalledOnce();
    dom.window.close();
  });
});
