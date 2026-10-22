import { expect, it, vi } from 'vitest';

import { noiseFingerprint } from '../../../packages/core/src/devices/noise/xk';
import type { HostCarrier } from '../src/host/carrier';
import { pairHost } from '../src/host/pairing';

function imageLink(expiresAt = '2099-01-01T00:00:00Z'): string {
  return (
    'deepseekbot://pair?p=' +
    Buffer.from(
      JSON.stringify({
        v: 1,
        host: { id: 'qa-host', name: 'QA computer' },
        offer: 'qa-offer',
        routes: ['http://192.168.1.5:14277'],
        expiresAt,
        encryption: { protocol: 'connect-noise-xk-v1', publicKey: '11'.repeat(32) },
      }),
    ).toString('base64url')
  );
}

function setup() {
  const carrier = {
    request: vi.fn<HostCarrier['request']>(),
    openSocket: vi.fn<HostCarrier['openSocket']>(() => {
      throw new Error('transport boundary');
    }),
    randomBytes: () => new Uint8Array(32).fill(7),
  } satisfies HostCarrier;
  const save = vi.fn();
  const onPending = vi.fn();
  const finish = vi.fn();
  return {
    method: 'image' as const,
    text: imageLink(),
    deviceName: 'QA phone',
    carrier,
    save,
    onPending,
    telemetry: { pairing: vi.fn(() => ({ finish })) },
  };
}

it('requires full Host fingerprint confirmation for an image before any enrollment traffic', async () => {
  const options = setup();
  const confirmFingerprint = vi.fn(async () => false);
  expect(await pairHost({ ...options, confirmFingerprint })).toEqual({
    ok: false,
    code: 'host-key-confirmation-required',
  });
  expect(confirmFingerprint).toHaveBeenCalledExactlyOnceWith(
    noiseFingerprint(new Uint8Array(32).fill(0x11)),
    'QA computer',
  );
  expect(options.carrier.request).not.toHaveBeenCalled();
  expect(options.carrier.openSocket).not.toHaveBeenCalled();
  expect(options.onPending).not.toHaveBeenCalled();
  expect(options.save).not.toHaveBeenCalled();
  expect(options.telemetry.pairing).toHaveBeenCalledWith('image');
});

it('refuses image pairing when no confirmation handler is provided', async () => {
  const options = setup();
  expect(await pairHost(options)).toEqual({ ok: false, code: 'host-key-confirmation-required' });
  expect(options.carrier.openSocket).not.toHaveBeenCalled();
  expect(options.save).not.toHaveBeenCalled();
});

it('cancels while comparing the image fingerprint without enrolling even if confirmation arrives later', async () => {
  const options = setup();
  const controller = new AbortController();
  let confirm!: (matches: boolean) => void;
  const confirmation = new Promise<boolean>((resolve) => {
    confirm = resolve;
  });
  const confirmFingerprint = vi.fn(() => confirmation);
  const result = pairHost({ ...options, signal: controller.signal, confirmFingerprint });
  expect(confirmFingerprint).toHaveBeenCalledTimes(1);
  controller.abort();
  confirm(true);
  expect(await result).toEqual({ ok: false, code: 'cancelled' });
  expect(options.carrier.request).not.toHaveBeenCalled();
  expect(options.carrier.openSocket).not.toHaveBeenCalled();
  expect(options.save).not.toHaveBeenCalled();
});

it('rejects expired images before asking for trust or making a network request', async () => {
  const options = setup();
  const confirmFingerprint = vi.fn(async () => true);
  expect(
    await pairHost({ ...options, text: imageLink('2000-01-01T00:00:00Z'), confirmFingerprint }),
  ).toEqual({ ok: false, code: 'link-expired' });
  expect(confirmFingerprint).not.toHaveBeenCalled();
  expect(options.carrier.openSocket).not.toHaveBeenCalled();
  expect(options.save).not.toHaveBeenCalled();
});

it('only reaches the encrypted transport after explicit image confirmation', async () => {
  const options = setup();
  const confirmFingerprint = vi.fn(async () => true);
  await pairHost({ ...options, confirmFingerprint });
  expect(confirmFingerprint).toHaveBeenCalledTimes(1);
  expect(options.carrier.openSocket).toHaveBeenCalledTimes(1);
  expect(confirmFingerprint.mock.invocationCallOrder[0]).toBeLessThan(
    options.carrier.openSocket.mock.invocationCallOrder[0]!,
  );
  expect(options.save).not.toHaveBeenCalled();
});

it('preserves the existing camera-only QR trust rule', async () => {
  const options = setup();
  const confirmFingerprint = vi.fn(async () => false);
  await pairHost({ ...options, method: 'qr', confirmFingerprint });
  expect(confirmFingerprint).not.toHaveBeenCalled();
  expect(options.carrier.openSocket).toHaveBeenCalledTimes(1);
});
