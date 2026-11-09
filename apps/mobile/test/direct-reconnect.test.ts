import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HostCarrier, HostSocketEvents } from '../src/host/carrier';
import {
  DIRECT_RETRY_MAX_MS,
  DIRECT_RETRY_MIN_MS,
  encryptedCarrier,
} from '../src/host/encrypted-carrier';
import { ConnectChannel } from '../../../packages/core/src/devices/noise/channel';
import { noisePublicKey } from '../../../packages/core/src/devices/noise/xk';

const ORIGIN = 'https://host.deepseekbot.dev';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function fakeHost(direct: () => 'answer' | 'refuse' | 'auth-fail' | 'send-fails') {
  const hostKey = randomBytes(32);
  const served: { via: 'relay' | 'direct'; path: string }[] = [];
  const offers: number[] = [];
  const links: { via: 'relay' | 'direct'; events: HostSocketEvents }[] = [];
  const responder = (via: 'relay' | 'direct', events: HostSocketEvents) => {
    const peer = new ConnectChannel({
      role: 'responder',
      hostId: 'host',
      staticKey: hostKey,
      ephemeralKey: randomBytes(32),
      hostKey: noisePublicKey(hostKey),
    });
    let alive = true;
    links.push({ via, events });
    const reply = (value: unknown) => {
      for (const frame of peer.send(JSON.stringify(value)))
        queueMicrotask(() => alive && events.message(frame));
    };
    queueMicrotask(events.open);
    return {
      send(wire: string) {
        if (!alive) throw new Error('closed');
        const result = peer.receive(wire);
        if (result.reply) queueMicrotask(() => alive && events.message(result.reply!));
        if (!result.message) return;
        const value = JSON.parse(result.message);
        reply({ type: 'ack', credit: value.credit });
        if (value.type === 'admit') reply({ type: 'admitted' });
        else if (value.type === 'request') {
          served.push({ via, path: value.path });
          const body =
            value.path === '/botharness-device/direct'
              ? JSON.stringify({ ok: true, answer: 'v=0 answer' })
              : '{}';
          reply({ type: 'response', id: value.id, status: 200, body: btoa(body) });
        }
      },
      close: () => {
        alive = false;
        peer.close();
      },
    };
  };
  const raw: HostCarrier = {
    request: vi.fn(),
    openSocket: (_url, events) => responder('relay', events),
    async openDirect(signal) {
      offers.push(Date.now());
      await signal('v=0 offer');
      const mode = direct();
      if (mode === 'refuse') throw new Error('direct-open-timeout');
      return (events) => {
        if (mode === 'auth-fail') {
          queueMicrotask(events.open);
          return {
            send: () => queueMicrotask(() => events.message('not-a-noise-frame')),
            close: () => {},
          };
        }
        const socket = responder('direct', events);
        if (mode !== 'send-fails') return socket;
        let sends = 0;
        return {
          send: (wire: string) => {
            if (++sends > 1) throw new Error('direct-closed');
            socket.send(wire);
          },
          close: socket.close,
        };
      };
    },
  };
  const carrier = encryptedCarrier({
    raw,
    hostId: 'host',
    credential: 'device-credential',
    encryption: {
      protocol: 'connect-noise-xk-v1',
      hostKey: Buffer.from(noisePublicKey(hostKey)).toString('hex'),
      deviceKey: randomBytes(32).toString('hex'),
    },
  });
  const call = async () => {
    await carrier.request(`${ORIGIN}/botharness-device/api/botharness/list`, {
      method: 'POST',
      body: '{}',
      signal: new AbortController().signal,
    });
    return served.at(-1)?.via;
  };
  const drop = (via: 'relay' | 'direct') => {
    const link = links.filter((item) => item.via === via).at(-1);
    link?.events.closed(`${via}-closed`);
  };
  return { carrier, offers, call, drop };
}

it('negotiates a new direct link after the old one drops while the relay stays up', async () => {
  const host = fakeHost(() => 'answer');
  try {
    expect(await host.call()).toBe('relay');
    await vi.advanceTimersByTimeAsync(10);
    expect(host.offers).toHaveLength(1);
    expect(await host.call()).toBe('direct');

    host.drop('direct');
    expect(await host.call()).toBe('relay');
    await vi.advanceTimersByTimeAsync(DIRECT_RETRY_MIN_MS - 100);
    expect(host.offers).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(host.offers).toHaveLength(2);
    expect(await host.call()).toBe('direct');

    host.drop('direct');
    await vi.advanceTimersByTimeAsync(DIRECT_RETRY_MIN_MS + 100);
    expect(host.offers).toHaveLength(3);
    expect(await host.call()).toBe('direct');
  } finally {
    host.carrier.close?.();
  }
});

it('re-offers as soon as a relay reconnects after both links dropped', async () => {
  const host = fakeHost(() => 'answer');
  try {
    await host.call();
    await vi.advanceTimersByTimeAsync(10);
    expect(await host.call()).toBe('direct');

    host.drop('direct');
    host.drop('relay');
    await vi.advanceTimersByTimeAsync(10);
    expect(host.offers).toHaveLength(1);
    expect(await host.call()).toBe('relay');
    await vi.advanceTimersByTimeAsync(10);
    expect(host.offers).toHaveLength(2);
    expect(await host.call()).toBe('direct');
  } finally {
    host.carrier.close?.();
  }
});

it('backs off between failed direct attempts and keeps serving over the relay', async () => {
  let mode: 'answer' | 'refuse' = 'refuse';
  const host = fakeHost(() => mode);
  try {
    await host.call();
    await vi.advanceTimersByTimeAsync(10);
    expect(host.offers).toHaveLength(1);
    const gaps: number[] = [];
    for (let n = 0; n < 9; n++) {
      const before = host.offers.length;
      const start = Date.now();
      while (host.offers.length === before) await vi.advanceTimersByTimeAsync(100);
      gaps.push(Math.round((Date.now() - start) / 1000));
      expect(await host.call()).toBe('relay');
    }
    expect(gaps).toEqual([3, 6, 12, 24, 48, 96, 192, 300, 300]);
    expect(DIRECT_RETRY_MAX_MS).toBe(300_000);

    mode = 'answer';
    await vi.advanceTimersByTimeAsync(DIRECT_RETRY_MAX_MS);
    expect(await host.call()).toBe('direct');
  } finally {
    host.carrier.close?.();
  }
});

it('stops offering after a direct link fails Noise authentication', async () => {
  const host = fakeHost(() => 'auth-fail');
  try {
    await host.call();
    await vi.advanceTimersByTimeAsync(10);
    expect(host.offers).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(DIRECT_RETRY_MAX_MS * 2);
    expect(host.offers).toHaveLength(1);
    expect(await host.call()).toBe('relay');
  } finally {
    host.carrier.close?.();
  }
});

it('keeps retrying when the direct link drops while sending its handshake reply', async () => {
  let mode: 'answer' | 'send-fails' = 'send-fails';
  const host = fakeHost(() => mode);
  try {
    await host.call();
    await vi.advanceTimersByTimeAsync(10);
    expect(host.offers).toHaveLength(1);
    mode = 'answer';
    await vi.advanceTimersByTimeAsync(DIRECT_RETRY_MIN_MS + 100);
    expect(host.offers).toHaveLength(2);
    expect(await host.call()).toBe('direct');
  } finally {
    host.carrier.close?.();
  }
});

it('cancels a pending retry when the carrier closes', async () => {
  const host = fakeHost(() => 'answer');
  await host.call();
  await vi.advanceTimersByTimeAsync(10);
  host.drop('direct');
  host.carrier.close?.();
  await vi.advanceTimersByTimeAsync(DIRECT_RETRY_MAX_MS);
  expect(host.offers).toHaveLength(1);
});
