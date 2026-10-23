import { expect, it, vi } from 'vitest';
import { createHostClient } from '../src/host/client';
import { decideFromPush } from '../src/host/push-actions';
import { decideApproval } from '../src/host/requests';
import { redeemPairing } from '../src/host/pairing';
import { encryptedCarrier } from '../src/host/encrypted-carrier';
import { parsePairingLink } from '../src/host/pairing';

it('accepts only a pinned single-loopback SSH v2 pairing without legacy fallback', () => {
  const payload = {
    v: 2,
    host: { id: 'host', name: 'Linux' },
    offer: 'private',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    routes: ['http://127.0.0.1:32451'],
    encryption: {
      protocol: 'connect-noise-xk-v1',
      publicKey: 'ab'.repeat(32),
      loopback: 'encrypted',
    },
  };
  const link = (value: unknown) =>
    `deepseekbot://pair?p=${Buffer.from(JSON.stringify(value)).toString('base64url')}`;
  expect(parsePairingLink(link(payload))).toMatchObject({
    ok: true,
    payload: { encryption: { loopback: 'encrypted' } },
  });
  expect(parsePairingLink(link({ ...payload, encryption: { loopback: 'encrypted' } }))).toEqual({
    ok: false,
    code: 'link-invalid',
  });
  expect(parsePairingLink(link({ ...payload, routes: ['https://other.tailnet.ts.net'] }))).toEqual({
    ok: false,
    code: 'link-invalid',
  });
});

it('never sends an SSH pairing credential over raw loopback after a local port is replaced', async () => {
  const raw = {
    request: vi.fn(),
    openSocket: vi.fn((_url: string, events: import('../src/host/carrier').HostSocketEvents) => {
      queueMicrotask(() => events.closed('channel-disconnected'));
      return { send: vi.fn(), close: vi.fn() };
    }),
  };
  const saved = parseSavedHost({
    hostId: 'host',
    hostName: 'Linux',
    deviceId: 'device',
    routes: ['http://127.0.0.1:32451'],
    credential: 'ssh-device-secret',
    encryption: {
      protocol: 'connect-noise-xk-v1',
      hostKey: 'ab'.repeat(32),
      deviceKey: 'cd'.repeat(32),
      loopback: 'encrypted',
    },
  });
  expect(saved?.encryption?.loopback).toBe('encrypted');
  if (!saved) throw new Error('missing fixture');
  const persisted = serializeSavedHost(saved);
  expect(persisted.routes).toEqual([]);
  expect(parseSavedHost(JSON.parse(JSON.stringify(persisted)))).toEqual(saved);
  expect(parseSavedHost({ ...persisted, routes: ['http://127.0.0.1:32451'] })).toBeUndefined();
  expect(
    parseSavedHost({ ...saved, encryption: { ...saved.encryption, hostKey: 'invalid' } }),
  ).toBeUndefined();
  const carrier = encryptedCarrier({ ...saved, raw });
  try {
    await expect(
      carrier.request('http://127.0.0.1:32451/botharness-device/push', {
        method: 'GET',
        signal: new AbortController().signal,
        headers: { authorization: 'Device ssh-device-secret' },
      }),
    ).rejects.toThrow();
    expect(raw.request).not.toHaveBeenCalled();
    expect(raw.openSocket.mock.calls[0]?.[0]).toBe(
      'ws://127.0.0.1:32451/botharness-device/channel',
    );
    expect(JSON.stringify(raw.openSocket.mock.calls)).not.toContain('ssh-device-secret');
  } finally {
    carrier.close?.();
  }
});

it.each(['https://host.deepseekbot.dev', 'http://192.168.1.20:39101'])(
  'refuses a legacy pairing at %s before any credential reaches the raw carrier',
  async (origin) => {
    const request = vi.fn(),
      openSocket = vi.fn();
    const carrier = encryptedCarrier({
      raw: { request, openSocket },
      hostId: 'host',
      credential: 'private-credential',
    });
    await expect(
      carrier.request(`${origin}/botharness-device/api/botharness/list`, {
        method: 'POST',
        signal: new AbortController().signal,
        headers: { authorization: 'Device private-credential' },
        body: '{}',
      }),
    ).rejects.toThrow('host-key-required');
    expect(request).not.toHaveBeenCalled();
    expect(openSocket).not.toHaveBeenCalled();
  },
);

import { parseSavedHost, serializeSavedHost, withHost } from '../src/host/hosts';
it('persists the complete trust record and refuses a silent pin change or removal', () => {
  const host = {
    hostId: 'host',
    hostName: 'Host',
    routes: ['https://host.deepseekbot.dev'],
    deviceId: 'device',
    credential: 'test-bearer',
    encryption: {
      protocol: 'connect-noise-xk-v1' as const,
      hostKey: 'ab'.repeat(32),
      deviceKey: 'cd'.repeat(32),
    },
  };
  expect(parseSavedHost(JSON.parse(JSON.stringify(host)))).toEqual(host);
  expect(() =>
    withHost(
      { hosts: [host] },
      { ...host, encryption: { ...host.encryption, hostKey: 'ef'.repeat(32) } },
    ),
  ).toThrow('host-key-mismatch');
  const { encryption: _removed, ...withoutPin } = host;
  expect(() => withHost({ hosts: [host] }, withoutPin)).toThrow('host-key-mismatch');
});

import { openNoiseSocket } from '../src/host/encrypted-carrier';
import { ConnectChannel } from '../../../packages/core/src/devices/noise/channel';
import { noisePublicKey } from '../../../packages/core/src/devices/noise/xk';
import { randomBytes } from 'node:crypto';
import { createHostPush } from '../src/host/push';
import { revokePairing, removeDevice } from '../src/host/pairing';

it('bounds unacknowledged native output even when bufferedAmount is absent', async () => {
  const hostKey = randomBytes(32);
  const peer = new ConnectChannel({
    role: 'responder',
    hostId: 'host',
    staticKey: hostKey,
    ephemeralKey: randomBytes(32),
    hostKey: noisePublicKey(hostKey),
  });
  const closed = vi.fn();
  const socket = openNoiseSocket({
    origin: 'https://host.deepseekbot.dev',
    hostId: 'host',
    encryption: {
      protocol: 'connect-noise-xk-v1',
      hostKey: Buffer.from(noisePublicKey(hostKey)).toString('hex'),
      deviceKey: randomBytes(32).toString('hex'),
    },
    message: vi.fn(),
    closed,
    raw: {
      request: vi.fn(),
      openSocket(_url, events) {
        queueMicrotask(events.open);
        return {
          send(wire) {
            const result = peer.receive(wire);
            if (result.reply) queueMicrotask(() => events.message(result.reply!));
          },
          close: vi.fn(),
        };
      },
    },
  });
  await socket.ready;
  expect(() => {
    for (let n = 0; n < 12; n++) socket.send({ type: 'send', text: 'x'.repeat(1024 * 1024) });
  }).toThrow('channel-busy');
  expect(closed).toHaveBeenCalledOnce();
  peer.close();
  socket.close();
});

it('never retries push or removal over another route after a missing Connect pin', async () => {
  const raw = { request: vi.fn(), openSocket: vi.fn() };
  const host = {
    hostId: 'host',
    hostName: 'Host',
    deviceId: 'device',
    credential: 'test-secret',
    routes: ['https://host.deepseekbot.dev', 'http://localhost:3333'],
  };
  await expect(createHostPush(raw).settings(host)).rejects.toThrow('host-key-required');
  expect(await revokePairing({ host, carrier: raw })).toBe('unreachable');
  expect(await removeDevice({ host, deviceId: 'other', carrier: raw })).toBe('unreachable');
  expect(raw.request).not.toHaveBeenCalled();
  expect(raw.openSocket).not.toHaveBeenCalled();
});

it.each([400, 500, 502, 503])(
  'never retries an authenticated Connect HTTP %i over a plaintext route',
  async (status) => {
    const hostKey = randomBytes(32);
    const requests: string[] = [];
    const raw = {
      request: vi.fn(async () => ({
        status: 200,
        text: async () => '{}',
        bytes: async () => new Uint8Array(),
      })),
      openSocket(_url: string, events: import('../src/host/carrier').HostSocketEvents) {
        const peer = new ConnectChannel({
          role: 'responder',
          hostId: 'host',
          staticKey: hostKey,
          ephemeralKey: randomBytes(32),
          hostKey: noisePublicKey(hostKey),
        });
        const reply = (value: unknown) => {
          for (const frame of peer.send(JSON.stringify(value)))
            queueMicrotask(() => events.message(frame));
        };
        queueMicrotask(events.open);
        return {
          send(wire: string) {
            const result = peer.receive(wire);
            if (result.reply) queueMicrotask(() => events.message(result.reply!));
            if (result.message) {
              const value = JSON.parse(result.message);
              if (value.type === 'admit') reply({ type: 'admitted' });
              else if (value.type === 'request') {
                requests.push(value.path);
                reply({ type: 'response', id: value.id, status, body: btoa('{}') });
              }
              reply({ type: 'ack', credit: value.credit });
            }
          },
          close: () => peer.close(),
        };
      },
    };
    const host = {
      hostId: 'host',
      hostName: 'Host',
      deviceId: 'device',
      credential: 'test-secret',
      routes: ['https://host.deepseekbot.dev', 'http://localhost:3333'],
      encryption: {
        protocol: 'connect-noise-xk-v1' as const,
        hostKey: Buffer.from(noisePublicKey(hostKey)).toString('hex'),
        deviceKey: randomBytes(32).toString('hex'),
      },
    };
    await expect(createHostPush(raw).settings(host)).rejects.toThrow();
    expect(await revokePairing({ host, carrier: raw })).toBe('unreachable');
    expect(await removeDevice({ host, deviceId: 'other', carrier: raw })).toBe('unreachable');
    expect(
      await decideFromPush(
        [host],
        {
          hostId: host.hostId,
          kind: 'tool-approval',
          botSlug: 'bot',
          channelId: 'channel',
          messageId: 'message',
        },
        'approve',
        async (saved, route, ref, outcome) => {
          const client = createHostClient({ ...saved, routes: [route], carrier: raw });
          try {
            return await decideApproval(client, ref, outcome);
          } finally {
            client.stop();
          }
        },
      ),
    ).toBe('failed');
    expect(requests).toEqual([
      '/botharness-device/push',
      '/botharness-device/unpair',
      '/botharness-device/devices/remove',
      '/botharness-device/api/botharness/toolApprovalDecide',
    ]);
    expect(raw.request).not.toHaveBeenCalled();
  },
);

it.each([
  'https://attacker.example',
  'https://host.deepseekbot.dev.attacker.example',
  'https://host.deepseekbot.dev.',
  'https://host.deepseekbot.dev:8443',
  'http://host.deepseekbot.dev',
  'https://user:password@host.deepseekbot.dev',
])(
  'refuses a persisted untrusted route %s before sending secrets or opening streams',
  async (route) => {
    const raw = { request: vi.fn(), openSocket: vi.fn() };
    const saved = {
      hostId: 'host',
      credential: 'synthetic-device-credential',
      encryption: {
        protocol: 'connect-noise-xk-v1' as const,
        hostKey: 'ab'.repeat(32),
        deviceKey: 'cd'.repeat(32),
      },
    };
    const client = createHostClient({ ...saved, routes: [route], carrier: raw });
    const carrier = encryptedCarrier({ ...saved, raw });
    try {
      await expect(
        client.call('privateInputSubmit', {
          channelId: 'channel',
          messageId: 'message',
          values: { password: 'synthetic-password' },
        }),
      ).rejects.toMatchObject({ code: 'route-invalid' });
      expect(client.secretInputAllowed?.()).toBe(false);
      const resource = client.resource('/api/botharness/memory/image?id=synthetic');
      expect(resource.headers).toEqual({});
      expect(resource.uri).not.toContain(route);
      await expect(resource.read!(new AbortController().signal)).rejects.toMatchObject({
        code: 'route-invalid',
      });
      expect(() =>
        carrier.openSocket(route.replace(/^http/u, 'ws') + '/botharness-device/api/remote.mux', {
          open: vi.fn(),
          message: vi.fn(),
          closed: vi.fn(),
        }),
      ).toThrow('route-invalid');
      expect(raw.request).not.toHaveBeenCalled();
      expect(raw.openSocket).not.toHaveBeenCalled();
    } finally {
      client.stop();
      carrier.close?.();
    }
  },
);

it.each(['https://studio.tailnet.ts.net', 'http://127.0.0.1:3080'])(
  'retains the explicitly selected trusted route contract for %s',
  async (route) => {
    const raw = {
      request: vi.fn(async () => ({ status: 200, text: async () => '{}' })),
      openSocket: vi.fn(),
    };
    const carrier = encryptedCarrier({
      raw,
      hostId: 'host',
      credential: 'synthetic-credential',
      encryption: {
        protocol: 'connect-noise-xk-v1',
        hostKey: 'ab'.repeat(32),
        deviceKey: 'cd'.repeat(32),
      },
    });
    try {
      await carrier.request(route + '/botharness-device/push', {
        method: 'GET',
        signal: new AbortController().signal,
      });
      expect(raw.request).toHaveBeenCalledOnce();
      expect(raw.openSocket).not.toHaveBeenCalled();
    } finally {
      carrier.close?.();
    }
  },
);

it.each([true, false])(
  'rejects an unknown pairing origin before fingerprint confirmation or network (encrypted=%s)',
  async (encrypted) => {
    const raw = { request: vi.fn(), openSocket: vi.fn() };
    const confirmFingerprint = vi.fn(async () => true);
    expect(
      await redeemPairing({
        payload: {
          host: { id: 'host', name: 'Host' },
          offer: 'synthetic-offer',
          routes: ['https://attacker.example'],
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          ...(encrypted
            ? {
                encryption: {
                  protocol: 'connect-noise-xk-v1' as const,
                  publicKey: 'ab'.repeat(32),
                },
              }
            : {}),
        },
        deviceName: 'Phone',
        carrier: raw,
        confirmFingerprint,
      }),
    ).toEqual({ ok: false, code: 'no-route' });
    expect(confirmFingerprint).not.toHaveBeenCalled();
    expect(raw.request).not.toHaveBeenCalled();
    expect(raw.openSocket).not.toHaveBeenCalled();
  },
);

it.each([
  'host-key-required',
  'channel-authentication-failed',
  'channel-timeout',
  'channel-disconnected',
])('does not retry a notification approval after Connect refuses with %s', async (reason) => {
  const decide = vi.fn().mockRejectedValueOnce(new Error(reason)).mockResolvedValue('accepted');
  expect(
    await decideFromPush(
      [
        {
          hostId: 'host',
          hostName: 'Host',
          deviceId: 'device',
          credential: 'synthetic-credential',
          routes: ['https://host.deepseekbot.dev', 'http://127.0.0.1:3080'],
        },
      ],
      {
        hostId: 'host',
        kind: 'tool-approval',
        botSlug: 'bot',
        channelId: 'channel',
        messageId: 'message',
      },
      'approve',
      decide,
    ),
  ).toBe('failed');
  expect(decide).toHaveBeenCalledOnce();
});
