import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserCarrier } from '../src/client/remote-hosts.js';

afterEach(() => vi.unstubAllGlobals());

describe('Remote Host viewer carrier authentication', () => {
  it('uses device headers without cookies for frame and input requests', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => ({
      status: 200,
      text: async () => '{}',
    }));
    vi.stubGlobal('fetch', fetch);
    const carrier = browserCarrier();
    const signal = new AbortController().signal;
    for (const kind of ['browser', 'computer']) {
      const prefix = `http://127.0.0.1:47712/botharness-device/api/${kind}`;
      await carrier.request(`${prefix}/frame`, {
        method: 'GET',
        headers: { Authorization: 'Device test.secret' },
        signal,
      });
      await carrier.request(`${prefix}/input`, {
        method: 'POST',
        headers: { Authorization: 'Device test.secret' },
        body: '{"kind":"key","key":"return"}',
        signal,
      });
    }
    for (const [, init] of fetch.mock.calls) {
      expect(init).toMatchObject({
        credentials: 'omit',
        mode: 'cors',
        headers: { Authorization: 'Device test.secret' },
        signal,
      });
    }
  });

  it('opens the Host Feed socket with a one-time ticket, never the device secret', async () => {
    const fetch = vi.fn(async () => ({ json: async () => ({ ticket: 'one-time' }) }));
    const urls: string[] = [];
    class Socket {
      constructor(url: string) {
        urls.push(url);
      }
      send() {}
      close() {}
    }
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', Socket);
    const socket = browserCarrier().openSocket(
      'ws://127.0.0.1:47712/botharness-device/api/remote.mux',
      {
        open() {},
        message() {},
        closed() {},
      },
      { Authorization: 'Device test.secret' },
    );
    await vi.waitFor(() => expect(urls).toHaveLength(1));
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:47712/botharness-device/stream-ticket',
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        mode: 'cors',
        headers: { Authorization: 'Device test.secret' },
      }),
    );
    expect(urls[0]).toBe('ws://127.0.0.1:47712/botharness-device/api/remote.mux?ticket=one-time');
    socket.close();
  });
});
