import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { GenuiRuntimeSource } from '../channels/genui-html.js';

const manifestSchema = z.object({
  renderer: z.strictObject({
    bytes: z.number().int().positive().max(2_097_152),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  }),
});

async function readBounded(url: URL, limit: number): Promise<string> {
  const file = await open(url, 'r');
  try {
    const buffer = Buffer.allocUnsafe(limit + 1);
    let used = 0;
    while (used < buffer.byteLength) {
      const { bytesRead } = await file.read(buffer, used, buffer.byteLength - used, used);
      if (bytesRead === 0) break;
      used += bytesRead;
    }
    if (used > limit) throw Error('The packaged renderer exceeds its byte limit.');
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, used));
  } finally {
    await file.close();
  }
}

export async function loadGenuiRuntimeSource(
  sourceUrl = new URL('./genui-runtime.js', import.meta.url),
  manifestUrl = new URL('./genui-runtime.json', import.meta.url),
): Promise<GenuiRuntimeSource> {
  const manifest = manifestSchema.parse(JSON.parse(await readBounded(manifestUrl, 4096)));
  const source = await readBounded(sourceUrl, 2_097_152);
  if (
    new TextEncoder().encode(source).byteLength !== manifest.renderer.bytes ||
    createHash('sha256').update(source).digest('hex') !== manifest.renderer.sha256
  )
    throw Error('The packaged renderer byte identity changed.');
  return Object.freeze({ source, sha256: manifest.renderer.sha256 });
}
