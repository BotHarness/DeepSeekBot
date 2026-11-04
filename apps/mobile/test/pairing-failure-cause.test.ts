import { describe, expect, it, vi } from 'vitest';
import type { HostCarrier, HostSocketEvents } from '../src/host/carrier';
import { channelFailure, redeemPairing, type PairingPayload } from '../src/host/pairing';
import {
  channelFailureDetail,
  isPairingFailureDetail,
  joinFailureDetails,
  reasonCode,
} from '../src/host/pairing-detail';
import { sanitizeEvent } from '../src/telemetry/schema';

const LAN = 'http://192.168.1.20:3080';
const CONNECT = 'https://abc123.deepseekbot.dev';

describe('reasonCode', () => {
  it.each([
    ['channel-timeout', 'channel-timeout'],
    ['lan-unreachable:local-network-denied', 'lan-unreachable:local-network-denied'],
    ['lan-unreachable:nsurl-1009', 'lan-unreachable:nsurl-1009'],
    ["Expected HTTP 101 response but was '530 '", 'http-530'],
    ['Received bad response code from server: 502.', 'http-502'],
    ['The operation couldn’t be completed. (NSURLErrorDomain error -1004.)', 'nsurl-1004'],
    [
      'failed to connect to /192.168.1.20 (port 3080) after 10000ms: isConnected failed: timed out',
      'socket-timeout',
    ],
    ['Unable to resolve host "abc123.deepseekbot.dev": No address associated', 'socket-dns'],
    ['Connection refused', 'socket-refused'],
    ['Something odd at 10.0.0.4', 'socket-error'],
  ])('reduces %j to %j', (reason, code) => {
    expect(reasonCode(reason)).toBe(code);
  });

  it('never keeps an address or host name from platform text', () => {
    for (const reason of [
      'failed to connect to /192.168.1.20 (port 3080)',
      'Unable to resolve host "abc123.deepseekbot.dev"',
    ]) {
      const detail = channelFailureDetail(LAN, reason);
      expect(detail).not.toMatch(/192|abc123/u);
      expect(isPairingFailureDetail(detail)).toBe(true);
    }
  });
});

describe('channelFailure', () => {
  it('reports a real Noise verification failure as a mismatch on any path', () => {
    expect(channelFailure(CONNECT, 'channel-authentication-failed', false)).toEqual({
      ok: false,
      code: 'channel-authentication-failed',
      detail: 'connect:channel-authentication-failed',
    });
  });

  it('reports transport faults on a remote path as unreachable, not as a verification failure', () => {
    expect(channelFailure(CONNECT, "Expected HTTP 101 response but was '530 '", false)).toEqual({
      ok: false,
      code: 'unreachable',
      detail: 'connect:http-530',
    });
    expect(channelFailure(CONNECT, 'channel-disconnected', true)).toMatchObject({
      code: 'unreachable',
    });
  });

  it('treats any unauthenticated local fault as a local path failure', () => {
    for (const reason of ['channel-frame-invalid', 'channel-handshake-failed', 'channel-timeout'])
      expect(channelFailure(LAN, reason, false).code).toBe('lan-unreachable');
    expect(channelFailure(LAN, 'lan-unreachable:local-network-denied', false)).toEqual({
      ok: false,
      code: 'lan-permission-denied',
      detail: 'lan:lan-unreachable:local-network-denied',
    });
    expect(channelFailure(LAN, 'channel-disconnected', true).code).toBe('unreachable');
  });
});

function closingCarrier(reasons: Record<string, string | undefined>) {
  const opened: string[] = [];
  const carrier: HostCarrier = {
    randomBytes: () => new Uint8Array(32).fill(7),
    request: vi.fn(),
    openSocket(url: string, events: HostSocketEvents) {
      const origin = new URL(url.replace(/^ws/u, 'http')).origin;
      opened.push(origin);
      const reason = reasons[origin];
      if (reason !== undefined) setTimeout(() => events.closed(reason), 0);
      return { send: () => {}, close: () => {} };
    },
  };
  return { carrier, opened };
}

function payload(routes: string[], expiresInMs = 60_000): PairingPayload {
  return {
    host: { id: 'host', name: 'Studio' },
    offer: 'synthetic-offer',
    routes,
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    encryption: { protocol: 'connect-noise-xk-v1', publicKey: 'ab'.repeat(32) },
  };
}

describe('encrypted redemption', () => {
  it('falls through to Connect after any local failure and keeps both causes', async () => {
    const { carrier, opened } = closingCarrier({
      [LAN]: 'channel-frame-invalid',
      [CONNECT]: "Expected HTTP 101 response but was '530 '",
    });
    expect(
      await redeemPairing({
        payload: payload([CONNECT, LAN]),
        deviceName: 'Phone',
        carrier,
        confirmFingerprint: async () => true,
      }),
    ).toEqual({
      ok: false,
      code: 'unreachable',
      detail: 'lan:channel-frame-invalid,connect:http-530',
    });
    expect(opened).toEqual([LAN, CONNECT]);
  });

  it('names the iOS Local Network denial when no other path works', async () => {
    const { carrier } = closingCarrier({
      [LAN]: 'lan-unreachable:local-network-denied',
      [CONNECT]: 'socket error',
    });
    expect(
      await redeemPairing({
        payload: payload([LAN, CONNECT]),
        deviceName: 'Phone',
        carrier,
        confirmFingerprint: async () => true,
      }),
    ).toMatchObject({ ok: false, code: 'lan-permission-denied' });
  });

  it('reports an offer that expires while waiting as expired, not unreachable', async () => {
    const { carrier } = closingCarrier({});
    expect(
      await redeemPairing({
        payload: payload([CONNECT], 30),
        deviceName: 'Phone',
        carrier,
        confirmFingerprint: async () => true,
      }),
    ).toEqual({ ok: false, code: 'offer-expired', detail: 'connect:offer-deadline' });
  });
});

describe('pairing telemetry detail', () => {
  const base = {
    uuid: '11111111-1111-4111-8111-111111111111',
    distinct_id: '22222222-2222-4222-8222-222222222222',
    timestamp: '2026-11-04T00:00:00.000Z',
    event: 'pairing:attempt_complete',
    properties: {
      platform: 'ios',
      environment: 'production',
      language: 'en',
      app_version: '1.5.3',
      app_build: '15',
      foreground_session_id: '33333333-3333-4333-8333-333333333333',
      method: 'qr',
      attempt_id: '44444444-4444-4444-8444-444444444444',
      outcome: 'failed',
      reason: 'unreachable',
      duration_bucket: '1-5s',
    },
  };

  it('keeps a well-formed detail and still accepts events without one', () => {
    expect(sanitizeEvent(base)?.properties).not.toHaveProperty('detail');
    expect(
      sanitizeEvent({
        ...base,
        properties: { ...base.properties, detail: 'lan:channel-timeout,connect:http-530' },
      })?.properties['detail'],
    ).toBe('lan:channel-timeout,connect:http-530');
  });

  it('drops events whose detail carries free text', () => {
    expect(
      sanitizeEvent({
        ...base,
        properties: { ...base.properties, detail: 'connect:failed to reach 10.0.0.4' },
      }),
    ).toBeUndefined();
  });

  it('caps joined details to the last four paths', () => {
    expect(
      joinFailureDetails(['lan:a', 'lan:b', 'lan:c', 'connect:d', 'connect:e'])?.split(','),
    ).toEqual(['lan:b', 'lan:c', 'connect:d', 'connect:e']);
  });
});
