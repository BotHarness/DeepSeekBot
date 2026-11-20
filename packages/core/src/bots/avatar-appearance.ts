import {
  canonicalLineRecipe,
  isLineAvatarRecipe,
  lineAvatarSvg,
  type LineAvatarRecipe,
} from './avatar-line.js';
import {
  canonicalRecipe as canonicalAvatarRecipe,
  isPixelAvatarRecipe as isIllustratedAvatarRecipe,
  pixelAvatarSvg,
  pixelFigure,
  seededRecipe,
  seededRecipeV2,
  type PixelAvatarRecipe,
} from '@botharness/pixel-avatar';
export { LINE_TOOL_SYMBOLS, lineMorphFace, type LineMorphNode } from './avatar-line.js';
export { pixelSymbolFor } from './avatar-pixel-symbols.js';
export { AVATAR_PRESETS } from './avatar-presets.js';
export {
  AVATAR_COLORS,
  AVATAR_EXTRA_PARTS,
  AVATAR_HAIR_PARTS,
  AVATAR_PARTS,
  AVATAR_PARTS_V2,
  AVATAR_PIECE_COLORS,
  AVATAR_RANGES,
  AVATAR_SPECIES,
  AVATAR_SPECIES_SWATCHES,
  AVATAR_SWATCHES,
  AVATAR_TURNS,
  canonicalRecipe as canonicalAvatarRecipe,
  DEFAULT_RECIPE as DEFAULT_ILLUSTRATED_RECIPE,
  detailedRecipe as detailedAvatarRecipe,
  faceCells as pixelFaceCells,
  hiddenChoices as hiddenAvatarChoices,
  isPixelAvatarRecipe as isIllustratedAvatarRecipe,
  PIXEL_SYMBOLS,
  pixelAvatarSvg as illustratedAvatarSvg,
  pixelSymbolCells,
  seededRecipe as seededAvatarRecipe,
  seededRecipeV2 as seededAvatarRecipeV2,
  withSpecies as withAvatarSpecies,
  withHeadpiece as withAvatarHeadpiece,
  withCustomPart as withAvatarCustomPart,
  wornPart as wornAvatarPart,
  withPieces as withAvatarPieces,
  withBuiltInHeadpiece as withAvatarBuiltInHeadpiece,
  builtInHeadpiece as builtInAvatarHeadpiece,
  AVATAR_PIECE_COLORS_V4,
  AVATAR_STRANDS,
  AVATAR_HEADPIECES,
  AVATAR_ANIMAL_SPECIES,
  AVATAR_PATTERNS,
  isAnimalSpecies,
  type AvatarAnimalSpecies,
  type AvatarSpeciesV4,
  type AvatarPattern,
  type AvatarHeadpiece,
  type AvatarStrand,
  type AvatarPieceColorV4,
  hairPieceStart,
  headpieceStart,
  replacePartStart,
  REPLACE_PART_SLOTS,
  isReplacePartSlot,
  type ReplacePartSlot,
  HAIR_PART_SLOTS,
  isHairPartSlot,
  type HairPartSlot,
  PART_SLOTS,
  PART_TONES,
  MAX_PART_FIXED_COLORS,
  canonicalCustomPart,
  createCustomPart,
  customPartId,
  emptyPartLayer,
  fillPartLayer,
  gradientPartLayer,
  noisePartLayer,
  partLinePoints,
  partRectPoints,
  shadePartLayer,
  isPixelCustomPart,
  mirrorPartX,
  paintPartLayer,
  partCells,
  partLayer,
  partToneColor,
  type PartColor,
  type PartInk,
  type PartLayer,
  type PartLayerName,
  type PartSlot,
  type PartTone,
  type PixelCustomPart,
  type AvatarColor,
  type AvatarHairPart,
  type AvatarPart,
  type AvatarPieceColor,
  type AvatarRange,
  type AvatarSpecies,
  type PixelAvatarRecipe as IllustratedAvatarRecipe,
  type PixelCell,
  type PixelSymbol,
  type PixelMouthState,
} from '@botharness/pixel-avatar';

export type AvatarRecipe = PixelAvatarRecipe | LineAvatarRecipe;

export function seededAvatarFor(name: string, seed: 2 | undefined): PixelAvatarRecipe {
  return seed === 2 ? seededRecipeV2(name) : seededRecipe(name);
}
export type AvatarFamily = AvatarRecipe['family'];
export const AVATAR_FAMILIES = ['illustrated', 'line'] as const satisfies readonly AvatarFamily[];

export interface AvatarAppearance {
  revision: string;
  recipe: AvatarRecipe;
}

export function isAvatarRecipe(value: unknown): value is AvatarRecipe {
  return isIllustratedAvatarRecipe(value) || isLineAvatarRecipe(value);
}

export function canonicalRecipe(recipe: AvatarRecipe): AvatarRecipe {
  return recipe.family === 'line' ? canonicalLineRecipe(recipe) : canonicalAvatarRecipe(recipe);
}

export function avatarSvg(
  recipe: AvatarRecipe,
  options: {
    turns?: readonly number[];
    surface?: 'portrait' | 'companion';
    mouthLayers?: boolean;
  } = {},
): string {
  if (recipe.family === 'illustrated' && options.surface === 'companion') {
    if (!isIllustratedAvatarRecipe(recipe)) throw new Error('invalid Avatar recipe');
    const yaw = { front: 0, left: -25, right: 25 }[recipe.pose];
    const base = pixelFigure(recipe, yaw, { ...options, speechMouthVersion: 2 });
    const turns = (options.turns ?? [])
      .map((delta) => {
        const pose = pixelFigure(recipe, yaw + delta, { ...options, speechMouthVersion: 2 });
        const layers = `${pose.body}${pose.head}`.replaceAll(
          'class="bh-illustrated-',
          'data-turn-part="',
        );
        return `<g data-avatar-turn="${delta}" opacity="0">${layers}</g>`;
      })
      .join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="512" height="512" shape-rendering="crispEdges" aria-hidden="true">${base.body}${base.head}${turns}<g data-avatar-pixel-morph=""></g></svg>`;
  }
  return recipe.family === 'line'
    ? lineAvatarSvg(recipe, options)
    : pixelAvatarSvg(recipe, options);
}

export interface RetainedAvatarAppearance {
  revision: string;
  recipe: Readonly<Record<string, string | number>>;
}

const RETAINED_KEY = /^[A-Za-z][A-Za-z0-9]{0,31}$/u;
const RETAINED_TEXT = /^[#A-Za-z0-9_-]{1,32}$/u;

export function isRetainedAvatarAppearance(value: unknown): value is RetainedAvatarAppearance {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const appearance = value as Record<string, unknown>;
  const recipe = appearance['recipe'];
  if (
    Object.keys(appearance).length !== 2 ||
    typeof appearance['revision'] !== 'string' ||
    !/^[a-f\d]{64}$/u.test(appearance['revision']) ||
    typeof recipe !== 'object' ||
    recipe === null ||
    Array.isArray(recipe) ||
    Object.getPrototypeOf(recipe) !== Object.prototype
  )
    return false;
  const entries = Object.entries(recipe);
  const version = (key: string) => {
    const v = (recipe as Record<string, unknown>)[key];
    return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 1_000;
  };
  return (
    entries.length >= 1 &&
    entries.length <= 64 &&
    entries.every(
      ([key, v]) =>
        RETAINED_KEY.test(key) &&
        ((typeof v === 'string' && RETAINED_TEXT.test(v)) ||
          (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1_000_000)),
    ) &&
    typeof (recipe as Record<string, unknown>)['family'] === 'string' &&
    ['schemaVersion', 'assetVersion', 'rigVersion'].every(version)
  );
}

export function isAvatarAppearance(value: unknown): value is AvatarAppearance {
  if (typeof value !== 'object' || value === null) return false;
  const appearance = value as Record<string, unknown>;
  return (
    Object.keys(appearance).length === 2 &&
    typeof appearance['revision'] === 'string' &&
    /^[a-f\d]{64}$/u.test(appearance['revision']) &&
    isAvatarRecipe(appearance['recipe'])
  );
}
