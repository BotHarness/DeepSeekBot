import { useMemo, useState, type ReactElement } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';

import type { HostClient, RosterBot } from '../../host/client';
import {
  INBOX_SECTIONS,
  type Inbox,
  type InboxSection,
  type InboxSnapshot,
} from '../../host/inbox';
import {
  answerQuestion,
  decideApproval,
  loadApproval,
  loadQuestion,
  requestRef,
  type DecisionResult,
  type RequestRef,
} from '../../host/requests';
import type { HumanAttentionItem } from '../../host/wire';
import { BotAvatar } from '../bot-avatar';
import { ApprovalCard } from '../chat/approval-card';
import { QuestionCard } from '../chat/question-card';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { Loading, Notice } from '../request-parts';
import { t } from '../strings';
import {
  ALL_ACTIVITY,
  ActivityFilters,
  type ActivityFilter,
  type ActivitySection,
} from './activity-filters';

const AVATAR = 32;

type FeedRow =
  | { kind: 'header'; key: string; section: InboxSection; count: number }
  | { kind: 'empty'; key: string }
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
  const listed = snapshot.sections[section].filter((item) => !gone.has(item.id));
  const items =
    section === 'action'
      ? [...listed, ...held.filter((kept) => !listed.some((item) => item.id === kept.id))]
      : listed;
  return bot === undefined ? items : items.filter((item) => item.botSlug === bot);
}

export function activityCounts(
  snapshot: InboxSnapshot,
  gone: ReadonlySet<string>,
  held: readonly HumanAttentionItem[],
  bot: string | undefined,
): Record<ActivitySection, number> {
  const counts: Record<ActivitySection, number> = { all: 0, action: 0, replies: 0, handled: 0 };
  if (snapshot.status !== 'ready') return counts;
  for (const section of INBOX_SECTIONS) {
    counts[section] = sectionItems(snapshot, section, gone, held, bot).length;
    counts.all += counts[section];
  }
  return counts;
}

export function activityBots(snapshot: InboxSnapshot): string[] {
  if (snapshot.status !== 'ready') return [];
  return [
    ...new Set(
      INBOX_SECTIONS.flatMap((section) => snapshot.sections[section].map((item) => item.botSlug)),
    ),
  ];
}

export function feedRows(
  snapshot: InboxSnapshot,
  gone: ReadonlySet<string>,
  held: readonly HumanAttentionItem[],
  filter: ActivityFilter = ALL_ACTIVITY,
): FeedRow[] {
  if (snapshot.status !== 'ready') return [];
  const rows: FeedRow[] = [];
  for (const section of INBOX_SECTIONS) {
    if (filter.section !== 'all' && filter.section !== section) continue;
    const items = sectionItems(snapshot, section, gone, held, filter.bot);
    const chosen = filter.section === section;
    if (items.length === 0 && section !== 'action' && !chosen) continue;
    rows.push({ kind: 'header', key: `header-${section}`, section, count: items.length });
    if (items.length === 0) rows.push({ kind: 'empty', key: `empty-${section}` });
    for (const item of items) {
      const ref = section === 'action' ? decidable(item) : undefined;
      rows.push(
        ref === undefined
          ? { kind: 'row', key: item.id, item, settled: section === 'handled' }
          : { kind: 'post', key: item.id, item, ref },
      );
    }
  }
  return rows;
}

function minutesSince(at: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(at)) / 60_000));
}

function Row({
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
  const name = bot?.displayName ?? item.botSlug;
  const size = settled ? theme.type.body.line : AVATAR;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.openPost(kind, name, item.summary)}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
          <Text numberOfLines={1} strong={!settled} style={{ flexShrink: 1 }}>
            {t.rowTitle(kind, name)}
            {settled && item.summary.length > 0 ? (
              <Text tone="muted">{` · ${item.summary}`}</Text>
            ) : null}
          </Text>
          <Text variant="meta" tone="muted" style={{ marginLeft: 'auto' }}>
            {t.ago(minutesSince(item.createdAt, now))}
          </Text>
        </View>
        {!settled && item.summary.length > 0 ? (
          <Text tone="muted" numberOfLines={2}>
            {item.summary}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function Post({
  client,
  inbox,
  item,
  requestRef: ref,
  bot,
  now,
  onOpen,
  onSettled,
}: {
  client: HostClient;
  inbox: Inbox | undefined;
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
  const ports = useMemo(
    () => ({
      approval: {
        load: () => loadApproval(client, ref),
        decide: (outcome: Parameters<typeof decideApproval>[2]) =>
          decideApproval(client, ref, outcome),
      },
      question: {
        load: () => loadQuestion(client, ref),
        answer: (answer: Parameters<typeof answerQuestion>[2]) =>
          answerQuestion(client, ref, answer),
      },
    }),
    [client, ref],
  );
  const settled = (result: DecisionResult) => {
    onSettled(item, result);
    void inbox?.refresh();
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
        accessibilityLabel={t.openPost(t.kind[item.kind] ?? t.otherKind, name, item.summary)}
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
        <Text strong numberOfLines={1} style={{ flexShrink: 1 }}>
          {name}
          <Text tone="muted">{where}</Text>
        </Text>
        <Text variant="meta" tone="muted" style={{ marginLeft: 'auto' }}>
          {t.ago(minutesSince(item.createdAt, now))}
        </Text>
      </Pressable>
      {item.kind === 'tool-approval' ? (
        <ApprovalCard port={ports.approval} wide onSettled={settled} />
      ) : (
        <QuestionCard port={ports.question} botName={name} wide onSettled={settled} />
      )}
    </View>
  );
}

export function ActivityFeed({
  client,
  inbox,
  snapshot,
  bot,
  onOpen,
  header,
  now = Date.now(),
}: {
  client: HostClient | undefined;
  inbox: Inbox | undefined;
  snapshot: InboxSnapshot;
  bot(slug: string): RosterBot | undefined;
  onOpen(item: HumanAttentionItem): void;
  header?: ReactElement | null;
  now?: number;
}) {
  const theme = useDesignTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const [held, setHeld] = useState<readonly HumanAttentionItem[]>([]);
  const [filter, setFilter] = useState<ActivityFilter>(ALL_ACTIVITY);
  const rows = feedRows(snapshot, gone, held, filter);
  const sticky = rows.flatMap((row, index) => (row.kind === 'header' ? [index] : []));
  const slugs = activityBots(snapshot);
  const shownBot = filter.bot !== undefined && slugs.includes(filter.bot) ? filter.bot : undefined;
  const settled = (item: HumanAttentionItem, result: DecisionResult) => {
    if (result === 'accepted') setGone((current) => new Set(current).add(item.id));
    else setHeld((current) => [...current.filter((kept) => kept.id !== item.id), item]);
  };
  const refresh = () => {
    setRefreshing(true);
    setHeld([]);
    void inbox?.refresh().finally(() => setRefreshing(false));
  };
  return (
    <Animated.FlatList
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={{ backgroundColor: theme.color.base }}
      data={rows}
      stickyHeaderIndices={sticky}
      keyExtractor={(row) => row.key}
      itemLayoutAnimation={LinearTransition}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={
        <View style={{ gap: space.x3 }}>
          {header}
          {snapshot.status === 'ready' && snapshot.stale !== undefined ? (
            <View style={{ paddingHorizontal: space.x5 }}>
              <Notice tone="warning">{`${t.inboxStale} ${snapshot.stale}`}</Notice>
            </View>
          ) : null}
          {snapshot.status === 'error' ? (
            <View style={{ paddingHorizontal: space.x5 }}>
              <Notice tone="danger">{`${t.inboxFailed} ${snapshot.error}`}</Notice>
            </View>
          ) : null}
          {snapshot.status === 'loading' ? <Loading /> : null}
          {snapshot.status === 'ready' ? (
            <ActivityFilters
              counts={activityCounts(snapshot, gone, held, shownBot)}
              bots={slugs.map((slug) => ({ slug, name: bot(slug)?.displayName ?? slug }))}
              filter={{ ...filter, bot: shownBot }}
              onFilter={setFilter}
            />
          ) : null}
        </View>
      }
      renderItem={({ item: row }) => {
        if (row.kind === 'header')
          return (
            <Text
              accessibilityRole="header"
              variant="meta"
              tone="muted"
              strong
              style={{
                paddingHorizontal: space.x5,
                paddingTop: space.x6,
                paddingBottom: space.x2,
                textTransform: 'uppercase',
                backgroundColor: theme.layer.canvas.fill,
              }}
            >
              {t.sectionCount(t.inboxSections[row.section], row.count)}
            </Text>
          );
        if (row.kind === 'empty')
          return (
            <Text tone="muted" style={{ paddingHorizontal: space.x5 }}>
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
              now={now}
            />
          );
        return (
          <Animated.View exiting={FadeOut.duration(220)}>
            {client === undefined ? null : (
              <Post
                client={client}
                inbox={inbox}
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
  );
}
