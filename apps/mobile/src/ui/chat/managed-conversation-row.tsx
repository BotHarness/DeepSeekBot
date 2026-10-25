import { Platform } from 'react-native';
import { showActionMenu } from '../primitives/app-dialog';
import { useStrings } from '../strings';
import { useNavigationContainerRef, useRouter } from 'expo-router';
import type { HostClient, RosterArrangement } from '../../host/client';
import type { DeletionTarget } from '../../host/deletion';
import type { Inbox } from '../../host/inbox';
import type { HostLook } from '../design/host-look';
import { ItemMenu } from '../primitives/item-menu';
import { conversationPeek } from '../shell/conversation-peek';
import { conversationHref, openConversation } from '../shell/open-conversation';
import {
  conversationActions,
  conversationChannelId,
  runConversationAction,
} from './conversation-actions';
import { conversationMenu } from './conversation-menu';
import { ConversationRow } from './conversation-row';
import { titleOf, type Conversation } from './conversations';

export function ManagedConversationRow({
  row,
  pinned,
  client,
  inbox,
  hostId,
  look,
  arrangement,
  onDelete,
  onError,
}: {
  row: Conversation;
  pinned: boolean;
  client: HostClient | undefined;
  inbox: Inbox | undefined;
  hostId: string | undefined;
  look: HostLook;
  arrangement: RosterArrangement | undefined;
  onDelete(target: DeletionTarget): void;
  onError(): void;
}) {
  useStrings();
  const router = useRouter();
  const navigation = useNavigationContainerRef();
  const openChannel = () => {
    if (!openConversation(navigation, row, hostId)) onError();
  };
  const channelId = conversationChannelId(row);
  const state = { pinned, hostMuted: arrangement?.muted?.includes(channelId ?? '') === true };
  const onAction = (key: Parameters<typeof runConversationAction>[3]) => {
    if (key === 'section') {
      if (hostId && channelId)
        router.push({ pathname: '/conversation-section', params: { hostId, channelId } });
      return;
    }
    if (client) void runConversationAction(client, inbox, row, key).catch(onError);
  };
  const actions = client
    ? conversationMenu(row, {
        ...state,
        sections: arrangement?.sections ?? [],
        onAction,
        onDelete,
        onMove: (sectionId) => {
          if (!channelId) return;
          void client
            .call('rosterBatch', { action: 'move', channelIds: [channelId], sectionId })
            .then(() => client.refresh())
            .catch(onError);
        },
      })
    : [];
  const common = { row, now: new Date(), look, actions: conversationActions(row, state), onAction };
  const openMenu = () =>
    showActionMenu(
      titleOf(row),
      actions.map((action) => ({
        text: action.label,
        icon: action.glyph,
        style: action.destructive ? 'destructive' : 'default',
        onPress: action.run,
      })),
    );
  if (conversationPeek || Platform.OS === 'android')
    return (
      <ConversationRow
        {...common}
        previewHref={conversationPeek && hostId ? conversationHref(row, hostId) : undefined}
        menuActions={actions}
        onLongPress={conversationPeek ? undefined : openMenu}
        onMenu={openMenu}
        onPress={openChannel}
      />
    );
  return (
    <ItemMenu title={titleOf(row)} actions={actions}>
      {(open) => (
        <ConversationRow {...common} onLongPress={open} onMenu={open} onPress={openChannel} />
      )}
    </ItemMenu>
  );
}
