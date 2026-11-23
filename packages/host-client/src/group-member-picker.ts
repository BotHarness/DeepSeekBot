import type {
  GroupBotCandidate,
  GroupHumanCandidate,
  GroupMemberPickerResult,
} from '@botharness/host-protocol/group-members';
import { answerRecord, HostAnswerInvalid, record, type HostCall } from './host-answer';

export async function loadGroupMemberPicker(
  host: HostCall,
  args: { channelId?: string; query?: string } = {},
): Promise<GroupMemberPickerResult> {
  const method = 'channelGroupMemberPicker';
  const answer = answerRecord(
    await host.call(method, {
      ...(args.channelId === undefined ? {} : { channelId: args.channelId }),
      query: args.query ?? '',
    }),
    method,
  );
  if (
    typeof answer['canAddBots'] !== 'boolean' ||
    typeof answer['canAddPeople'] !== 'boolean' ||
    !Array.isArray(answer['people']) ||
    !Array.isArray(answer['bots'])
  )
    throw new HostAnswerInvalid(`${method} returned no candidates.`);
  const people = answer['people'].flatMap((value): GroupHumanCandidate[] => {
    const row = record(value);
    if (typeof row?.['id'] !== 'string' || typeof row['displayName'] !== 'string') return [];
    return [
      {
        id: row['id'],
        displayName: row['displayName'],
        ...(typeof row['username'] === 'string' ? { username: row['username'] } : {}),
      },
    ];
  });
  const bots = answer['bots'].flatMap((value): GroupBotCandidate[] => {
    const row = record(value);
    if (typeof row?.['id'] !== 'string' || typeof row['displayName'] !== 'string') return [];
    return [
      {
        id: row['id'],
        displayName: row['displayName'],
        ...(row['requiresOwner'] === true ? { requiresOwner: true as const } : {}),
        ...(typeof row['requiredHumanId'] === 'string'
          ? { requiredHumanId: row['requiredHumanId'] }
          : {}),
      },
    ];
  });
  return {
    canAddBots: answer['canAddBots'],
    canAddPeople: answer['canAddPeople'],
    people,
    bots,
  };
}
