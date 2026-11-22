import { useMemo, type ReactElement } from 'react';
import {
  AVATAR_COLORS,
  AVATAR_EXTRA_PARTS,
  AVATAR_HAIR_PARTS,
  AVATAR_PARTS,
  AVATAR_PARTS_V2,
  AVATAR_PIECE_COLORS,
  AVATAR_PIECE_COLORS_V4,
  AVATAR_HEADPIECES,
  AVATAR_ANIMAL_SPECIES,
  AVATAR_PATTERNS,
  isAnimalSpecies,
  AVATAR_STRANDS,
  withAvatarPieces,
  AVATAR_PRESETS,
  AVATAR_RANGES,
  AVATAR_SPECIES,
  AVATAR_SPECIES_SWATCHES,
  detailedAvatarRecipe,
  hiddenAvatarChoices,
  type IllustratedAvatarRecipe,
  AVATAR_SWATCHES,
  withAvatarSpecies,
  type PartSlot,
  avatarSvg,
  seededAvatarFor,
  type AvatarFamily,
  type AvatarRecipe,
  AVATAR_FAMILIES,
  withAvatarBuiltInHeadpiece,
  builtInAvatarHeadpiece,
  withAvatarCustomPart,
  wornAvatarPart,
  hairPieceStart,
  headpieceStart,
  isHairPartSlot,
  isReplacePartSlot,
  replacePartStart,
  customPartId,
  type PixelCustomPart,
} from '../../../../../core/src/bots/avatar-appearance.js';
import {
  LINE_COLORS,
  LINE_PARTS,
  LINE_PRESETS,
  LINE_RANGES,
  LINE_SWATCHES,
  seededLineRecipe,
} from '../../../../../core/src/bots/avatar-line.js';
import type { BotHarnessTranslate } from '../../locale.js';

export type Key = Parameters<BotHarnessTranslate>[0];

interface FamilySpec {
  parts: Readonly<Record<string, readonly string[]>>;
  colors: readonly string[];
  swatches: Readonly<Record<string, readonly string[]>>;
  ranges: Readonly<Record<string, readonly [number, number]>>;
  categories: readonly string[];
  presets: readonly AvatarRecipe[];
  option(part: string, value: string): Key;
  seeded(name: string, seed: 2 | undefined): AvatarRecipe;
}

export const PIECE_COLORS = [
  'bangsColor',
  ...AVATAR_PIECE_COLORS,
  'backHairColor',
  'strandColor',
] as const satisfies readonly string[];

const V4_KEYS = new Set<string>(['strand', 'pattern', ...AVATAR_PIECE_COLORS_V4]);

export const MOVED = new Set<string>(AVATAR_HEADPIECES);

export const FAMILIES: Record<AvatarFamily, FamilySpec> = {
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
    },
    colors: [...AVATAR_COLORS, ...PIECE_COLORS],
    swatches: {
      ...AVATAR_SWATCHES,
      ...Object.fromEntries(PIECE_COLORS.map((key) => [key, AVATAR_SWATCHES.hairColor])),
    },
    ranges: AVATAR_RANGES,
    presets: AVATAR_PRESETS,
    categories: [
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
      ...Object.keys(AVATAR_PARTS).filter((part) => part !== 'backdrop' && part !== 'hair'),
      'beard',
      'headpiece',
      'shape',
      'colors',
    ],
    option: (part, value) =>
      `profile.avatar.option.${part === 'rightSideHair' ? 'sideHair' : part}.${value}` as Key,
    seeded: seededAvatarFor,
  },
  line: {
    parts: LINE_PARTS,
    colors: LINE_COLORS,
    swatches: LINE_SWATCHES,
    ranges: LINE_RANGES,
    presets: LINE_PRESETS,
    categories: [
      'presets',
      ...Object.keys(LINE_PARTS).filter((part) => part !== 'symbol'),
      'shape',
      'colors',
    ],
    option: (part, value) => `profile.avatar.line.${part}.${value}` as Key,
    seeded: seededLineRecipe,
  },
};

export type Fields = Record<string, string | number>;

const DETAIL = new Set<string>([...Object.keys(AVATAR_HAIR_PARTS), ...Object.keys(AVATAR_RANGES)]);

const EXTRAS = new Set<string>(Object.keys(AVATAR_EXTRA_PARTS));

const SPLIT = new Set<string>([
  'species',
  'sideHair',
  'rightSideHair',
  ...AVATAR_PIECE_COLORS,
  ...EXTRAS,
]);

export const PART_CATEGORY: Partial<Record<string, PartSlot>> = {
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

const V2_ONLY = (part: string, value: string | number) =>
  (part === 'outfit' || part === 'accessory') &&
  !(AVATAR_PARTS[part] as readonly (string | number)[]).includes(value);

export function withPart(recipe: AvatarRecipe, key: string, value: string | number): AvatarRecipe {
  if (recipe.family !== 'illustrated')
    return {
      ...(recipe as unknown as Fields),
      [key]: value,
    } as unknown as AvatarRecipe;
  if (key === 'species')
    return withAvatarSpecies(recipe, value as Parameters<typeof withAvatarSpecies>[1]);
  if (V4_KEYS.has(key)) {
    const { [key]: _removed, ...rest } = withAvatarPieces(recipe) as unknown as Fields;
    return (value === 'none' ? rest : { ...rest, [key]: value }) as unknown as AvatarRecipe;
  }
  if (EXTRAS.has(key) && value === 'none') {
    const { [key]: _removed, ...rest } = recipe as unknown as Fields;
    return rest as unknown as AvatarRecipe;
  }
  if (SPLIT.has(key) || V2_ONLY(key, value))
    return {
      ...withAvatarSpecies(recipe, recipe.species ?? 'human'),
      [key]: value,
    } as IllustratedAvatarRecipe;
  if (DETAIL.has(key))
    return {
      ...(detailedAvatarRecipe(recipe) as unknown as Fields),
      [key]: value,
    } as unknown as AvatarRecipe;
  const next = { ...recipe, [key]: value } as IllustratedAvatarRecipe;
  if (key !== 'hair' || recipe.bangs === undefined) return next;
  const { bangs: _b, sideHair: _s, backHair: _h, ...plain } = next;
  const split = detailedAvatarRecipe(plain as unknown as IllustratedAvatarRecipe);
  return {
    ...split,
    ...(split.assetVersion === 2
      ? {
          rightSideHair: split.sideHair as NonNullable<IllustratedAvatarRecipe['rightSideHair']>,
        }
      : {}),
    spacing: next.spacing ?? 0,
    height: next.height ?? 0,
    hairLength: next.hairLength ?? 0,
  } as IllustratedAvatarRecipe;
}

export function shuffled(recipe: AvatarRecipe): AvatarRecipe {
  const spec = FAMILIES[recipe.family];
  const pick = <T,>(values: readonly T[]) => values[Math.floor(Math.random() * values.length)]!;
  const next: Fields = { ...(recipe as unknown as Fields) };
  const own = (key: string) =>
    recipe.family !== 'illustrated' || (!SPLIT.has(key) && !V4_KEYS.has(key));
  for (const [part, values] of Object.entries(spec.parts)) if (own(part)) next[part] = pick(values);
  for (const color of spec.colors) if (own(color)) next[color] = pick(spec.swatches[color]!);
  for (const [key, [min, max]] of Object.entries(spec.ranges))
    next[key] = min + Math.floor(Math.random() * (max - min + 1));
  if (recipe.family !== 'illustrated') return next as unknown as AvatarRecipe;
  const species = pick(AVATAR_SPECIES);
  const random = withAvatarSpecies(next as unknown as IllustratedAvatarRecipe, species);
  for (const color of AVATAR_PIECE_COLORS) delete random[color];
  for (const key of V4_KEYS) delete random[key as keyof typeof random];
  for (const extra of EXTRAS) delete random[extra as keyof typeof random];
  const beard = pick(['none', ...AVATAR_EXTRA_PARTS.beard] as const);
  return {
    ...random,
    sideHair: pick(AVATAR_HAIR_PARTS.sideHair),
    rightSideHair: pick(AVATAR_HAIR_PARTS.sideHair),
    skinColor: pick(AVATAR_SPECIES_SWATCHES[species]),
    ...(species === 'flower'
      ? {
          petals: pick(AVATAR_EXTRA_PARTS.petals),
          flowerBase: pick(AVATAR_EXTRA_PARTS.flowerBase),
        }
      : beard === 'none'
        ? {}
        : { beard }),
  } as IllustratedAvatarRecipe;
}

export function categoriesFor(
  spec: FamilySpec,
  recipe: AvatarRecipe | undefined,
  library = true,
): readonly string[] {
  if (recipe?.family !== 'illustrated') return spec.categories;
  const flower = recipe.species === 'flower';
  return spec.categories.filter((key) =>
    key === 'petals' || key === 'flowerBase'
      ? flower
      : key === 'beard'
        ? !flower
        : key === 'strand'
          ? !flower
          : key === 'pattern'
            ? isAnimalSpecies(recipe.species)
            : true,
  );
}

export const SLOT_CATEGORY = Object.fromEntries(
  Object.entries(PART_CATEGORY).map(([category, slot]) => [slot, category]),
) as Record<PartSlot, string>;

export function hiddenFor(recipe: AvatarRecipe | undefined, category: string): boolean {
  if (recipe?.family !== 'illustrated') return false;
  const hidden = hiddenAvatarChoices(recipe);
  return hidden.includes(category) || (category === 'hair' && hidden.includes('bangs'));
}

export function swatchesFor(spec: FamilySpec, fields: Fields, key: string): readonly string[] {
  if (key !== 'skinColor' || fields['family'] !== 'illustrated') return spec.swatches[key]!;
  const species = (fields['species'] ?? 'human') as keyof typeof AVATAR_SPECIES_SWATCHES;
  return AVATAR_SPECIES_SWATCHES[species];
}

export function OptionTile({
  recipe,
  selected,
  label,
  id,
  onSelect,
}: {
  recipe: AvatarRecipe;
  selected: boolean;
  label: string;
  id: string;
  onSelect(): void;
}): ReactElement {
  const key = JSON.stringify(recipe);
  const markup = useMemo(() => avatarSvg(JSON.parse(key) as AvatarRecipe), [key]);
  return (
    <button
      type="button"
      className="bh-avatar-option"
      data-avatar-option={id}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
    >
      <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />
    </button>
  );
}

let pixelPresets: readonly { recipe: AvatarRecipe; image: string }[] | undefined;

export function getPixelPresets() {
  return (pixelPresets ??= AVATAR_PRESETS.map((recipe) => {
    const svg = avatarSvg(recipe, { squareBackdrop: true });
    return { recipe, image: `data:image/svg+xml,${encodeURIComponent(svg)}` };
  }));
}

export {
  AVATAR_FAMILIES,
  AVATAR_HEADPIECES,
  withAvatarBuiltInHeadpiece,
  builtInAvatarHeadpiece,
  detailedAvatarRecipe,
  type IllustratedAvatarRecipe,
  withAvatarCustomPart,
  wornAvatarPart,
  hairPieceStart,
  headpieceStart,
  isHairPartSlot,
  isReplacePartSlot,
  replacePartStart,
  type PartSlot,
  customPartId,
  type PixelCustomPart,
  seededAvatarFor,
  type AvatarFamily,
  type AvatarRecipe,
};
