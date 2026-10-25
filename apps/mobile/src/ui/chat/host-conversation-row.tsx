import { useRouter } from 'expo-router';
import { useHostLook } from '../../host/native-host-look';
import { ConversationRow } from './conversation-row';
import {
  conversationActions,
  conversationChannelId,
  runConversationAction,
} from './conversation-actions';
import { shownHostName } from '../design/host-look';
import { showAppDialog } from '../primitives/app-dialog';
import { conversationHref, openConversation } from '../shell/open-conversation';
import { conversationPeek } from '../shell/conversation-peek';
import { useStrings } from '../strings';
import type { EnvironmentChatRow as Row } from './environment-chat-list';
export function HostRow({ item }: { item: Extract<Row, { type: 'computer' }> }) {
  const router = useRouter();
  const t = useStrings();
  const { saved, client, inbox, snapshot } = item.host;
  const look = useHostLook(saved.hostId);
  const row = (
    <ConversationRow
      row={item.conversation}
      now={new Date()}
      look={look}
      sourceLabel={shownHostName(look, saved.hostName)}
      previewHref={conversationPeek ? conversationHref(item.conversation, saved.hostId) : undefined}
      onPress={() => openConversation(router, item.conversation, saved.hostId)}
      actions={conversationActions(item.conversation, {
        pinned: item.pinned,
        hostMuted:
          snapshot.roster?.arrangement?.muted?.includes(
            conversationChannelId(item.conversation) ?? '',
          ) === true,
      })}
      onAction={(key) => {
        if (key === 'section') {
          const channelId = conversationChannelId(item.conversation);
          if (channelId)
            router.push({
              pathname: '/conversation-section',
              params: { hostId: saved.hostId, channelId },
            });
          return;
        }
        runConversationAction(client, inbox, item.conversation, key).catch(() =>
          showAppDialog(t.rowActions.failed, undefined, [{ text: t.done }]),
        );
      }}
    />
  );
  return row;
}
