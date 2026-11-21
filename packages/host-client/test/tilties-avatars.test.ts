import { describe, expect, it } from 'vitest';

import { isPersonaBotAvatar } from '../../core/src/bots/persona-bot';
import webp from '../assets/tilties.json';
import { isTiltiesAvatar, randomTiltiesAvatar, TILTIES_PORTRAITS } from '../src/tilties-avatars';

describe('Tilties avatars', () => {
  const images = TILTIES_PORTRAITS.map(({ image }) => image);

  it('ships the 36 built-in portraits as a single gallery of distinct 512 px WebP images', () => {
    expect(TILTIES_PORTRAITS).toHaveLength(36);
    expect(TILTIES_PORTRAITS.map(({ id }) => id).sort()).toEqual(Object.keys(webp).sort());
    expect(new Set(images).size).toBe(36);
    let totalBytes = 0;
    for (const { image } of TILTIES_PORTRAITS) {
      expect(isPersonaBotAvatar(image)).toBe(true);
      expect(isTiltiesAvatar(image)).toBe(true);
      const bytes = Buffer.from(image.slice('data:image/webp;base64,'.length), 'base64');
      expect(bytes.toString('ascii', 12, 16)).toBe('VP8 ');
      expect(bytes.readUInt16LE(26) & 0x3fff).toBe(512);
      expect(bytes.readUInt16LE(28) & 0x3fff).toBe(512);
      expect(bytes.length).toBeLessThanOrEqual(24 * 1024);
      totalBytes += bytes.length;
    }
    expect(totalBytes).toBeLessThanOrEqual(640 * 1024);
  });

  it('shuffles among bundled portraits and excludes the one already shown', () => {
    expect(images).toContain(randomTiltiesAvatar());
    for (const image of images) {
      const shuffled = randomTiltiesAvatar(image);
      expect(images).toContain(shuffled);
      expect(shuffled).not.toBe(image);
    }
    expect(isTiltiesAvatar('data:image/webp;base64,AA==')).toBe(false);
  });
});
