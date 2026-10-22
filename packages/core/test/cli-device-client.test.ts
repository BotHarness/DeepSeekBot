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
  await expect(runDeviceClientCommand('device-pair', [], values)).rejects.toThrow('confirm');
  expect(paired).not.toHaveBeenCalled();
  paired.mockImplementation(async (options) => {
    expect(options.text).toBe('private-pairing-link');
    await options.save({
      hostId: 'host',
      deviceId: 'device',
      credential: 'private-secret',
      encryption: { deviceKey: 'private-key' },
    });
    return { ok: true };
  });
  const result = await runDeviceClientCommand('device-pair', [], { ...values, confirm: true });
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
