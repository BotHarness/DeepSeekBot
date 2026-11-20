import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { decodeGenuiBase64 } from '../src/channels/genui-base64-bytes.js';

const require = createRequire(import.meta.url);

describe('GenUI packaged WASM decoding', () => {
  it('reproduces the packaged interpreter bytes exactly', async () => {
    const wasm = await readFile(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm'));
    const decoded = new Uint8Array(decodeGenuiBase64(wasm.toString('base64')));
    expect(decoded.byteLength).toBe(wasm.byteLength);
    expect(Buffer.from(decoded).equals(wasm)).toBe(true);
    expect(WebAssembly.validate(decoded)).toBe(true);
  });

  it('decodes every byte value and padding length', () => {
    const all = Uint8Array.from({ length: 256 }, (_, index) => index);
    for (const length of [0, 1, 2, 3, 256])
      expect([
        ...new Uint8Array(
          decodeGenuiBase64(Buffer.from(all.subarray(0, length)).toString('base64')),
        ),
      ]).toEqual([...all.subarray(0, length)]);
  });
});
