import type { BridgeCall } from './bridge.js';
import { list, record, unwrap } from './team-bridge.js';
import {
  parseAudience,
  sameAudience,
  type AudienceDirectory,
  type AudienceRole,
  type SpaceAudience,
} from './team-spaces-bridge.js';

export const CREATE_PUBLIC_BOTS = 'bots.createPublic';

export type BotVisibility =
  | { readonly kind: 'private' }
  | { readonly kind: 'public'; readonly audience: SpaceAudience };

export interface BotSwitches {
  readonly proactiveDms: boolean;
  readonly joinPrincipalChannels: boolean;
  readonly speakerContext: boolean;
}

export interface BotAccess {
  readonly visibility: BotVisibility;
  readonly switches: BotSwitches;
  readonly directory: AudienceDirectory;
}

export interface VisibilityPreview {
  readonly dmsBecomingReadOnly: number;
  readonly channelsLeaving: number;
  readonly memoryFrom?: string;
  readonly memoryTo?: string;
}

export type VisibilityResult =
  | { readonly applied: true; readonly visibility: BotVisibility }
  | { readonly applied: false; readonly preview: VisibilityPreview };

export interface ReachableBot {
  readonly slug: string;
  readonly displayName: string;
  readonly avatar?: string;
  readonly visibility: BotVisibility['kind'];
  readonly principalDisplayName: string;
}

export interface RoleConflict {
  readonly topic: string;
  readonly allowRole: string;
  readonly denyRole: string;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

export function parseVisibility(value: unknown): BotVisibility | undefined {
  const row = record(value);
  if (row?.['kind'] === 'private') return { kind: 'private' };
  if (row?.['kind'] !== 'public') return undefined;
  const audience = parseAudience(row['audience']);
  return audience === undefined ? undefined : { kind: 'public', audience };
}

export function parseSwitches(value: unknown): BotSwitches {
  const row = record(value);
  return {
    proactiveDms: row?.['proactiveDms'] === true,
    joinPrincipalChannels: row?.['joinPrincipalChannels'] !== false,
    speakerContext: row?.['speakerContext'] !== false,
  };
}

function parseDirectoryRole(value: unknown): AudienceRole | undefined {
  const row = record(value);
  const roleId = text(row?.['roleId']);
  const name = text(row?.['name']);
  if (roleId === undefined || name === undefined) return undefined;
  const builtin = row?.['builtin'];
  return { roleId, name, builtin: builtin === 'admin' || builtin === 'member' ? builtin : null };
}

export function parseDirectory(value: unknown): AudienceDirectory {
  const row = record(value);
  return {
    roles: list(row?.['roles'], parseDirectoryRole),
    members: list(row?.['members'], (item) => {
      const member = record(item);
      const humanId = text(member?.['humanId']);
      const displayName = text(member?.['displayName']);
      return humanId === undefined || displayName === undefined
        ? undefined
        : { humanId, displayName };
    }),
  };
}

export function parseBotAccess(value: unknown): BotAccess | undefined {
  const row = record(value);
  const visibility = parseVisibility(row?.['visibility']);
  if (visibility === undefined) return undefined;
  return {
    visibility,
    switches: parseSwitches(row?.['switches']),
    directory: parseDirectory(row?.['audienceDirectory']),
  };
}

export function parseVisibilityResult(value: unknown): VisibilityResult | undefined {
  const row = record(value);
  if (row?.['applied'] === true) {
    const visibility = parseVisibility(row['visibility']);
    return visibility === undefined ? undefined : { applied: true, visibility };
  }
  if (row?.['applied'] !== false) return undefined;
  const preview = record(row['preview']);
  const memory = record(preview?.['memory']);
  const from = text(memory?.['from']);
  const to = text(memory?.['to']);
  return {
    applied: false,
    preview: {
      dmsBecomingReadOnly: Array.isArray(preview?.['dmsBecomingReadOnly'])
        ? preview['dmsBecomingReadOnly'].length
        : 0,
      channelsLeaving: Array.isArray(preview?.['channelsLeaving'])
        ? preview['channelsLeaving'].length
        : 0,
      ...(from === undefined ? {} : { memoryFrom: from }),
      ...(to === undefined ? {} : { memoryTo: to }),
    },
  };
}

export function parseReachableBot(value: unknown): ReachableBot | undefined {
  const row = record(value);
  const slug = text(row?.['slug']);
  const displayName = text(row?.['displayName']);
  const visibility = row?.['visibility'];
  if (slug === undefined || displayName === undefined) return undefined;
  const avatar = text(row?.['avatar']);
  return {
    slug,
    displayName,
    ...(avatar === undefined ? {} : { avatar }),
    visibility: visibility === 'public' ? 'public' : 'private',
    principalDisplayName: text(row?.['principalDisplayName']) ?? '',
  };
}

export function parseRoleConflict(value: unknown): RoleConflict | undefined {
  const row = record(value);
  const topic = text(row?.['topic']);
  const allowRole = text(record(row?.['allowRole'])?.['name']);
  const denyRole = text(record(row?.['denyRole'])?.['name']);
  return topic === undefined || allowRole === undefined || denyRole === undefined
    ? undefined
    : { topic, allowRole, denyRole };
}

function visibilityPayload(visibility: BotVisibility): Record<string, unknown> {
  if (visibility.kind === 'private') return { kind: 'private' };
  const audience = visibility.audience;
  return {
    kind: 'public',
    audience:
      audience.kind === 'roles'
        ? { kind: 'roles', roleIds: [...audience.roleIds] }
        : audience.kind === 'members'
          ? { kind: 'members', humanIds: [...audience.humanIds] }
          : { kind: 'everyone' },
  };
}

export async function loadBotAccess(
  call: BridgeCall,
  slug: string,
  signal?: AbortSignal,
): Promise<BotAccess> {
  const access = parseBotAccess(await unwrap(call, 'botVisibility', { slug }, signal));
  if (access === undefined) throw new Error('invalid botVisibility response');
  return access;
}

export async function setBotVisibility(
  call: BridgeCall,
  slug: string,
  visibility: BotVisibility,
  confirm: boolean,
): Promise<VisibilityResult> {
  const result = parseVisibilityResult(
    await unwrap(call, 'botVisibilitySet', {
      slug,
      visibility: visibilityPayload(visibility),
      ...(confirm ? { confirm: true } : {}),
    }),
  );
  if (result === undefined) throw new Error('invalid botVisibilitySet response');
  return result;
}

export async function setBotSwitches(
  call: BridgeCall,
  slug: string,
  switches: Partial<BotSwitches>,
): Promise<BotSwitches> {
  return parseSwitches(
    record(await unwrap(call, 'botSwitches', { slug, ...switches }))?.['switches'],
  );
}

export async function loadReachableBots(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<ReachableBot[]> {
  return list(await unwrap(call, 'reachableBots', {}, signal), parseReachableBot);
}

export async function setProactiveOptOut(
  call: BridgeCall,
  slug: string,
  optOut: boolean,
): Promise<void> {
  await unwrap(call, 'botProactiveOptOut', { slug, optOut });
}

export async function loadRoleConflicts(
  call: BridgeCall,
  humanId: string,
  signal?: AbortSignal,
): Promise<RoleConflict[]> {
  return list(await unwrap(call, 'roleConflicts', { humanId }, signal), parseRoleConflict);
}

export function sameVisibility(left: BotVisibility, right: BotVisibility): boolean {
  if (left.kind === 'private' || right.kind === 'private') return left.kind === right.kind;
  return sameAudience(left.audience, right.audience);
}
