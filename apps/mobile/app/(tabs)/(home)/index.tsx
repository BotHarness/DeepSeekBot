import { HostRow } from '../../../src/ui/chat/host-conversation-row';
import { renderKeyboardFormScroll } from '../../../src/ui/primitives/keyboard-form';
import { Redirect, Stack, useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  refreshQuietChannels,
  useHostSession,
  useHostSnapshot,
  useQuietChannels,
  useHostSessions,
  quietChannels,
  type ConnectedHost,
} from '../../../src/host/host-session';
import { prefetchInbox } from '../../../src/host/inbox';
import { hostLooks, useHostLook } from '../../../src/host/native-host-look';
import { cloudClient, useCloudSnapshot } from '../../../src/cloud/native';
import { cloudAvailable } from '../../../src/cloud/available';
import { cloudConversations, useCloudConversations } from '../../../src/cloud/native-conversations';
import { cloudViewScope } from '../../../src/cloud/workspace-directory';
import { cloudError } from '../../../src/cloud/client';
import type { CloudConversation } from '../../../src/cloud/conversations';
import { conversations, searchKey } from '../../../src/ui/chat/conversations';

import { CloudConversationRow } from '../../../src/ui/chat/cloud-conversation-row';
import { useConversationFilter } from '../../../src/host/native-conversation-filter';
import { ConnectionBanner } from '../../../src/ui/connection-banner';
import { space } from '../../../src/ui/design/tokens';
import {
  conversationEnvironments,
  computerEnvironmentKey,
  cloudEnvironmentKey,
} from '../../../src/host/conversation-environments';
import { shownHostName } from '../../../src/ui/design/host-look';
import { Text } from '../../../src/ui/primitives/text';
import { Button } from '../../../src/ui/primitives/button';
import { HeaderAction } from '../../../src/ui/shell/header-action';
import { HeaderSearch } from '../../../src/ui/shell/header-search';
import { HomeHeader } from '../../../src/ui/shell/home-header';
import { HostDrawerEdge } from '../../../src/ui/shell/host-drawer';
import { useFloatingTabInset } from '../../../src/ui/shell/floating-tab-inset';
import { useChromeScroll } from '../../../src/ui/shell/scroll-chrome';
import { useStrings } from '../../../src/ui/strings';
import { LoadingIndicator } from '../../../src/ui/primitives/loading-indicator';
import { PullToRefresh } from '../../../src/ui/primitives/pull-to-refresh';

import {
  environmentChatList,
  ALL_HOSTS_COLLAPSE,
  type EnvironmentChatRow as Row,
  type EnvironmentChatItem,
} from '../../../src/ui/chat/environment-chat-list';
import { SectionHeader } from '../../../src/ui/chat/section-header';
import { sectionCollapse, useCollapsedSections } from '../../../src/host/native-section-collapse';

export default function HomeScreen() {
  const focused = useIsFocused();
  const { saved, client } = useHostSession();
  const snapshot = useHostSnapshot(client, focused);

  const hosts = useHostSessions(focused);
  return <HomeContent saved={saved} client={client} snapshot={snapshot} hosts={hosts} />;
}

const HomeContent = memo(function HomeContent({
  saved,
  client,
  snapshot,
  hosts,
}: {
  saved: ReturnType<typeof useHostSession>['saved'];
  client: ReturnType<typeof useHostSession>['client'];
  snapshot: ReturnType<typeof useHostSnapshot>;
  hosts: readonly ConnectedHost[];
}) {
  const t = useStrings();
  const router = useRouter();
  const prepared = useRef<typeof client>(undefined);
  const pairingOffered = useRef(false);
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
  const onScroll = useChromeScroll(
    true,
    searchFocused || query !== '' || (Platform.OS === 'android' && searching),
  );
  const bottom = useFloatingTabInset();
  const look = useHostLook(saved?.hostId);
  const cloud = useCloudSnapshot();
  const directory = useCloudConversations();
  const [filter, setFilter] = useConversationFilter();
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string>();
  const [refreshFailedHost, setRefreshFailedHost] = useState<string>();
  const enrollment = JSON.stringify(cloud.rows.map(cloudViewScope));
  const unpaired =
    !cloudAvailable &&
    saved === null &&
    (cloud.ready || Boolean(cloud.error)) &&
    cloud.rows.length === 0;
  useFocusEffect(
    useCallback(() => {
      if (!unpaired || pairingOffered.current) return;
      pairingOffered.current = true;
      router.push('/pair');
    }, [unpaired]),
  );
  useFocusEffect(
    useCallback(() => {
      if (cloud.ready) void cloudConversations.refresh();
    }, [cloud.ready, enrollment]),
  );
  const filters = useMemo(
    () =>
      conversationEnvironments(
        hosts.map(({ saved }) => {
          const look = hostLooks.look(saved.hostId);
          return {
            hostId: saved.hostId,
            name: shownHostName(look, saved.hostName),
            icon: look.icon,
            ...(look.color === undefined ? {} : { color: look.color }),
          };
        }),
        cloud.rows.filter((r) => r.hasSession).map(cloudViewScope),
        directory.workspaces,
        t.allEnvironments,
      ),
    [t, hosts, look, cloud.rows, directory.workspaces],
  );
  const environment = filters.find((f) => f.key === filter) ?? filters[0]!;
  const effectiveFilter = environment.key;
  const collapseScope =
    hosts.find((host) => computerEnvironmentKey(host.saved.hostId) === effectiveFilter)?.saved
      .hostId ?? ALL_HOSTS_COLLAPSE;
  const collapsed = useCollapsedSections(collapseScope);

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
    const hostRows: Row[] = hosts.flatMap((host) => {
      if (host.snapshot.connection.status !== 'connected') return [];
      const pins = new Set(host.snapshot.roster?.arrangement?.pins);
      const list = host.attention;
      return conversations(
        host.snapshot.roster,
        list.status === 'ready' ? list.sections.action : [],
        list.status === 'ready' ? list.unread : {},
        quietChannels.get(host.saved.hostId),
      ).map((conversation) => ({
        key: JSON.stringify(['computer', host.saved.hostId, conversation.key]),
        environment: computerEnvironmentKey(host.saved.hostId),
        type: 'computer' as const,
        host,
        conversation,
        pinned:
          pins.has(conversation.kind === 'bot' ? conversation.bot.slug : conversation.channel.id) ||
          pins.has(
            conversation.kind === 'bot'
              ? (conversation.bot.dmChannelId ?? '')
              : conversation.channel.id,
          ),
        ...(conversation.at ? { at: conversation.at } : {}),
      }));
    });
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
  }, [hosts, directory.rows, saved, query, quiet]);

  if (saved === undefined || (!cloud.ready && !cloud.error))
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <LoadingIndicator />
      </View>
    );
  if (saved === null && cloud.rows.length === 0)
    return cloudAvailable ? (
      <Redirect href="/cloud-join" />
    ) : (
      <View
        testID="home-unpaired"
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: space.x6,
          gap: space.x4,
        }}
      >
        <Text variant="title" strong style={{ textAlign: 'center' }}>
          {t.pairChoice.emptyTitle}
        </Text>
        <Text tone="muted" style={{ textAlign: 'center' }}>
          {t.pairChoice.emptyBody}
        </Text>
        <Button
          label={t.pairChoice.emptyAction}
          tone="primary"
          on="canvas"
          onPress={() => router.push('/pair')}
        />
      </View>
    );
  const refresh = async () => {
    setRefreshing(true);
    const results = await Promise.allSettled([
      ...hosts.flatMap((host) => [host.client.refresh(), host.inbox.refresh()]),
      cloudConversations.refresh(),
    ]);
    setRefreshFailedHost(results.some((r) => r.status === 'rejected') ? saved?.hostId : undefined);

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
      <Stack.Screen options={{ title: environment.title, headerShown: false }} />
      <HostDrawerEdge>
        <HomeHeader
          environment={environment}
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
              <HeaderAction
                icon="search"
                label={t.openSearch}
                testID="search-button"
                onPress={() => setSearching(true)}
              />
              {Platform.OS !== 'ios' && Platform.OS !== 'android' && (
                <HeaderAction
                  icon="settings"
                  label={t.settings}
                  testID="settings-button"
                  onPress={() => router.push('/settings')}
                />
              )}
            </>
          }
        >
          {(headerTravel) => (
            <PullToRefresh
              refreshing={refreshing || directory.busy}
              onRefresh={() => void refresh()}
            >
              {(pull) => (
                <Animated.FlatList<EnvironmentChatItem>
                  {...pull}
                  renderScrollComponent={renderKeyboardFormScroll}
                  onScroll={onScroll}
                  scrollEventThrottle={1}
                  contentContainerStyle={{ paddingBottom: bottom + headerTravel + space.x6 }}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  data={environmentChatList(
                    rows,
                    effectiveFilter,
                    hosts,
                    collapsed,
                    query.trim() !== '',
                  )}
                  keyExtractor={(r) => r.key}
                  ListHeaderComponent={
                    <>
                      {saved && environment.key === computerEnvironmentKey(saved.hostId) && (
                        <ConnectionBanner
                          connection={snapshot.connection}
                          onRetry={() => client?.retryNow()}
                          onPairAgain={() => router.push('/pair')}
                        />
                      )}
                      {saved &&
                      refreshFailedHost === saved.hostId &&
                      (environment.key === 'all' ||
                        environment.key === computerEnvironmentKey(saved.hostId)) ? (
                        <View style={{ paddingHorizontal: space.x5, gap: space.x2 }}>
                          <Text tone="muted">{t.hostListUnavailable}</Text>
                          <Button
                            testID="chat-list-retry"
                            label={t.retry}
                            on="canvas"
                            onPress={() => void refresh()}
                            disabled={refreshing}
                          />
                        </View>
                      ) : null}
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
                    hosts.some(
                      (host) =>
                        (effectiveFilter === 'all' ||
                          effectiveFilter === computerEnvironmentKey(host.saved.hostId)) &&
                        !host.snapshot.roster &&
                        host.snapshot.connection.status === 'connecting',
                    ) ? (
                      <View style={{ padding: space.x6, alignItems: 'center' }}>
                        <LoadingIndicator />
                      </View>
                    ) : (
                      <Text tone="muted" style={{ padding: space.x6 }}>
                        {query
                          ? t.searchNoMatch(query.trim())
                          : effectiveFilter === 'all' &&
                              hosts.length > 0 &&
                              hosts.every((host) => host.snapshot.connection.status !== 'connected')
                            ? t.noOnlineChats
                            : t.cloudChannels.empty}
                      </Text>
                    )
                  }
                  renderItem={({ item }) =>
                    item.type === 'section' ? (
                      <SectionHeader
                        testID={`chat-section-${item.id}`}
                        name={item.name ?? t.pinnedSection}
                        count={item.count}
                        needsYou={item.needsYou}
                        unread={item.unread}
                        collapsed={item.collapsed}
                        onToggle={() => {
                          sectionCollapse.toggle(collapseScope, item.id);
                        }}
                      />
                    ) : item.type === 'computer' ? (
                      <HostRow item={item} />
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
            </PullToRefresh>
          )}
        </HomeHeader>
      </HostDrawerEdge>
    </>
  );
});
