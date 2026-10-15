import { PassThrough } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerBrowserViewer, type BrowserViewerHost } from '../src/viewer.js';

afterEach(() => vi.unstubAllGlobals());

describe('Container viewer authenticated Host adapter', () => {
  function fixture(deviceUpgrade?: () => ((...args: unknown[]) => void) | undefined) {
    let http!: Parameters<BrowserViewerHost['register']>[0];
    const upgrades: Parameters<BrowserViewerHost['registerUpgrade']>[0][] = [];
    const release = vi.fn();
    const rejection = vi.fn((headers: Headers) =>
      headers.get('cookie') === 'session=qa' ? undefined : 401,
    );
    const dispose = registerBrowserViewer({
      host: {
        register: (route) => {
          http = route;
          return release;
        },
        registerUpgrade: (route) => {
          upgrades.push(route);
          return release;
        },
      },
      prefix: '/botharness-browser/viewer/qa',
      upstream: () => new URL('http://127.0.0.1:39001/botharness-browser/viewer/qa/'),
      rejection,
      ...(deviceUpgrade === undefined ? {} : { deviceUpgrade }),
    });
    const response = { writeHead: vi.fn(), end: vi.fn() };
    return { http, upgrades, dispose, release, rejection, response };
  }
  it('refuses unauthenticated HTTP and WebSocket before any upstream request', async () => {
    const f = fixture();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await f.http.handler(
      { headers: {}, url: '/botharness-browser/viewer/qa/', method: 'GET' } as IncomingMessage,
      f.response as unknown as ServerResponse,
    );
    expect(f.response.writeHead).toHaveBeenCalledWith(401);
    expect(fetch).not.toHaveBeenCalled();
    expect(f.upgrades.map((r) => r.path)).toContain('/botharness-browser/viewer/qa/websocket');
    const socket = new PassThrough();
    f.upgrades
      .at(-1)!
      .handler({ headers: {}, method: 'GET' } as IncomingMessage, socket, Buffer.alloc(0));
    expect(socket.destroyed).toBe(true);
    f.dispose();
    expect(f.release).toHaveBeenCalledTimes(4);
  });
  it('hands the device web twin of each socket path to the device gateway', () => {
    const forward = vi.fn();
    let gateway: typeof forward | undefined;
    const f = fixture(() => gateway);
    const twin = f.upgrades.find(
      (route) => route.path === '/botharness-device/web/botharness-browser/viewer/qa/websockets',
    )!;
    const request = { headers: {}, method: 'GET' } as IncomingMessage;
    const refused = new PassThrough();
    twin.handler(request, refused, Buffer.alloc(0));
    expect(refused.destroyed).toBe(true);
    gateway = forward;
    const socket = new PassThrough();
    twin.handler(request, socket, Buffer.alloc(0));
    expect(forward).toHaveBeenCalledWith(request, socket, expect.any(Buffer));
    expect(f.rejection).not.toHaveBeenCalled();
    f.dispose();
    expect(f.release).toHaveBeenCalledTimes(7);
  });
  it('uses native authentication and strips Host credentials from an allowed HTTP request', async () => {
    const f = fixture();
    const fetch = vi.fn(
      async () => new Response('viewer', { headers: { 'x-frame-options': 'DENY' } }),
    );
    vi.stubGlobal('fetch', fetch);
    await f.http.handler(
      {
        headers: { cookie: 'session=qa', authorization: 'Bearer synthetic' },
        url: '/botharness-browser/viewer/qa/index.html',
        method: 'GET',
      } as IncomingMessage,
      f.response as unknown as ServerResponse,
    );
    expect(f.rejection).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]).toEqual([
      new URL('http://127.0.0.1:39001/botharness-browser/viewer/qa/index.html'),
      { method: 'GET', redirect: 'manual', headers: { 'accept-encoding': 'identity' } },
    ]);
    expect(f.response.writeHead).toHaveBeenCalledWith(
      200,
      expect.not.objectContaining({ 'x-frame-options': 'DENY' }),
    );
    expect(f.response.end).toHaveBeenCalledWith(Buffer.from('viewer'));
    f.dispose();
  });
});
