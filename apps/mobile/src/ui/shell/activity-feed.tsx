import { ActivityInspector } from './activity-inspector';
import { HostGlyph } from './host-tile';
import { useIsFocused } from 'expo-router';
import { ActivitySheetRegistration } from './activity-sheet-root';
import { DEFAULT_HOST_LOOK, hostColorInk } from '@botharness/host-client/ui/design/host-look';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { PullToRefresh } from '../primitives/pull-to-refresh';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useMemo,
  useState,
  memo,
  type ReactElement,
  type RefObject,
} from 'react';
import { AccessibilityInfo, Platform, Pressable, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import type { HostClient, RosterBot } from '@botharness/host-client/client';
import { observeInbox, type Inbox, type InboxSnapshot } from '@botharness/host-client/inbox';
import {
  answerQuestion,
  approvalSummaryTool,
  decideApproval,
  loadApproval,
  loadQuestion,
  type DecisionResult,
  type RequestRef,
} from '@botharness/host-client/requests';
import {
  activityKey,
  activityBotKey,
  localSelection,
  observeActivitySources,
  type ActivityItem as HumanAttentionItem,
  type ActivitySource,
} from '../../host/activity-sources';
import {
  attentionItemUnread,
  clearAllAttention,
  markAllAttentionRead,
} from '@botharness/host-client/attention-actions';
import { useFocusedSnapshot } from '../../host/use-focused-snapshot';
import { BotAvatar } from '../bot-avatar';
import { GroupMark } from '../chat/group-mark';
import { AvatarSlot, CONVERSATION_AVATAR, CONVERSATION_RING } from '../chat/avatar-slot';
import { shortTime } from '../chat/conversations';
import { SourceName } from '../chat/source-name';
import { ApprovalCard } from '../chat/approval-card';
import { QuestionCard } from '../chat/question-card';
import { useDesignTheme } from '../design/theme';
import { spring, springy } from '../design/motion';
import { chatList, conversationType, radius, space, undoBar } from '../design/tokens';
import { Text } from '../primitives/text';
import { Notice } from '../request-parts';
import { useChatHeaderHeight } from '../chat/header-chrome';
import { Button } from '../primitives/button';
import { DeferredContent } from '../primitives/deferred-content';
import { ListSkeleton } from '../primitives/list-skeleton';
import { confirmDestructive } from '../primitives/app-dialog';
import { SwipeRow, swipeActionProps, type SwipeAction } from '../primitives/swipe-row';
import { UndoBar, type UndoNotice } from '../primitives/undo-bar';
import type {
  ActivityManage,
  ActivityManageItem,
  ActivityOptions,
} from './activity-header-actions';
import { ActivityToolbar, type ActivityToolbarHandle } from './activity-toolbar';
import { activityAvatar } from './activity-avatar';
import { useFloatingTabInset } from './floating-tab-inset';
import { FixedToolbar } from './fixed-toolbar';
import { useStrings } from '../strings';
import {
  DEFAULT_ACTIVITY,
  ActivityFilters,
  ActivityFilterContent,
  type ActivityFilter,
  type ActivitySort,
} from './activity-filters';
import { feedRows, type HiddenItems } from './activity-feed-rows';
import { activityItemActions } from './activity-item-actions';
export { type HiddenItems, feedRows } from './activity-feed-rows';

const AVATAR = 32;
const LOADING: InboxSnapshot = { status: 'loading' };
const EMPTY_SOURCE = { getSnapshot: () => LOADING, subscribe: () => () => {} };
const SUMMARY_PREVIEW_LIMIT = 512;
const ROW_LAYOUT = springy(LinearTransition.springify(), spring.spatial.default);
const ROW_EXIT = springy(FadeOut.springify(), spring.effects.fast);

function itemSummary(item: HumanAttentionItem): string {
  const tool = item.kind === 'tool-approval' ? approvalSummaryTool(item.summary) : undefined;
  return tool ?? item.summary;
}

function summaryPreview(summary: string): string {
  return summary.length <= SUMMARY_PREVIEW_LIMIT
    ? summary
    : `${summary.slice(0, SUMMARY_PREVIEW_LIMIT).replace(/[\uD800-\uDBFF]$/, '')}…`;
}

function minutesSince(at: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(at)) / 60_000));
}

function ActivityEnvironment({ item }: { item: HumanAttentionItem }) {
  const theme = useDesignTheme();
  const source = item.activitySource;
  if (!source) return null;
  const look = source.look ?? DEFAULT_HOST_LOOK;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x1, flexShrink: 1 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <HostGlyph
          icon={look.icon}
          size={theme.type.meta.size * theme.fontScale}
          color={hostColorInk(theme.scheme, theme.color, look.color)}
        />
      </View>
      <Text
        variant="meta"
        tone="muted"
        numberOfLines={theme.largeText ? undefined : 1}
        style={{ flexShrink: 1 }}
      >
        {source.label}
      </Text>
    </View>
  );
}

function ActivityAvatar({
  item,
  bot,
  size,
}: {
  item: HumanAttentionItem;
  bot: RosterBot | undefined;
  size: number;
}) {
  const corner = size >= CONVERSATION_AVATAR ? radius.md : radius.sm;
  const avatar = activityAvatar(item, bot);
  if (avatar.kind === 'bot')
    return <BotAvatar bot={avatar.bot} size={size} corner={corner} ring={false} />;
  return (
    <GroupMark
      avatar={avatar.kind === 'group' ? avatar.avatar : undefined}
      initial={avatar.kind === 'initial' ? avatar.initial : '#'}
      size={size}
      corner={corner}
      variant={size >= CONVERSATION_AVATAR ? 'title' : 'body'}
      strong={false}
    />
  );
}

const Row = memo(function Row({
  item,
  settled,
  mixed,
  bot,
  now,
  onOpen,
  actions,
}: {
  item: HumanAttentionItem;
  settled: boolean;
  mixed: boolean;
  bot: RosterBot | undefined;
  now: number;
  onOpen(item: HumanAttentionItem): void;
  actions: readonly SwipeAction[];
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const kind = t.kind[item.kind] ?? t.otherKind;
  const localName =
    item.kind === 'channel-unread'
      ? (item.channelName ?? t.otherKind)
      : (bot?.displayName ?? item.botSlug);
  const name = item.activitySource ? `${localName} · ${item.activitySource.label}` : localName;
  const summary = summaryPreview(itemSummary(item));
  const preview = summary.length > 0 ? `${kind} · ${summary}` : kind;
  const time = shortTime(item.createdAt, new Date(now));
  return (
    <SwipeRow actions={actions} testID={`inbox-swipe-${activityKey(item)}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.openPost(
          kind,
          name,
          [(item.unreadCount ?? 0) > 0 ? t.unreadCount(item.unreadCount!) : '', summary]
            .filter((part) => part !== '')
            .join(', '),
        )}
        testID={`inbox-row-${activityKey(item)}`}
        onPress={() => onOpen(item)}
        {...swipeActionProps(t.rowTitle(kind, name), actions)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x4,
          minHeight: theme.touch,
          paddingLeft: chatList.gutter - CONVERSATION_RING / 2,
          paddingRight: chatList.gutter,
          paddingVertical: space.x3,
          backgroundColor: pressed ? theme.layer.canvas.pressed : theme.layer.canvas.fill,
        })}
      >
        <AvatarSlot>
          <ActivityAvatar item={item} bot={bot} size={CONVERSATION_AVATAR} />
        </AvatarSlot>
        <View
          key={`${theme.scheme}:${theme.fontScale}:${name}`}
          style={{ flex: 1, minWidth: 0, gap: space.x1 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
            <SourceName
              name={localName}
              source="computer"
              look={
                item.activitySource ? (item.activitySource.look ?? DEFAULT_HOST_LOOK) : undefined
              }
              sourceLabel={item.activitySource?.label}
              glyph={mixed && item.activitySource !== undefined}
            />
            {time === '' ? null : (
              <Text variant="meta" tone="subtle" style={{ flexShrink: 0 }}>
                {time}
              </Text>
            )}
          </View>
          <Text
            variant="meta"
            dynamicTypeRamp="subheadline"
            tone={settled ? 'muted' : 'fg'}
            numberOfLines={1}
            ellipsizeMode="tail"
            style={conversationType.preview}
          >
            {preview}
          </Text>
        </View>
      </Pressable>
    </SwipeRow>
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
  actions,
}: {
  client: HostClient;
  item: HumanAttentionItem;
  requestRef: RequestRef;
  bot: RosterBot | undefined;
  now: number;
  onOpen(item: HumanAttentionItem): void;
  onSettled(item: HumanAttentionItem, result: DecisionResult): void;
  actions: readonly SwipeAction[];
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const localName = bot?.displayName ?? item.botSlug;
  const name = item.activitySource ? `${localName} · ${item.activitySource.label}` : localName;
  const where =
    item.channelName !== undefined && !item.channelId?.startsWith('dm-')
      ? ` · ${t.inChannel(item.channelName)}`
      : '';
  const { channelId, messageId, botSlug } = ref;
  const ports = useMemo(() => {
    const stableRef = { channelId, messageId, botSlug };
    const connected = () => {
      if (client.getSnapshot().connection.status !== 'connected')
        throw new Error('activity-source-unavailable');
    };
    return {
      approval: {
        load: () => loadApproval(client, stableRef),
        decide: (outcome: Parameters<typeof decideApproval>[2]) => {
          connected();
          return decideApproval(client, stableRef, outcome);
        },
      },
      question: {
        load: () => loadQuestion(client, stableRef),
        answer: (answer: Parameters<typeof answerQuestion>[2]) => {
          connected();
          return answerQuestion(client, stableRef, answer);
        },
      },
    };
  }, [client, channelId, messageId, botSlug]);
  const settled = (result: DecisionResult) => {
    onSettled(item, result);
  };
  return (
    <SwipeRow actions={actions} contextMenu={false} testID={`inbox-swipe-${activityKey(item)}`}>
      <View
        testID={`inbox-post-${activityKey(item)}`}
        style={{
          paddingVertical: space.x3,
          gap: space.x1,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.openPost(t.kind[item.kind] ?? t.otherKind, name, itemSummary(item))}
          onPress={() => onOpen(item)}
          {...swipeActionProps(t.rowTitle(t.kind[item.kind] ?? t.otherKind, name), actions)}
          style={({ pressed }) => ({
            minHeight: theme.touch,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x3,
            paddingHorizontal: space.x5,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <ActivityAvatar item={item} bot={bot} size={AVATAR} />
          <View
            key={`${theme.scheme}:${theme.fontScale}:${name}`}
            style={{
              flex: 1,
              minWidth: 0,
              flexDirection: theme.largeText ? 'column' : 'row',
              alignItems: theme.largeText ? 'flex-start' : 'center',
              gap: space.x2,
            }}
          >
            <Text strong numberOfLines={theme.largeText ? undefined : 1} style={{ flexShrink: 1 }}>
              {localName}
              {theme.largeText ? null : <Text tone="muted">{where}</Text>}
            </Text>
            <ActivityEnvironment item={item} />
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
    </SwipeRow>
  );
}

type ActivityFeedProps = {
  sources?: readonly ActivitySource[];
  onNotice?(notice: Omit<UndoNotice, 'id'>): void;
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
  const focused = useIsFocused();
  const { botSlugs, channels = [], bot } = props;
  const theme = useDesignTheme();
  const toolbar = useRef<ActivityToolbarHandle>(null);
  const dismissSearch = useCallback(() => toolbar.current?.dismissSearch(), []);
  const [filter, setFilter] = useState<ActivityFilter>(DEFAULT_ACTIVITY);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [sort, setSort] = useState<ActivitySort>('default');
  const [filtering, setFiltering] = useState(false);
  const manageRef = useRef<((key: string) => void) | undefined>(undefined);
  const [manageItems, setManageItems] = useState<readonly ActivityManageItem[]>([]);
  const onManageItems = useCallback(
    (next: readonly ActivityManageItem[]) =>
      setManageItems((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      ),
    [],
  );
  const manage = useMemo<ActivityManage | undefined>(
    () =>
      manageItems.length === 0
        ? undefined
        : { items: manageItems, run: (key) => manageRef.current?.(key) },
    [manageItems],
  );
  const [notice, setNotice] = useState<UndoNotice>();
  const noticeCount = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const noticeDone = useCallback(
    (id: number) => setNotice((current) => (current?.id === id ? undefined : current)),
    [],
  );
  const showNotice = useCallback(
    (next: Omit<UndoNotice, 'id'>) => {
      noticeCount.current += 1;
      const id = noticeCount.current;
      setNotice({ ...next, id });
      AccessibilityInfo.announceForAccessibility(next.message);
      clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => noticeDone(id), undoBar.duration);
    },
    [noticeDone],
  );
  const tabInset = useFloatingTabInset();
  const initialHeight = useChatHeaderHeight();
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(Platform.OS === 'ios' ? 0 : initialHeight);
  const slugsWithSelection =
    filter.bot !== undefined && !botSlugs.includes(filter.bot)
      ? [...botSlugs, filter.bot]
      : botSlugs;
  const filterOptions: ActivityOptions = {
    sort,
    onSort: setSort,
    filter,
    channels,
    bots: slugsWithSelection.map((slug) => ({ slug, name: bot(slug)?.displayName ?? slug })),
    onFilter: setFilter,
  };
  const top = headerHeight;
  const content = (
    <KeyboardAvoidingView
      style={{ flex: 1, overflow: 'hidden', backgroundColor: theme.color.base }}
      enabled={searchFocused}
      behavior="padding"
    >
      <View style={{ flex: 1, marginTop: top }}>
        <DeferredContent fallback={<ListSkeleton />}>
          {props.unavailable ? (
            <View style={{ padding: space.x6 }}>
              <Text tone="muted">{props.unavailable}</Text>
            </View>
          ) : (
            <ActivityPage
              {...props}
              onNotice={showNotice}
              manageRef={manageRef}
              onManageItems={onManageItems}
              section={filter.section}
              filterBot={filter.bot}
              filterChannel={filter.channel}
              filterUnread={filter.unreadOnly}
              search={search}
              sort={sort}
              active={focused}
              searchFocused={searchFocused}
              dismissSearch={dismissSearch}
            />
          )}
        </DeferredContent>
      </View>
      <FixedToolbar height={top}>
        <ActivityToolbar
          ref={toolbar}
          unavailable={props.unavailable !== undefined}
          search={search}
          onSearchFocus={setSearchFocused}
          filtered={
            sort !== 'default' ||
            filter.section !== 'all' ||
            filter.bot !== undefined ||
            filter.channel !== undefined ||
            filter.unreadOnly === true
          }
          options={filterOptions}
          onSearch={setSearch}
          onFilter={() => setFiltering(true)}
          manage={props.unavailable === undefined ? manage : undefined}
          onHeight={setHeaderHeight}
        />
      </FixedToolbar>
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
      <UndoBar notice={notice} bottom={tabInset} onDone={noticeDone} />
      {Platform.OS === 'web' ? (
        <ActivityFilters
          visible={filtering}
          {...filterOptions}
          onClose={() => setFiltering(false)}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
  return Platform.OS === 'android' ? (
    <>
      <ActivitySheetRegistration
        open={filtering}
        active={focused}
        enabled={!searchFocused && search === ''}
        onOpenChange={setFiltering}
        panel={
          <View
            style={{
              flex: 1,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            }}
          >
            <ActivityFilterContent {...filterOptions} onClose={() => setFiltering(false)} />
          </View>
        }
      />
      {content}
    </>
  ) : (
    <ActivityInspector
      visible={filtering && focused}
      {...filterOptions}
      onClose={() => setFiltering(false)}
    >
      {content}
    </ActivityInspector>
  );
});

const ActivityPage = memo(function ActivityPage({
  sources,
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
  onNotice,
  manageRef,
  onManageItems,
}: ActivityFeedProps & {
  manageRef: RefObject<((key: string) => void) | undefined>;
  onManageItems(items: readonly ActivityManageItem[]): void;
  section: ActivityFilter['section'];
  filterBot: ActivityFilter['bot'];
  filterChannel: ActivityFilter['channel'];
  filterUnread: ActivityFilter['unreadOnly'];
  search: string;
  sort: ActivitySort;
  active: boolean;
  searchFocused: boolean;
  dismissSearch(): void;
}) {
  const t = useStrings();
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
  const [refreshing, setRefreshing] = useState(false);
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const [held, setHeld] = useState<readonly HumanAttentionItem[]>([]);
  const [hidden, setHidden] = useState<HiddenItems>(() => new Map());
  useLayoutEffect(
    () => setHeld((current) => (current.length === 0 ? current : [])),
    [filter, search, sort],
  );
  const scoped = useMemo(
    () =>
      sources !== undefined
        ? observeActivitySources(sources, {
            activity: true,
            section: filter.section,
            botSlug: filter.bot,
            channelId: filter.channel,
            unreadOnly: filter.unreadOnly,
            search,
            sort,
          })
        : client === undefined
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
    [sources, client, filter.section, filter.bot, filter.channel, filter.unreadOnly, search, sort],
  );
  const settlementScope = useMemo(() => ({}), [hostId, scoped, filter, search, sort, active]);
  const activeSettlementScope = useRef<object | undefined>(undefined);
  useLayoutEffect(() => {
    activeSettlementScope.current = active ? settlementScope : undefined;
    return () => {
      activeSettlementScope.current = undefined;
    };
  }, [settlementScope, active]);
  const scopedSnapshot = useFocusedSnapshot(scoped ?? EMPTY_SOURCE, active);
  const visible = scoped === undefined ? snapshot : scopedSnapshot;
  const currentInbox = () => (scoped === undefined ? inbox : scoped.getInbox());
  const retained =
    sources === undefined
      ? held
      : held.filter((item) =>
          sources.some((source) => source.client === item.activitySource?.client),
        );
  const rows = feedRows(visible, gone, retained, filter, search, hidden, sort);
  const { actionsFor, clientFor } = activityItemActions({
    setHidden,
    sources,
    client,
    filter,
    t,
    onNotice,
    currentInbox,
  });

  const settled = (item: HumanAttentionItem, result: DecisionResult) => {
    if (activeSettlementScope.current !== settlementScope) return;
    if (result === 'accepted') setGone((current) => new Set(current).add(activityKey(item)));
    else
      setHeld((current) => [
        ...current.filter((kept) => activityKey(kept) !== activityKey(item)),
        item,
      ]);
    void currentInbox()?.refresh();
  };
  const clearSections: ReadonlyArray<'action' | 'replies' | 'unread'> =
    filter.section === 'all'
      ? ['action', 'replies', 'unread']
      : filter.section === 'action' || filter.section === 'replies' || filter.section === 'unread'
        ? [filter.section]
        : [];
  const clearKinds = [
    ...new Set(
      rows.flatMap((row) =>
        (row.kind === 'row' || row.kind === 'post') &&
        clearSections.some((section) => section === row.section)
          ? [row.item.kind]
          : [],
      ),
    ),
  ];
  const targets = () =>
    sources === undefined
      ? client === undefined
        ? []
        : [{ client, botSlug: filter.bot, channelId: filter.channel }]
      : sources.flatMap((source) => {
          const botSlug = localSelection(filter.bot, source);
          const channelId = localSelection(filter.channel, source);
          return botSlug === false || channelId === false
            ? []
            : [{ client: source.client, botSlug, channelId }];
        });
  const clearMany = async (kind: string | undefined) => {
    let dismissed = 0;
    let more = false;
    try {
      for (const target of targets()) {
        if (target.client.getSnapshot().connection.status !== 'connected')
          throw new Error('activity-source-unavailable');
        for (const category of clearSections) {
          const result = await clearAllAttention(target.client, {
            kind,
            category,
            botSlug: target.botSlug,
            channelId: target.channelId,
          });
          dismissed += result.dismissed;
          more ||= result.more;
        }
      }
      onNotice?.({
        message: more ? t.activityClearedMore(dismissed) : t.activityClearedCount(dismissed),
      });
    } catch {
      onNotice?.({ message: t.activityChangeFailed });
    } finally {
      setHeld([]);
      await currentInbox()?.refresh();
    }
  };
  const markAllRead = async () => {
    let channels = 0;
    try {
      for (const target of targets()) {
        if (target.client.getSnapshot().connection.status !== 'connected')
          throw new Error('activity-source-unavailable');
        channels += (
          await markAllAttentionRead(target.client, {
            botSlug: target.botSlug,
            channelId: target.channelId,
          })
        ).channels;
      }
      onNotice?.({ message: t.activityMarkedAllRead(channels) });
    } catch {
      onNotice?.({ message: t.activityChangeFailed });
    } finally {
      setHeld([]);
      await currentInbox()?.refresh();
    }
  };
  const hasUnread = rows.some(
    (row) =>
      (row.kind === 'row' || row.kind === 'post') &&
      (attentionItemUnread(row.item) || (row.item.unreadCount ?? 0) > 0),
  );
  const manageItems: ActivityManageItem[] =
    visible.status !== 'ready'
      ? []
      : [
          ...(hasUnread
            ? [{ key: 'read-all', label: t.activityMarkAllRead, icon: 'read' as const }]
            : []),
          ...(clearKinds.length === 0
            ? []
            : [
                {
                  key: 'clear:',
                  label: t.activityClearAllItems,
                  icon: 'clear' as const,
                  destructive: true,
                },
                ...clearKinds.map((kind) => ({
                  key: 'clear:' + kind,
                  label: t.activityClearKind(t.kind[kind] ?? t.otherKind),
                  icon: 'clear' as const,
                })),
              ]),
        ];
  useLayoutEffect(() => {
    manageRef.current = (key) => {
      if (key === 'read-all') void markAllRead();
      else if (key === 'clear:')
        confirmDestructive(
          t.activityClearAllTitle,
          t.activityClearAllBody,
          t.activityClearAllItems,
          () => void clearMany(undefined),
        );
      else if (key.startsWith('clear:')) void clearMany(key.slice(6));
    };
  });
  useLayoutEffect(() => onManageItems(manageItems));
  useLayoutEffect(() => () => onManageItems([]), [onManageItems]);
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
      <PullToRefresh refreshing={refreshing} onRefresh={refresh}>
        {(pull) => (
          <Animated.FlatList
            {...pull}
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={{
              flexGrow: 1,
              paddingBottom: bottom + space.x6,
            }}
            renderScrollComponent={(props) => (
              <KeyboardFormScroll {...props} enabled={!searchFocused} />
            )}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            scrollEventThrottle={1}
            style={{
              backgroundColor: theme.color.base,
            }}
            data={[{ kind: 'status', key: 'status' } as const, ...rows]}
            keyExtractor={(row) => row.key}
            itemLayoutAnimation={ROW_LAYOUT}
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
              const rowClient = clientFor(row.item);
              if (row.kind === 'row')
                return (
                  <Row
                    item={row.item}
                    settled={row.settled}
                    mixed={hostId === 'all'}
                    bot={
                      row.item.activitySource?.roster?.bots.find(
                        (entry) => entry.slug === row.item.botSlug,
                      ) ?? bot(activityBotKey(row.item))
                    }
                    onOpen={onOpen}
                    actions={actionsFor(row.item, row.section)}
                    now={Math.floor(now / 60_000) * 60_000}
                  />
                );
              return (
                <Animated.View exiting={ROW_EXIT}>
                  {rowClient === undefined ? null : (
                    <Post
                      client={rowClient}
                      item={row.item}
                      requestRef={row.ref}
                      bot={
                        row.item.activitySource?.roster?.bots.find(
                          (entry) => entry.slug === row.item.botSlug,
                        ) ?? bot(activityBotKey(row.item))
                      }
                      now={now}
                      onOpen={onOpen}
                      onSettled={settled}
                      actions={actionsFor(row.item, row.section)}
                    />
                  )}
                </Animated.View>
              );
            }}
          />
        )}
      </PullToRefresh>
    </View>
  );
});
