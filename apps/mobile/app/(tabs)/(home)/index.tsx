import { Redirect, Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';

import { useHostSession, useHostSnapshot, useInbox } from '../../../src/host/host-session';
import { useHostLook } from '../../../src/host/native-host-look';
import { sectionCollapse, useCollapsedSections } from '../../../src/host/native-section-collapse';
import { ConversationRow } from '../../../src/ui/chat/conversation-row';
import {
  chatList,
  PINNED_SECTION,
  shortcutCounts,
  type ConversationFilter,
} from '../../../src/ui/chat/conversations';
import { SectionHeader } from '../../../src/ui/chat/section-header';
import { ConnectionBanner } from '../../../src/ui/connection-banner';
import { space } from '../../../src/ui/design/tokens';
import { Text } from '../../../src/ui/primitives/text';
import { HomeHeader } from '../../../src/ui/shell/home-header';
import { ShortcutCards } from '../../../src/ui/shell/shortcut-cards';
import { t } from '../../../src/ui/strings';
import type { HumanAttentionItem } from '../../../src/host/wire';

const NONE: HumanAttentionItem[] = [];

export default function HomeScreen() {
  const router = useRouter();
  const { saved, client, inbox } = useHostSession();
  const look = useHostLook(saved?.hostId);
  const snapshot = useHostSnapshot(client);
  const list = useInbox(inbox);
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const action = list.status === 'ready' ? list.sections.action : NONE;
  const hostId = saved?.hostId;
  const collapsed = useCollapsedSections(hostId);
  const rows = useMemo(
    () => chatList(snapshot.roster, action, filter, collapsed),
    [snapshot.roster, action, filter, collapsed],
  );
  const counts = useMemo(() => shortcutCounts(snapshot.roster, action), [snapshot.roster, action]);
  const now = new Date();

  if (saved === undefined)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  if (saved === null) return <Redirect href="/pair" />;

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([client?.refresh(), inbox?.refresh()]).catch(() => undefined);
    setRefreshing(false);
  };

  return (
    <>
      <Stack.Screen options={{ title: saved.hostName, headerShown: false }} />
      <HomeHeader hostName={saved.hostName} look={look}>
        <FlatList
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
              <ShortcutCards counts={counts} filter={filter} onFilter={setFilter} />
            </>
          }
          ListEmptyComponent={
            snapshot.roster === undefined ? null : (
              <View style={{ padding: space.x6, alignItems: 'center', gap: space.x3 }}>
                <Text tone="muted">{filter === 'all' ? t.noBots : t.noConversations}</Text>
                {filter === 'all' ? null : (
                  <Text tone="accent" accessibilityRole="button" onPress={() => setFilter('all')}>
                    {t.showAll}
                  </Text>
                )}
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
                  collapsed={item.collapsed}
                  onToggle={() => sectionCollapse.toggle(saved.hostId, item.id)}
                />
              );
            const row = item.row;
            return (
              <ConversationRow
                row={row}
                now={now}
                {...(row.kind === 'bot'
                  ? {
                      onPress: () =>
                        router.push({ pathname: '/dm/[slug]', params: { slug: row.bot.slug } }),
                    }
                  : {})}
              />
            );
          }}
        />
      </HomeHeader>
    </>
  );
}
