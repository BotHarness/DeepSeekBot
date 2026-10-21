import { expect, it, vi } from 'vitest';
import { encryptedCarrier } from '../src/host/encrypted-carrier';

it('refuses a legacy Connect pairing before any credential reaches the raw carrier', async () => {
  const request = vi.fn(),
    openSocket = vi.fn();
  const carrier = encryptedCarrier({
    raw: { request, openSocket },
    hostId: 'host',
    credential: 'private-credential',
  });
  await expect(
    carrier.request('https://host.deepseekbot.dev/botharness-device/api/botharness/list', {
      method: 'POST',
      signal: new AbortController().signal,
      headers: { authorization: 'Device private-credential' },
      body: '{}',
    }),
  ).rejects.toThrow('host-key-required');
  expect(request).not.toHaveBeenCalled();
  expect(openSocket).not.toHaveBeenCalled();
});

import { parseSavedHost, withHost } from '../src/host/hosts';
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
    expect(requests).toEqual([
      '/botharness-device/push',
      '/botharness-device/unpair',
      '/botharness-device/devices/remove',
    ]);
    expect(raw.request).not.toHaveBeenCalled();
  },
);
