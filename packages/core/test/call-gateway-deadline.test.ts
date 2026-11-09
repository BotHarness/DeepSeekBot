import { randomBytes } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { encryptedCarrier } from '../../../apps/mobile/src/host/encrypted-carrier.js';
import type { HostRequest } from '../../../apps/mobile/src/host/carrier.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createDeviceGateway } from '../src/devices/gateway.js';
import { createEncryptedGateway } from '../src/devices/encrypted-gateway.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import type { VoiceCallResult } from '../src/voice/call-contract.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

afterEach(() => vi.useRealTimers());

async function gateway(route: 'http' | 'encrypted', delay: number) {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('call-gateway-budget-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'studio',
  });
  const hostKey = randomBytes(32);
  const deviceKey = randomBytes(32);
  const publicKey = Buffer.from(noisePublicKey(deviceKey)).toString('hex');
  const offer = pairing.createOffer();
  pairing.requestKey({ offer: offer.offer, publicKey });
  pairing.approveKey(offer.receipt, publicKey);
  const paired = pairing.redeem({ offer: offer.offer, publicKey });
  if (!paired.ok) throw new Error('pairing failed');
  let onStarted!: (signal: AbortSignal) => void;
  const started = new Promise<AbortSignal>((resolve) => {
    onStarted = resolve;
  });
  const dispatch = vi.fn(({ signal }: { signal: AbortSignal }) => {
    onStarted(signal);
    return new Promise<VoiceCallResult>((resolve, reject) => {
      const timer = setTimeout(() => resolve({ ok: true }), delay);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('cancelled'));
      });
    });
  });
  let onEntered!: () => void;
  const entered = new Promise<void>((resolve) => {
    onEntered = resolve;
  });
  const server = createServer((request, response) => {
    void direct.handle(request, response);
    onEntered();
  });
  const direct = createDeviceGateway({
    pairing,
    port: () => port,
    authenticatedUrl: (url) => url,
    voiceCall: dispatch,
  });
  const encrypted = createEncryptedGateway({
    route: 'lan',
    pairing,
    key: async () => Uint8Array.from(hostKey),
    port: () => port,
    voiceCall: dispatch,
  });
  server.on('upgrade', (request, socket, head) => encrypted.upgrade(request, socket, head));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;
  const carrier = encryptedCarrier({
    requireEncryption: true,
    hostId: pairing.host().id,
    credential: paired.credential,
    encryption: {
      protocol: 'connect-noise-xk-v1',
      hostKey: Buffer.from(noisePublicKey(hostKey)).toString('hex'),
      deviceKey: deviceKey.toString('hex'),
    },
    raw: {
      request: async () => {
        throw new Error('plaintext not allowed');
      },
      openSocket: (url, events) => {
        expect(url).toBe('ws://192.168.1.20:39101/botharness-device/channel');
        const socket = new WebSocket(`ws://127.0.0.1:${port}/botharness-device/channel`);
        socket.on('open', events.open);
        socket.on('message', (data) => events.message(data.toString()));
        socket.on('close', () => events.closed('closed'));
        socket.on('error', () => events.closed('error'));
        return { send: (text) => socket.send(text), close: () => socket.close() };
      },
    },
  });
  return {
    started,
    entered,
    dispatch,
    slowBody(delay: number) {
      return new Promise<VoiceCallResult | undefined>((resolve) => {
        const request = httpRequest(
          `${origin}/botharness-device/api/voice/call`,
          {
            method: 'POST',
            headers: { authorization: `Device ${paired.credential}` },
          },
          (response) => {
            let body = '';
            response.on('data', (chunk) => {
              body += String(chunk);
            });
            response.on('end', () => resolve(JSON.parse(body) as VoiceCallResult));
          },
        );
        request.on('error', () => resolve(undefined));
        request.write('{"kind":');
        setTimeout(() => request.end('"open","slug":"mira"}'), delay);
      });
    },
    async request(kind: string, signal = new AbortController().signal) {
      const url = `${route === 'http' ? origin : 'http://192.168.1.20:39101'}/botharness-device/api/voice/call`;
      const init: HostRequest = {
        method: 'POST',
        headers: { authorization: `Device ${paired.credential}` },
        body: JSON.stringify({ kind, slug: 'mira' }),
        signal,
      };
      try {
        const response =
          route === 'http' ? await fetch(url, init) : await carrier.request(url, init);
        return JSON.parse(await response.text()) as VoiceCallResult;
      } catch {
        return undefined;
      }
    },
    async close() {
      vi.useRealTimers();
      carrier.close?.();
      encrypted.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

it.each(['http', 'encrypted'] as const)('%s accepts an 11-second call open', async (route) => {
  const host = await gateway(route, 11_000);
  try {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const result = host.request('open');
    const signal = await host.started;
    await vi.advanceTimersByTimeAsync(11_000);
    expect(await result).toEqual({ ok: true });
    expect(signal.aborted).toBe(false);
  } finally {
    await host.close();
  }
});

it.each(['http', 'encrypted'] as const)('%s bounds call open at 20 seconds', async (route) => {
  const host = await gateway(route, 25_000);
  try {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const result = host.request('open');
    const signal = await host.started;
    await vi.advanceTimersByTimeAsync(19_999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
    await result;
  } finally {
    await host.close();
  }
});

it.each(['http', 'encrypted'] as const)(
  '%s keeps ordinary commands bounded at 10 seconds',
  async (route) => {
    const host = await gateway(route, 15_000);
    try {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      const result = host.request('readiness');
      const signal = await host.started;
      await vi.advanceTimersByTimeAsync(9_999);
      expect(signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(signal.aborted).toBe(true);
      await result;
    } finally {
      await host.close();
    }
  },
);

it.each(['http', 'encrypted'] as const)(
  '%s cancels opening when the client stops waiting',
  async (route) => {
    const host = await gateway(route, 25_000);
    try {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      const controller = new AbortController();
      const result = host.request('open', controller.signal);
      const signal = await host.started;
      const cancelled = new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve()),
      );
      await vi.advanceTimersByTimeAsync(5_000);
      controller.abort();
      await cancelled;
      expect(signal.aborted).toBe(true);
      await result;
    } finally {
      await host.close();
    }
  },
);

it('counts HTTP body time inside the opening budget', async () => {
  const host = await gateway('http', 25_000);
  try {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const result = host.slowBody(5_000);
    await host.entered;
    await vi.advanceTimersByTimeAsync(5_000);
    const signal = await host.started;
    await vi.advanceTimersByTimeAsync(14_999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
    await result;
  } finally {
    await host.close();
  }
});

it('keeps unfinished HTTP bodies bounded at ten seconds', async () => {
  const host = await gateway('http', 0);
  try {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const result = host.slowBody(11_000);
    await host.entered;
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
    expect(host.dispatch).not.toHaveBeenCalled();
  } finally {
    await host.close();
  }
});
