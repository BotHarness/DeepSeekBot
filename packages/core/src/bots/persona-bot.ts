import type { HttpsFallback } from '../memory/clone.js';
import { isStandingLimits, type StandingLimits } from '../memory/soul.js';
import { isPersonaBotModelPlan, type PersonaBotModelPlan } from '../models/presets.js';
import { createHash } from 'node:crypto';
import {
  isAvatarAppearance,
  isRetainedAvatarAppearance,
  type AvatarAppearance,
  type RetainedAvatarAppearance,
} from './avatar-appearance.js';
import { isBotBanner, type BotBanner } from './bot-banner.js';
import { isBotPrimaryColor, type BotPrimaryColor } from './primary-color.js';

export interface PersonaBotRecord {
  slug: string;
  displayName: string;
  roles?: string[];

  tag?: string;
  description?: string;
  avatar?: string;
  appearance?: AvatarAppearance | RetainedAvatarAppearance;
  banner?: BotBanner;
  primaryColor?: BotPrimaryColor;
  avatarSeed?: 2;
  model?: string;
  modelPlan?: PersonaBotModelPlan;
  modelPlanRevision?: number;
  preset?: string;
  memoryDir?: string;
  workspaces: string[];
  createdAt: string;
  paused?: boolean;

  computerAccess?: boolean;
  browserAccess?: boolean;
  browserProfile?: string;

  approvalTemplate?: string;

  standingLimits?: StandingLimits;
}

export interface CreatePersonaBotInput {
  slug: string;
  displayName: string;
  persona?: string;
  coreMemory?: string;
  roles?: string[];
  description?: string;
  avatar?: string;
  model?: string;
  preset?: string;
  memoryDir?: string;
  memoryLocation?: string;
  workspaces?: string[];
}

export type CreatePersonaBotResult =
  | { ok: true; record: PersonaBotRecord; httpsFallback?: HttpsFallback }
  | {
      ok: false;
      reason:
        | 'invalid-slug'
        | 'duplicate'
        | 'invalid-input'
        | 'invalid-memory-dir'
        | 'git-not-found'
        | 'invalid-git-url'
        | 'git-clone-failed'
        | 'git-clone-timeout'
        | 'invalid-zip'
        | 'memory-unavailable';
      detail?: string;
    };

export interface PersonaBotPatch {
  displayName?: string;
  roles?: string[];
  description?: string;
  avatar?: string;
  model?: string;
  preset?: string;
  workspaces?: string[];
  computerAccess?: boolean;
  browserAccess?: boolean;
  browserProfile?: string;
}

export type UpdatePersonaBotResult =
  | { ok: true; record: PersonaBotRecord }
  | { ok: false; reason: 'not-found' | 'invalid-input' };

export const MAX_PERSONA_BOT_AVATAR_BYTES = 131_072;
const MAX_PERSONA_BOT_AVATAR_CHARS = 175_000;

export function isPersonaBotAvatar(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_PERSONA_BOT_AVATAR_CHARS) return false;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(value);
  if (match === null) return false;
  const bytes = Buffer.from(match[2]!, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_PERSONA_BOT_AVATAR_BYTES) return false;
  return match[1] === 'png'
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : match[1] === 'jpeg'
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

export function personaBotAvatarFromBytes(bytes: Uint8Array): string | undefined {
  const data = Buffer.from(bytes);
  const type = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? 'png'
    : data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
      ? 'jpeg'
      : data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
        ? 'webp'
        : undefined;
  if (type === undefined) return undefined;
  const avatar = `data:image/${type};base64,${data.toString('base64')}`;
  return isPersonaBotAvatar(avatar) ? avatar : undefined;
}

export function isUsableAvatarAppearance(
  appearance: unknown,
  avatar: unknown,
): appearance is AvatarAppearance | RetainedAvatarAppearance {
  if (!isAvatarAppearance(appearance) && !isRetainedAvatarAppearance(appearance)) return false;
  if (!isPersonaBotAvatar(avatar) || !avatar.startsWith('data:image/png;base64,')) return false;
  const png = Buffer.from(avatar.slice('data:image/png;base64,'.length), 'base64');
  const revision = createHash('sha256')
    .update(JSON.stringify(appearance.recipe))
    .update(png)
    .digest('hex');
  return revision === appearance.revision;
}

export interface RemovePersonaBotOptions {
  purge?: boolean;
}

export function isPersonaBotRecord(value: unknown, slug: string): value is PersonaBotRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record['slug'] !== slug) return false;
  if (typeof record['displayName'] !== 'string') return false;
  if (typeof record['createdAt'] !== 'string') return false;
  if (record['paused'] !== undefined && typeof record['paused'] !== 'boolean') return false;
  if (record['computerAccess'] !== undefined && typeof record['computerAccess'] !== 'boolean')
    return false;
  if (record['browserAccess'] !== undefined && typeof record['browserAccess'] !== 'boolean')
    return false;
  if (record['browserProfile'] !== undefined && typeof record['browserProfile'] !== 'string')
    return false;
  if (record['approvalTemplate'] !== undefined && typeof record['approvalTemplate'] !== 'string')
    return false;
  if (
    record['appearance'] !== undefined &&
    !isUsableAvatarAppearance(record['appearance'], record['avatar'])
  )
    return false;
  if (record['banner'] !== undefined && !isBotBanner(record['banner'])) return false;
  if (record['primaryColor'] !== undefined && !isBotPrimaryColor(record['primaryColor']))
    return false;
  if (record['avatarSeed'] !== undefined && record['avatarSeed'] !== 2) return false;
  if (!Array.isArray(record['workspaces'])) return false;
  if (!record['workspaces'].every((entry) => typeof entry === 'string')) return false;
  if (record['roles'] !== undefined) {
    if (!Array.isArray(record['roles'])) return false;
    if (!record['roles'].every((entry) => typeof entry === 'string')) return false;
  }
  for (const key of ['tag', 'description', 'avatar', 'model', 'preset', 'memoryDir'] as const) {
    const optional = record[key];
    if (optional !== undefined && typeof optional !== 'string') return false;
  }
  if (
    record['modelPlanRevision'] !== undefined &&
    (!Number.isSafeInteger(record['modelPlanRevision']) ||
      (record['modelPlanRevision'] as number) < 0)
  )
    return false;
  if (record['modelPlan'] !== undefined && !isPersonaBotModelPlan(record['modelPlan']))
    return false;
  if (record['standingLimits'] !== undefined && !isStandingLimits(record['standingLimits']))
    return false;
  return true;
}
