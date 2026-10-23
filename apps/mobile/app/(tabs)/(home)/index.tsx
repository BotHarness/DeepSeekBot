import { renderKeyboardFormScroll } from '../../../src/ui/primitives/keyboard-form';
import { Redirect, Stack, useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
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
import {
  conversationActions,
  conversationChannelId,
  runConversationAction,
} from '../../../src/ui/chat/conversation-actions';
import { showAppDialog } from '../../../src/ui/primitives/app-dialog';
import {
  chatList,
  conversations,
  searchKey,
  type ChatListItem,
  type Conversation,
} from '../../../src/ui/chat/conversations';
import { sectionCollapse, useCollapsedSections } from '../../../src/host/native-section-collapse';
import { SectionHeader } from '../../../src/ui/chat/section-header';
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
import { conversationPeek } from '../../../src/ui/shell/conversation-peek';
import { useFloatingTabInset } from '../../../src/ui/shell/floating-tab-inset';
import { conversationHref, openConversation } from '../../../src/ui/shell/open-conversation';
import { useChromeScroll } from '../../../src/ui/shell/scroll-chrome';
import { useStrings } from '../../../src/ui/strings';
import { LoadingIndicator } from '../../../src/ui/primitives/loading-indicator';
import { PullToRefresh } from '../../../src/ui/primitives/pull-to-refresh';

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
type ListRow =
  | Row
  | {
      type: 'section';
      key: string;
      environment: string;
      section: Extract<ChatListItem, { kind: 'section' }>;
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
        saved
          ? {
              hostId: saved.hostId,
              name: shownHostName(look, saved.hostName),
              icon: look.icon,
              ...(look.color === undefined ? {} : { color: look.color }),
            }
          : undefined,
        cloud.rows.filter((r) => r.hasSession).map(cloudViewScope),
        directory.workspaces,
        t.allEnvironments,
      ),
    [t, saved, look, cloud.rows, directory.workspaces],
  );
  const environment = filters.find((item) => item.key === filter) ?? filters[0]!;
  const effectiveFilter = environment.key;
  const quiet = useQuietChannels(saved?.hostId);
  const collapsed = useCollapsedSections(saved?.hostId);
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
  const displayed = useMemo((): ListRow[] => {
    const visible = (row: { environment: string }) =>
      effectiveFilter === 'all' || row.environment === effectiveFilter;
    if (searchKey(query)) return rows.filter(visible);
    const hostEnvironment = saved ? computerEnvironmentKey(saved.hostId) : '';
    const hostRows = new Map(
      rows.filter((row) => row.type === 'computer').map((row) => [row.conversation.key, row]),
    );
    const grouped: ListRow[] = saved
      ? chatList(
          snapshot.roster,
          list.status === 'ready' ? list.sections.action : [],
          collapsed,
          list.status === 'ready' ? list.unread : {},
          quiet,
        ).flatMap((item): ListRow[] => {
          const key = JSON.stringify(['computer', saved.hostId, item.key]);
          if (item.kind === 'section')
            return [{ type: 'section', key, environment: hostEnvironment, section: item }];
          const row = hostRows.get(item.row.key);
          return row ? [row] : [];
        })
      : [];
    return [...grouped, ...rows.filter((row) => row.type === 'cloud')].filter(visible);
  }, [rows, effectiveFilter, query, saved, snapshot.roster, list, collapsed, quiet]);
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
    const result = await Promise.allSettled([
      client?.refresh(),
      inbox?.refresh(),
      cloudConversations.refresh(),
    ]);
    setRefreshFailedHost(result[0]?.status === 'rejected' ? saved?.hostId : undefined);
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
  const renderHostConversation = (conversation: Conversation, pinned: boolean) => {
    return (
      <ConversationRow
        key={`${saved?.hostId}:${conversation.key}`}
        previewHref={conversationPeek ? conversationHref(conversation, saved?.hostId) : undefined}
        row={conversation}
        now={new Date()}
        look={look}
        onPress={() => openConversation(router, conversation, saved?.hostId)}
        actions={conversationActions(conversation, {
          pinned: pinned,
          hostMuted:
            snapshot.roster?.arrangement?.muted?.includes(
              conversationChannelId(conversation) ?? '',
            ) === true,
        })}
        onAction={(key) => {
          if (client === undefined) return;
          if (key === 'section') {
            const channelId = conversationChannelId(conversation);
            if (channelId && saved)
              router.push({
                pathname: '/conversation-section',
                params: { hostId: saved.hostId, channelId },
              });
            return;
          }
          runConversationAction(client, inbox, conversation, key).catch(() =>
            showAppDialog(t.rowActions.failed, undefined, [{ text: t.done }]),
          );
        }}
      />
    );
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
                <Animated.FlatList<ListRow>
                  {...pull}
                  renderScrollComponent={renderKeyboardFormScroll}
                  onScroll={onScroll}
                  scrollEventThrottle={1}
                  contentContainerStyle={{ paddingBottom: bottom + headerTravel + space.x6 }}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  data={displayed}
                  keyExtractor={(r) => r.key}
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
                    (saved &&
                      (environment.key === 'all' ||
                        environment.key === computerEnvironmentKey(saved.hostId)) &&
                      !snapshot.roster &&
                      snapshot.connection.status === 'connecting') ? (
                      <View style={{ padding: space.x6, alignItems: 'center' }}>
                        <LoadingIndicator />
                      </View>
                    ) : (
                      <Text tone="muted" style={{ padding: space.x6 }}>
                        {query ? t.searchNoMatch(query.trim()) : t.cloudChannels.empty}
                      </Text>
                    )
                  }
                  renderItem={({ item }) =>
                    item.type === 'section' ? (
                      <SectionHeader
                        testID={`chat-section-${item.section.id}`}
                        name={item.section.name ?? t.pinnedSection}
                        count={item.section.count}
                        needsYou={item.section.needsYou}
                        unread={item.section.unread}
                        collapsed={item.section.collapsed}
                        onToggle={() => {
                          if (saved) sectionCollapse.toggle(saved.hostId, item.section.id);
                        }}
                      />
                    ) : item.type === 'computer' ? (
                      renderHostConversation(item.conversation, item.pinned)
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
