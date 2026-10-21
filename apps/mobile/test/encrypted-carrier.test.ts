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
