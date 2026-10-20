import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useMemo,
  useState,
  memo,
  type ReactElement,
} from 'react';
import {
  Animated as NativeAnimated,
  Platform,
  Pressable,
  RefreshControl,
  View,
  useWindowDimensions,
} from 'react-native';
import { TabView } from 'react-native-tab-view';
import Animated, {
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';

import type { HostClient, RosterBot } from '../../host/client';
import {
  INBOX_SECTIONS,
  observeInbox,
  type Inbox,
  type InboxSection,
  type InboxSnapshot,
} from '../../host/inbox';
import {
  answerQuestion,
  approvalSummaryTool,
  decideApproval,
  loadApproval,
  loadQuestion,
  requestRef,
  type DecisionResult,
  type RequestRef,
} from '../../host/requests';
import type { HumanAttentionItem } from '../../host/wire';
import { useFocusedSnapshot } from '../../host/use-focused-snapshot';
import { BotAvatar } from '../bot-avatar';
import { ApprovalCard } from '../chat/approval-card';
import { QuestionCard } from '../chat/question-card';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { CountBadge } from '../primitives/count-badge';
import { Notice } from '../request-parts';
import { useChatHeaderHeight } from '../chat/header-chrome';
import { Button } from '../primitives/button';
import { DeferredContent } from '../primitives/deferred-content';
import { ListSkeleton } from '../primitives/list-skeleton';
import { ActivityToolbar, type ActivityToolbarHandle } from './activity-toolbar';
import { ActivityTabs, ACTIVITY_TABS, type ActivityTab } from './activity-tabs';
import { useFloatingTabInset } from './floating-tab-inset';
import { CollapsingToolbar, useChromeProgress, useChromeScroll } from './scroll-chrome';
import { t } from '../strings';
import {
  DEFAULT_ACTIVITY,
  ActivityFilters,
  type ActivityFilter,
  type ActivitySort,
} from './activity-filters';

const AVATAR = 32;
const LOADING: InboxSnapshot = { status: 'loading' };
const EMPTY_SOURCE = { getSnapshot: () => LOADING, subscribe: () => () => {} };
const ACTIVITY_ROUTES = [...ACTIVITY_TABS];
const SUMMARY_PREVIEW_LIMIT = 512;

function itemSummary(item: HumanAttentionItem): string {
  const tool = item.kind === 'tool-approval' ? approvalSummaryTool(item.summary) : undefined;
  return tool ?? item.summary;
}

function summaryPreview(summary: string): string {
  return summary.length <= SUMMARY_PREVIEW_LIMIT
    ? summary
    : `${summary.slice(0, SUMMARY_PREVIEW_LIMIT).replace(/[\uD800-\uDBFF]$/, '')}…`;
}

type FeedRow =
  | { kind: 'empty'; key: string }
  | { kind: 'more'; key: string; section: InboxSection }
  | { kind: 'post'; key: string; item: HumanAttentionItem; ref: RequestRef }
  | { kind: 'row'; key: string; item: HumanAttentionItem; settled: boolean };

function decidable(item: HumanAttentionItem): RequestRef | undefined {
  if (item.kind !== 'user-question' && item.kind !== 'tool-approval') return undefined;
  return requestRef(item);
}

function sectionItems(
  snapshot: Extract<InboxSnapshot, { status: 'ready' }>,
  section: InboxSection,
  gone: ReadonlySet<string>,
  held: readonly HumanAttentionItem[],
  bot: string | undefined,
): HumanAttentionItem[] {
  const listed = snapshot.sections[section].filter(
    (item) => section !== 'action' || !gone.has(item.id),
  );
  const items =
    section === 'action'
      ? [
          ...listed,
          ...held.filter(
            (kept) =>
              (bot === undefined || kept.botSlug === bot) &&
              !listed.some((item) => item.id === kept.id),
          ),
        ]
      : listed;
  return bot === undefined || snapshot.botSlug === bot
    ? items
    : items.filter((item) => item.botSlug === bot);
}

export function feedRows(
  snapshot: InboxSnapshot,
  gone: ReadonlySet<string>,
  held: readonly HumanAttentionItem[],
  filter: ActivityFilter = DEFAULT_ACTIVITY,
  search = '',
): FeedRow[] {
  if (snapshot.status !== 'ready') return [];
  const rows: FeedRow[] = [];
  for (const section of INBOX_SECTIONS) {
    if (filter.section === 'all' && section === 'handled') continue;
    if (filter.section !== 'all' && filter.section !== section) continue;
    const items = sectionItems(snapshot, section, gone, held, filter.bot);
    if (search.trim() && items.length === 0 && !snapshot.cursors?.[section]) continue;
    for (const item of items) {
      const ref = section === 'action' ? decidable(item) : undefined;
      rows.push(
        ref === undefined
          ? { kind: 'row', key: item.id, item, settled: section === 'handled' }
          : { kind: 'post', key: item.id, item, ref },
      );
    }
    if (snapshot.cursors?.[section]) rows.push({ kind: 'more', key: `more-${section}`, section });
  }
  if (rows.length === 0 && !search.trim())
    rows.push({ kind: 'empty', key: `empty-${filter.section}` });
  return rows;
}

function minutesSince(at: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(at)) / 60_000));
}

const Row = memo(function Row({
  item,
  settled,
  bot,
  now,
  onOpen,
}: {
  item: HumanAttentionItem;
  settled: boolean;
  bot: RosterBot | undefined;
  now: number;
  onOpen(item: HumanAttentionItem): void;
}) {
  const theme = useDesignTheme();
  const kind = t.kind[item.kind] ?? t.otherKind;
  const name =
    item.kind === 'channel-unread'
      ? (item.channelName ?? t.otherKind)
      : (bot?.displayName ?? item.botSlug);
  const summary = summaryPreview(itemSummary(item));
  const size = settled ? theme.type.body.line : AVATAR;
  const metadata = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: space.x3,
        marginLeft: theme.largeText ? 0 : 'auto',
      }}
    >
      <Text variant="meta" tone="muted">
        {t.ago(minutesSince(item.createdAt, now))}
      </Text>
      {(item.unreadCount ?? 0) > 0 ? <CountBadge count={item.unreadCount!} tone="unread" /> : null}
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.openPost(kind, name, summary)}
      testID={`inbox-row-${item.id}`}
      onPress={() => onOpen(item)}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: settled ? 'center' : 'flex-start',
        gap: space.x3,
        paddingHorizontal: space.x5,
        paddingVertical: space.x3,
        backgroundColor: pressed ? theme.layer.canvas.pressed : theme.layer.canvas.fill,
      })}
    >
      {bot === undefined ? (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: theme.layer.canvas.inset,
          }}
        />
      ) : (
        <BotAvatar bot={bot} size={size} />
      )}
      <View style={{ flex: 1, gap: space.x1 }}>
        <View
          style={{
            flexDirection: theme.largeText ? 'column' : 'row',
            alignItems: theme.largeText ? 'flex-start' : 'center',
            gap: space.x3,
          }}
        >
          <Text
            variant={theme.largeText ? 'meta' : 'body'}
            numberOfLines={theme.largeText ? 2 : 1}
            strong={!settled}
            style={{ flexShrink: 1 }}
          >
            {theme.largeText ? name : t.rowTitle(kind, name)}
            {settled && summary.length > 0 ? <Text tone="muted">{` · ${summary}`}</Text> : null}
          </Text>
          {theme.largeText ? null : metadata}
        </View>
        {!settled && summary.length > 0 ? (
          <Text tone={theme.largeText ? 'fg' : 'muted'} numberOfLines={2}>
            {summary}
          </Text>
        ) : null}
        {theme.largeText ? metadata : null}
      </View>
    </Pressable>
  );
});

function Post({
  client,
  item,
  requestRef: ref,
  bot,
  now,
  onOpen,
  onSettled,
}: {
  client: HostClient;
  item: HumanAttentionItem;
  requestRef: RequestRef;
  bot: RosterBot | undefined;
  now: number;
  onOpen(item: HumanAttentionItem): void;
  onSettled(item: HumanAttentionItem, result: DecisionResult): void;
}) {
  const theme = useDesignTheme();
  const name = bot?.displayName ?? item.botSlug;
  const where =
    item.channelName !== undefined && !item.channelId?.startsWith('dm-')
      ? ` · ${t.inChannel(item.channelName)}`
      : '';
  const { channelId, messageId, botSlug } = ref;
  const ports = useMemo(() => {
    const stableRef = { channelId, messageId, botSlug };
    return {
      approval: {
        load: () => loadApproval(client, stableRef),
        decide: (outcome: Parameters<typeof decideApproval>[2]) =>
          decideApproval(client, stableRef, outcome),
      },
      question: {
        load: () => loadQuestion(client, stableRef),
        answer: (answer: Parameters<typeof answerQuestion>[2]) =>
          answerQuestion(client, stableRef, answer),
      },
    };
  }, [client, channelId, messageId, botSlug]);
  const settled = (result: DecisionResult) => {
    onSettled(item, result);
  };
  return (
    <View
      testID={`inbox-post-${item.id}`}
      style={{
        paddingVertical: space.x3,
        gap: space.x1,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.openPost(t.kind[item.kind] ?? t.otherKind, name, itemSummary(item))}
        onPress={() => onOpen(item)}
        style={({ pressed }) => ({
          minHeight: theme.touch,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x3,
          paddingHorizontal: space.x5,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        {bot === undefined ? (
          <View
            style={{
              width: AVATAR,
              height: AVATAR,
              borderRadius: AVATAR / 2,
              backgroundColor: theme.layer.canvas.inset,
            }}
          />
        ) : (
          <BotAvatar bot={bot} size={AVATAR} />
        )}
        <View
          style={{
            flex: 1,
            flexDirection: theme.largeText ? 'column' : 'row',
            alignItems: theme.largeText ? 'flex-start' : 'center',
            gap: space.x2,
          }}
        >
          <Text strong numberOfLines={theme.largeText ? undefined : 1} style={{ flexShrink: 1 }}>
            {name}
            {theme.largeText ? null : <Text tone="muted">{where}</Text>}
          </Text>
          {theme.largeText && where !== '' ? (
            <Text variant="meta" tone="muted">
              {t.inChannel(item.channelName ?? '')}
            </Text>
          ) : null}
          <Text variant="meta" tone="muted" style={{ marginLeft: theme.largeText ? 0 : 'auto' }}>
            {t.ago(minutesSince(item.createdAt, now))}
          </Text>
        </View>
      </Pressable>
      {item.kind === 'tool-approval' ? (
        <ApprovalCard port={ports.approval} wide onSettled={settled} />
      ) : (
        <QuestionCard port={ports.question} botName={name} wide onSettled={settled} />
      )}
    </View>
  );
}

type ActivityFeedProps = {
  unavailable?: string | undefined;
  hostId: string;
  client: HostClient | undefined;
  inbox: Inbox | undefined;
  snapshot: InboxSnapshot;
  botSlugs: readonly string[];
  channels?: ReadonlyArray<{ id: string; name: string }>;
  bot(slug: string): RosterBot | undefined;
  onOpen(item: HumanAttentionItem): void;
  header?: ReactElement | null;
  now?: number;
};

export const ActivityFeed = memo(function ActivityFeed(props: ActivityFeedProps) {
  const { botSlugs, channels = [], bot } = props;
  const theme = useDesignTheme();
  const toolbar = useRef<ActivityToolbarHandle>(null);
  const dismissSearch = useCallback(() => toolbar.current?.dismissSearch(), []);
  const [filter, setFilter] = useState<ActivityFilter>(DEFAULT_ACTIVITY);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [sort, setSort] = useState<ActivitySort>('default');
  const [filtering, setFiltering] = useState(false);
  const [lastTab, setLastTab] = useState(0);
  const initialHeight = useChatHeaderHeight();
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(Platform.OS === 'ios' ? 0 : initialHeight);
  const width = useWindowDimensions().width;
  const reducedMotion = useReducedMotion();
  const progress = useChromeProgress();
  const selectedIndex = ACTIVITY_TABS.findIndex((tab) => tab.key === filter.section);
  const index = selectedIndex < 0 ? lastTab : selectedIndex;
  const placeholderPosition = useMemo(() => new NativeAnimated.Value(index), [index]);
  const slugsWithSelection =
    filter.bot !== undefined && !botSlugs.includes(filter.bot)
      ? [...botSlugs, filter.bot]
      : botSlugs;
  const selectIndex = (next: number) => {
    const tab = ACTIVITY_TABS[next];
    if (!tab) return;
    setLastTab(next);
    setFilter((current) => ({ ...current, section: tab.key }));
  };
  const top = headerHeight;
  const travel = Math.max(0, top - insets.top);
  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -travel * progress.value }],
  }));
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, overflow: 'hidden', backgroundColor: theme.color.base }}
      enabled={searchFocused}
      behavior="padding"
    >
      <Animated.View style={[{ flex: 1, marginTop: top, marginBottom: -travel }, pageStyle]}>
        <DeferredContent
          fallback={
            <View style={{ flex: 1 }}>
              <ActivityTabs
                selected={filter.section}
                position={placeholderPosition}
                onSelect={(key) => selectIndex(ACTIVITY_TABS.findIndex((tab) => tab.key === key))}
              />
              <ListSkeleton />
            </View>
          }
        >
          <TabView
            style={{ backgroundColor: theme.color.base }}
            navigationState={{ index, routes: ACTIVITY_ROUTES }}
            initialLayout={{ width }}
            onIndexChange={selectIndex}
            animationEnabled={!reducedMotion}
            lazy
            renderLazyPlaceholder={() => <ListSkeleton />}
            renderTabBar={({ position, jumpTo }) => (
              <ActivityTabs selected={filter.section} position={position} onSelect={jumpTo} />
            )}
            renderScene={({ route }: { route: ActivityTab }) =>
              props.unavailable ? (
                <View style={{ padding: space.x6 }}>
                  <Text tone="muted">{props.unavailable}</Text>
                </View>
              ) : (
                <ActivityPage
                  {...props}
                  section={route.key === ACTIVITY_TABS[index]?.key ? filter.section : route.key}
                  filterBot={filter.bot}
                  filterChannel={filter.channel}
                  filterUnread={filter.unreadOnly}
                  search={search}
                  sort={sort}
                  active={route.key === ACTIVITY_TABS[index]?.key}
                  searchFocused={searchFocused}
                  scrollActive={route.key === ACTIVITY_TABS[index]?.key}
                  pinChrome={searchFocused || filtering}
                  headerTravel={travel}
                  dismissSearch={dismissSearch}
                />
              )
            }
          />
        </DeferredContent>
      </Animated.View>
      <CollapsingToolbar travel={travel} height={top}>
        <ActivityToolbar
          ref={toolbar}
          unavailable={props.unavailable !== undefined}
          search={search}
          onSearchFocus={setSearchFocused}
          filtered={
            sort !== 'default' ||
            filter.section === 'all' ||
            filter.section === 'handled' ||
            filter.bot !== undefined ||
            filter.channel !== undefined ||
            filter.unreadOnly === true
          }
          onSearch={setSearch}
          onFilter={() => setFiltering(true)}
          onHeight={setHeaderHeight}
        />
      </CollapsingToolbar>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: insets.top,
          backgroundColor: theme.color.base,
        }}
      />
      <ActivityFilters
        visible={filtering}
        sort={sort}
        onSort={setSort}
        filter={filter}
        channels={channels}
        bots={slugsWithSelection.map((slug) => ({ slug, name: bot(slug)?.displayName ?? slug }))}
        onFilter={setFilter}
        onClose={() => setFiltering(false)}
      />
    </KeyboardAvoidingView>
  );
});

const ActivityPage = memo(function ActivityPage({
  hostId,
  client,
  inbox,
  snapshot,
  bot,
  onOpen,
  header,
  now = Date.now(),
  section,
  filterBot,
  filterChannel,
  filterUnread,
  search,
  sort,
  active,
  searchFocused,
  dismissSearch,
  scrollActive,
  pinChrome,
  headerTravel,
}: ActivityFeedProps & {
  section: ActivityFilter['section'];
  filterBot: ActivityFilter['bot'];
  filterChannel: ActivityFilter['channel'];
  filterUnread: ActivityFilter['unreadOnly'];
  search: string;
  sort: ActivitySort;
  active: boolean;
  searchFocused: boolean;
  dismissSearch(): void;
  scrollActive: boolean;
  pinChrome: boolean;
  headerTravel: number;
}) {
  const theme = useDesignTheme();
  const bottom = useFloatingTabInset();
  const filter = useMemo<ActivityFilter>(
    () => ({
      section,
      bot: filterBot,
      channel: filterChannel,
      ...(filterUnread === undefined ? {} : { unreadOnly: filterUnread }),
    }),
    [section, filterBot, filterChannel, filterUnread],
  );
  const onScroll = useChromeScroll(scrollActive, pinChrome);
  const [refreshing, setRefreshing] = useState(false);
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const [held, setHeld] = useState<readonly HumanAttentionItem[]>([]);
  useLayoutEffect(
    () => setHeld((current) => (current.length === 0 ? current : [])),
    [filter, search, sort],
  );
  const scoped = useMemo(
    () =>
      client === undefined
        ? undefined
        : observeInbox(client, {
            activity: true,
            section: filter.section,
            botSlug: filter.bot,
            channelId: filter.channel,
            unreadOnly: filter.unreadOnly,
            search,
            sort,
          }),
    [client, filter.section, filter.bot, filter.channel, filter.unreadOnly, search, sort],
  );
  const settlementScope = useMemo(() => ({}), [hostId, scoped, filter, search, sort, active]);
  const activeSettlementScope = useRef<object | undefined>(undefined);
  useLayoutEffect(() => {
    activeSettlementScope.current = active ? settlementScope : undefined;
    return () => {
      activeSettlementScope.current = undefined;
    };
  }, [settlementScope, active]);
  const scopedSnapshot = useFocusedSnapshot(scoped ?? EMPTY_SOURCE, scrollActive);
  const visible = scoped === undefined ? snapshot : scopedSnapshot;
  const currentInbox = () => (scoped === undefined ? inbox : scoped.getInbox());
  const rows = feedRows(visible, gone, held, filter, search);
  const settled = (item: HumanAttentionItem, result: DecisionResult) => {
    if (activeSettlementScope.current !== settlementScope) return;
    if (result === 'accepted') setGone((current) => new Set(current).add(item.id));
    else setHeld((current) => [...current.filter((kept) => kept.id !== item.id), item]);
    void currentInbox()?.refresh();
  };
  const refresh = () => {
    setRefreshing(true);
    setHeld([]);
    void (currentInbox()?.refresh() ?? Promise.resolve()).finally(() => setRefreshing(false));
  };
  return (
    <View
      style={{ flex: 1 }}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    >
      <Animated.FlatList
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: bottom + headerTravel + space.x6,
        }}
        renderScrollComponent={(props) => (
          <KeyboardFormScroll {...props} enabled={!searchFocused} />
        )}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onScroll={onScroll}
        scrollEventThrottle={1}
        style={{
          backgroundColor: theme.color.base,
        }}
        data={[{ kind: 'status', key: 'status' } as const, ...rows]}
        keyExtractor={(row) => row.key}
        itemLayoutAnimation={LinearTransition}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListFooterComponentStyle={{ flexGrow: 1 }}
        ListFooterComponent={
          <Pressable accessible={false} onPress={() => dismissSearch()} style={{ flex: 1 }} />
        }
        renderItem={({ item: row }) => {
          if (row.kind === 'status')
            return (
              <>
                <View style={{ gap: space.x3 }}>
                  {header}
                  {visible.status === 'ready' && visible.stale !== undefined ? (
                    <View style={{ paddingHorizontal: space.x5 }}>
                      <Notice tone="warning">{`${t.inboxStale} ${visible.stale}`}</Notice>
                      <Button label={t.tryAgain} onPress={refresh} disabled={refreshing} />
                    </View>
                  ) : null}
                  {visible.status === 'error' ? (
                    <View style={{ paddingHorizontal: space.x5 }}>
                      <Notice tone="danger">{`${t.inboxFailed} ${visible.error}`}</Notice>
                      <Button label={t.tryAgain} onPress={refresh} disabled={refreshing} />
                    </View>
                  ) : null}
                  {visible.status === 'loading' ? <ListSkeleton /> : null}
                  {visible.status === 'ready' &&
                  Object.values(visible.cursors ?? {}).some(Boolean) ? (
                    <Text variant="meta" tone="muted" style={{ paddingHorizontal: space.x5 }}>
                      {t.activityLoaded}
                    </Text>
                  ) : null}
                </View>
                {visible.status === 'ready' && rows.length === 0 && search.trim() ? (
                  <Text tone="muted" style={{ padding: space.x5 }}>
                    {t.activityNoResults}
                  </Text>
                ) : null}
              </>
            );
          if (row.kind === 'more')
            return (
              <View style={{ padding: space.x5 }}>
                <Button
                  label={t.activityLoadMore}
                  disabled={
                    visible.status === 'ready' &&
                    visible.loadingMore?.includes(row.section) === true
                  }
                  onPress={() => void currentInbox()?.loadMore?.(row.section)}
                />
              </View>
            );
          if (row.kind === 'empty')
            return (
              <Text tone="muted" style={{ paddingHorizontal: space.x5, paddingTop: space.x6 }}>
                {row.key === 'empty-action' && filter.bot === undefined
                  ? t.inboxEmpty
                  : t.filterEmpty}
              </Text>
            );
          if (row.kind === 'row')
            return (
              <Row
                item={row.item}
                settled={row.settled}
                bot={bot(row.item.botSlug)}
                onOpen={onOpen}
                now={Math.floor(now / 60_000) * 60_000}
              />
            );
          return (
            <Animated.View exiting={FadeOut.duration(220)}>
              {client === undefined ? null : (
                <Post
                  client={client}
                  item={row.item}
                  requestRef={row.ref}
                  bot={bot(row.item.botSlug)}
                  now={now}
                  onOpen={onOpen}
                  onSettled={settled}
                />
              )}
            </Animated.View>
          );
        }}
      />
    </View>
  );
});
