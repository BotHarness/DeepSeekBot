import { describe, expect, it, vi } from 'vitest';

import { connectCdp } from '../src/runtime/browser.js';

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
