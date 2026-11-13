import { expect, it } from 'vitest';
import { encode } from 'uqr';
import { decodeQrPixels, QR_IMAGE_MAX_EDGE, readQrImage } from '../src/client/qr-image.js';
import { pairingLink } from '../../core/src/devices/http.js';
import { parsePairingLink } from '../../../apps/mobile/src/host/pairing.js';

it('reads a real pairing QR image with the full identity and routes unchanged', () => {
  const link = pairingLink({
    v: 1,
    host: { id: 'remote', name: 'Studio' },
    offer: 'one-time',
    routes: ['https://studio.example.ts.net', 'http://192.168.1.10:14277'],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const qr = encode(link, { border: 4 });
  const scale = 4;
  const width = qr.size * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < width; y++)
    for (let x = 0; x < width; x++) {
      if (!qr.data[Math.floor(y / scale)]?.[Math.floor(x / scale)]) continue;
      const offset = (y * width + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
    }
  const decoded = decodeQrPixels(pixels, width, width);
  expect(decoded).toBe(link);
  expect(parsePairingLink(decoded)).toEqual(parsePairingLink(link));
});
it('bounds decoding work and refuses blank or unsupported images', async () => {
  expect(() => decodeQrPixels(new Uint8ClampedArray(), QR_IMAGE_MAX_EDGE + 1, 1)).toThrow(
    'image-too-large',
  );
  expect(() => decodeQrPixels(new Uint8ClampedArray(400).fill(255), 10, 10)).toThrow(
    'qr-not-found',
  );
  await expect(readQrImage(new File(['x'], 'x.svg', { type: 'image/svg+xml' }))).rejects.toThrow(
    'unsupported-image',
  );
});
