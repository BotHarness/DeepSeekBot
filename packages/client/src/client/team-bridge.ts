import { BridgeCallError, type BridgeCall } from './bridge.js';

export type TeamViewerKind = 'owner' | 'member';

export interface TeamViewer {
  readonly humanId: string;
  readonly kind: TeamViewerKind;
  readonly displayName: string;
  readonly mustChangePassword: boolean;
  readonly owner: boolean;
  readonly permissions: readonly string[];
  readonly roleIds: readonly string[];
}

export interface TeamModeView {
  readonly enabled: boolean;
  readonly ownerPasswordSet: boolean;
  readonly insecureHttpAllowed: boolean;
  readonly memberUrls: readonly string[];
  readonly viewer: TeamViewer;
}

export type TeamMemberStatus = 'active' | 'suspended';

export interface TeamMember {
  readonly humanId: string;
  readonly username: string;
  readonly displayName: string;
  readonly status: TeamMemberStatus;
  readonly mustChangePassword: boolean;
  readonly createdAt: string;
  readonly owner: boolean;
  readonly roleIds: readonly string[];
  readonly deviceCount: number;
}

export interface CreatedMember {
  readonly member: TeamMember;
  readonly initialPassword: string;
}

export const TEAM_REFUSALS = [
  'owner-password-required',
  'password-weak',
  'password-reused',
  'password-change-required',
  'credentials-invalid',
  'team-mode-off',
  'username-invalid',
  'username-taken',
  'channel-not-public',
  'channel-not-found',
  'permission-required',
  'role-name-invalid',
  'role-name-taken',
  'role-builtin',
  'owner-protected',
  'member-not-found',
  'device-not-found',
  'member-suspended',
  'permission-not-grantable',
  'owner-transfer-target-unverified',
  'role-not-found',
  'channel-post-restricted',
  'channel-mention-restricted',
] as const;
export type TeamRefusal = (typeof TEAM_REFUSALS)[number];

export const TEAM_PASSWORD_MIN_LENGTH = 10;

export function teamRefusal(error: unknown): TeamRefusal | undefined {
  if (!(error instanceof BridgeCallError)) return undefined;
  return (TEAM_REFUSALS as readonly string[]).includes(error.code)
    ? (error.code as TeamRefusal)
    : undefined;
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export async function unwrap(
  call: BridgeCall,
  endpoint: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const result = await call(endpoint, payload, signal);
  if (!result.ok)
    throw new BridgeCallError(result.error.code, result.error.message, result.error.details);
  return result.value;
}

export function parseTeamViewer(value: unknown): TeamViewer | undefined {
  const row = record(value);
  const humanId = text(row?.['humanId']);
  const kind = row?.['kind'];
  if (row === undefined || humanId === undefined || (kind !== 'owner' && kind !== 'member'))
    return undefined;
  return {
    humanId,
    kind,
    displayName: text(row['displayName']) ?? humanId,
    mustChangePassword: row['mustChangePassword'] === true,
    owner: row['owner'] === true || kind === 'owner',
    permissions: strings(row['permissions']),
    roleIds: strings(row['roleIds']),
  };
}

export function parseTeamMode(value: unknown): TeamModeView {
  const row = record(value);
  const viewer = parseTeamViewer(row?.['viewer']);
  if (row === undefined || viewer === undefined) throw new Error('invalid teamMode response');
  const urls = Array.isArray(row['memberUrls'])
    ? row['memberUrls'].filter((url): url is string => typeof url === 'string' && url.length > 0)
    : [];
  return {
    enabled: row['enabled'] === true,
    ownerPasswordSet: row['ownerPasswordSet'] === true,
    insecureHttpAllowed: row['insecureHttpAllowed'] === true,
    memberUrls: urls,
    viewer,
  };
}

export function parseTeamMember(value: unknown): TeamMember | undefined {
  const row = record(value);
  const humanId = text(row?.['humanId']);
  const username = text(row?.['username']);
  if (row === undefined || humanId === undefined || username === undefined) return undefined;
  return {
    humanId,
    username,
    displayName: text(row['displayName']) ?? username,
    status: row['status'] === 'suspended' ? 'suspended' : 'active',
    mustChangePassword: row['mustChangePassword'] === true,
    createdAt: text(row['createdAt']) ?? '',
    owner: row['owner'] === true,
    roleIds: strings(row['roleIds']),
    deviceCount:
      typeof row['deviceCount'] === 'number' && row['deviceCount'] >= 0 ? row['deviceCount'] : 0,
  };
}

export function list<T>(value: unknown, parse: (item: unknown) => T | undefined): T[] {
  const items = Array.isArray(value) ? value : (record(value)?.['items'] ?? []);
  return Array.isArray(items)
    ? items.flatMap((item: unknown) => {
        const parsed = parse(item);
        return parsed === undefined ? [] : [parsed];
      })
    : [];
}

export async function loadTeamMode(call: BridgeCall, signal?: AbortSignal): Promise<TeamModeView> {
  return parseTeamMode(await unwrap(call, 'teamMode', {}, signal));
}

export async function setTeamMode(call: BridgeCall, enabled: boolean): Promise<TeamModeView> {
  return parseTeamMode(await unwrap(call, 'teamModeSet', { enabled }));
}

export async function setOwnerPassword(
  call: BridgeCall,
  password: string,
  current?: string,
): Promise<TeamModeView> {
  return parseTeamMode(
    await unwrap(call, 'teamOwnerPasswordSet', {
      password,
      ...(current === undefined ? {} : { current }),
    }),
  );
}

export async function setInsecureHttp(call: BridgeCall, allowed: boolean): Promise<TeamModeView> {
  return parseTeamMode(await unwrap(call, 'teamInsecureHttpSet', { allowed }));
}

export async function loadMembers(call: BridgeCall, signal?: AbortSignal): Promise<TeamMember[]> {
  return list(await unwrap(call, 'members', {}, signal), parseTeamMember);
}

export async function createMember(
  call: BridgeCall,
  input: { username: string; displayName: string },
): Promise<CreatedMember> {
  const row = record(await unwrap(call, 'memberCreate', input));
  const member = parseTeamMember(row?.['member']);
  const initialPassword = text(row?.['initialPassword']);
  if (member === undefined || initialPassword === undefined)
    throw new Error('invalid memberCreate response');
  return { member, initialPassword };
}

export async function changeOwnPassword(
  call: BridgeCall,
  current: string,
  next: string,
): Promise<void> {
  await unwrap(call, 'memberPasswordChange', { current, next });
}

export function validUsername(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{1,31}$/u.test(value);
}

export const TEAM_ENTRY_PATH = '/botharness-device/team/';

export async function signOutMember(fetcher: typeof fetch = fetch): Promise<void> {
  const response = await fetcher(`${TEAM_ENTRY_PATH}sign-out`, {
    method: 'POST',
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('sign-out failed');
}
