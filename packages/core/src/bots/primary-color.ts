import {
  detailedAvatarRecipe,
  HAIR_PART_SLOTS,
  isAvatarAppearance,
  seededAvatarFor,
  wornAvatarPart,
  type AvatarRecipe,
} from './avatar-appearance.js';

export type BotPrimaryColor =
  | { mode: 'automatic'; fallback?: string; retained?: string }
  | { mode: 'custom'; color: string; fallback?: string; retained?: string };

export type BotPrimaryColorSource = 'custom' | 'hair' | 'fallback' | 'retained';

export interface ResolvedBotPrimaryColor {
  mode: BotPrimaryColor['mode'];
  source: BotPrimaryColorSource;
  color: string;
}

export interface BotPresentationSubject {
  slug: string;
  displayName: string;
  avatar?: string | undefined;
  appearance?: unknown;
  avatarSeed?: 2 | undefined;
  primaryColor?: BotPrimaryColor | undefined;
}

const SOURCE_COLOR = /^#[0-9a-f]{6}$/u;

const FALLBACK_COLORS = [
  '#d9475a',
  '#e07a3f',
  '#c79a2b',
  '#5f9e45',
  '#2f9e8f',
  '#3f8fd0',
  '#5a7be0',
  '#8a63d2',
  '#c25bb6',
  '#8a5a36',
] as const;

export function normalizeSourceColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().toLowerCase();
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/u.exec(text);
  if (short !== null) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const full = /^#?([0-9a-f]{6})$/u.exec(text);
  return full === null ? undefined : `#${full[1]}`;
}

export function isBotPrimaryColor(value: unknown): value is BotPrimaryColor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  for (const key of ['fallback', 'retained']) {
    const carried = record[key];
    if (carried !== undefined && (typeof carried !== 'string' || !SOURCE_COLOR.test(carried)))
      return false;
  }
  const keys = Object.keys(record).filter((key) => key !== 'fallback' && key !== 'retained');
  if (record['mode'] === 'automatic') return keys.length === 1;
  return (
    record['mode'] === 'custom' &&
    keys.length === 2 &&
    typeof record['color'] === 'string' &&
    SOURCE_COLOR.test(record['color'])
  );
}

export function fallbackPrimaryColor(slug: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < slug.length; index += 1) {
    hash ^= slug.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return FALLBACK_COLORS[(hash >>> 0) % FALLBACK_COLORS.length]!;
}

export function resolvedAvatarRecipe(subject: BotPresentationSubject): AvatarRecipe | undefined {
  if (isAvatarAppearance(subject.appearance)) return subject.appearance.recipe;
  if (subject.avatar !== undefined && subject.avatar.length > 0) return undefined;
  return seededAvatarFor(subject.displayName || subject.slug, subject.avatarSeed);
}

export function mainHairColor(recipe: AvatarRecipe | undefined): string | undefined {
  if (recipe === undefined || recipe.family !== 'illustrated') return undefined;
  const detailed = detailedAvatarRecipe(recipe) as unknown as Record<string, unknown>;
  const pieces = ['bangs', 'sideHair', 'rightSideHair', 'backHair'] as const;
  const hasHair =
    pieces.some((piece) => detailed[piece] !== undefined && detailed[piece] !== 'none') ||
    detailed['strand'] !== undefined ||
    HAIR_PART_SLOTS.some((slot) => wornAvatarPart(recipe, slot) !== undefined);
  return hasHair ? normalizeSourceColor(recipe.hairColor) : undefined;
}

export function resolveBotPrimaryColor(subject: BotPresentationSubject): ResolvedBotPrimaryColor {
  const policy = subject.primaryColor;
  if (policy?.retained !== undefined)
    return { mode: policy.mode, source: 'retained', color: policy.retained };
  if (policy?.mode === 'custom') return { mode: 'custom', source: 'custom', color: policy.color };
  const hair = mainHairColor(resolvedAvatarRecipe(subject));
  if (hair !== undefined) return { mode: 'automatic', source: 'hair', color: hair };
  return {
    mode: 'automatic',
    source: 'fallback',
    color: policy?.fallback ?? fallbackPrimaryColor(subject.slug),
  };
}

export function nextBotPrimaryColor(
  current: BotPrimaryColor | undefined,
  choice: unknown,
): BotPrimaryColor | undefined | false {
  if (typeof choice !== 'object' || choice === null || Array.isArray(choice)) return false;
  const record = choice as Record<string, unknown>;
  const carried = current?.fallback === undefined ? {} : { fallback: current.fallback };
  if (record['mode'] === 'automatic' && Object.keys(record).length === 1)
    return current?.fallback === undefined ? undefined : { mode: 'automatic', ...carried };
  if (record['mode'] !== 'custom' || Object.keys(record).length !== 2) return false;
  const color = typeof record['color'] === 'string' ? record['color'] : undefined;
  if (color === undefined || !/^#[0-9a-fA-F]{6}$/u.test(color)) return false;
  return { mode: 'custom', color: color.toLowerCase(), ...carried };
}

export function retainedBotPrimaryColor(subject: BotPresentationSubject): BotPrimaryColor {
  const { retained: _retained, ...policy } = subject.primaryColor ?? { mode: 'automatic' as const };
  const current = { ...subject, primaryColor: policy as BotPrimaryColor };
  return { ...(policy as BotPrimaryColor), retained: resolveBotPrimaryColor(current).color };
}

export function historicalBotPrimaryColor(
  slug: string,
  policy: BotPrimaryColor | undefined,
): BotPrimaryColor {
  if (policy?.retained !== undefined) return policy;
  return { ...(policy ?? { mode: 'automatic' }), retained: fallbackPrimaryColor(slug) };
}

export function currentBotPrimaryColor(
  policy: BotPrimaryColor | undefined,
): BotPrimaryColor | undefined {
  if (policy?.retained === undefined) return policy;
  const { retained: _retained, ...current } = policy;
  return current.mode === 'automatic' && current.fallback === undefined ? undefined : current;
}
