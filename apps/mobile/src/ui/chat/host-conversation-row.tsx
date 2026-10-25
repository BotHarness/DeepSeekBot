import { useHostLook } from '../../host/native-host-look';
import type { DeletionTarget } from '../../host/deletion';
import { ManagedConversationRow } from './managed-conversation-row';
import { shownHostName } from '../design/host-look';
import type { EnvironmentChatRow as Row } from './environment-chat-list';

export function HostRow({
  item,
  onDelete,
  onError,
}: {
  item: Extract<Row, { type: 'computer' }>;
  onDelete(target: DeletionTarget): void;
  onError(): void;
}) {
  const { saved, client, inbox, snapshot } = item.host;
  const look = useHostLook(saved.hostId);
  return (
    <ManagedConversationRow
      row={item.conversation}
      pinned={item.pinned}
      client={client}
      inbox={inbox}
      hostId={saved.hostId}
      look={look}
      sourceLabel={shownHostName(look, saved.hostName)}
      arrangement={snapshot.roster?.arrangement}
      onDelete={onDelete}
      onError={onError}
    />
  );
}
