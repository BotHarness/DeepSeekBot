import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  BOT_DESCRIPTOR_PATH,
  MAX_DESCRIPTOR_BIO_LENGTH,
  MAX_DESCRIPTOR_BYTES,
  MAX_DESCRIPTOR_NAME_LENGTH,
  MAX_DESCRIPTOR_TAG_LENGTH,
  MAX_DESCRIPTOR_TAGS,
  parseBotDescriptor,
  type BotDescriptorAvatar,
} from '../marketplace/descriptor.js';
import { createMemoryGit } from '../memory/git.js';
import { canonicalRecipe, isAvatarRecipe, seededAvatarFor } from './avatar-appearance.js';
import { BOT_BANNER_FILE, botBannerPng, seededBotBanner } from './bot-banner.js';
import type { PersonaBotRecord } from './persona-bot.js';
import { readSharedPresentation } from './shared-presentation.js';
import { fallbackPrimaryColor, type BotPrimaryColor } from './primary-color.js';

const DESCRIPTOR_DIR = '.botharness';
const AVATAR_EXTENSIONS = { png: 'png', jpeg: 'jpg', webp: 'webp' } as const;
const MANAGED_AVATARS = Object.values(AVATAR_EXTENSIONS).map(
  (extension) => `${DESCRIPTOR_DIR}/avatar.${extension}`,
);
export const BOT_DESCRIPTOR_COMMIT_MESSAGE = 'Update Bot profile in .botharness/bot.json\n';

export type BotDescriptorSyncResult = 'written' | 'unchanged' | 'kept' | 'no-memory';

function clip(value: string, max: number): string {
  return [...value.trim()].slice(0, max).join('').trim();
}

function descriptorTags(record: PersonaBotRecord): string[] {
  const source = record.roles ?? (record.tag === undefined ? [] : [record.tag]);
  const tags: string[] = [];
  for (const tag of source) {
    const clipped = clip(tag, MAX_DESCRIPTOR_TAG_LENGTH);
    if (clipped.length > 0 && !tags.includes(clipped)) tags.push(clipped);
  }
  return tags.slice(0, MAX_DESCRIPTOR_TAGS);
}

function imageAvatar(dataUrl: string): { path: string; bytes: Buffer } | undefined {
  const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/u.exec(dataUrl);
  if (match === null) return undefined;
  const extension = AVATAR_EXTENSIONS[match[1] as keyof typeof AVATAR_EXTENSIONS];
  return {
    path: `${DESCRIPTOR_DIR}/avatar.${extension}`,
    bytes: Buffer.from(match[2]!, 'base64'),
  };
}

function readExisting(memoryDir: string): Record<string, unknown> | undefined {
  try {
    const text = readFileSync(join(memoryDir, BOT_DESCRIPTOR_PATH), 'utf8');
    if (parseBotDescriptor(text) === undefined) return undefined;
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function sameAvatar(memoryDir: string, record: PersonaBotRecord): boolean {
  const current = readSharedPresentation(memoryDir);
  if (current === undefined) return false;
  if (record.appearance !== undefined) {
    return (
      current.appearance !== undefined &&
      JSON.stringify(current.appearance.recipe) === JSON.stringify(record.appearance.recipe)
    );
  }
  return (
    record.avatar !== undefined &&
    current.appearance === undefined &&
    current.avatar === record.avatar
  );
}

export function portablePrimaryColor(
  record: Pick<PersonaBotRecord, 'slug' | 'primaryColor'>,
): BotPrimaryColor {
  const policy = record.primaryColor;
  const fallback = policy?.fallback ?? fallbackPrimaryColor(record.slug);
  return policy?.mode === 'custom'
    ? { mode: 'custom', color: policy.color, fallback }
    : { mode: 'automatic', fallback };
}

export function syncBotDescriptor(
  memoryDir: string,
  record: PersonaBotRecord,
  options: { onlyIfMissing?: boolean } = {},
): BotDescriptorSyncResult {
  if (!existsSync(memoryDir)) return 'no-memory';
  const descriptorFile = join(memoryDir, BOT_DESCRIPTOR_PATH);
  if (options.onlyIfMissing === true && existsSync(descriptorFile)) return 'kept';

  const existing = readExisting(memoryDir);
  const descriptor: Record<string, unknown> = { ...existing };
  delete descriptor['name'];
  delete descriptor['roles'];
  delete descriptor['tags'];
  delete descriptor['bio'];
  delete descriptor['avatar'];
  delete descriptor['banner'];
  delete descriptor['primaryColor'];

  const name = clip(record.displayName, MAX_DESCRIPTOR_NAME_LENGTH);
  if (name.length > 0) descriptor['name'] = name;
  const tags = descriptorTags(record);
  if (tags.length > 0) descriptor['tags'] = tags;
  const bio = clip(record.description ?? '', MAX_DESCRIPTOR_BIO_LENGTH);
  if (bio.length > 0) descriptor['bio'] = bio;

  let image: { path: string; bytes: Buffer } | undefined;
  let avatar: BotDescriptorAvatar | undefined;
  const keepAvatar = existing?.['avatar'] !== undefined && sameAvatar(memoryDir, record);
  if (keepAvatar) {
    descriptor['avatar'] = existing['avatar'];
  } else if (record.appearance !== undefined) {
    avatar = { recipe: { ...record.appearance.recipe } };
  } else if (record.avatar !== undefined) {
    image = imageAvatar(record.avatar);
    if (image !== undefined) avatar = { image: image.path };
  } else {
    const seeded: unknown = seededAvatarFor(record.displayName || record.slug, record.avatarSeed);
    if (isAvatarRecipe(seeded)) avatar = { recipe: { ...canonicalRecipe(seeded) } };
  }
  if (avatar !== undefined) descriptor['avatar'] = avatar;
  const banner = record.banner ?? seededBotBanner(record.displayName || record.slug);
  descriptor['banner'] =
    'recipe' in banner ? { recipe: banner.recipe } : { image: BOT_BANNER_FILE };
  descriptor['primaryColor'] = portablePrimaryColor(record);

  const text = `${JSON.stringify(descriptor, null, 2)}\n`;
  if (
    parseBotDescriptor(text) === undefined ||
    Buffer.byteLength(text, 'utf8') > MAX_DESCRIPTOR_BYTES
  ) {
    throw new Error('Generated Bot descriptor is invalid');
  }

  let changed = false;
  let previous: string | undefined;
  try {
    previous = readFileSync(descriptorFile, 'utf8');
  } catch {}
  mkdirSync(dirname(descriptorFile), { recursive: true });
  if (previous !== text) {
    writeFileSync(descriptorFile, text, 'utf8');
    changed = true;
  }
  if (image !== undefined) {
    const target = join(memoryDir, image.path);
    let current: Buffer | undefined;
    try {
      current = readFileSync(target);
    } catch {}
    if (current === undefined || !current.equals(image.bytes)) {
      writeFileSync(target, image.bytes);
      changed = true;
    }
  }
  const bannerBytes = botBannerPng(banner);
  const bannerTarget = join(memoryDir, BOT_BANNER_FILE);
  let currentBanner: Buffer | undefined;
  try {
    currentBanner = readFileSync(bannerTarget);
  } catch {}
  if (currentBanner === undefined || !currentBanner.equals(bannerBytes)) {
    writeFileSync(bannerTarget, bannerBytes);
    changed = true;
  }
  if (!keepAvatar) {
    for (const managed of MANAGED_AVATARS) {
      if (managed === image?.path) continue;
      const target = join(memoryDir, managed);
      if (!existsSync(target)) continue;
      rmSync(target, { force: true });
      changed = true;
    }
  }
  if (!changed) return 'unchanged';
  if (existsSync(join(memoryDir, '.git'))) {
    createMemoryGit(memoryDir).commitPaths([DESCRIPTOR_DIR], BOT_DESCRIPTOR_COMMIT_MESSAGE);
  }
  return 'written';
}

export function backfillBotDescriptors(
  registry: {
    list(): PersonaBotRecord[];
    memoryDirFor(slug: string): string | undefined;
  },
  warn?: (message: string) => void,
): void {
  const startedAt = performance.now();
  let written = 0;
  let failed = 0;
  let records: PersonaBotRecord[];
  try {
    records = registry.list();
  } catch {
    return;
  }
  for (const record of records) {
    const memoryDir = registry.memoryDirFor(record.slug);
    if (memoryDir === undefined) continue;
    try {
      if (syncBotDescriptor(memoryDir, record, { onlyIfMissing: true }) === 'written') written += 1;
    } catch {
      failed += 1;
    }
  }
  if (written > 0 || failed > 0) {
    warn?.(
      `bot-descriptor-backfill initiator=host-startup written=${written} failed=${failed} durationMs=${Math.round(performance.now() - startedAt)}`,
    );
  }
}

export function backfillBotBanners(
  registry: {
    list(): PersonaBotRecord[];
    setBanner(slug: string, banner: unknown): { ok: boolean };
  },
  warn?: (message: string) => void,
): void {
  let written = 0;
  let failed = 0;
  let records: PersonaBotRecord[];
  try {
    records = registry.list();
  } catch {
    return;
  }
  for (const record of records) {
    if (record.banner !== undefined) continue;
    try {
      if (registry.setBanner(record.slug, seededBotBanner(record.displayName || record.slug)).ok)
        written += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  if (written > 0 || failed > 0) {
    warn?.(`bot-banner-backfill initiator=host-startup written=${written} failed=${failed}`);
  }
}
