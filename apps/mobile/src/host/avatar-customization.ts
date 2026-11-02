import {
  AVATAR_ANIMAL_SPECIES,
  AVATAR_COLORS,
  AVATAR_EXTRA_PARTS,
  AVATAR_HAIR_PARTS,
  AVATAR_HEADPIECES,
  AVATAR_PARTS,
  AVATAR_PARTS_V2,
  AVATAR_PATTERNS,
  AVATAR_PIECE_COLORS,
  AVATAR_PIECE_COLORS_V4,
  AVATAR_PRESETS,
  AVATAR_RANGES,
  AVATAR_SPECIES,
  AVATAR_SPECIES_SWATCHES,
  AVATAR_STRANDS,
  AVATAR_SWATCHES,
  DEFAULT_ILLUSTRATED_RECIPE,
  builtInAvatarHeadpiece,
  canonicalRecipe,
  detailedAvatarRecipe,
  hiddenAvatarChoices,
  isAnimalSpecies,
  isAvatarRecipe,
  withAvatarBuiltInHeadpiece,
  withAvatarCustomPart,
  withAvatarPieces,
  withAvatarSpecies,
  type AvatarFamily,
  type AvatarRecipe,
  type PartSlot,
} from '../../../../packages/core/src/bots/avatar-appearance';
import {
  LINE_COLORS,
  LINE_PARTS,
  LINE_PRESETS,
  LINE_RANGES,
  LINE_SWATCHES,
} from '../../../../packages/core/src/bots/avatar-line';

interface FamilyOptions {
  parts: Readonly<Record<string, readonly string[]>>;
  colors: readonly string[];
  ranges: Readonly<Record<string, readonly [number, number]>>;
  presets: readonly AvatarRecipe[];
  swatches: Readonly<Record<string, readonly string[]>>;
}

const pieceColors = ['bangsColor', ...AVATAR_PIECE_COLORS, 'backHairColor', 'strandColor'];
export const avatarFamilyOptions: Record<AvatarFamily, FamilyOptions> = {
  illustrated: {
    parts: {
      species: [...AVATAR_SPECIES, ...AVATAR_ANIMAL_SPECIES],
      pattern: AVATAR_PATTERNS,
      ...AVATAR_PARTS_V2,
      ...AVATAR_HAIR_PARTS,
      rightSideHair: AVATAR_HAIR_PARTS.sideHair,
      beard: ['none', ...AVATAR_EXTRA_PARTS.beard],
      petals: AVATAR_EXTRA_PARTS.petals,
      flowerBase: AVATAR_EXTRA_PARTS.flowerBase,
      strand: ['none', ...AVATAR_STRANDS],
      headpiece: ['none', ...AVATAR_HEADPIECES],
    },
    colors: [...AVATAR_COLORS, ...pieceColors],
    ranges: AVATAR_RANGES,
    presets: AVATAR_PRESETS,
    swatches: {
      ...AVATAR_SWATCHES,
      ...Object.fromEntries(pieceColors.map((key) => [key, AVATAR_SWATCHES.hairColor])),
    },
  },
  line: {
    parts: LINE_PARTS,
    colors: LINE_COLORS,
    ranges: LINE_RANGES,
    presets: LINE_PRESETS,
    swatches: LINE_SWATCHES,
  },
};

const categories = [
  'presets',
  'species',
  'pattern',
  'hair',
  'bangs',
  'sideHair',
  'rightSideHair',
  'backHair',
  'strand',
  'petals',
  'flowerBase',
  ...Object.keys(AVATAR_PARTS).filter((key) => key !== 'backdrop' && key !== 'hair'),
  'beard',
  'headpiece',
  'shape',
  'colors',
];
const extraParts = new Set<string>(Object.keys(AVATAR_EXTRA_PARTS));
const v4Keys = new Set<string>(['strand', 'pattern', ...AVATAR_PIECE_COLORS_V4]);
const splitKeys = new Set<string>([
  'species',
  'sideHair',
  'rightSideHair',
  ...AVATAR_PIECE_COLORS,
  ...extraParts,
]);
const detailKeys = new Set<string>([
  ...Object.keys(AVATAR_HAIR_PARTS),
  ...Object.keys(AVATAR_RANGES),
]);
const slots: Partial<Record<string, PartSlot>> = {
  headpiece: 'headpiece',
  pattern: 'pattern',
  bangs: 'bangs',
  sideHair: 'leftSideHair',
  rightSideHair: 'rightSideHair',
  backHair: 'backHair',
  outfit: 'outfit',
  accessory: 'accessory',
  beard: 'beard',
  glasses: 'glasses',
  nose: 'nose',
  cheeks: 'cheeks',
  petals: 'petals',
  flowerBase: 'flowerBase',
};

export function avatarCategories(recipe: AvatarRecipe): readonly string[] {
  if (recipe.family === 'line')
    return [
      'presets',
      ...Object.keys(LINE_PARTS).filter((part) => part !== 'symbol'),
      'shape',
      'colors',
    ];
  const flower = recipe.species === 'flower';
  return categories.filter((key) =>
    key === 'petals' || key === 'flowerBase'
      ? flower
      : key === 'beard' || key === 'strand'
        ? !flower
        : key === 'pattern'
          ? isAnimalSpecies(recipe.species)
          : true,
  );
}

export function avatarField(recipe: AvatarRecipe, key: string): string | number | undefined {
  if (key === 'headpiece' && recipe.family === 'illustrated')
    return builtInAvatarHeadpiece(recipe) ?? 'none';
  const fields = recipe.family === 'illustrated' ? detailedAvatarRecipe(recipe) : recipe;
  const value: unknown = Object.entries(fields).find(([name]) => name === key)?.[1];
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

export function avatarFeatureHidden(recipe: AvatarRecipe, key: string): boolean {
  if (recipe.family !== 'illustrated') return false;
  const hidden = hiddenAvatarChoices(recipe);
  return hidden.includes(key) || (key === 'hair' && hidden.includes('bangs'));
}

export function avatarColorSwatches(recipe: AvatarRecipe, key: string): readonly string[] {
  if (key === 'skinColor' && recipe.family === 'illustrated')
    return AVATAR_SPECIES_SWATCHES[recipe.species ?? 'human'];
  return avatarFamilyOptions[recipe.family].swatches[key] ?? [];
}

export function avatarColorCanFollowHair(recipe: AvatarRecipe, key: string): boolean {
  return (
    recipe.family === 'illustrated' &&
    pieceColors.includes(key) &&
    avatarField(recipe, key) !== undefined
  );
}

export function changeAvatarFeature(
  recipe: AvatarRecipe,
  key: string,
  value: string | number,
): AvatarRecipe | undefined {
  let next: unknown;
  if (recipe.family === 'line') next = { ...recipe, [key]: value };
  else {
    if (key === 'species') {
      const species = [...AVATAR_SPECIES, ...AVATAR_ANIMAL_SPECIES].find(
        (option) => option === value,
      );
      return species === undefined ? undefined : withAvatarSpecies(recipe, species);
    }
    if (key === 'headpiece') {
      if (value === 'none') return withAvatarBuiltInHeadpiece(recipe, undefined);
      const headpiece = AVATAR_HEADPIECES.find((option) => option === value);
      return headpiece === undefined ? undefined : withAvatarBuiltInHeadpiece(recipe, headpiece);
    }
    const slot = slots[key];
    const base = slot ? withAvatarCustomPart(recipe, slot, undefined) : recipe;
    const v2Only =
      (key === 'outfit' || key === 'accessory') &&
      !AVATAR_PARTS[key].some((option) => option === value);
    if (value === 'none' && pieceColors.includes(key)) {
      const { [key]: _removed, ...rest } = Object.fromEntries(Object.entries(base));
      next = rest;
    } else if (v4Keys.has(key)) {
      const { [key]: _removed, ...rest } = Object.fromEntries(
        Object.entries(withAvatarPieces(base)),
      );
      next = value === 'none' ? rest : { ...rest, [key]: value };
    } else if (extraParts.has(key) && value === 'none') {
      const { [key]: _removed, ...rest } = Object.fromEntries(Object.entries(base));
      next = rest;
    } else if (splitKeys.has(key) || v2Only) {
      next = { ...withAvatarSpecies(base, base.species ?? 'human'), [key]: value };
    } else if (detailKeys.has(key)) next = { ...detailedAvatarRecipe(base), [key]: value };
    else {
      next = { ...base, [key]: value };
      if (
        key === 'hair' &&
        base.bangs !== undefined &&
        isAvatarRecipe(next) &&
        next.family === 'illustrated'
      ) {
        const split = detailedAvatarRecipe({ ...DEFAULT_ILLUSTRATED_RECIPE, hair: next.hair });
        next = {
          ...next,
          bangs: split.bangs,
          sideHair: split.sideHair,
          backHair: split.backHair,
          ...(split.assetVersion === 2 && split.sideHair ? { rightSideHair: split.sideHair } : {}),
          spacing: base.spacing ?? 0,
          height: base.height ?? 0,
          hairLength: base.hairLength ?? 0,
        };
      }
    }
  }
  return isAvatarRecipe(next) ? canonicalRecipe(next) : undefined;
}

export interface AvatarOption {
  id: string;
  value: string;
  recipe: AvatarRecipe;
}

export function avatarOptions(recipe: AvatarRecipe, category: string): AvatarOption[] {
  const spec = avatarFamilyOptions[recipe.family];
  if (category === 'presets')
    return spec.presets.map((preset, index) => ({
      id: `preset-${index}`,
      value: String(index + 1),
      recipe: preset,
    }));
  return (spec.parts[category] ?? []).flatMap((value) => {
    const next = changeAvatarFeature(recipe, category, value);
    return next ? [{ id: `${category}-${value}`, value, recipe: next }] : [];
  });
}
