import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createTempRoot } from './helpers.js';
const paired = vi.hoisted(() => vi.fn());
vi.mock('../../../apps/mobile/src/host/pairing.js', () => ({ pairHost: paired }));
import { runDeviceClientCommand } from '../src/bots/cli-device-client.js';

it('requires trusted-file confirmation and never returns saved device secrets on stdout', async () => {
  const root = createTempRoot('lan-cli-');
  const link = join(root, 'link.txt'),
    out = join(root, 'device.json');
  writeFileSync(link, 'private-pairing-link');
  const values = { 'link-file': link, out };
  const pending = vi.fn();
  const fingerprint = '1234 '.repeat(15) + '5678';
  await expect(runDeviceClientCommand('device-pair', [], values)).rejects.toThrow('confirm');
  expect(paired).not.toHaveBeenCalled();
  paired.mockImplementation(async (options) => {
    expect(options.text).toBe('private-pairing-link');
    options.onPending(fingerprint);
    options.onPending(fingerprint);
    expect(pending).toHaveBeenCalledExactlyOnceWith(
      `${JSON.stringify({ type: 'device-key-confirmation-required', fingerprint })}\n`,
    );
    expect(() => readFileSync(out)).toThrow();
    await options.save({
      hostId: 'host',
      deviceId: 'device',
      credential: 'private-secret',
      encryption: { deviceKey: 'private-key' },
    });
    return { ok: true };
  });
  const result = await runDeviceClientCommand(
    'device-pair',
    [],
    { ...values, confirm: true },
    pending,
  );
  expect(result).toEqual({
    hostId: 'host',
    deviceId: 'device',
    encrypted: true,
    pairing: { path: out },
  });
  expect(JSON.stringify(result)).not.toContain('private-');
  expect(JSON.parse(readFileSync(out, 'utf8')).credential).toBe('private-secret');
  await expect(
    runDeviceClientCommand('device-pair', [], { ...values, confirm: true }),
  ).rejects.toThrow('new --out');
  expect(paired).toHaveBeenCalledOnce();
});

it('uses authenticated account enrollment for an offline Host without a trusted pasted link', async () => {
  const root = createTempRoot('account-cli-');
  const file = join(root, 'account.json');
  const out = join(root, 'device.json');
  writeFileSync(
    file,
    JSON.stringify({
      clientId: 'client_01TEST',
      subject: 'user_alice',
      refreshToken: 'private-refresh',
    }),
    { mode: 0o600 },
  );
  const request = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).includes('authenticate'))
      return Response.json({
        access_token: 'private-access',
        refresh_token: 'private-refresh',
        user: { id: 'user_alice' },
      });
    if (String(url).endsWith('/offer'))
      return Response.json({
        identitySource: 'client',
        hostname: 'hstudio.deepseekbot.dev',
        enrollment: { body: 'private-proof', signature: 'private-signature' },
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      });
    if (String(url).endsWith('/botharness-device/channel'))
      return Response.json({
        host: { id: 'host', name: 'Studio' },
        encryption: { protocol: 'connect-noise-xk-v1', publicKey: 'ab'.repeat(32) },
      });
    throw new Error('Unexpected request');
  });
  try {
    paired.mockImplementationOnce(async (options) => {
      expect(options.method).toBe('account');
      const offer = await options.text();
      expect(offer).toMatchObject({
        ok: true,
        payload: { host: { id: 'host' }, enrollment: { body: 'private-proof' } },
      });
      await options.save({
        hostId: 'host',
        deviceId: 'device',
        credential: 'private-device',
        routes: ['https://hstudio.deepseekbot.dev'],
        encryption: {},
      });
      return { ok: true };
    });
    const result = await runDeviceClientCommand('device-account-pair', [], {
      'account-file': file,
      'host-id': 'hstudio',
      out,
      confirm: true,
    });
    expect(result).toMatchObject({ hostId: 'host', deviceId: 'device' });
    expect(JSON.stringify(result)).not.toContain('private-');
  } finally {
    request.mockRestore();
  }
});
