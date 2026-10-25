import { renderKeyboardFormScroll } from '../../../src/ui/primitives/keyboard-form';
import { Redirect, Stack, useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
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
import { sectionCollapse, useCollapsedSections } from '../../../src/host/native-section-collapse';
import { cloudClient, useCloudSnapshot } from '../../../src/cloud/native';
import { cloudAvailable } from '../../../src/cloud/available';
import { cloudConversations, useCloudConversations } from '../../../src/cloud/native-conversations';
import { cloudViewScope } from '../../../src/cloud/workspace-directory';
import { cloudError } from '../../../src/cloud/client';
import type { CloudConversation } from '../../../src/cloud/conversations';
import { ManagedConversationRow } from '../../../src/ui/chat/managed-conversation-row';
import { DeletionSheet } from '../../../src/ui/chat/deletion-sheet';
import type { DeletionTarget } from '../../../src/host/deletion';
import { ItemMenu } from '../../../src/ui/primitives/item-menu';
import { SectionHeader } from '../../../src/ui/chat/section-header';
import {
  chatList,
  PINNED_SECTION,
  conversations,
  searchKey,
  type ChatListItem,
  type Conversation,
} from '../../../src/ui/chat/conversations';
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
import { Button } from '../../../src/ui/primitives/button';
import { HeaderAction } from '../../../src/ui/shell/header-action';
import { HeaderSearch } from '../../../src/ui/shell/header-search';
import { HomeHeader } from '../../../src/ui/shell/home-header';
import { HostDrawerEdge } from '../../../src/ui/shell/host-drawer';
import { useFloatingTabInset } from '../../../src/ui/shell/floating-tab-inset';
import { useChromeScroll, useScrollChrome } from '../../../src/ui/shell/scroll-chrome';
import { t } from '../../../src/ui/strings';
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
type DisplayRow =
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
    <HomeContent
      key={saved?.hostId ?? 'unpaired'}
      saved={saved}
      client={client}
      inbox={inbox}
      snapshot={snapshot}
      list={list}
    />
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
  const [actionError, setActionError] = useState(false);
  const [deleting, setDeleting] = useState<{ hostId: string; target: DeletionTarget }>();
  const collapsed = useCollapsedSections(saved?.hostId);

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
  const displayed = useMemo((): DisplayRow[] => {
    if (!saved || query || !snapshot.roster?.arrangement?.sections.length) return rows;
    const computerRows = new Map(
      rows.flatMap((row) =>
        row.type === 'computer' ? [[row.conversation.key, row] as const] : [],
      ),
    );
    const items = chatList(
      snapshot.roster,
      list.status === 'ready' ? list.sections.action : [],
      collapsed,
      list.status === 'ready' ? list.unread : {},
      quiet,
    );
    return [
      ...items.flatMap((item): DisplayRow[] => {
        if (item.kind === 'section')
          return [
            {
              type: 'section',
              key: item.key,
              environment: computerEnvironmentKey(saved.hostId),
              section: item,
            },
          ];
        const row = computerRows.get(item.row.key);
        return row ? [row] : [];
      }),
      ...rows.filter((row) => row.type === 'cloud'),
    ];
  }, [rows, saved, query, snapshot.roster, list, collapsed, quiet]);
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
              <HeaderAction
                icon="search"
                label={t.openSearch}
                testID="search-button"
                onPress={() => setSearching(true)}
              />
              <HeaderAction
                icon="settings"
                label={t.settings}
                testID="settings-button"
                onPress={() => router.push('/settings')}
              />
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
              <PullToRefresh
                refreshing={refreshing || directory.busy}
                onRefresh={() => void refresh()}
              >
                {(pull) => (
                  <Animated.FlatList<DisplayRow>
                    {...pull}
                    renderScrollComponent={renderKeyboardFormScroll}
                    onScroll={active ? onScroll : undefined}
                    scrollEventThrottle={1}
                    contentContainerStyle={{ paddingBottom: bottom + space.x6 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    data={displayed.filter(
                      (row) => environment.key === 'all' || row.environment === environment.key,
                    )}
                    keyExtractor={(r) => r.key}
                    ListHeaderComponent={
                      <>
                        {actionError ? (
                          <Text
                            accessibilityRole="alert"
                            tone="danger"
                            style={{ paddingHorizontal: space.x5 }}
                          >
                            {t.rowActions.failed}
                          </Text>
                        ) : null}
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
                        <ItemMenu
                          title={item.section.name ?? t.pinnedSection}
                          actions={
                            item.section.id === PINNED_SECTION || !saved || !client
                              ? []
                              : [
                                  {
                                    key: 'delete-section',
                                    label: t.deletion.deleteSection,
                                    destructive: true,
                                    run: () =>
                                      setDeleting({
                                        hostId: saved.hostId,
                                        target: {
                                          kind: 'section',
                                          id: item.section.id,
                                          name: item.section.name ?? '',
                                        },
                                      }),
                                  },
                                ]
                          }
                        >
                          {(open, nativeContextMenu) => (
                            <SectionHeader
                              {...item.section}
                              name={item.section.name ?? t.pinnedSection}
                              onLongPress={
                                nativeContextMenu || item.section.id === PINNED_SECTION
                                  ? undefined
                                  : open
                              }
                              onMenu={item.section.id === PINNED_SECTION ? undefined : open}
                              onToggle={() => {
                                if (saved) sectionCollapse.toggle(saved.hostId, item.section.id);
                              }}
                            />
                          )}
                        </ItemMenu>
                      ) : item.type === 'computer' ? (
                        <ManagedConversationRow
                          row={item.conversation}
                          pinned={item.pinned}
                          look={look}
                          client={client}
                          inbox={inbox}
                          hostId={saved?.hostId}
                          arrangement={snapshot.roster?.arrangement}
                          onError={() => setActionError(true)}
                          onDelete={(target) => {
                            if (saved) setDeleting({ hostId: saved.hostId, target });
                          }}
                        />
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
          />
        </HomeHeader>
      </HostDrawerEdge>
      {deleting && client && saved?.hostId === deleting.hostId ? (
        <DeletionSheet
          key={`${deleting.hostId}:${deleting.target.kind}:${deleting.target.id}`}
          target={deleting.target}
          client={client}
          hostName={shownHostName(look, saved.hostName)}
          onClose={() => setDeleting(undefined)}
          onDeleted={() => {
            setDeleting(undefined);
            void inbox?.refresh();
          }}
        />
      ) : null}
    </>
  );
});
