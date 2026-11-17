import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectRefused } from '@botharness/host-client/encrypted-carrier';
import { custodyCarrier } from '../src/client/remote-custody.js';

const handle = 'custody.' + 'c'.repeat(43);
const raw = { request: vi.fn(), openSocket: vi.fn() };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Client transport for Host-kept credentials', () => {
  it('sends the handle to the local Host and rebuilds connect refusals', async () => {
    const posted: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { url: string };
        posted.push(body);
        if (body.url.endsWith('/revoked'))
          return Response.json({ code: 'device-revoked', refused: true }, { status: 409 });
        return Response.json({
          status: 201,
          contentType: 'text/plain',
          body: btoa('hello'),
        });
      }),
    );
    const carrier = custodyCarrier(handle, raw);
    const response = await carrier.request('https://remote.example/ok', {
      method: 'POST',
      headers: { authorization: `Device ${handle}` },
      body: new Blob(['abc']),
      signal: AbortSignal.timeout(1000),
    });
    expect(response.status).toBe(201);
    expect(await response.text()).toBe('hello');
    expect(posted[0]).toEqual({
      action: 'request',
      handle,
      url: 'https://remote.example/ok',
      method: 'POST',
      headers: { authorization: `Device ${handle}` },
      bodyBase64: btoa('abc'),
    });
    const refused = carrier.request('https://remote.example/revoked', {
      method: 'GET',
      signal: AbortSignal.timeout(1000),
    });
    await expect(refused).rejects.toBeInstanceOf(ConnectRefused);
    await expect(refused).rejects.toMatchObject({ code: 'device-revoked' });
    expect(raw.request).not.toHaveBeenCalled();
  });

  it('relays a live connection through the local Host and sends only after it opens, in order', async () => {
    const posted: { action: string; text?: string }[] = [];
    let push!: (text: string) => void;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        push = (text) => controller.enqueue(new TextEncoder().encode(text));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/stream?socket=')) return new Response(stream);
        const body = JSON.parse(String(init?.body)) as { action: string; text?: string };
        posted.push(body);
        if (body.action === 'socket') return Response.json({ socket: 's'.repeat(24) });
        return Response.json({ ok: true });
      }),
    );
    const events = { open: vi.fn(), message: vi.fn(), closed: vi.fn() };
    const socket = custodyCarrier(handle, raw).openSocket('wss://remote.example/live', events, {
      authorization: `Device ${handle}`,
    });
    socket.send('first');
    socket.send('second');
    await vi.waitFor(() => expect(posted.map((item) => item.action)).toEqual(['socket']));
    push('event: open\ndata: {}\n\n');
    await vi.waitFor(() => expect(events.open).toHaveBeenCalled());
    push('event: message\ndata: {"text":"hi"}\n\n');
    await vi.waitFor(() => expect(events.message).toHaveBeenCalledWith('hi'));
    await vi.waitFor(() =>
      expect(posted.filter((item) => item.action === 'send').map((item) => item.text)).toEqual([
        'first',
        'second',
      ]),
    );
    push('event: closed\ndata: {"reason":"device-revoked"}\n\n');
    await vi.waitFor(() => expect(events.closed).toHaveBeenCalledWith('device-revoked'));
    expect(raw.openSocket).not.toHaveBeenCalled();
  });
});
