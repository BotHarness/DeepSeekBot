export interface GroupMemberTarget {
  kind: 'human' | 'bot';
  id: string;
  operationKey: string;
}

export interface GroupMemberCandidate {
  id: string;
  displayName: string;
}

export interface GroupHumanCandidate extends GroupMemberCandidate {
  username?: string;
}

export interface GroupBotCandidate extends GroupMemberCandidate {
  requiresOwner?: true;
  requiredHumanId?: string;
}

export interface GroupMemberPickerResult {
  canAddPeople: boolean;
  canAddBots: boolean;
  people: GroupHumanCandidate[];
  bots: GroupBotCandidate[];
}

export type GroupMemberOutcome = { kind: GroupMemberTarget['kind']; id: string } & (
  | { status: 'joined' | 'pending' }
  | { status: 'failed'; code: string }
);

export interface GroupMembersAddResult {
  results: GroupMemberOutcome[];
}
