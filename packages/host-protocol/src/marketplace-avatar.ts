export const MIN_MARKETPLACE_AVATAR_SIDE = 256;
export const MAX_MARKETPLACE_AVATAR_SIDE = 512;
export const MAX_MARKETPLACE_AVATAR_BYTES = 128 * 1024;
export const MAX_MARKETPLACE_AVATAR_NAME = 40;
export const MAX_MARKETPLACE_AVATAR_DESCRIPTION = 160;
export const MAX_MARKETPLACE_AVATAR_TAGS = 5;
export const MAX_MARKETPLACE_AVATAR_TAG = 24;
const MAX_NFKC_CODE_POINT_EXPANSION = 18;
export const MAX_MARKETPLACE_AVATAR_TAG_FILTER =
  MAX_MARKETPLACE_AVATAR_TAG * MAX_NFKC_CODE_POINT_EXPANSION;
export const MAX_MARKETPLACE_AVATAR_QUERY = 100;

export interface MarketplaceAvatarText {
  name: string;
  description: string;
  tags: string[];
}

export type MarketplaceAvatarEdit = Partial<MarketplaceAvatarText>;

export interface MarketplaceAvatarPublish extends MarketplaceAvatarText {
  image: string;
  requestKey: string;
  confirm: true;
  expectedAuthorId?: string;
}

export interface MarketplaceAvatar extends MarketplaceAvatarText {
  id: string;
  imageUrl: string;
  author: { id: string; name: string };
  applyCount: number;
}

export interface MarketplaceAvatarApplyCandidate {
  slug: string;
  displayName: string;
  avatar?: string;
  avatarSeed?: 2;
  hasAppearance: boolean;
}

export interface MarketplaceAvatarPage {
  avatars: MarketplaceAvatar[];
  nextCursor: string | null;
}

export interface MarketplaceAvatarQuery {
  cursor?: string;
  q?: string;
  tag?: string;
}

export interface MarketplaceAvatarTag {
  tag: string;
  count: number;
}

export function normalizeMarketplaceAvatarTag(tag: string): string {
  return tag.normalize('NFKC').trim().toLowerCase().replaceAll('ς', 'σ');
}

export function parseMarketplaceAvatarText(input: {
  name?: unknown;
  description?: unknown;
  tags?: unknown;
}): MarketplaceAvatarText | undefined {
  const patch = parseMarketplaceAvatarEdit({
    name: input.name,
    description: input.description === undefined ? '' : input.description,
    tags: input.tags === undefined ? [] : input.tags,
  });
  if (patch?.name === undefined || patch.description === undefined || patch.tags === undefined)
    return;
  return { name: patch.name, description: patch.description, tags: patch.tags };
}

export function parseMarketplaceAvatarEdit(
  input: Record<string, unknown>,
): MarketplaceAvatarEdit | undefined {
  if (Object.keys(input).some((key) => key !== 'name' && key !== 'description' && key !== 'tags'))
    return;
  const { name, description, tags } = input;
  if (name === undefined && description === undefined && tags === undefined) return;
  const patch: MarketplaceAvatarEdit = {};
  if (name !== undefined) {
    if (typeof name !== 'string') return;
    const trimmed = name.trim();
    if (!trimmed || [...trimmed].length > MAX_MARKETPLACE_AVATAR_NAME) return;
    patch.name = trimmed;
  }
  if (description !== undefined) {
    if (typeof description !== 'string') return;
    const trimmed = description.trim();
    if ([...trimmed].length > MAX_MARKETPLACE_AVATAR_DESCRIPTION) return;
    patch.description = trimmed;
  }
  if (tags !== undefined) {
    if (!Array.isArray(tags) || tags.length > MAX_MARKETPLACE_AVATAR_TAGS) return;
    const unique = new Map<string, string>();
    for (const value of tags) {
      if (typeof value !== 'string') return;
      const tag = value.trim();
      if (!tag || [...tag].length > MAX_MARKETPLACE_AVATAR_TAG) return;
      const key = tag.toLowerCase();
      if (!unique.has(key)) unique.set(key, tag);
    }
    patch.tags = [...unique.values()];
  }
  return patch;
}

export function parseMarketplaceAvatarPublish(
  input: Record<string, unknown>,
): MarketplaceAvatarPublish | undefined {
  const text = parseMarketplaceAvatarText(input);
  const { image, requestKey, confirm, expectedAuthorId } = input;
  if (
    text === undefined ||
    typeof image !== 'string' ||
    typeof requestKey !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/u.test(requestKey) ||
    (expectedAuthorId !== undefined &&
      (typeof expectedAuthorId !== 'string' || !/^[2-9a-z]{6}$/u.test(expectedAuthorId))) ||
    confirm !== true
  )
    return;
  return {
    ...text,
    image,
    requestKey,
    confirm,
    ...(expectedAuthorId === undefined ? {} : { expectedAuthorId }),
  };
}
