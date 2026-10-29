import { useChatsRetainedSearch } from '../../../src/ui/search/use-chats-retained-search';
import { RetainedSearchRow } from '../../../src/ui/search/retained-search-row';
import {
  retainedTargetMatches,
  retainedMessageMatches,
  retainedSearchResults,
} from '../../../src/ui/search/retained-search-results';
import type { SearchHit } from '../../../src/host/retained-search';
import { chatHref } from '../../../src/ui/shell/recent-chats';
import { HostRow } from '../../../src/ui/chat/host-conversation-row';
import { renderKeyboardFormScroll } from '../../../src/ui/primitives/keyboard-form';
import {
  Redirect,
  Stack,
  useFocusEffect,
  useIsFocused,
  useRouter,
  useNavigationContainerRef,
} from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { useSharedValue } from 'react-native-reanimated';
import {
  refreshQuietChannels,
  useHostSession,
  useQuietChannels,
  useHostSessions,
  quietChannels,
  type ConnectedHost,
} from '../../../src/host/host-session';
import { prefetchInbox } from '../../../src/host/inbox';
import { useMessageSearch, type MessageSearchHit } from '../../../src/host/message-search';
import { hostLooks, useHostLook } from '../../../src/host/native-host-look';
import { cloudClient, useCloudSnapshot } from '../../../src/cloud/native';
import { cloudAvailable } from '../../../src/cloud/available';
import { cloudConversations, useCloudConversations } from '../../../src/cloud/native-conversations';
import { cloudViewScope } from '../../../src/cloud/workspace-directory';
import { navigateCloudChannel } from '../../../src/ui/shell/cloud-channel-navigation';
import { cloudError } from '../../../src/cloud/client';
import type { CloudConversation } from '../../../src/cloud/conversations';
import { DeletionSheet } from '../../../src/ui/chat/deletion-sheet';
import type { DeletionTarget } from '../../../src/host/deletion';
import { ItemMenu } from '../../../src/ui/primitives/item-menu';
import {
  conversations,
  searchKey,
  PINNED_SECTION,
  type Conversation,
} from '../../../src/ui/chat/conversations';
import { CloudConversationRow } from '../../../src/ui/chat/cloud-conversation-row';
import { useConversationFilter } from '../../../src/host/native-conversation-filter';
import { ConnectionBanner } from '../../../src/ui/connection-banner';
import { searchAppBar, space } from '../../../src/ui/design/tokens';
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
import { HostDrawerEdge, hostDrawer, openHostDrawer } from '../../../src/ui/shell/host-drawer';
import { ChatsSearchBar } from '../../../src/ui/shell/chats-search-bar';
import { LastChatPreview, LastChatSwipe } from '../../../src/ui/shell/last-chat-swipe';
import { useWorkspacePanel } from '../../../src/ui/shell/use-workspace-panel';
import { recentHostIds, useRecentChats } from '../../../src/ui/shell/recent-chats';
import { tobComputer, tobModeHostId, tobModeHref } from '../../../src/ui/shell/tob-mode-model';
import { recordFeature } from '../../../src/telemetry/features';
import {
  chatsSearchResults,
  messageSearchResults,
} from '../../../src/ui/chat/chats-search-results';
import { avatarImageUri } from '../../../src/host/native-notification-avatars';
import { openConversation } from '../../../src/ui/shell/open-conversation';
import { useConnectionProgress } from '../../../src/ui/primitives/connection-progress';
import { useFloatingTabInset } from '../../../src/ui/shell/floating-tab-inset';
import { useChromeScroll } from '../../../src/ui/shell/scroll-chrome';
import { useStrings } from '../../../src/ui/strings';
import { ListSkeleton } from '../../../src/ui/primitives/list-skeleton';
import { PullToTob } from '../../../src/ui/shell/pull-to-tob';

import {
  environmentChatList,
  ALL_HOSTS_COLLAPSE,
  type EnvironmentChatRow as Row,
  type EnvironmentChatItem,
} from '../../../src/ui/chat/environment-chat-list';
import { SectionHeader } from '../../../src/ui/chat/section-header';
import { MessageSearchHeading, MessageSearchRow } from '../../../src/ui/chat/message-search-row';
import { conversationHref } from '../../../src/ui/shell/open-conversation';
import { navigateChannel } from '../../../src/ui/shell/channel-navigation';

type MessageItem = {
  type: 'message';
  key: string;
  hit: MessageSearchHit;
  host: ConnectedHost;
  conversation: Conversation;
};
type HomeItem =
  | EnvironmentChatItem
  | { type: 'message-heading'; key: string }
  | MessageItem
  | { type: 'retained'; key: string; hit: SearchHit };
import { sectionCollapse, useCollapsedSections } from '../../../src/host/native-section-collapse';

export default function HomeScreen() {
  const focused = useIsFocused();
  const { saved, client } = useHostSession();

  const hosts = useHostSessions(focused);
  return <HomeContent saved={saved} client={client} hosts={hosts} />;
}

const HomeContent = memo(function HomeContent({
  saved,
  client,
  hosts,
}: {
  saved: ReturnType<typeof useHostSession>['saved'];
  client: ReturnType<typeof useHostSession>['client'];
  hosts: readonly ConnectedHost[];
}) {
  const t = useStrings();
  const router = useRouter();
  const navigation = useNavigationContainerRef();
  const showWorkspaces = useWorkspacePanel();
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
  const lastChatTravel = useSharedValue(0);
  const messageSearch = useMessageSearch();
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
  const [opening, setOpening] = useState<string>();
  const openTarget = useRef<string | undefined>(undefined);
  const openSequence = useRef(0);
  const openTail = useRef(Promise.resolve());
  const cloudEntryFocused = useRef(false);
  const [error, setError] = useState<string>();
  const [failedOpen, setFailedOpen] = useState<CloudConversation>();
  const [deleting, setDeleting] = useState<{ host: ConnectedHost; target: DeletionTarget }>();
  const [actionError, setActionError] = useState(false);
  const deletionLook = useHostLook(deleting?.host.saved.hostId);
  const [refreshFailedHosts, setRefreshFailedHosts] = useState<string[]>([]);
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
  const retained = useChatsRetainedSearch(effectiveFilter, query);
  const selectedHost = hosts.find(
    (host) => computerEnvironmentKey(host.saved.hostId) === effectiveFilter,
  );
  useFocusEffect(
    useCallback(() => {
      cloudEntryFocused.current = true;
      return () => {
        cloudEntryFocused.current = false;
        openSequence.current++;
        openTarget.current = undefined;
        setOpening(undefined);
        setFailedOpen(undefined);
        setError(undefined);
      };
    }, [enrollment, effectiveFilter]),
  );
  const recent = useRecentChats();
  const tobComputers = hosts.map(tobComputer);
  const tobHostId = tobModeHostId(
    effectiveFilter,
    tobComputers,
    recentHostIds(recent),
    saved?.hostId,
  );
  const tobHref = tobModeHref(tobHostId, tobComputers);
  const pullFocused = useIsFocused();
  const tobAction =
    tobHostId === undefined ? null : (
      <HeaderAction
        icon="tob"
        label={t.openTobMode}
        testID="tob-mode-button"
        onPress={() => {
          if (tobHref === undefined) return;
          recordFeature('tob:mode_open', {});
          router.push(tobHref);
        }}
      />
    );
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
      if (host.snapshot.connection.status !== 'connected' && host !== selectedHost) return [];
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
    const scopes = new Set(cloud.rows.filter((row) => row.hasSession).map(cloudViewScope));
    const cloudRows: Row[] = directory.rows
      .filter((row) => scopes.has(row.scope))
      .map((conversation) => ({
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
  }, [hosts, directory.rows, cloud.rows, selectedHost, query, quiet]);
  const displayed = environmentChatList(
    rows,
    effectiveFilter,
    hosts,
    collapsed,
    query.trim() !== '',
  );
  const searchHosts = (selectedHost ? [selectedHost] : effectiveFilter === 'all' ? hosts : [])
    .filter((host) => host.snapshot.connection.status === 'connected')
    .map((host) => ({ hostId: host.saved.hostId, client: host.client }));
  const searchScope = searchHosts.map((host) => host.hostId).join('|');
  const scheduleMessageSearch = messageSearch.schedule;
  useFocusEffect(
    useCallback(() => {
      scheduleMessageSearch(query, searchHosts);
    }, [scheduleMessageSearch, query, searchScope]),
  );
  const onQuery = (value: string) => setQuery(value);
  const conversationIndex = useMemo(() => {
    const index = new Map<string, { host: ConnectedHost; conversation: Conversation }>();
    for (const host of hosts)
      for (const conversation of conversations(host.snapshot.roster, [])) {
        const channelId =
          conversation.kind === 'bot' ? conversation.bot.dmChannelId : conversation.channel.id;
        if (channelId !== undefined)
          index.set(JSON.stringify([host.saved.hostId, channelId]), { host, conversation });
      }
    return index;
  }, [hosts]);
  const messages = messageSearch.state;
  const messageItems = useMemo<MessageItem[]>(
    () =>
      query.trim() === '' || messages.query !== query.trim()
        ? []
        : messages.hits.flatMap((hit) => {
            const found = conversationIndex.get(JSON.stringify([hit.hostId, hit.channelId]));
            return found === undefined
              ? []
              : [
                  {
                    type: 'message' as const,
                    key: JSON.stringify(['message', hit.hostId, hit.channelId, hit.messageId]),
                    hit,
                    ...found,
                  },
                ];
          }),
    [query, messages, conversationIndex],
  );
  const retainedConversations = retained.conversations.filter(
    (hit) =>
      !displayed.some(
        (item) =>
          item.type === 'computer' &&
          retainedTargetMatches(hit, item.host.saved.hostId, item.conversation),
      ),
  );
  const retainedMessages = retained.messages.filter(
    (hit) => !messageItems.some((item) => retainedMessageMatches(hit, item.hit, item.conversation)),
  );
  const retainedItems = (hits: SearchHit[]): HomeItem[] =>
    hits.map((hit) => ({ type: 'retained', key: hit.key, hit }));
  const messagesShown =
    messageItems.length > 0 ||
    retainedMessages.length > 0 ||
    (messages.loading && displayed.length > 0);
  const listItems: HomeItem[] =
    Platform.OS !== 'android' && query.trim() !== ''
      ? [
          ...displayed,
          ...retainedItems(retainedConversations),
          ...(messagesShown
            ? [
                { type: 'message-heading' as const, key: 'message-heading' },
                ...messageItems,
                ...retainedItems(retainedMessages),
              ]
            : []),
        ]
      : displayed;
  const openMessage = ({ hit, host, conversation }: MessageItem) => {
    recordFeature('search:result_open', { kind: 'message' });
    if (
      !navigateChannel(
        navigation,
        conversationHref(conversation, host.saved.hostId, hit.messageId, String(Date.now())),
      )
    )
      setActionError(true);
  };
  const searchNotice =
    query.trim() === ''
      ? ''
      : [
          t.localSearch.coverage,
          ...(environment.kind !== 'computer' ? [t.localSearch.cloudUnavailable] : []),
          ...(retained.snapshot.unavailable.length
            ? [t.localSearch.unavailable(retained.snapshot.unavailable.join(', '))]
            : []),
          ...(retained.error ? [retained.error] : []),
        ].join('\n');
  const searchResults = useMemo(
    () =>
      Platform.OS === 'android'
        ? [
            ...chatsSearchResults(displayed, query, searchAppBar.recent, avatarImageUri),
            ...retainedSearchResults(
              retainedConversations,
              t.localSearch.conversations,
              new Date(),
              t.reactionYou,
            ),
            ...messageSearchResults(messageItems, t.searchMessages, new Date(), avatarImageUri),
            ...retainedSearchResults(
              retainedMessages,
              messageItems.length ? undefined : t.searchMessages,
              new Date(),
              t.reactionYou,
            ),
          ]
        : [],
    [displayed, query, messageItems, retainedConversations, retainedMessages, t],
  );
  const connecting = useConnectionProgress(selectedHost?.snapshot.connection.status) !== undefined;
  const pickSearch = (key: string) => {
    const cached = [...retainedConversations, ...retainedMessages].find((hit) => hit.key === key);
    if (cached) {
      void retained.open(cached);
      return;
    }
    const message = messageItems.find((entry) => entry.key === key);
    if (message !== undefined) {
      openMessage(message);
      return;
    }
    const item = displayed.find((entry) => entry.type !== 'section' && entry.key === key);
    if (item === undefined || item.type === 'section') return;
    if (item.type === 'cloud') void openCloud(item.conversation);
    else if (!openConversation(navigation, item.conversation, item.host.saved.hostId))
      setActionError(true);
  };
  const includesCloud = environment.kind !== 'computer';
  const hostFailed =
    selectedHost !== undefined &&
    ['unreachable', 'refused', 'stopped'].includes(selectedHost.snapshot.connection.status);
  const cloudFailed = includesCloud && Boolean(directory.errors.length || cloud.error);
  const loadingHosts = selectedHost ? [selectedHost] : effectiveFilter === 'all' ? hosts : [];
  const coldLoading =
    loadingHosts.some(
      (host) =>
        !host.snapshot.roster &&
        ['connecting', 'reconnecting'].includes(host.snapshot.connection.status),
    ) ||
    (includesCloud && cloud.rows.some((row) => row.hasSession) && !directory.ready && !cloudFailed);
  const screen = <Stack.Screen options={{ title: environment.title, headerShown: false }} />;
  if (saved === undefined || (!cloud.ready && !cloud.error && displayed.length === 0))
    return (
      <>
        {screen}
        <ListSkeleton />
      </>
    );
  if (saved === null && cloud.rows.length === 0)
    return cloudAvailable ? (
      <Redirect href="/cloud-join" />
    ) : (
      <>
        {screen}
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
      </>
    );
  const refresh = async (target?: ConnectedHost) => {
    setRefreshing(true);
    const targets = target ? [target] : hosts;
    const results = await Promise.allSettled([
      ...targets.map((host) => Promise.all([host.client.refresh(), host.inbox.refresh()])),
      ...(target ? [] : [cloudConversations.refresh()]),
    ]);
    setRefreshFailedHosts((previous) => [
      ...previous.filter((id) => !targets.some((host) => host.saved.hostId === id)),
      ...targets.flatMap((host, index) =>
        results[index]?.status === 'rejected' ? [host.saved.hostId] : [],
      ),
    ]);
    setRefreshing(false);
  };
  const openCloud = (target: CloudConversation) => {
    if (openTarget.current === target.key) return;
    const sequence = ++openSequence.current;
    openTarget.current = target.key;
    setOpening(target.key);
    setError(undefined);
    setFailedOpen(undefined);
    const currentRow = () =>
      cloudClient.getSnapshot().rows.find((row) => row.config.instanceId === target.instanceId);
    const origin = navigation.getRootState();
    const workspaceCurrent = hostDrawer.captureWorkspaceSelection();
    const isCurrent = () =>
      workspaceCurrent() &&
      cloudEntryFocused.current &&
      sequence === openSequence.current &&
      navigation.getRootState() === origin;
    const requireScope = () => {
      const current = currentRow();
      if (!current?.hasSession || cloudViewScope(current) !== target.scope)
        throw Error('changed source');
      return current;
    };
    const open = async () => {
      try {
        if (!isCurrent()) return;
        let current = requireScope();
        if (!current.identity) {
          await cloudClient.whoami(target.instanceId);
          if (!isCurrent()) return;
          current = requireScope();
        }
        if (!target.guest && current.organization?.organizationId !== target.organizationId) {
          await cloudClient.useOrganization(target.instanceId, target.organizationId);
          if (!isCurrent()) return;
          requireScope();
        }
        if (!isCurrent()) return;
        navigateCloudChannel(navigation, {
          instanceId: target.instanceId,
          organizationId: target.organizationId,
          channelId: target.channel.channelId,
          guest: target.guest,
          accountScope: target.scope,
        });
      } catch (error) {
        if (isCurrent()) {
          setError(cloudError(error));
          setFailedOpen(target);
        }
      } finally {
        if (cloudEntryFocused.current && sequence === openSequence.current) {
          openTarget.current = undefined;
          setOpening(undefined);
        }
      }
    };
    openTail.current = openTail.current.then(open, open);
  };
  return (
    <>
      {screen}
      <HostDrawerEdge anywhere enabled={showWorkspaces === undefined}>
        <HomeHeader
          environment={environment}
          connection={selectedHost?.snapshot.connection}
          onWorkspaces={showWorkspaces}
          bar={
            Platform.OS === 'android' ? (
              <ChatsSearchBar
                placeholder={t.searchIn(environment.title)}
                busy={connecting || messages.loading || retained.snapshot.status === 'loading'}
                results={searchResults}
                notice={searchNotice}
                retryLabel={retained.snapshot.unavailable.length ? t.retry : ''}
                onRetry={retained.retry}
                onQuery={onQuery}
                onExpanded={setSearchFocused}
                onPick={pickSearch}
                onNavigation={openHostDrawer}
              />
            ) : undefined
          }
          barActions={searchFocused ? null : tobAction}
          search={
            searching ? (
              <HeaderSearch
                value={query}
                placeholder={t.searchPlaceholder}
                onChangeText={onQuery}
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
              {tobAction}
            </>
          }
        >
          {(headerTravel) => (
            <LastChatSwipe
              enabled={!searching && !searchFocused && query === ''}
              candidates={displayed.flatMap((row) =>
                row.type !== 'computer'
                  ? []
                  : [
                      {
                        id: row.key,
                        title:
                          row.conversation.kind === 'bot'
                            ? row.conversation.bot.displayName
                            : row.conversation.channel.name,
                        href: chatHref(
                          row.conversation.kind === 'bot'
                            ? `/dm/${encodeURIComponent(row.conversation.bot.slug)}`
                            : `/channel/${encodeURIComponent(row.conversation.channel.id)}`,
                          row.host.saved.hostId,
                        ),
                      },
                    ],
              )}
              travel={lastChatTravel}
            >
              <PullToTob
                enabled={pullFocused && !searching && !searchFocused && query === ''}
                scope={`${effectiveFilter}:${tobHostId ?? ''}:${tobHref?.params.slug ?? ''}`}
                hostId={tobHostId}
                href={tobHref}
                refreshing={refreshing}
                onRefresh={() => void refresh()}
                onOpen={(href) => router.push(href)}
                onScroll={onScroll}
              >
                {(pull) => (
                  <Animated.FlatList<HomeItem>
                    {...pull}
                    renderScrollComponent={renderKeyboardFormScroll}
                    scrollEventThrottle={1}
                    contentContainerStyle={{ paddingBottom: bottom + headerTravel + space.x6 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    data={listItems}
                    keyExtractor={(r) => r.key}
                    ListHeaderComponent={
                      <>
                        {retained.error ? (
                          <Text accessibilityRole="alert" tone="warning">
                            {retained.error}
                          </Text>
                        ) : null}
                        {query.trim() !== '' && (
                          <Text variant="meta" tone="muted" style={{ paddingHorizontal: space.x5 }}>
                            {searchNotice}
                          </Text>
                        )}
                        {query.trim() !== '' && retained.snapshot.unavailable.length > 0 && (
                          <Button
                            label={t.retry}
                            variant="text"
                            fit
                            testID="retained-search-retry"
                            onPress={retained.retry}
                          />
                        )}
                        {actionError ? (
                          <Text accessibilityRole="alert" tone="danger">
                            {t.rowActions.failed}
                          </Text>
                        ) : null}
                        {selectedHost &&
                          selectedHost.snapshot.connection.status !== 'unreachable' && (
                            <ConnectionBanner
                              connection={selectedHost.snapshot.connection}
                              onRetry={() => selectedHost.client.retryNow()}
                              onPairAgain={() => router.push('/pair')}
                            />
                          )}
                        {selectedHost &&
                        ((refreshFailedHosts.includes(selectedHost.saved.hostId) && !hostFailed) ||
                          selectedHost.snapshot.connection.status === 'unreachable' ||
                          selectedHost.snapshot.connection.status === 'stopped') ? (
                          <View style={{ paddingHorizontal: space.x5, gap: space.x2 }}>
                            <Text tone="muted">
                              {selectedHost.snapshot.roster === undefined
                                ? t.hostListLoadFailed
                                : t.hostListUnavailable}
                            </Text>
                            <Button
                              testID="chat-list-retry"
                              label={t.retry}
                              on="canvas"
                              onPress={() => void refresh(selectedHost)}
                              disabled={refreshing}
                            />
                          </View>
                        ) : null}
                        {(cloudFailed || error) && (
                          <View style={{ paddingHorizontal: space.x5, gap: space.x2 }}>
                            <Text tone="muted" accessibilityRole="alert">
                              {t.cloudListUnavailable}
                              {error ? ` (${error})` : ''}
                            </Text>
                            <Button
                              testID="cloud-list-retry"
                              label={t.retry}
                              on="canvas"
                              onPress={() => (failedOpen ? openCloud(failedOpen) : void refresh())}
                              disabled={refreshing}
                            />
                          </View>
                        )}
                      </>
                    }
                    ListEmptyComponent={
                      coldLoading ? (
                        <ListSkeleton />
                      ) : hostFailed || cloudFailed ? undefined : (
                        <Text tone="muted" style={{ padding: space.x6 }}>
                          {query
                            ? t.searchNoMatch(query.trim())
                            : effectiveFilter === 'all' &&
                                hosts.length > 0 &&
                                hosts.every(
                                  (host) => host.snapshot.connection.status !== 'connected',
                                )
                              ? t.noOnlineChats
                              : t.cloudChannels.empty}
                        </Text>
                      )
                    }
                    renderItem={({ item }) =>
                      item.type === 'retained' ? (
                        <RetainedSearchRow
                          hit={item.hit}
                          onPress={() => void retained.open(item.hit)}
                        />
                      ) : item.type === 'message-heading' ? (
                        <MessageSearchHeading loading={messages.loading} />
                      ) : item.type === 'message' ? (
                        <MessageSearchRow
                          hit={item.hit}
                          conversation={item.conversation}
                          now={new Date()}
                          onPress={() => openMessage(item)}
                        />
                      ) : item.type === 'section' ? (
                        <ItemMenu
                          title={item.name ?? t.pinnedSection}
                          actions={
                            item.id === PINNED_SECTION || !item.host
                              ? []
                              : [
                                  {
                                    key: 'delete-section',
                                    glyph: 'delete',
                                    label: t.deletion.deleteSection,
                                    destructive: true,
                                    run: () =>
                                      setDeleting({
                                        host: item.host!,
                                        target: {
                                          kind: 'section',
                                          id: item.id,
                                          name: item.name ?? '',
                                        },
                                      }),
                                  },
                                ]
                          }
                        >
                          {(open, nativeContextMenu) => (
                            <SectionHeader
                              count={item.count}
                              needsYou={item.needsYou}
                              unread={item.unread}
                              collapsed={item.collapsed}
                              testID={`chat-section-${item.id}`}
                              name={item.name ?? t.pinnedSection}
                              onLongPress={
                                nativeContextMenu || item.id === PINNED_SECTION ? undefined : open
                              }
                              onMenu={item.id === PINNED_SECTION ? undefined : open}
                              onToggle={() => {
                                sectionCollapse.toggle(collapseScope, item.id);
                              }}
                            />
                          )}
                        </ItemMenu>
                      ) : item.type === 'computer' ? (
                        <HostRow
                          item={item}
                          showSourceLabel={effectiveFilter === 'all'}
                          onError={() => setActionError(true)}
                          onDelete={(target) => setDeleting({ host: item.host, target })}
                        />
                      ) : (
                        <CloudConversationRow
                          row={item.conversation}
                          pending={opening === item.conversation.key}
                          onPress={() => void openCloud(item.conversation)}
                        />
                      )
                    }
                  />
                )}
              </PullToTob>
            </LastChatSwipe>
          )}
        </HomeHeader>
      </HostDrawerEdge>
      <LastChatPreview travel={lastChatTravel} />
      {deleting && hosts.some((host) => host.client === deleting.host.client) ? (
        <DeletionSheet
          key={`${deleting.host.saved.hostId}:${deleting.target.kind}:${deleting.target.id}`}
          target={deleting.target}
          client={deleting.host.client}
          hostName={shownHostName(deletionLook, deleting.host.saved.hostName)}
          onClose={() => setDeleting(undefined)}
          onDeleted={() => {
            setDeleting(undefined);
            void deleting.host.inbox.refresh();
          }}
        />
      ) : null}
    </>
  );
});
