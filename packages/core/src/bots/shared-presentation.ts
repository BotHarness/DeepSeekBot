import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

import {
  BOT_DESCRIPTOR_PATH,
  MAX_DESCRIPTOR_BYTES,
  parseBotDescriptor,
} from '../marketplace/descriptor.js';
import type { AvatarAppearance } from './avatar-appearance.js';
import {
  botBannerFromPng,
  isBotBanner,
  MAX_BOT_BANNER_BYTES,
  type BotBanner,
} from './bot-banner.js';
import { deriveAvatarAppearance } from './avatar-snapshot.js';
import { isPersonaBotAvatar, MAX_PERSONA_BOT_AVATAR_BYTES } from './persona-bot.js';
import { isBotPrimaryColor, type BotPrimaryColor } from './primary-color.js';

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export interface SharedPresentation {
  avatar: string;
  appearance?: AvatarAppearance;
}

function readInside(root: string, path: string, maxBytes: number): Buffer | undefined {
  try {
    const realRoot = realpathSync(root);
    const target = realpathSync(join(realRoot, path));
    const inside = relative(realRoot, target);
    if (inside.length === 0 || inside.startsWith('..') || isAbsolute(inside)) return undefined;
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.size > maxBytes) return undefined;
    return readFileSync(target);
  } catch {
    return undefined;
  }
}

export function readSharedPresentation(memoryDir: string): SharedPresentation | undefined {
  const file = readInside(memoryDir, BOT_DESCRIPTOR_PATH, MAX_DESCRIPTOR_BYTES);
  if (file === undefined) return undefined;
  const avatar = parseBotDescriptor(file.toString('utf8'))?.avatar;
  if (avatar === undefined) return undefined;
  if ('recipe' in avatar) return deriveAvatarAppearance(avatar.recipe);
  const type = IMAGE_TYPES[avatar.image.split('.').pop()?.toLowerCase() ?? ''];
  const bytes = readInside(memoryDir, avatar.image, MAX_PERSONA_BOT_AVATAR_BYTES);
  if (type === undefined || bytes === undefined) return undefined;
  const dataUrl = `data:${type};base64,${bytes.toString('base64')}`;
  return isPersonaBotAvatar(dataUrl) ? { avatar: dataUrl } : undefined;
}

export function readSharedBanner(memoryDir: string): BotBanner | undefined {
  const file = readInside(memoryDir, BOT_DESCRIPTOR_PATH, MAX_DESCRIPTOR_BYTES);
  if (file === undefined) return undefined;
  const banner = parseBotDescriptor(file.toString('utf8'))?.banner;
  if (banner === undefined) return undefined;
  if ('recipe' in banner) return isBotBanner(banner) ? banner : undefined;
  if (!banner.image.toLowerCase().endsWith('.png')) return undefined;
  const bytes = readInside(memoryDir, banner.image, MAX_BOT_BANNER_BYTES);
  return bytes === undefined ? undefined : botBannerFromPng(bytes);
}

export function readSharedPrimaryColor(memoryDir: string): BotPrimaryColor | undefined {
  const file = readInside(memoryDir, BOT_DESCRIPTOR_PATH, MAX_DESCRIPTOR_BYTES);
  if (file === undefined) return undefined;
  const policy = parseBotDescriptor(file.toString('utf8'))?.primaryColor;
  return isBotPrimaryColor(policy) ? policy : undefined;
}
