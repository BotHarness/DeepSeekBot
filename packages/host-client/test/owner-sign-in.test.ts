import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { HostCarrier, HostRequest, HostSocketEvents } from '@botharness/host-protocol/carrier';
import { ConnectChannel } from '@botharness/host-protocol/noise/channel';
import { noiseFingerprint, noisePublicKey } from '@botharness/host-protocol/noise/xk';
import { teamRecord } from '@botharness/host-protocol/team-invitation';
import { createHostResources } from '../src/client-resources';
import { encryptedCarrier } from '../src/encrypted-carrier';
import { parseSavedHost, serializeSavedHost, type SavedHost } from '../src/hosts';
import { signInOwnerDevice } from '../src/owner-sign-in';
import { discoverHostAddress, signInWithPassword } from '@botharness/host-client/password-sign-in';

const route = 'https://studio.example';
const password = 'test-only-sign-in-password';
const deviceId = 'test-device-1234';
const credential = deviceId + '.' + 'a'.repeat(43);
const avatarPath = '/api/bots/avatar';

function host({
  differentSocketKey = false,
  passwordAvailable,
  passwordReply,
}: {
  differentSocketKey?: boolean;
  passwordAvailable?: boolean;
  passwordReply?: object;
} = {}) {
  const privateKey = randomBytes(32);
  const publicKey = noisePublicKey(privateKey);
  const identity = { id: 'studio', name: 'Studio', fingerprint: noiseFingerprint(publicKey) };
  const encryption = {
    publicKey: Buffer.from(publicKey).toString('hex'),
    fingerprint: identity.fingerprint,
  };
  const request = vi.fn(async (_url: string, _init: HostRequest) => ({
    status: 200,
    text: async () =>
      JSON.stringify({
        host: identity,
        encryption,
        ...(passwordAvailable === undefined ? {} : { signIn: { password: passwordAvailable } }),
      }),
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
              if (message['type'] === 'password-sign-in')
                send({
                  type: 'password-signed-in',
                  result: passwordReply ?? {
                    ok: true,
                    value: { host: identity, deviceId, credential, role: 'owner' },
                  },
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
    identity,
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

  it('rejects a channel fingerprint that does not match its advertised key', async () => {
    const test = host();
    test.request.mockResolvedValueOnce({
      status: 200,
      text: async () =>
        JSON.stringify({
          host: { id: 'studio', name: 'Studio' },
          encryption: { ...test.encryption, fingerprint: '01'.repeat(32) },
        }),
    });
    expect(await signInOwnerDevice(test.input)).toEqual({
      ok: false,
      code: 'fingerprint-mismatch',
    });
    expect(test.openSocket).not.toHaveBeenCalled();
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

describe('HTTPS address discovery and unified sign-in', () => {
  it.each([true, false, undefined])(
    'normalizes a typed address and returns password availability %s',
    async (passwordAvailable) => {
      const test = host(passwordAvailable === undefined ? {} : { passwordAvailable });
      expect(
        await discoverHostAddress({ carrier: test.carrier, input: ' Studio.Example/ ' }),
      ).toEqual({
        ok: true,
        value: {
          route,
          host: test.identity,
          publicKey: test.encryption.publicKey,
          ...(passwordAvailable === undefined ? {} : { signIn: { password: passwordAvailable } }),
        },
      });
      expect(test.request).toHaveBeenCalledWith(route + '/botharness-device/channel', {
        method: 'GET',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      });
      expect(test.openSocket).not.toHaveBeenCalled();
    },
  );

  it('codes cancellation, unreachable responses, malformed JSON and fingerprint mismatches', async () => {
    const test = host();
    const discover = (signal?: AbortSignal) =>
      discoverHostAddress({ carrier: test.carrier, input: route, ...(signal ? { signal } : {}) });
    expect(await discover(AbortSignal.abort())).toEqual({ ok: false, code: 'request-cancelled' });
    expect(test.request).not.toHaveBeenCalled();
    test.request.mockRejectedValueOnce(new Error('discovery redirect'));
    expect(await discover()).toEqual({ ok: false, code: 'unreachable' });
    test.request.mockResolvedValueOnce({
      status: 404,
      text: async () => JSON.stringify({ code: 'private-route' }),
    });
    expect(await discover()).toEqual({ ok: false, code: 'private-route' });
    test.request.mockResolvedValueOnce({
      status: 404,
      text: async () => JSON.stringify({ code: 'not-found' }),
    });
    expect(await discover()).toEqual({ ok: false, code: 'unreachable' });
    test.request.mockResolvedValueOnce({ status: 200, text: async () => '{' });
    expect(await discover()).toEqual({ ok: false, code: 'response-invalid' });
    test.request.mockResolvedValueOnce({
      status: 200,
      text: async () =>
        JSON.stringify({
          host: test.identity,
          encryption: { ...test.encryption, fingerprint: '01'.repeat(32) },
        }),
    });
    expect(await discover()).toEqual({ ok: false, code: 'fingerprint-mismatch' });
    expect(test.openSocket).not.toHaveBeenCalled();
  });

  it('uses the unified frame and saves the Owner grant', async () => {
    const test = host({ passwordAvailable: true });
    expect(await signInWithPassword(test.input)).toMatchObject({
      ok: true,
      value: { role: 'owner', hostId: 'studio', routes: [route], credential, deviceId },
    });
    expect(test.messages).toEqual([
      expect.objectContaining({
        type: 'password-sign-in',
        input: {
          username: 'owner',
          password,
          deviceName: 'Desktop',
          fingerprint: test.identity.fingerprint,
        },
      }),
    ]);
    expect(test.wire.join('')).not.toContain(password);
  });

  it.each([
    [undefined, 'host-update-required'],
    [false, 'password-sign-in-unavailable'],
  ] as const)('does not send a password when discovery advertises %s', async (available, code) => {
    const test = host(available === undefined ? {} : { passwordAvailable: available });
    expect(await signInWithPassword(test.input)).toEqual({ ok: false, code });
    expect(test.openSocket).not.toHaveBeenCalled();
  });

  it('checks the existing pairing, local Host and encryption before submitting a password', async () => {
    const test = host({ passwordAvailable: true, differentSocketKey: true });
    const previous: SavedHost = {
      hostId: 'studio',
      hostName: 'Studio',
      deviceId,
      credential,
      routes: [route],
      encryption: {
        protocol: 'connect-noise-xk-v1',
        hostKey: test.encryption.publicKey,
        deviceKey: 'ab'.repeat(32),
      },
    };
    expect(await signInWithPassword({ ...test.input, localHostId: 'studio' })).toEqual({
      ok: false,
      code: 'this-host',
    });
    expect(
      await signInWithPassword({
        ...test.input,
        previous: () => previous,
        allowExisting: () => false,
      }),
    ).toEqual({ ok: false, code: 'already-paired' });
    expect(
      await signInWithPassword({
        ...test.input,
        previous: () => ({
          ...previous,
          encryption: { ...previous.encryption!, hostKey: 'ef'.repeat(32) },
        }),
      }),
    ).toEqual({ ok: false, code: 'fingerprint-mismatch' });
    expect(test.openSocket).not.toHaveBeenCalled();
    expect(
      await signInWithPassword({
        ...test.input,
        previous: () => previous,
        allowExisting: () => true,
      }),
    ).toEqual({ ok: false, code: 'fingerprint-mismatch' });
    expect(test.openSocket).toHaveBeenCalledOnce();
    expect(test.messages).toHaveLength(0);
  });

  it.each(['rate-limited', 'team-mode-off', 'member-suspended'] as const)(
    'preserves the %s refusal for the phone to explain',
    async (code) => {
      const refusal = { ok: false, code, retryAfterSeconds: 10 };
      const test = host({ passwordAvailable: true, passwordReply: refusal });
      expect(await signInWithPassword(test.input)).toEqual(refusal);
    },
  );
});
