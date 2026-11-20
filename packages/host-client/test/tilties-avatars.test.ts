import { describe, expect, it } from 'vitest';

import { isPersonaBotAvatar } from '../../core/src/bots/persona-bot';
import originalWebp from '../assets/tilties.json';
import gameWebp from '../assets/tilties-games.json';
import {
  isTiltiesAvatar,
  randomTiltiesAvatar,
  TILTIES_COLLECTIONS,
  DEFAULT_TILTIES_COLLECTION,
} from '../src/tilties-avatars';

describe('Tilties avatars', () => {
  const portraits = TILTIES_COLLECTIONS.flatMap((collection) => collection.portraits);
  const images = portraits.map(({ image }) => image);

  it('ships 16 collections of nine distinct 512 px WebP portraits within their budgets', () => {
    expect(TILTIES_COLLECTIONS.map(({ id }) => id)).toEqual([
      'ai',
      'pioneers',
      'town',
      'fantasy',
      'genshin-1',
      'genshin-2',
      'genshin-3',
      'genshin-4',
      'genshin-5',
      'genshin-6',
      'star-rail-1',
      'star-rail-2',
      'star-rail-3',
      'wuthering-waves-1',
      'wuthering-waves-2',
      'wuthering-waves-3',
    ]);
    expect(DEFAULT_TILTIES_COLLECTION).toBe('ai');
    expect(TILTIES_COLLECTIONS[0]?.portraits.map(({ id }) => id)).toEqual([
      'deepseek',
      'gpt',
      'claude',
      'gemini',
      'qwen',
      'doubao',
      'kimi',
      'grok',
      'mistral',
    ]);
    expect(TILTIES_COLLECTIONS.map(({ portraits }) => portraits.length)).toEqual(Array(16).fill(9));
    expect(
      portraits
        .slice(0, 36)
        .map(({ id }) => id)
        .sort(),
    ).toEqual(Object.keys(originalWebp).sort());
    expect(
      portraits
        .slice(36)
        .map(({ id }) => id)
        .sort(),
    ).toEqual(Object.keys(gameWebp).sort());
    expect(new Set(images).size).toBe(144);

    let originalBytes = 0;
    let gameBytes = 0;
    for (const { id, image } of portraits) {
      expect(isPersonaBotAvatar(image)).toBe(true);
      expect(isTiltiesAvatar(image)).toBe(true);
      const bytes = Buffer.from(image.slice('data:image/webp;base64,'.length), 'base64');
      expect(bytes.toString('ascii', 12, 16)).toBe('VP8 ');
      expect(bytes.readUInt16LE(26) & 0x3fff).toBe(512);
      expect(bytes.readUInt16LE(28) & 0x3fff).toBe(512);
      expect(bytes.length).toBeLessThanOrEqual(24 * 1024);
      if (Object.hasOwn(originalWebp, id)) originalBytes += bytes.length;
      else gameBytes += bytes.length;
    }
    expect(originalBytes).toBeLessThanOrEqual(640 * 1024);
    expect(gameBytes).toBeLessThanOrEqual(1600 * 1024);
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
