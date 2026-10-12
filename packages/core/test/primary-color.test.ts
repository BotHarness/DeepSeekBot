import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ILLUSTRATED_RECIPE,
  seededAvatarFor,
  type AvatarRecipe,
} from '../src/bots/avatar-appearance.js';
import { DEFAULT_LINE_RECIPE } from '../src/bots/avatar-line.js';
import {
  fallbackPrimaryColor,
  isBotPrimaryColor,
  mainHairColor,
  nextBotPrimaryColor,
  resolveBotPrimaryColor,
  resolvedAvatarRecipe,
  type BotPresentationSubject,
} from '../src/bots/primary-color.js';

const REVISION = 'a'.repeat(64);
const IMAGE = '/api/botharness/bot-avatar?slug=ada&v=1';

function bot(overrides: Partial<BotPresentationSubject> = {}): BotPresentationSubject {
  return { slug: 'ada', displayName: 'Ada', ...overrides };
}

function saved(recipe: AvatarRecipe): Partial<BotPresentationSubject> {
  return { avatar: IMAGE, appearance: { revision: REVISION, recipe } };
}

describe('Bot Primary Color source resolution', () => {
  it('follows the Avatar the renderer draws: name-seeded until an Appearance is saved', () => {
    for (const avatarSeed of [undefined, 2] as const) {
      const unsaved = bot({ avatarSeed });
      expect(resolvedAvatarRecipe(unsaved)).toEqual(seededAvatarFor('Ada', avatarSeed));
      expect(resolveBotPrimaryColor(unsaved)).toEqual({
        mode: 'automatic',
        source: 'hair',
        color: seededAvatarFor('Ada', avatarSeed).hairColor,
      });
      const renamed = bot({ avatarSeed, displayName: 'Grace Hopper' });
      expect(resolveBotPrimaryColor(renamed).color).toBe(
        seededAvatarFor('Grace Hopper', avatarSeed).hairColor,
      );
    }
    expect(resolvedAvatarRecipe(bot({ displayName: '' }))).toEqual(
      seededAvatarFor('ada', undefined),
    );

    const recipe = { ...DEFAULT_ILLUSTRATED_RECIPE, hairColor: '#C4452F' };
    const kept = bot({ ...saved(recipe), displayName: 'Renamed' });
    expect(resolvedAvatarRecipe(kept)).toEqual(recipe);
    expect(resolveBotPrimaryColor(kept)).toMatchObject({ source: 'hair', color: '#c4452f' });
  });

  it('reselects only on the main hair color', () => {
    const base = seededAvatarFor('Ada', 2);
    const color = resolveBotPrimaryColor(bot(saved(base))).color;
    for (const incidental of [
      { leftSideHairColor: '#ffffff', rightSideHairColor: '#000000' },
      { pose: 'left' },
      { accessory: 'beanie' },
      { accessory: 'crown', shirtColor: '#123456', skinColor: '#654321' },
    ]) {
      const recipe = { ...base, ...incidental } as AvatarRecipe;
      expect(resolveBotPrimaryColor(bot(saved(recipe))).color, JSON.stringify(incidental)).toBe(
        color,
      );
    }
    const dyed = { ...base, hairColor: '#3fc1b8' } as AvatarRecipe;
    expect(resolveBotPrimaryColor(bot(saved(dyed))).color).toBe('#3fc1b8');
  });

  it('keeps valid black, white and gray hair as the source', () => {
    for (const hairColor of ['#000000', '#ffffff', '#9aa3ad']) {
      const recipe = { ...DEFAULT_ILLUSTRATED_RECIPE, hairColor };
      expect(resolveBotPrimaryColor(bot(saved(recipe)))).toEqual({
        mode: 'automatic',
        source: 'hair',
        color: hairColor,
      });
    }
  });

  it('uses one stable ID fallback without hair, for line Avatars, images and unknown data', () => {
    const fallback = fallbackPrimaryColor('ada');
    expect(fallback).toMatch(/^#[0-9a-f]{6}$/u);
    const hairless = {
      ...seededAvatarFor('Ada', 2),
      hair: 'none',
      bangs: 'none',
      sideHair: 'none',
      rightSideHair: 'none',
      backHair: 'none',
    } as AvatarRecipe;
    expect(mainHairColor(hairless)).toBeUndefined();
    expect(mainHairColor({ ...DEFAULT_ILLUSTRATED_RECIPE, hair: 'none' })).toBeUndefined();
    const retained = {
      revision: REVISION,
      recipe: { family: 'future', schemaVersion: 9, assetVersion: 1, rigVersion: 1 },
    };
    for (const subject of [
      bot(saved(hairless)),
      bot(saved(DEFAULT_LINE_RECIPE)),
      bot({ avatar: IMAGE }),
      bot({ avatar: IMAGE, appearance: retained }),
      bot({ avatar: IMAGE, displayName: 'Renamed' }),
    ]) {
      expect(resolveBotPrimaryColor(subject)).toEqual({
        mode: 'automatic',
        source: 'fallback',
        color: fallback,
      });
    }
    expect(fallbackPrimaryColor('ada')).toBe(fallback);
    const carried = { mode: 'automatic', fallback: '#123456' } as const;
    expect(resolveBotPrimaryColor(bot({ avatar: IMAGE, primaryColor: carried })).color).toBe(
      '#123456',
    );
    expect(resolveBotPrimaryColor(bot({ primaryColor: carried })).source).toBe('hair');
  });

  it('lets Custom override any Avatar, and allows two Bots the same color', () => {
    const primaryColor = { mode: 'custom', color: '#000000' } as const;
    for (const subject of [
      bot({ primaryColor }),
      bot({ primaryColor, avatar: IMAGE }),
      bot({ primaryColor, slug: 'bob', displayName: 'Bob' }),
    ]) {
      expect(resolveBotPrimaryColor(subject)).toEqual({
        mode: 'custom',
        source: 'custom',
        color: '#000000',
      });
    }
  });

  it('stores only a source policy and keeps a carried fallback across choices', () => {
    expect(isBotPrimaryColor({ mode: 'automatic' })).toBe(true);
    expect(isBotPrimaryColor({ mode: 'automatic', fallback: '#123456' })).toBe(true);
    expect(isBotPrimaryColor({ mode: 'custom', color: '#abcdef' })).toBe(true);
    for (const invalid of [
      { mode: 'custom' },
      { mode: 'custom', color: '#ABCDEF' },
      { mode: 'custom', color: '#abcdef', light: '#000000' },
      { mode: 'automatic', color: '#abcdef' },
      { mode: 'automatic', fallback: 'blue' },
      [],
      null,
    ])
      expect(isBotPrimaryColor(invalid), JSON.stringify(invalid)).toBe(false);

    expect(nextBotPrimaryColor(undefined, { mode: 'automatic' })).toBeUndefined();
    expect(nextBotPrimaryColor(undefined, { mode: 'custom', color: '#ABCDEF' })).toEqual({
      mode: 'custom',
      color: '#abcdef',
    });
    const carried = { mode: 'automatic', fallback: '#123456' } as const;
    const custom = nextBotPrimaryColor(carried, { mode: 'custom', color: '#abcdef' });
    expect(custom).toEqual({ mode: 'custom', color: '#abcdef', fallback: '#123456' });
    expect(nextBotPrimaryColor(custom || undefined, { mode: 'automatic' })).toEqual(carried);
    expect(nextBotPrimaryColor(undefined, { mode: 'custom', color: '#abc' })).toBe(false);
  });
});
