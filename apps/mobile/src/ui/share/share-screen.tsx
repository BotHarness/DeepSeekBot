import { useIncomingShare } from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHostSession, useHostSnapshot, useQuietChannels } from '../../host/host-session';
import { hostDraftKey } from '../../host/source-drafts';
import { ConversationRow } from '../chat/conversation-row';
import { conversations, type Conversation } from '../chat/conversations';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { DrawerHeader } from '../primitives/drawer-header';
import { Text } from '../primitives/text';
import { conversationHref } from '../shell/open-conversation';
import { t } from '../strings';
import { deliverShare, incomingShare } from './incoming-share';

function draftKey(hostId: string, row: Conversation): string {
  return row.kind === 'bot'
    ? hostDraftKey(hostId, 'dm', row.bot.slug)
    : hostDraftKey(hostId, 'channel', row.channel.id);
}

export default function ShareScreen() {
  const router = useRouter();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { saved, client } = useHostSession();
  const snapshot = useHostSnapshot(client);
  const quiet = useQuietChannels(saved?.hostId);
  const incoming = useIncomingShare();
  const share = useMemo(
    () => incomingShare(incoming.resolvedSharedPayloads),
    [incoming.resolvedSharedPayloads],
  );
  const rows = useMemo(
    () => conversations(snapshot.roster, [], {}, quiet),
    [snapshot.roster, quiet],
  );
  const [sending, setSending] = useState(false);
  const empty = !incoming.isResolving && share.text === '' && share.files.length === 0;
  const send = async (row: Conversation) => {
    if (saved === undefined || saved === null || sending || empty) return;
    setSending(true);
    await deliverShare(draftKey(saved.hostId, row), share);
    incoming.clearSharedPayloads();
    router.replace(conversationHref(row, saved.hostId));
  };
  const close = () => {
    incoming.clearSharedPayloads();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.overlay.fill }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: insets.bottom + space.x6 }}
      data={saved && !empty ? rows : []}
      keyExtractor={(row) => row.key}
      ListHeaderComponent={
        <View style={{ paddingTop: space.x5, paddingHorizontal: space.x5 }}>
          <DrawerHeader title={t.share.title} onClose={close} />
          <View
            testID="share-preview"
            style={{
              marginVertical: space.x5,
              padding: space.x5,
              gap: space.x3,
              borderRadius: radius.lg,
              backgroundColor: theme.layer.raised.fill,
            }}
          >
            {incoming.isResolving ? (
              <ActivityIndicator />
            ) : empty ? (
              <Text tone="muted">{t.share.nothing}</Text>
            ) : (
              <>
                {share.text !== '' && <Text numberOfLines={4}>{share.text}</Text>}
                {share.files.length > 0 && (
                  <Text variant="meta" tone="muted">
                    {t.share.files(share.files.length)}
                  </Text>
                )}
              </>
            )}
          </View>
        </View>
      }
      ListEmptyComponent={
        saved === null ? (
          <View style={{ paddingHorizontal: space.x5, gap: space.x4 }}>
            <Text tone="muted">{t.share.pairFirst}</Text>
            <Button
              label={t.pairTitle}
              tone="primary"
              testID="share-pair"
              onPress={() => router.replace('/pair')}
            />
          </View>
        ) : !empty && snapshot.roster === undefined ? (
          <ActivityIndicator />
        ) : undefined
      }
      renderItem={({ item }) => (
        <ConversationRow row={item} now={new Date()} onPress={() => void send(item)} />
      )}
    />
  );
}
