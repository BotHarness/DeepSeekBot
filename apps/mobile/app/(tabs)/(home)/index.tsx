import { renderKeyboardFormScroll } from '../../../src/ui/primitives/keyboard-form';
import { Redirect, Stack, useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, View } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  refreshQuietChannels,
  useHostSession,
  useHostSnapshot,
  useInbox,
  useQuietChannels,
} from '../../../src/host/host-session';
import { prefetchInbox } from '../../../src/host/inbox';
import { useHostLook } from '../../../src/host/native-host-look';
import { cloudClient, useCloudSnapshot } from '../../../src/cloud/native';
import { cloudAvailable } from '../../../src/cloud/available';
import { cloudConversations, useCloudConversations } from '../../../src/cloud/native-conversations';
import { cloudViewScope } from '../../../src/cloud/workspace-directory';
import { cloudError } from '../../../src/cloud/client';
import type { CloudConversation } from '../../../src/cloud/conversations';
import { ConversationRow } from '../../../src/ui/chat/conversation-row';
import { conversations, searchKey, type Conversation } from '../../../src/ui/chat/conversations';
import { CloudConversationRow } from '../../../src/ui/chat/cloud-conversation-row';
import { useConversationFilter } from '../../../src/host/native-conversation-filter';
import { ConnectionBanner } from '../../../src/ui/connection-banner';
import { space } from '../../../src/ui/design/tokens';
import { EnvironmentPager } from '../../../src/ui/shell/environment-pager';
import {
  conversationEnvironments,
  computerEnvironmentKey,
  cloudEnvironmentKey,
} from '../../../src/host/conversation-environments';
import { shownHostName } from '../../../src/ui/design/host-look';
import { Text } from '../../../src/ui/primitives/text';
import { HeaderSearch, HeaderSearchButton } from '../../../src/ui/shell/header-search';
import { HomeHeader } from '../../../src/ui/shell/home-header';
import { HostDrawerEdge } from '../../../src/ui/shell/host-drawer';
import { SettingsButton } from '../../../src/ui/shell/settings-button';
import { ConversationPeek, conversationPeek } from '../../../src/ui/shell/conversation-peek';
import { useFloatingTabInset } from '../../../src/ui/shell/floating-tab-inset';
import { conversationHref, openConversation } from '../../../src/ui/shell/open-conversation';
import { useChromeScroll, useScrollChrome } from '../../../src/ui/shell/scroll-chrome';
import { t } from '../../../src/ui/strings';

type Row =
  | {
      key: string;
      environment: string;
      type: 'computer';
      conversation: Conversation;
      pinned: boolean;
      at?: string;
    }
  | {
      key: string;
      environment: string;
      type: 'cloud';
      conversation: CloudConversation;
      pinned: false;
      at?: string;
    };
export default function HomeScreen() {
  const focused = useIsFocused();
  const { saved, client, inbox } = useHostSession();
  const snapshot = useHostSnapshot(client, focused);
  const list = useInbox(inbox, focused);
  return (
    <HomeContent saved={saved} client={client} inbox={inbox} snapshot={snapshot} list={list} />
  );
}

const HomeContent = memo(function HomeContent({
  saved,
  client,
  inbox,
  snapshot,
  list,
}: {
  saved: ReturnType<typeof useHostSession>['saved'];
  client: ReturnType<typeof useHostSession>['client'];
  inbox: ReturnType<typeof useHostSession>['inbox'];
  snapshot: ReturnType<typeof useHostSnapshot>;
  list: ReturnType<typeof useInbox>;
}) {
  const router = useRouter();
  const prepared = useRef<typeof client>(undefined);
  useFocusEffect(
    useCallback(() => {
      if (client === undefined || prepared.current === client) return;
      let stop: (() => void) | undefined;
      const idle = requestIdleCallback(() => {
        prepared.current = client;
        router.prefetch('/activity');
        stop = prefetchInbox(client, { activity: true, section: 'action' });
      });
      return () => {
        cancelIdleCallback(idle);
        stop?.();
      };
    }, [router, client]),
  );
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const onScroll = useChromeScroll(true, searchFocused || query !== '');
  const chrome = useScrollChrome();
  const bottom = useFloatingTabInset();
  const look = useHostLook(saved?.hostId);
  const cloud = useCloudSnapshot();
  const directory = useCloudConversations();
  const [filter, setFilter] = useConversationFilter();
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string>();
  const enrollment = JSON.stringify(cloud.rows.map(cloudViewScope));
  useFocusEffect(
    useCallback(() => {
      if (cloud.ready) void cloudConversations.refresh();
    }, [cloud.ready, enrollment]),
  );
  const filters = useMemo(
    () =>
      conversationEnvironments(
        saved ? { hostId: saved.hostId, name: shownHostName(look, saved.hostName) } : undefined,
        cloud.rows.filter((r) => r.hasSession).map(cloudViewScope),
        directory.workspaces,
        t.allEnvironments,
      ),
    [saved, look, cloud.rows, directory.workspaces],
  );
  const effectiveFilter = filters.some((f) => f.key === filter) ? filter : 'all';
  const quiet = useQuietChannels(saved?.hostId);
  useFocusEffect(
    useCallback(() => {
      if (saved) refreshQuietChannels(saved);
    }, [saved]),
  );
  useFocusEffect(
    useCallback(() => {
      if (
        saved !== undefined &&
        cloud.ready &&
        directory.ready &&
        directory.errors.length === 0 &&
        !directory.busy &&
        filter !== effectiveFilter
      )
        setFilter(effectiveFilter);
    }, [
      saved,
      cloud.ready,
      directory.ready,
      directory.errors.length,
      directory.busy,
      filter,
      effectiveFilter,
      setFilter,
    ]),
  );
  const rows = useMemo(() => {
    const pins = new Set(snapshot.roster?.arrangement?.pins);
    const hostRows: Row[] = saved
      ? conversations(
          snapshot.roster,
          list.status === 'ready' ? list.sections.action : [],
          list.status === 'ready' ? list.unread : {},
          quiet,
        ).map((conversation) => ({
          key: JSON.stringify(['computer', saved.hostId, conversation.key]),
          environment: computerEnvironmentKey(saved.hostId),
          type: 'computer',
          conversation,
          pinned:
            pins.has(
              conversation.kind === 'bot' ? conversation.bot.slug : conversation.channel.id,
            ) ||
            pins.has(
              conversation.kind === 'bot'
                ? (conversation.bot.dmChannelId ?? '')
                : conversation.channel.id,
            ),
          ...(conversation.at ? { at: conversation.at } : {}),
        }))
      : [];
    const cloudRows: Row[] = directory.rows.map((conversation) => ({
      key: conversation.key,
      environment: cloudEnvironmentKey(conversation.scope, conversation.organizationId),
      type: 'cloud',
      conversation,
      pinned: false,
    }));
    const needle = searchKey(query);
    const title = (r: Row) =>
      searchKey(
        r.type === 'cloud'
          ? r.conversation.channel.name
          : r.conversation.kind === 'bot'
            ? r.conversation.bot.displayName
            : r.conversation.channel.name,
      );
    return [...hostRows, ...cloudRows]
      .filter((r) => !needle || title(r).includes(needle))
      .sort(
        (a, b) =>
          (needle
            ? Number(title(b).startsWith(needle)) - Number(title(a).startsWith(needle))
            : 0) ||
          Number(b.pinned) - Number(a.pinned) ||
          (Date.parse(b.at ?? '') || 0) - (Date.parse(a.at ?? '') || 0) ||
          a.key.localeCompare(b.key),
      );
  }, [snapshot.roster, list, directory.rows, saved, query, quiet]);
  if (saved === undefined || (!cloud.ready && !cloud.error))
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  if (saved === null && cloud.rows.length === 0)
    return <Redirect href={cloudAvailable ? '/cloud-join' : '/pair'} />;
  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([client?.refresh(), inbox?.refresh(), cloudConversations.refresh()]).catch(
      () => undefined,
    );
    setRefreshing(false);
  };
  const openCloud = async (target: CloudConversation) => {
    if (opening || cloud.busy || directory.busy) return;
    setOpening(true);
    setError(undefined);
    try {
      let current = cloudClient
        .getSnapshot()
        .rows.find((r) => r.config.instanceId === target.instanceId);
      if (cloudViewScope(current) !== target.scope) throw Error('changed source');
      if (!current?.identity) await cloudClient.whoami(target.instanceId);
      current = cloudClient
        .getSnapshot()
        .rows.find((r) => r.config.instanceId === target.instanceId);
      if (!target.guest && current?.organization?.organizationId !== target.organizationId)
        await cloudClient.useOrganization(target.instanceId, target.organizationId);
      if (
        cloudViewScope(
          cloudClient.getSnapshot().rows.find((r) => r.config.instanceId === target.instanceId),
        ) !== target.scope
      )
        throw Error('changed source');
      router.push({
        pathname: '/cloud-channels',
        params: {
          instanceId: target.instanceId,
          organizationId: target.organizationId,
          channelId: target.channel.channelId,
          guest: String(target.guest),
          accountScope: target.scope,
        },
      });
    } catch (e) {
      setError(cloudError(e));
    } finally {
      setOpening(false);
    }
  };
  return (
    <>
      <Stack.Screen options={{ title: t.allConversations, headerShown: false }} />
      <HostDrawerEdge>
        <HomeHeader
          search={
            searching ? (
              <HeaderSearch
                value={query}
                placeholder={t.searchPlaceholder}
                onChangeText={setQuery}
                onFocusChange={(next) => {
                  setSearchFocused(next);
                  if (!next && query === '') setSearching(false);
                }}
                onClose={() => {
                  setSearchFocused(false);
                  setSearching(false);
                }}
              />
            ) : undefined
          }
          actions={
            <>
              <HeaderSearchButton
                label={t.openSearch}
                testID="search-button"
                onPress={() => setSearching(true)}
              />
              <SettingsButton onPress={() => router.push('/settings')} />
            </>
          }
        >
          <EnvironmentPager
            routes={filters}
            selected={effectiveFilter}
            onSelect={(key) => {
              chrome.hidden.value = false;
              setFilter(key);
            }}
            renderPage={(environment, active) => (
              <Animated.FlatList<Row>
                renderScrollComponent={renderKeyboardFormScroll}
                onScroll={active ? onScroll : undefined}
                scrollEventThrottle={1}
                contentContainerStyle={{ paddingBottom: bottom + space.x6 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                data={rows.filter(
                  (row) => environment.key === 'all' || row.environment === environment.key,
                )}
                keyExtractor={(r) => r.key}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing || directory.busy}
                    onRefresh={() => void refresh()}
                  />
                }
                ListHeaderComponent={
                  <>
                    {saved &&
                      (environment.key === 'all' ||
                        environment.key === computerEnvironmentKey(saved.hostId)) && (
                        <ConnectionBanner
                          connection={snapshot.connection}
                          onRetry={() => client?.retryNow()}
                          onPairAgain={() => router.push('/pair')}
                        />
                      )}
                    {(directory.errors.length > 0 || cloud.error || error) && (
                      <Text tone="muted" style={{ paddingHorizontal: space.x5 }}>
                        {t.cloudListUnavailable}
                        {error ? ` (${error})` : ''}
                      </Text>
                    )}
                  </>
                }
                ListEmptyComponent={
                  directory.busy ||
                  (saved &&
                    (environment.key === 'all' ||
                      environment.key === computerEnvironmentKey(saved.hostId)) &&
                    !snapshot.roster &&
                    snapshot.connection.status === 'connecting') ? (
                    <ActivityIndicator />
                  ) : (
                    <Text tone="muted" style={{ padding: space.x6 }}>
                      {query ? t.searchNoMatch(query.trim()) : t.cloudChannels.empty}
                    </Text>
                  )
                }
                renderItem={({ item }) =>
                  item.type === 'computer' ? (
                    conversationPeek ? (
                      <ConversationPeek href={conversationHref(item.conversation, saved?.hostId)}>
                        <ConversationRow row={item.conversation} now={new Date()} />
                      </ConversationPeek>
                    ) : (
                      <ConversationRow
                        row={item.conversation}
                        now={new Date()}
                        onPress={() => openConversation(router, item.conversation, saved?.hostId)}
                      />
                    )
                  ) : (
                    <CloudConversationRow
                      row={item.conversation}
                      disabled={opening || cloud.busy || directory.busy}
                      onPress={() => void openCloud(item.conversation)}
                    />
                  )
                }
              />
            )}
          />
        </HomeHeader>
      </HostDrawerEdge>
    </>
  );
});
