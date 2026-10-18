import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  AvatarSourceError,
  MAX_AVATAR_SOURCE_BYTES,
  MAX_AVATAR_SOURCE_PIXELS,
  MAX_GROUP_AVATAR_IMAGE_BYTES,
  prepareAvatarImage,
  readAvatarSource,
} from '../src/bots/avatar-source.js';
import { isPersonaBotAvatar, MAX_PERSONA_BOT_AVATAR_BYTES } from '../src/bots/persona-bot.js';
import { isGroupAvatar } from '../src/channels/channel.js';

function image(width: number, height: number, channels: 3 | 4 = 3) {
  return sharp({ create: { width, height, channels, background: '#3388aa80' } });
}
function decoded(value: string): Buffer {
  return Buffer.from(value.split(',')[1]!, 'base64');
}

function noise(width: number, height: number): Buffer {
  const pixels = Buffer.alloc(width * height * 3);
  let state = 1234567;
  for (let i = 0; i < pixels.length; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    pixels[i] = state & 255;
  }
  return pixels;
}

describe('avatar source preparation', () => {
  it.each(['png', 'jpeg', 'webp'] as const)(
    'decodes %s, preserves aspect ratio and bounds dimensions',
    async (format) => {
      const source = await image(1600, 800).toFormat(format).toBuffer();
      const prepared = await prepareAvatarImage(source);
      expect(isPersonaBotAvatar(prepared)).toBe(true);
      expect(prepared).toMatch(/^data:image\/webp;base64,/u);
      expect(await sharp(decoded(prepared)).metadata()).toMatchObject({ width: 1024, height: 512 });
    },
  );

  it('keeps small transparent images small and strips source metadata', async () => {
    const prepared = await prepareAvatarImage(
      await image(16, 8, 4).withMetadata().png().toBuffer(),
    );
    const metadata = await sharp(decoded(prepared)).metadata();
    expect(metadata).toMatchObject({ width: 16, height: 8, hasAlpha: true });
    expect(metadata.exif).toBeUndefined();
  });

  it('applies EXIF orientation before fitting dimensions', async () => {
    const source = await image(1600, 800).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const metadata = await sharp(decoded(await prepareAvatarImage(source))).metadata();
    expect(metadata).toMatchObject({ width: 512, height: 1024 });
    expect(metadata.orientation).toBeUndefined();
  });

  it('compresses detailed PNGs larger than the persisted cap for Bots and Groups', async () => {
    const source = await sharp(noise(1200, 900), { raw: { width: 1200, height: 900, channels: 3 } })
      .png()
      .toBuffer();
    expect(source.length).toBeGreaterThan(MAX_PERSONA_BOT_AVATAR_BYTES);
    expect(source.length).toBeLessThan(MAX_AVATAR_SOURCE_BYTES);
    const avatar = await prepareAvatarImage(source);
    expect(isPersonaBotAvatar(avatar)).toBe(true);
    expect(decoded(avatar).length).toBeLessThanOrEqual(MAX_PERSONA_BOT_AVATAR_BYTES);
    const groupAvatar = await prepareAvatarImage(source, MAX_GROUP_AVATAR_IMAGE_BYTES);
    expect(isGroupAvatar(groupAvatar)).toBe(true);
    expect(groupAvatar.length).toBeLessThanOrEqual(131_072);
    expect(decoded(groupAvatar).length).toBeLessThanOrEqual(MAX_GROUP_AVATAR_IMAGE_BYTES);
    expect(await prepareAvatarImage(source)).toBe(avatar);
  });

  it('refuses corrupt, unsupported, animated, too-large and oversized-dimension inputs', async () => {
    const hugeDimensions = await image(1, 1).png().toBuffer();
    hugeDimensions.writeUInt32BE(MAX_AVATAR_SOURCE_PIXELS + 1, 16);
    const frames = Buffer.concat([Buffer.alloc(12, 32), Buffer.alloc(12, 224)]);
    const animated = await sharp(frames, {
      raw: { width: 2, height: 4, pageHeight: 2, channels: 3 },
    })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    for (const bytes of [
      Buffer.alloc(0),
      Buffer.alloc(MAX_AVATAR_SOURCE_BYTES + 1),
      Buffer.from('iVBORw0KGgo=', 'base64'),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>'),
      await image(2, 2).gif().toBuffer(),
      hugeDimensions,
      animated,
    ]) {
      await expect(prepareAvatarImage(bytes)).rejects.toMatchObject({ code: 'invalid-avatar' });
    }
  });

  it('bounds source file reads and distinguishes invalid from unreadable input', () => {
    const dir = mkdtempSync(join(tmpdir(), 'avatar-source-'));
    try {
      const path = join(dir, 'source.png');
      writeFileSync(path, 'image bytes');
      expect(readAvatarSource(path)).toEqual(Buffer.from('image bytes'));
      writeFileSync(path, Buffer.alloc(MAX_AVATAR_SOURCE_BYTES + 1));
      expect(() => readAvatarSource(path)).toThrowError(AvatarSourceError);
      expect(() => readAvatarSource(path)).toThrowError(/5 MB/u);
      expect(() => readAvatarSource(join(dir, 'missing'))).toThrowError(/Cannot read/u);
      expect(() => readAvatarSource(dir)).toThrowError(/Cannot read/u);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
