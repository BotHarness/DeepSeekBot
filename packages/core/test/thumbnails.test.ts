import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  loadImageProcessor,
  parseThumbnailVariant,
  THUMBNAIL_VARIANTS,
} from '../src/attachments/thumbnails.js';

const image = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } })
    .png()
    .toBuffer();

describe('attachment thumbnails', () => {
  it('reports dimensions and a thumbhash for an image', async () => {
    const processor = (await loadImageProcessor())!;
    const facts = await processor.facts(await image(1200, 600));
    expect(facts).toMatchObject({ width: 1200, height: 600 });
    expect(Buffer.from(facts!.thumbhash, 'base64').length).toBeGreaterThan(4);
  });

  it('makes WebP variants within their bounds and never upscales', async () => {
    const processor = (await loadImageProcessor())!;
    const large = await image(1600, 900);
    for (const variant of Object.keys(THUMBNAIL_VARIANTS) as (keyof typeof THUMBNAIL_VARIANTS)[]) {
      const bytes = await processor.thumbnail(large, variant);
      const meta = await sharp(bytes!).metadata();
      expect(meta.format).toBe('webp');
      const { size, fit } = THUMBNAIL_VARIANTS[variant];
      if (fit === 'cover') expect([meta.width, meta.height]).toEqual([size, size]);
      else expect(Math.max(meta.width!, meta.height!)).toBe(size);
    }
    const small = await processor.thumbnail(await image(40, 30), '800');
    expect(await sharp(small!).metadata()).toMatchObject({ width: 40, height: 30 });
  });

  it('applies EXIF orientation to dimensions', async () => {
    const processor = (await loadImageProcessor())!;
    const rotated = await sharp(await image(300, 100))
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect(await processor.facts(rotated)).toMatchObject({ width: 100, height: 300 });
  });

  it('returns nothing for bytes that are not an image', async () => {
    const processor = (await loadImageProcessor())!;
    const junk = Buffer.from('not an image at all');
    expect(await processor.facts(junk)).toBeUndefined();
    expect(await processor.thumbnail(junk, '320')).toBeUndefined();
  });

  it('accepts only the known variants', () => {
    expect(parseThumbnailVariant('320')).toBe('320');
    expect(parseThumbnailVariant('96c')).toBe('96c');
    expect(parseThumbnailVariant('2000')).toBeUndefined();
    expect(parseThumbnailVariant('__proto__')).toBeUndefined();
  });
});
