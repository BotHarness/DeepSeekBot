import { describe, expect, it } from 'vitest';

import { isPersonaBotAvatar } from '../../core/src/bots/persona-bot';
import webp from '../assets/tilties.json';
import { isTiltiesAvatar, randomTiltiesAvatar, TILTIES_COLLECTIONS } from '../src/tilties-avatars';

describe('original Tilties avatars', () => {
  const portraits = TILTIES_COLLECTIONS.flatMap((collection) => collection.portraits);
  const images = portraits.map(({ image }) => image);

  it('ships three collections of nine distinct 512 px WebP images within the bundle budget', () => {
    expect(TILTIES_COLLECTIONS.map(({ id }) => id)).toEqual(['pioneers', 'town', 'fantasy']);
    expect(TILTIES_COLLECTIONS.map(({ portraits }) => portraits.length)).toEqual([9, 9, 9]);
    expect(portraits.map(({ id }) => id).sort()).toEqual(Object.keys(webp).sort());
    expect(new Set(images).size).toBe(27);

    let totalBytes = 0;
    for (const image of images) {
      expect(isPersonaBotAvatar(image)).toBe(true);
      expect(isTiltiesAvatar(image)).toBe(true);
      const bytes = Buffer.from(image.slice('data:image/webp;base64,'.length), 'base64');
      expect(bytes.toString('ascii', 12, 16)).toBe('VP8 ');
      expect(bytes.readUInt16LE(26) & 0x3fff).toBe(512);
      expect(bytes.readUInt16LE(28) & 0x3fff).toBe(512);
      expect(bytes.length).toBeLessThanOrEqual(24 * 1024);
      totalBytes += bytes.length;
    }
    expect(totalBytes).toBeLessThanOrEqual(384 * 1024);
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
