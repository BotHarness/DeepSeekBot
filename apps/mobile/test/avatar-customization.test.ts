import { expect, it } from 'vitest';
import {
  AVATAR_PRESETS,
  AVATAR_SPECIES,
  AVATAR_ANIMAL_SPECIES,
  isAvatarRecipe,
  seededAvatarFor,
  withAvatarSpecies,
} from '../../../packages/core/src/bots/avatar-appearance';
import { LINE_PRESETS } from '../../../packages/core/src/bots/avatar-line';
import {
  avatarCategories,
  avatarColorSwatches,
  avatarFamilyOptions,
  avatarOptions,
  changeAvatarFeature,
} from '../src/host/avatar-customization';

it('every displayed desktop part, preset, swatch and shape endpoint produces a valid durable recipe', () => {
  const original = seededAvatarFor('avatar-qa', 2);
  const recipes = [
    ...AVATAR_PRESETS,
    ...LINE_PRESETS,
    seededAvatarFor('legacy-avatar', undefined),
    ...[...AVATAR_SPECIES, ...AVATAR_ANIMAL_SPECIES].map((species) =>
      withAvatarSpecies(original, species),
    ),
  ];
  for (const recipe of recipes) {
    const spec = avatarFamilyOptions[recipe.family];
    for (const category of avatarCategories(recipe)) {
      if (category === 'colors' || category === 'shape') continue;
      const options = avatarOptions(recipe, category);
      expect(options.length, `${recipe.family}/${recipe.assetVersion}/${category}`).toBe(
        category === 'presets' ? spec.presets.length : spec.parts[category]?.length,
      );
      expect(new Set(options.map((option) => option.id)).size).toBe(options.length);
      expect(options.every((option) => isAvatarRecipe(option.recipe))).toBe(true);
    }
    for (const color of spec.colors)
      for (const value of avatarColorSwatches(recipe, color))
        expect(
          changeAvatarFeature(recipe, color, value),
          `${recipe.family}/${color}/${value}`,
        ).toSatisfy(isAvatarRecipe);
    for (const [key, [min, max]] of Object.entries(spec.ranges))
      for (const value of [min, max])
        expect(
          changeAvatarFeature(recipe, key, value),
          `${recipe.family}/${key}/${value}`,
        ).toSatisfy(isAvatarRecipe);
  }
});
