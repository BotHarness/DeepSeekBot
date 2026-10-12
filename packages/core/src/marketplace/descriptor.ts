export const BOT_DESCRIPTOR_PATH = '.botharness/bot.json';
export const MAX_DESCRIPTOR_BYTES = 16_384;
export const MAX_DESCRIPTOR_NAME_LENGTH = 60;
export const MAX_DESCRIPTOR_TAGS = 8;
export const MAX_DESCRIPTOR_TAG_LENGTH = 32;
export const MAX_DESCRIPTOR_BIO_LENGTH = 160;

export type BotDescriptorAvatar = { recipe: Record<string, unknown> } | { image: string };

export type BotDescriptorBanner = { recipe: { scene: string; seed: number } } | { image: string };

export type BotDescriptorPrimaryColor =
  | { mode: 'automatic'; fallback?: string }
  | { mode: 'custom'; color: string; fallback?: string };

export interface BotDescriptor {
  name?: string;
  tags?: string[];
  bio?: string;
  avatar?: BotDescriptorAvatar;
  banner?: BotDescriptorBanner;
  primaryColor?: BotDescriptorPrimaryColor;
}

const IMAGE_PATH = /\.(png|jpe?g|webp)$/iu;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function isDescriptorImagePath(value: string): boolean {
  if (value.length === 0 || value.length > 200 || !IMAGE_PATH.test(value)) return false;
  if (value.startsWith('/') || value.includes('\\') || /^[a-z][a-z0-9+.-]*:/iu.test(value)) {
    return false;
  }
  return value.split('/').every((part) => part !== '' && part !== '..');
}

function parseAvatar(value: unknown): BotDescriptorAvatar | undefined | false {
  if (value === undefined) return undefined;
  const source = record(value);
  if (source === undefined) return false;
  const recipe = record(source['recipe']);
  const image = source['image'];
  if (recipe !== undefined && image === undefined) return { recipe };
  if (recipe === undefined && typeof image === 'string' && isDescriptorImagePath(image.trim())) {
    return { image: image.trim().replace(/^\.\//u, '') };
  }
  return false;
}

function parseBanner(value: unknown): BotDescriptorBanner | undefined | false {
  if (value === undefined) return undefined;
  const source = record(value);
  if (source === undefined) return false;
  const recipe = record(source['recipe']);
  const image = source['image'];
  if (recipe !== undefined && image === undefined) {
    const { scene, seed } = recipe;
    if (
      typeof scene !== 'string' ||
      !/^[a-z][a-z-]{0,31}$/u.test(scene) ||
      !Number.isInteger(seed) ||
      (seed as number) < 0 ||
      (seed as number) >= 2 ** 32
    ) {
      return false;
    }
    return { recipe: { scene, seed: seed as number } };
  }
  if (recipe === undefined && typeof image === 'string' && isDescriptorImagePath(image.trim())) {
    return { image: image.trim().replace(/^\.\//u, '') };
  }
  return false;
}

const SOURCE_COLOR = /^#[0-9a-f]{6}$/iu;

function parsePrimaryColor(value: unknown): BotDescriptorPrimaryColor | undefined | false {
  if (value === undefined) return undefined;
  const source = record(value);
  if (source === undefined) return false;
  const { mode, color, fallback, ...rest } = source;
  if (Object.keys(rest).length > 0) return false;
  if (fallback !== undefined && (typeof fallback !== 'string' || !SOURCE_COLOR.test(fallback)))
    return false;
  const carried = fallback === undefined ? {} : { fallback: fallback.toLowerCase() };
  if (mode === 'automatic') return color === undefined ? { mode, ...carried } : false;
  if (mode !== 'custom' || typeof color !== 'string' || !SOURCE_COLOR.test(color)) return false;
  return { mode, color: color.toLowerCase(), ...carried };
}

function parseTags(value: unknown): string[] | undefined | false {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_DESCRIPTOR_TAGS) return false;
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return false;
    const tag = item.trim();
    if (tag.length === 0 || [...tag].length > MAX_DESCRIPTOR_TAG_LENGTH) return false;
    if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function parseBio(value: unknown): string | undefined | false {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return false;
  const bio = value.trim();
  return [...bio].length > MAX_DESCRIPTOR_BIO_LENGTH ? false : bio;
}

export function parseBotDescriptor(text: string): BotDescriptor | undefined {
  if (new TextEncoder().encode(text).length > MAX_DESCRIPTOR_BYTES) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const source = record(parsed);
  if (source === undefined) return undefined;
  const descriptor: BotDescriptor = {};
  const name = source['name'];
  if (name !== undefined) {
    if (typeof name !== 'string') return undefined;
    const trimmed = name.trim();
    if (trimmed.length === 0 || [...trimmed].length > MAX_DESCRIPTOR_NAME_LENGTH) return undefined;
    descriptor.name = trimmed;
  }
  const tags = parseTags(source['tags']);
  const roles = parseTags(source['roles']);
  if (tags === false || roles === false) return undefined;
  const effective = tags ?? roles;
  if (effective !== undefined && effective.length > 0) descriptor.tags = effective;
  const bio = parseBio(source['bio']);
  if (bio === false) return undefined;
  if (bio !== undefined && bio.length > 0) descriptor.bio = bio;
  const avatar = parseAvatar(source['avatar']);
  if (avatar === false) return undefined;
  if (avatar !== undefined) descriptor.avatar = avatar;
  const banner = parseBanner(source['banner']);
  if (banner === false) return undefined;
  if (banner !== undefined) descriptor.banner = banner;
  const primaryColor = parsePrimaryColor(source['primaryColor']);
  if (primaryColor === false) return undefined;
  if (primaryColor !== undefined) descriptor.primaryColor = primaryColor;
  return descriptor;
}
