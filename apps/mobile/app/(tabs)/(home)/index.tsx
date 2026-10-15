import { Redirect, Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';

import { fullClientParams } from '../../../src/host/full-client';
import { useHostSession, useHostSnapshot, useInbox } from '../../../src/host/host-session';
import { loadHumanName } from '../../../src/host/human';
import { useHostLook } from '../../../src/host/native-host-look';
import { shownHostName } from '../../../src/ui/design/host-look';
import { sectionCollapse, useCollapsedSections } from '../../../src/host/native-section-collapse';
import { AVATAR_EDGE, ConversationRow } from '../../../src/ui/chat/conversation-row';
import {
  chatList,
  PINNED_SECTION,
  searchConversations,
  type ChatListItem,
} from '../../../src/ui/chat/conversations';
import { SectionHeader } from '../../../src/ui/chat/section-header';
import { ConnectionBanner } from '../../../src/ui/connection-banner';
import { space } from '../../../src/ui/design/tokens';
import { SearchField } from '../../../src/ui/primitives/search-field';
import { Text } from '../../../src/ui/primitives/text';
import { CreateButton, type CreateTarget } from '../../../src/ui/shell/create-button';
import { HomeHeader } from '../../../src/ui/shell/home-header';
import { HostDrawerEdge } from '../../../src/ui/shell/host-drawer';
import { HumanAvatarButton } from '../../../src/ui/shell/human-avatar';
import { openConversation } from '../../../src/ui/shell/open-conversation';
import { t } from '../../../src/ui/strings';
import type { HumanAttentionItem } from '../../../src/host/wire';

const NONE: HumanAttentionItem[] = [];

export default function HomeScreen() {
  const router = useRouter();
  const { saved, client, inbox } = useHostSession();
  const look = useHostLook(saved?.hostId);
  const snapshot = useHostSnapshot(client);
  const list = useInbox(inbox);
  const connected = snapshot.connection.status === 'connected';
  const loadName = useMemo(
    () => (client === undefined || !connected ? undefined : () => loadHumanName(client)),
    [client, connected],
  );
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const action = list.status === 'ready' ? list.sections.action : NONE;
  const unread = list.status === 'ready' ? list.unread : undefined;
  const hostId = saved?.hostId;
  const collapsed = useCollapsedSections(hostId);
  const searching = query.trim() !== '';
  const rows = useMemo(
    () =>
      searching
        ? searchConversations(snapshot.roster, action, query, unread).map((row): ChatListItem => ({
            kind: 'row',
            key: row.key,
            row,
          }))
        : chatList(snapshot.roster, action, collapsed, unread),
    [snapshot.roster, action, collapsed, query, searching, unread],
  );
  const now = new Date();

  if (saved === undefined)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  if (saved === null) return <Redirect href="/pair" />;

  const create = (target: CreateTarget) =>
    router.push({ pathname: '/full-client', params: fullClientParams(target) });

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([client?.refresh(), inbox?.refresh()]).catch(() => undefined);
    setRefreshing(false);
  };

  return (
    <>
      <Stack.Screen options={{ title: shownHostName(look, saved.hostName), headerShown: false }} />
      <HostDrawerEdge>
        <HomeHeader
          hostName={shownHostName(look, saved.hostName)}
          look={look}
          actions={
            <>
              <CreateButton onPick={create} />
              <HumanAvatarButton loadName={loadName} onPress={() => router.push('/settings')} />
            </>
          }
        >
          <FlatList
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            data={rows}
            contentInsetAdjustmentBehavior="automatic"
            keyExtractor={(row) => row.key}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
            ListHeaderComponent={
              <>
                <ConnectionBanner
                  connection={snapshot.connection}
                  onRetry={() => client?.retryNow()}
                  onPairAgain={() => router.push('/pair')}
                />
                <SearchField
                  inset={AVATAR_EDGE}
                  value={query}
                  placeholder={t.searchPlaceholder}
                  onChangeText={setQuery}
                />
              </>
            }
            ListEmptyComponent={
              snapshot.roster === undefined ? null : (
                <View style={{ padding: space.x6, alignItems: 'center' }}>
                  <Text tone="muted" style={{ textAlign: 'center' }}>
                    {searching ? t.searchNoMatch(query.trim()) : t.noBots}
                  </Text>
                </View>
              )
            }
            renderItem={({ item }) => {
              if (item.kind === 'section')
                return (
                  <SectionHeader
                    name={item.id === PINNED_SECTION ? t.pinnedSection : (item.name ?? '')}
                    count={item.count}
                    needsYou={item.needsYou}
                    unread={item.unread}
                    collapsed={item.collapsed}
                    onToggle={() => sectionCollapse.toggle(saved.hostId, item.id)}
                  />
                );
              const row = item.row;
              return (
                <ConversationRow
                  row={row}
                  now={now}
                  onPress={() => openConversation(router, row)}
                />
              );
            }}
          />
        </HomeHeader>
      </HostDrawerEdge>
    </>
  );
}
