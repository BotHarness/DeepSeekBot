import type { BridgeCall } from './bridge.js';
import { list, record, strings, unwrap } from './team-bridge.js';

export type SpaceAudience =
  | { readonly kind: 'everyone' }
  | { readonly kind: 'roles'; readonly roleIds: readonly string[] }
  | { readonly kind: 'members'; readonly humanIds: readonly string[] };

export interface TeamSpace {
  readonly spaceId: string;
  readonly kind: 'account' | 'shared';
  readonly name: string;
  readonly ownerHumanId?: string;
  readonly audience?: SpaceAudience;
  readonly canManage: boolean;
}

export function parseAudience(value: unknown): SpaceAudience | undefined {
  const row = record(value);
  if (row?.['kind'] === 'everyone') return { kind: 'everyone' };
  if (row?.['kind'] === 'roles') return { kind: 'roles', roleIds: strings(row['roleIds']) };
  if (row?.['kind'] === 'members') return { kind: 'members', humanIds: strings(row['humanIds']) };
  return undefined;
}

export function parseSpace(value: unknown): TeamSpace | undefined {
  const row = record(value);
  const spaceId = row?.['spaceId'];
  const name = row?.['name'];
  const kind = row?.['kind'];
  if (
    row === undefined ||
    typeof spaceId !== 'string' ||
    spaceId.length === 0 ||
    typeof name !== 'string' ||
    (kind !== 'account' && kind !== 'shared')
  )
    return undefined;
  const audience = parseAudience(row['audience']);
  const owner = row['ownerHumanId'];
  return {
    spaceId,
    kind,
    name,
    ...(typeof owner === 'string' ? { ownerHumanId: owner } : {}),
    ...(audience === undefined ? {} : { audience }),
    canManage: row['canManage'] === true,
  };
}

function audiencePayload(audience: SpaceAudience): Record<string, unknown> {
  if (audience.kind === 'roles') return { kind: 'roles', roleIds: [...audience.roleIds] };
  if (audience.kind === 'members') return { kind: 'members', humanIds: [...audience.humanIds] };
  return { kind: 'everyone' };
}

export async function loadSpaces(call: BridgeCall, signal?: AbortSignal): Promise<TeamSpace[]> {
  return list(await unwrap(call, 'spaces', {}, signal), parseSpace);
}

export async function createSpace(
  call: BridgeCall,
  input: { name: string; audience: SpaceAudience },
): Promise<void> {
  await unwrap(call, 'spaceCreate', {
    name: input.name,
    audience: audiencePayload(input.audience),
  });
}

export async function updateSpace(
  call: BridgeCall,
  input: { spaceId: string; name: string; audience: SpaceAudience },
): Promise<void> {
  await unwrap(call, 'spaceUpdate', {
    spaceId: input.spaceId,
    name: input.name,
    audience: audiencePayload(input.audience),
  });
}

export async function deleteSpace(call: BridgeCall, spaceId: string): Promise<void> {
  await unwrap(call, 'spaceDelete', { spaceId, confirm: true });
}

export function audienceReady(audience: SpaceAudience): boolean {
  if (audience.kind === 'roles') return audience.roleIds.length > 0;
  if (audience.kind === 'members') return audience.humanIds.length > 0;
  return true;
}
