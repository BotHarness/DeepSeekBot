import type { BotCreationDraft, CreationRecord } from '@botharness/host-client/bot-creation';
import type { ChannelCreationRecord } from './channel-creation';

export function channelDraftStarted(record: ChannelCreationRecord): boolean {
  return record.kind === 'draft' && (record.name.trim() !== '' || record.members.length > 0);
}

function botDraftStarted(draft: BotCreationDraft): boolean {
  return (
    draft.displayName.trim() !== '' ||
    draft.persona.trim() !== '' ||
    draft.description.trim() !== '' ||
    draft.tags.trim() !== '' ||
    (draft.tagInput ?? '').trim() !== '' ||
    (draft.source?.kind === 'git' ? draft.source.gitUrl.trim() !== '' : draft.source !== undefined)
  );
}

export function botRecordStarted(record: CreationRecord): boolean {
  return record.kind === 'draft' && botDraftStarted(record.draft);
}
