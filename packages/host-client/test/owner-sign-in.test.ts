import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { HostCarrier, HostRequest, HostSocketEvents } from '@botharness/host-protocol/carrier';
import { ConnectChannel } from '@botharness/host-protocol/noise/channel';
import { noiseFingerprint, noisePublicKey } from '@botharness/host-protocol/noise/xk';
import { teamRecord } from '@botharness/host-protocol/team-invitation';
import { createHostResources } from '../src/client-resources';
import { encryptedCarrier } from '../src/encrypted-carrier';
import { parseSavedHost, serializeSavedHost } from '../src/hosts';
import { signInOwnerDevice } from '../src/owner-sign-in';

const route = 'https://studio.example';
const password = 'test-only-sign-in-password';
const deviceId = 'test-device-1234';
const credential = deviceId + '.' + 'a'.repeat(43);
const avatarPath = '/api/bots/avatar';

function host({ differentSocketKey = false } = {}) {
  const privateKey = randomBytes(32);
  const publicKey = noisePublicKey(privateKey);
  const identity = { id: 'studio', name: 'Studio', fingerprint: noiseFingerprint(publicKey) };
  const encryption = {
    publicKey: Buffer.from(publicKey).toString('hex'),
    fingerprint: identity.fingerprint,
  };
  const request = vi.fn(async (_url: string, _init: HostRequest) => ({
    status: 200,
    text: async () => JSON.stringify({ host: identity, encryption }),
  }));
  const messages: unknown[] = [];
  const wire: string[] = [];
  const openSocket = vi.fn((_url: string, events: HostSocketEvents) => {
    const staticKey = differentSocketKey ? randomBytes(32) : privateKey;
    const channel = new ConnectChannel({
      role: 'responder',
      hostId: identity.id,
      staticKey,
      ephemeralKey: randomBytes(32),
      hostKey: noisePublicKey(staticKey),
    });
    queueMicrotask(events.open);
    return {
      send(frame: string) {
        wire.push(frame);
        queueMicrotask(() => {
          try {
            const result = channel.receive(frame);
            if (result.reply) events.message(result.reply);
            if (result.message) {
              const message = teamRecord(JSON.parse(result.message));
              messages.push(message);
              if (message['type'] === 'owner-sign-in')
                send({
                  type: 'owner-signed-in',
                  result: { ok: true, value: { host: identity, deviceId, credential } },
                });
              if (message['type'] === 'admit' && message['credential'] === credential)
                send({ type: 'admitted' });
              if (message['type'] === 'request') {
                const avatar = message['path'] === '/botharness-device' + avatarPath;
                send({
                  type: 'response',
                  id: message['id'],
                  status: 200,
                  ...(avatar ? { contentType: 'image/png' } : {}),
                  body: btoa(avatar ? 'test-avatar' : '{"bots":[]}'),
                });
              }
            }
          } catch {
            events.closed('channel-handshake-rejected');
          }
        });
      },
      close: () => channel.close(),
    };
    function send(message: object) {
      for (const reply of channel.send(JSON.stringify(message))) events.message(reply);
    }
  });
  const carrier: HostCarrier = { request, openSocket, randomBytes: () => randomBytes(32) };
  return {
    carrier,
    request,
    openSocket,
    messages,
    wire,
    encryption,
    input: { carrier, route, username: 'owner', password, deviceName: 'Desktop' },
  };
}

describe('Owner password sign-in', () => {
  it('validates the HTTPS discovery origin and sends credentials only inside an authenticated Noise channel', async () => {
    const test = host();
    expect(await signInOwnerDevice(test.input)).toMatchObject({
      ok: true,
      value: {
        credential,
        deviceId,
        hostId: 'studio',
        routes: [route],
        encryption: { required: true, hostKey: test.encryption.publicKey },
      },
    });
    expect(test.request.mock.calls).toEqual([
      [
        route + '/botharness-device/channel',
        {
          method: 'GET',
          redirect: 'error',
          signal: expect.any(AbortSignal),
        },
      ],
    ]);
    expect(test.openSocket.mock.calls[0]?.[0]).toBe(
      'wss://studio.example/botharness-device/channel',
    );
    expect(test.messages).toEqual([
      expect.objectContaining({
        type: 'owner-sign-in',
        input: {
          username: 'owner',
          password,
          deviceName: 'Desktop',
          fingerprint: test.encryption.fingerprint,
        },
      }),
    ]);
    expect(test.wire.join('')).not.toContain(password);
  });

  it('refuses an origin whose saved Host public key changed before opening a socket', async () => {
    const test = host();
    expect(
      await signInOwnerDevice({
        ...test.input,
        previous: () => ({
          hostId: 'studio',
          hostName: 'Studio',
          deviceId,
          credential,
          routes: [route],
          encryption: {
            protocol: 'connect-noise-xk-v1',
            hostKey: '01'.repeat(32),
            deviceKey: '02'.repeat(32),
          },
        }),
      }),
    ).toEqual({ ok: false, code: 'fingerprint-mismatch' });
    expect(test.openSocket).not.toHaveBeenCalled();
  });

  it('sends no credentials when the Noise peer cannot authenticate with the discovered key', async () => {
    const test = host({ differentSocketKey: true });
    expect(await signInOwnerDevice(test.input)).toEqual({
      ok: false,
      code: 'fingerprint-mismatch',
    });
    expect(test.messages).toHaveLength(0);
  });

  it('preserves encrypted Owner access after saving a Tailscale or custom HTTPS route', async () => {
    const test = host();
    const address = 'https://studio.tailnet.ts.net';
    const signed = await signInOwnerDevice({ ...test.input, route: address });
    if (!signed.ok) throw new Error(signed.code);
    const saved = parseSavedHost(serializeSavedHost(signed.value));
    if (!saved) throw new Error('Saved Owner device required');
    const transport = encryptedCarrier({ ...saved, raw: test.carrier });
    try {
      const response = await transport.request(address + '/botharness-device/api/botharness/list', {
        method: 'POST',
        signal: AbortSignal.timeout(3000),
      });
      expect(await response.text()).toBe('{"bots":[]}');
      expect(test.request).toHaveBeenCalledOnce();
      expect(test.openSocket).toHaveBeenCalledTimes(2);
      expect(test.messages).toContainEqual(expect.objectContaining({ type: 'admit', credential }));
      expect(test.wire.join('')).not.toContain(credential);
    } finally {
      transport.close?.();
    }
  });

  it('loads a Host avatar through Noise on a password-enrolled custom HTTPS origin', async () => {
    const test = host();
    const signed = await signInOwnerDevice(test.input);
    if (!signed.ok) throw new Error(signed.code);
    const transport = encryptedCarrier({ ...signed.value, raw: test.carrier });
    const resources = createHostResources(
      { ...signed.value, carrier: test.carrier },
      transport,
      { authorization: `Device ${credential}` },
      3000,
      { route, running: true },
      () => {},
    );
    try {
      expect(resources.avatar(avatarPath)).toEqual({});
      await vi.waitFor(() =>
        expect(resources.avatar(avatarPath)).toEqual({
          avatarUrl: `data:image/png;base64,${btoa('test-avatar')}`,
          avatarHeaders: {},
        }),
      );
      expect(test.request).toHaveBeenCalledOnce();
    } finally {
      transport.close?.();
    }
  });

  it('does not use HTTP or continue after HTTPS discovery rejects', async () => {
    const test = host();
    expect(await signInOwnerDevice({ ...test.input, route: 'http://studio.example' })).toEqual({
      ok: false,
      code: 'insecure-transport',
    });
    expect(test.request).not.toHaveBeenCalled();
    test.request.mockRejectedValueOnce(new TypeError('TLS certificate rejected'));
    expect(await signInOwnerDevice(test.input)).toEqual({ ok: false, code: 'unreachable' });
    expect(test.openSocket).not.toHaveBeenCalled();
  });
});
