import type { CloudConversation } from '../../cloud/conversations';
import { ConnectionProgress } from '../primitives/connection-progress';
import { useStrings } from '../strings';
import { ConversationGroupAvatar, ConversationRowFrame } from './conversation-row';

export function CloudConversationRow({
  row,
  pending = false,
  onPress,
}: {
  row: CloudConversation;
  pending?: boolean;
  onPress(): void;
}) {
  const t = useStrings();
  return (
    <ConversationRowFrame
      testID={`conversation-row-cloud:${row.channel.channelId}`}
      title={row.channel.name}
      source="cloud"
      label={[row.channel.name, t.cloudChannels.cloudChannel, pending ? t.loading : undefined]
        .filter(Boolean)
        .join(', ')}
      preview={t.recentNotLoaded}
      avatar={
        <ConnectionProgress active={pending}>
          <ConversationGroupAvatar />
        </ConnectionProgress>
      }
      disabled={pending}
      onPress={onPress}
    />
  );
}
