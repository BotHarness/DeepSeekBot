import type {
  GroupBotCandidate,
  GroupHumanCandidate,
  GroupMemberOutcome,
  GroupMemberPickerResult,
  GroupMemberTarget,
} from '@botharness/host-protocol/group-members';
import { type BridgeCall, BridgeCallError } from './bridge.js';
import { list, record, unwrap } from './team-bridge.js';

export async function loadGroupMemberPicker(
  call: BridgeCall,
  channelId: string | undefined,
  query: string,
  signal?: AbortSignal,
): Promise<GroupMemberPickerResult> {
  const result = record(
    await unwrap(
      call,
      'channelGroupMemberPicker',
      {
        ...(channelId === undefined ? {} : { channelId }),
        query,
      },
      signal,
    ),
  );
  if (
    !result ||
    typeof result.canAddBots !== 'boolean' ||
    typeof result.canAddPeople !== 'boolean' ||
    !Array.isArray(result.people) ||
    !Array.isArray(result.bots)
  )
    throw new BridgeCallError('invalid-response', 'Invalid Group member candidates');
  const people = list(result.people, (value): GroupHumanCandidate | undefined => {
    const row = record(value);
    if (typeof row?.id !== 'string' || typeof row.displayName !== 'string') return undefined;
    return {
      id: row.id,
      displayName: row.displayName,
      ...(typeof row.username === 'string' ? { username: row.username } : {}),
    };
  });
  const bots = list(result.bots, (value): GroupBotCandidate | undefined => {
    const row = record(value);
    if (typeof row?.id !== 'string' || typeof row.displayName !== 'string') return undefined;
    return {
      id: row.id,
      displayName: row.displayName,
      ...(row.requiresOwner === true ? { requiresOwner: true } : {}),
      ...(typeof row.requiredHumanId === 'string' ? { requiredHumanId: row.requiredHumanId } : {}),
    };
  });
  return { canAddBots: result.canAddBots, canAddPeople: result.canAddPeople, people, bots };
}

export function groupMemberKey(row: { kind: GroupMemberTarget['kind']; id: string }): string {
  return row.kind + ':' + row.id;
}

export async function addGroupMembers(
  call: BridgeCall,
  channelId: string,
  targets: GroupMemberTarget[],
): Promise<Map<string, GroupMemberOutcome>> {
  const result = record(await unwrap(call, 'channelGroupMembersAdd', { channelId, targets }));
  const results = new Map<string, GroupMemberOutcome>();
  const items = Array.isArray(result?.results) ? result.results : [];
  for (const item of items) {
    const row = record(item);
    if ((row?.kind !== 'human' && row?.kind !== 'bot') || typeof row.id !== 'string') continue;
    const identity: Pick<GroupMemberTarget, 'kind' | 'id'> = { kind: row.kind, id: row.id };
    if (row.status === 'joined' || row.status === 'pending')
      results.set(groupMemberKey(identity), { ...identity, status: row.status });
    else if (row.status === 'failed' && typeof row.code === 'string')
      results.set(groupMemberKey(identity), { ...identity, status: 'failed', code: row.code });
  }
  if (targets.some((target) => !results.has(groupMemberKey(target))))
    throw new BridgeCallError('invalid-response', 'Missing Group member outcome');
  return results;
}
