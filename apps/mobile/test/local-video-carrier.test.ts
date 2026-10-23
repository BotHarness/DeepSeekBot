import { randomBytes } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { ConnectChannel } from '../../../packages/core/src/devices/noise/channel';
import { noisePublicKey } from '../../../packages/core/src/devices/noise/xk';
import { LOCAL_VIDEO_PATH } from '../../../packages/computer/src/local-video-contract';
import { createLocalVideoClient } from '../../../packages/computer/src/local-video-client';
import { createHostClient } from '../src/host/client';
import { encryptedCarrier } from '../src/host/encrypted-carrier';
import type { HostSocketEvents } from '../src/host/carrier';

const origin = 'http://192.168.1.20:39101';
const path = '/botharness-device' + LOCAL_VIDEO_PATH;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function lane({ delayAdmission = false, loseResponse = false } = {}) {
  const hostKey = randomBytes(32);
  const admitted = deferred();
  const requests: Array<{ path: string; body: string }> = [];
  const wire: string[] = [];
  let admit = () => {};
  const closed = vi.fn();
  const raw = {
    request: vi.fn(),
    openSocket: vi.fn((_url: string, events: HostSocketEvents) => {
      const peer = new ConnectChannel({
        role: 'responder',
        hostId: 'host',
        staticKey: hostKey,
        ephemeralKey: randomBytes(32),
        hostKey: noisePublicKey(hostKey),
        route: 'lan',
      });
      const reply = (value: unknown) => {
        for (const frame of peer.send(JSON.stringify(value)))
          queueMicrotask(() => events.message(frame));
      };
      admit = () => reply({ type: 'admitted' });
      queueMicrotask(events.open);
      return {
        send(text: string) {
          wire.push(text);
          const result = peer.receive(text);
          if (result.reply) queueMicrotask(() => events.message(result.reply!));
          if (result.message) {
            const value = JSON.parse(result.message);
            if (value.type === 'admit') {
              admitted.resolve();
              if (!delayAdmission) admit();
            } else if (value.type === 'request') {
              requests.push({ path: value.path, body: value.body });
              if (loseResponse) queueMicrotask(() => events.closed('ack-lost'));
              else
                reply({
                  type: 'response',
                  id: value.id,
                  status: 409,
                  body: btoa(
                    JSON.stringify({ ok: false, code: 'viewer-limit', error: 'One viewer only.' }),
                  ),
                });
            }
            reply({ type: 'ack', credit: value.credit });
          }
        },
        close() {
          closed();
          peer.close();
        },
      };
    }),
  };
  const options = {
    raw,
    hostId: 'host',
    credential: 'synthetic-private-credential',
    encryption: {
      protocol: 'connect-noise-xk-v1' as const,
      hostKey: Buffer.from(noisePublicKey(hostKey)).toString('hex'),
      deviceKey: randomBytes(32).toString('hex'),
    },
  };
  return { options, raw, requests, wire, closed, admitted: admitted.promise, admit: () => admit() };
}

afterEach(() => vi.useRealTimers());

it('sends only the exact LAN video route through Noise and preserves owner status/refusal', async () => {
  const test = lane();
  const client = createHostClient({ ...test.options, routes: [origin], carrier: test.raw });
  try {
    expect(await client.api(LOCAL_VIDEO_PATH, { body: { kind: 'open' } })).toEqual({
      status: 409,
      body: { ok: false, code: 'viewer-limit', error: 'One viewer only.' },
    });
    for (const rejected of [
      LOCAL_VIDEO_PATH + '/',
      LOCAL_VIDEO_PATH + '?extra=1',
      '/api/computer/frame',
      '/api/browser/video',
    ])
      await expect(client.api(rejected)).rejects.toMatchObject({
        code: 'connect-viewer-unavailable',
      });
    expect(test.requests).toEqual([{ path, body: JSON.stringify({ kind: 'open' }) }]);
    expect(test.raw.request).not.toHaveBeenCalled();
    expect(test.wire.join('')).not.toContain(test.options.credential);
  } finally {
    client.stop();
  }
});

it('retains the structured Connect refusal through the shared video consumer without network fallback', async () => {
  const raw = { request: vi.fn(), openSocket: vi.fn() };
  const host = createHostClient({
    hostId: 'host',
    credential: 'synthetic',
    routes: ['https://host.deepseekbot.dev'],
    carrier: raw,
  });
  const video = createLocalVideoClient(host);
  try {
    expect(await host.api(LOCAL_VIDEO_PATH, { body: { kind: 'status' } })).toMatchObject({
      status: 403,
      body: { ok: false, code: 'connect-carrier-required' },
    });
    await video.start();
    expect(video.getState()).toMatchObject({
      status: 'unavailable',
      code: 'connect-carrier-required',
    });
    expect(raw.request).not.toHaveBeenCalled();
    expect(raw.openSocket).not.toHaveBeenCalled();
  } finally {
    await video.stop();
    host.stop();
  }
});

it.each(['http://127.0.0.1:39101', 'http://localhost:39101', 'http://[::1]:39101'])(
  'refuses video and legacy viewers over the encrypted SSH loopback %s',
  async (sshOrigin) => {
    const raw = { request: vi.fn(), openSocket: vi.fn() };
    const host = createHostClient({
      hostId: 'host',
      credential: 'synthetic',
      routes: [sshOrigin],
      carrier: raw,
      encryption: {
        protocol: 'connect-noise-xk-v1',
        hostKey: randomBytes(32).toString('hex'),
        deviceKey: randomBytes(32).toString('hex'),
        loopback: 'encrypted',
      },
    });
    try {
      for (const rejected of [
        LOCAL_VIDEO_PATH,
        LOCAL_VIDEO_PATH + '/',
        '/api/computer/frame',
        '/api/browser/video',
      ])
        await expect(host.api(rejected)).rejects.toMatchObject({
          code: 'connect-viewer-unavailable',
        });
      expect(raw.request).not.toHaveBeenCalled();
      expect(raw.openSocket).not.toHaveBeenCalled();
    } finally {
      host.stop();
    }
  },
);
it('cancels an admission waiter immediately while another request keeps the shared channel', async () => {
  const test = lane({ delayAdmission: true });
  const carrier = encryptedCarrier(test.options);
  const cancelled = new AbortController();
  try {
    const first = carrier.request(origin + path, {
      method: 'POST',
      body: '{"kind":"close"}',
      signal: cancelled.signal,
    });
    const refusal = expect(first).rejects.toThrow('request-cancelled');
    const second = carrier.request(origin + path, {
      method: 'POST',
      body: '{"kind":"status"}',
      signal: new AbortController().signal,
    });
    await test.admitted;
    cancelled.abort();
    await refusal;
    expect(test.closed).not.toHaveBeenCalled();
    expect(test.requests).toEqual([]);
    test.admit();
    expect((await second).status).toBe(409);
    expect(test.requests).toEqual([{ path, body: '{"kind":"status"}' }]);
    expect(test.raw.openSocket).toHaveBeenCalledOnce();
    expect(test.raw.request).not.toHaveBeenCalled();
  } finally {
    carrier.close?.();
  }
});

it('honors the video cleanup deadline during admission without closing the shared carrier', async () => {
  vi.useFakeTimers();
  const test = lane({ delayAdmission: true });
  const host = createHostClient({ ...test.options, routes: [origin], carrier: test.raw });
  try {
    const request = host.api(LOCAL_VIDEO_PATH, { body: { kind: 'close' }, timeoutMs: 3000 });
    const refusal = expect(request).rejects.toThrow('The Host did not answer in time.');
    await test.admitted;
    await vi.advanceTimersByTimeAsync(3000);
    await refusal;
    expect(test.closed).not.toHaveBeenCalled();
    test.admit();
    expect((await host.api(LOCAL_VIDEO_PATH, { body: { kind: 'status' } })).status).toBe(409);
    expect(test.requests).toEqual([{ path, body: '{"kind":"status"}' }]);
  } finally {
    host.stop();
  }
});

it('never retries an input after encrypted delivery loses its acknowledgement', async () => {
  const test = lane({ loseResponse: true });
  const host = createHostClient({
    ...test.options,
    routes: [origin, 'https://studio.tailnet.ts.net'],
    carrier: test.raw,
  });
  try {
    await expect(
      host.api(LOCAL_VIDEO_PATH, { body: { kind: 'input', sequence: 1 } }),
    ).rejects.toThrow();
    expect(test.requests).toHaveLength(1);
    expect(test.raw.openSocket).toHaveBeenCalledOnce();
    expect(test.raw.request).not.toHaveBeenCalled();
  } finally {
    host.stop();
  }
});
