import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { MAX_PERSONA_BOT_AVATAR_BYTES } from './persona-bot.js';

export const MAX_AVATAR_SOURCE_BYTES = 5_000_000;
export const MAX_AVATAR_SOURCE_PIXELS = 40_000_000;
export const MAX_AVATAR_DIMENSION = 1024;
export const MAX_GROUP_AVATAR_IMAGE_BYTES = 98_286;

export class AvatarSourceError extends Error {
  constructor(readonly code: 'file-unreadable' | 'invalid-avatar') {
    super(
      code === 'file-unreadable'
        ? 'Cannot read the avatar file.'
        : 'Avatar source must be a valid, static PNG, JPEG or WebP image of at most 5 MB and 40 million pixels.',
    );
  }
}

export function readAvatarSource(path: string): Buffer {
  let descriptor: number;
  try {
    descriptor = openSync(path, 'r');
  } catch {
    throw new AvatarSourceError('file-unreadable');
  }
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile()) throw new AvatarSourceError('file-unreadable');
    if (stat.size === 0 || stat.size > MAX_AVATAR_SOURCE_BYTES)
      throw new AvatarSourceError('invalid-avatar');
    const bytes = Buffer.alloc(Math.min(stat.size + 1, MAX_AVATAR_SOURCE_BYTES + 1));
    let length = 0;
    while (length < bytes.length) {
      const read = readSync(descriptor, bytes, length, bytes.length - length, null);
      if (read === 0) break;
      length += read;
    }
    if (length > stat.size || length === 0) throw new AvatarSourceError('invalid-avatar');
    return bytes.subarray(0, length);
  } catch (error) {
    if (error instanceof AvatarSourceError) throw error;
    throw new AvatarSourceError('file-unreadable');
  } finally {
    closeSync(descriptor);
  }
}

export async function prepareAvatarImage(
  source: Uint8Array,
  maxBytes = MAX_PERSONA_BOT_AVATAR_BYTES,
): Promise<string> {
  if (source.byteLength === 0 || source.byteLength > MAX_AVATAR_SOURCE_BYTES)
    throw new AvatarSourceError('invalid-avatar');
  try {
    const { default: sharp } = await import('sharp');
    const image = sharp(source, {
      limitInputPixels: MAX_AVATAR_SOURCE_PIXELS,
      failOn: 'warning',
      animated: false,
    });
    const metadata = await image.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1)
      throw new AvatarSourceError('invalid-avatar');
    const { data, info } = await image
      .autoOrient()
      .resize(MAX_AVATAR_DIMENSION, MAX_AVATAR_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (const dimension of [1024, 768, 512, 384, 256, 128]) {
      const prepared = sharp(data, { raw: info }).resize(dimension, dimension, {
        fit: 'inside',
        withoutEnlargement: true,
      });
      for (const quality of [90, 80, 65, 50]) {
        const encoded = await prepared.clone().webp({ quality, effort: 4 }).toBuffer();
        if (encoded.length <= maxBytes)
          return `data:image/webp;base64,${encoded.toString('base64')}`;
      }
    }
  } catch {
    throw new AvatarSourceError('invalid-avatar');
  }
  throw new AvatarSourceError('invalid-avatar');
}
