import { describe, expect, it } from 'vitest';

import {
  AVATAR_HAIR_PARTS,
  AVATAR_PARTS,
  AVATAR_PRESETS,
  AVATAR_RANGES,
  canonicalAvatarRecipe,
  detailedAvatarRecipe,
  DEFAULT_ILLUSTRATED_RECIPE,
  illustratedAvatarSvg,
  isIllustratedAvatarRecipe,
  seededAvatarRecipe,
  type AvatarPart,
  type IllustratedAvatarRecipe,
  withAvatarSpecies,
} from '../src/bots/avatar-appearance.js';
import { deriveAvatarAppearance } from '../src/bots/avatar-snapshot.js';
import { MAX_PERSONA_BOT_AVATAR_BYTES } from '../src/bots/persona-bot.js';

const parts = Object.keys(AVATAR_PARTS) as AvatarPart[];
const variants: IllustratedAvatarRecipe[] = parts.flatMap((part) =>
  AVATAR_PARTS[part].map((value) => ({ ...DEFAULT_ILLUSTRATED_RECIPE, [part]: value })),
);
const crowded: IllustratedAvatarRecipe[] = AVATAR_PARTS.head.flatMap((head) =>
  AVATAR_PARTS.hair.map((hair, index) => ({
    ...DEFAULT_ILLUSTRATED_RECIPE,
    head,
    hair,
    glasses: AVATAR_PARTS.glasses[index % AVATAR_PARTS.glasses.length]!,
    accessory: AVATAR_PARTS.accessory[index % AVATAR_PARTS.accessory.length]!,
  })),
);

describe('illustrated Avatar artwork', () => {
  it('renders every catalog option as distinct, inert, id-free pixel markup with stable rig nodes', () => {
    for (const part of parts.filter((name) => name !== 'backdrop')) {
      const rendered = new Set(
        AVATAR_PARTS[part].map((value) =>
          illustratedAvatarSvg({ ...DEFAULT_ILLUSTRATED_RECIPE, [part]: value }),
        ),
      );
      expect(rendered.size, part).toBe(AVATAR_PARTS[part].length);
    }
    for (const recipe of [...variants, ...crowded]) {
      const svg = illustratedAvatarSvg(recipe);
      expect(svg).not.toMatch(/\sid=|<defs|<script|<image|href=|url\(/u);
      expect(svg).toContain('viewBox="0 0 32 32"');
      expect(svg).toContain('shape-rendering="crispEdges"');
      expect(svg).not.toContain('data-avatar-attention-mark');
      for (const node of ['body', 'head', 'face', 'gaze', 'blink'])
        expect(svg).toContain(`class="bh-illustrated-${node}"`);
      expect(svg).not.toContain('data-avatar-mark=');
      expect(svg).not.toContain('<path');
      expect(svg).toContain('<g data-avatar-pixel-morph=""></g>');
      expect(svg.match(/<rect/gu)!.length).toBeLessThan(1400);
    }
  });

  it('joins both lenses of framed glasses with a continuous bridge', () => {
    for (const [glasses, from, to] of [
      ['round', 14, 17],
      ['square', 14, 17],
    ] as const) {
      const svg = illustratedAvatarSvg({ ...DEFAULT_ILLUSTRATED_RECIPE, glasses });
      const row = [
        ...svg.matchAll(/<rect x="(\d+)" y="16" width="(\d+)" height="1" fill="#2a2230"\/>/gu),
      ];
      const covered = new Set(
        row.flatMap(([, x, w]) => Array.from({ length: Number(w) }, (_, i) => Number(x) + i)),
      );
      for (let x = from; x <= to; x++) expect(covered.has(x), `${glasses} x=${x}`).toBe(true);
    }
  });

  it('keeps every static pixel inside the rounded tile', () => {
    const inside = (x: number, y: number) => {
      const clamp = (v: number) => Math.min(Math.max(v, 6), 26);
      return (x + 0.5 - clamp(x + 0.5)) ** 2 + (y + 0.5 - clamp(y + 0.5)) ** 2 <= 36;
    };
    for (const recipe of [...variants, ...crowded]) {
      const svg = illustratedAvatarSvg(recipe).replace(
        /<g data-avatar-attention-mark[\s\S]*?<\/g>/gu,
        '',
      );
      for (const [, x, y, w] of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)"/gu))
        for (let i = 0; i < Number(w); i++)
          expect(
            inside(Number(x) + i, Number(y)),
            `${recipe.hair}/${recipe.accessory} ${x},${y}`,
          ).toBe(true);
    }
  });

  it('splits hair into bangs, side and back hair with bounded geometry, all-or-none', () => {
    const base = detailedAvatarRecipe(DEFAULT_ILLUSTRATED_RECIPE);
    expect(isIllustratedAvatarRecipe(base)).toBe(true);
    for (const part of Object.keys(AVATAR_HAIR_PARTS) as (keyof typeof AVATAR_HAIR_PARTS)[]) {
      const rendered = new Set(
        AVATAR_HAIR_PARTS[part].map((value) =>
          illustratedAvatarSvg({
            ...base,
            bangs: 'none',
            sideHair: 'none',
            backHair: 'none',
            [part]: value,
          }),
        ),
      );
      expect(rendered.size, part).toBe(AVATAR_HAIR_PARTS[part].length);
    }
    for (const [key, [min, max]] of Object.entries(AVATAR_RANGES)) {
      expect(isIllustratedAvatarRecipe({ ...base, [key]: min })).toBe(true);
      expect(isIllustratedAvatarRecipe({ ...base, [key]: max })).toBe(true);
      expect(isIllustratedAvatarRecipe({ ...base, [key]: max + 1 })).toBe(false);
      expect(isIllustratedAvatarRecipe({ ...base, [key]: 0.5 })).toBe(false);
      expect(deriveAvatarAppearance({ ...base, [key]: min - 1 })).toBeUndefined();
    }
    const { bangs: _bangs, ...partial } = base;
    expect(isIllustratedAvatarRecipe(partial)).toBe(false);
    expect(isIllustratedAvatarRecipe({ ...base, backHair: 'crown' })).toBe(false);
    expect(canonicalAvatarRecipe({ ...base, backHair: 'twintails' })).toMatchObject({
      bangs: base.bangs,
      backHair: 'twintails',
      hairLength: 0,
    });
    const inside = (x: number, y: number) => {
      const clamp = (v: number) => Math.min(Math.max(v, 6), 26);
      return (x + 0.5 - clamp(x + 0.5)) ** 2 + (y + 0.5 - clamp(y + 0.5)) ** 2 <= 36;
    };
    for (const backHair of AVATAR_HAIR_PARTS.backHair)
      for (const pose of AVATAR_PARTS.pose)
        for (const extreme of [-1, 1]) {
          const recipe = {
            ...base,
            pose,
            backHair,
            spacing: extreme,
            height: extreme,
            hairLength: extreme * 2,
          };
          const svg = illustratedAvatarSvg(recipe, { turns: [-14, 14] });
          expect(deriveAvatarAppearance(recipe), `${backHair}/${pose}`).toBeDefined();
          for (const [, x, y, w] of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)"/gu))
            for (let i = 0; i < Number(w); i++)
              expect(inside(Number(x) + i, Number(y)), `${backHair}/${pose}`).toBe(true);
        }
  });

  it('derives a stable, valid default recipe from the name alone', () => {
    const ada = seededAvatarRecipe('Ada Lovelace');
    expect(isIllustratedAvatarRecipe(ada)).toBe(true);
    expect(seededAvatarRecipe('  ada lovelace ')).toEqual(ada);
    expect(ada.pose).toBe('front');
    const names = ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Barbara', '小明', 'Rin'];
    const recipes = names.map(seededAvatarRecipe);
    expect(new Set(recipes.map((recipe) => JSON.stringify(recipe))).size).toBe(names.length);
    for (const recipe of recipes) expect(() => illustratedAvatarSvg(recipe)).not.toThrow();
  });

  it('tints the tile from the hair colour and keeps colourless hair on paper', () => {
    const tile = (hairColor: string) =>
      illustratedAvatarSvg({ ...DEFAULT_ILLUSTRATED_RECIPE, hairColor }).match(
        /<rect width="32" height="32" rx="6" fill="(#[\da-f]{6})"/u,
      )![1];
    expect(tile('#1d1b22')).toBe('#ece8e1');
    expect(tile('#f4f1ec')).toBe('#ece8e1');
    const teal = tile('#3fc1b8');
    expect(teal).not.toBe('#ece8e1');
    expect(teal).not.toBe(tile('#e2b04a'));
    for (const backdrop of AVATAR_PARTS.backdrop)
      expect(tile('#3fc1b8')).toBe(
        illustratedAvatarSvg({
          ...DEFAULT_ILLUSTRATED_RECIPE,
          hairColor: '#3fc1b8',
          backdrop,
        }).match(/<rect width="32" height="32" rx="6" fill="(#[\da-f]{6})"/u)![1],
      );
  });

  it('ships distinct, valid presets', () => {
    expect(AVATAR_PRESETS).toHaveLength(28);
    expect(
      AVATAR_PRESETS.flatMap((recipe) => ('species' in recipe ? [recipe.species] : [])),
    ).toEqual(
      expect.arrayContaining([
        'elf',
        'dwarf',
        'orc',
        'goblin',
        'flower',
        'cat',
        'dog',
        'fox',
        'rabbit',
        'bear',
      ]),
    );
    expect(new Set(AVATAR_PRESETS.map((recipe) => JSON.stringify(recipe))).size).toBe(
      AVATAR_PRESETS.length,
    );
    for (const recipe of AVATAR_PRESETS) expect(isIllustratedAvatarRecipe(recipe)).toBe(true);
  });

  it('rejects unknown parts and keeps the recipe closed', () => {
    expect(isIllustratedAvatarRecipe(DEFAULT_ILLUSTRATED_RECIPE)).toBe(true);
    for (const invalid of [
      { ...DEFAULT_ILLUSTRATED_RECIPE, eyes: 'laser' },
      { ...DEFAULT_ILLUSTRATED_RECIPE, accessory: 'glasses' },
      { ...DEFAULT_ILLUSTRATED_RECIPE, extra: 'x' },
      { ...DEFAULT_ILLUSTRATED_RECIPE, skinColor: 'red' },
    ])
      expect(isIllustratedAvatarRecipe(invalid)).toBe(false);
  });

  it('applies recipe colours and derives a bounded snapshot for every option and extreme colours', () => {
    const extreme = {
      ...DEFAULT_ILLUSTRATED_RECIPE,
      skinColor: '#000000',
      hairColor: '#ffffff',
      shirtColor: '#ff00ff',
    };
    const svg = illustratedAvatarSvg(extreme);
    for (const colour of ['#000000', '#ff00ff']) expect(svg).toContain(`fill="${colour}"`);
    for (const recipe of [extreme, ...variants]) {
      const derived = deriveAvatarAppearance(recipe);
      expect(derived).toBeDefined();
      const bytes = Buffer.from(derived!.avatar.split(',')[1]!, 'base64');
      expect(bytes.byteLength).toBeLessThanOrEqual(MAX_PERSONA_BOT_AVATAR_BYTES);
    }
  });

  it('derives a goblin with split, separately colored side hair as asset version 2', () => {
    const goblin = {
      ...withAvatarSpecies({ ...DEFAULT_ILLUSTRATED_RECIPE, hair: 'bob' }, 'goblin'),
      rightSideHair: 'none' as const,
      leftSideHairColor: '#E2B04A',
    };
    const derived = deriveAvatarAppearance(goblin);
    expect(derived?.appearance.recipe).toMatchObject({
      assetVersion: 2,
      species: 'goblin',
      rightSideHair: 'none',
      leftSideHairColor: '#e2b04a',
    });
    expect(deriveAvatarAppearance({ ...goblin, species: 'dragon' } as never)).toBeUndefined();
    const human = withAvatarSpecies(DEFAULT_ILLUSTRATED_RECIPE, 'human');
    expect(
      illustratedAvatarSvg({ ...human, skinColor: DEFAULT_ILLUSTRATED_RECIPE.skinColor }),
    ).toBe(illustratedAvatarSvg(detailedAvatarRecipe(DEFAULT_ILLUSTRATED_RECIPE)));
  });
});
