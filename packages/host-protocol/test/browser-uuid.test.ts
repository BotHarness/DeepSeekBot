import { expect, it, vi } from 'vitest';
import { createBrowserUuid } from '../src/browser-uuid.js';

it('uses the native UUID without drawing fallback bytes when available', () => {
  const getRandomValues = vi.spyOn(crypto, 'getRandomValues');
  const nativeUuid = vi.spyOn(crypto, 'randomUUID');
  try {
    const id = createBrowserUuid();
    expect(nativeUuid).toHaveBeenCalledTimes(1);
    expect(id).toBe(nativeUuid.mock.results[0]?.value);
    expect(getRandomValues).not.toHaveBeenCalled();
  } finally {
    nativeUuid.mockRestore();
    getRandomValues.mockRestore();
  }
});

it('draws 16 Web Crypto bytes and sets the UUID v4 version and variant bits', () => {
  const getRandomValues: Crypto['getRandomValues'] = (bytes) => {
    expect(bytes).toBeInstanceOf(Uint8Array);
    if (bytes instanceof Uint8Array) bytes.fill(0xff);
    return bytes;
  };
  expect(createBrowserUuid({ getRandomValues })).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
});
