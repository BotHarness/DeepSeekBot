import { useState } from 'react';
import { FlatList } from 'react-native';

import type { HostClient, RosterView } from '@botharness/host-client/client';
import { useHostSessions } from '../../host/host-session';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { SettingsRow } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { conversationChannelId, setConversationHidden } from './conversation-actions';
import { hiddenConversations, titleOf, type Conversation } from './conversations';

export function HiddenChatsScreen({ hostId }: { hostId: string }) {
  const host = useHostSessions().find((candidate) => candidate.saved.hostId === hostId);
  return <HiddenChats key={hostId} client={host?.client} roster={host?.snapshot.roster} />;
}

export function HiddenChats({
  client,
  roster,
}: {
  client: Pick<HostClient, 'call' | 'refresh'> | undefined;
  roster: RosterView | undefined;
}) {
  const t = useStrings();
  const [busy, setBusy] = useState<string>();
  const [failed, setFailed] = useState(false);
  const rows = hiddenConversations(roster);
  const unhide = (row: Conversation) => {
    const channelId = conversationChannelId(row);
    if (client === undefined || channelId === undefined || busy !== undefined) return;
    setBusy(row.key);
    setFailed(false);
    setConversationHidden(client, channelId, false)
      .catch(() => setFailed(true))
      .finally(() => setBusy(undefined));
  };
  return (
    <FlatList
      testID="hidden-chats"
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(row) => row.key}
      ListHeaderComponent={
        failed ? (
          <Text accessibilityRole="alert" tone="danger" style={{ padding: space.x5 }}>
            {t.hiddenChats.failed}
          </Text>
        ) : undefined
      }
      ListEmptyComponent={
        roster === undefined ? (
          <LoadingIndicator />
        ) : (
          <Text tone="muted" style={{ padding: space.x6 }}>
            {t.hiddenChats.empty}
          </Text>
        )
      }
      renderItem={({ item }) => (
        <SettingsRow
          on="canvas"
          testID={`hidden-chat-${item.key}`}
          title={titleOf(item)}
          trailing={
            <Button
              testID={`hidden-chat-unhide-${item.key}`}
              label={t.hiddenChats.unhide}
              on="canvas"
              fit
              busy={busy === item.key}
              disabled={client === undefined || (busy !== undefined && busy !== item.key)}
              onPress={() => unhide(item)}
            />
          }
        />
      )}
    />
  );
}
