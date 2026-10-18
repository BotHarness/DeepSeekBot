import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, View, type ViewInstance } from 'react-native';

import type { RosterBot } from '../host/client';
import { MethodRefused } from '../host/client';
import {
  USAGE_SPLIT,
  usageIsPartial,
  usageShare,
  usageWeek,
  usageChartDays,
  type OverviewMemory,
  type OverviewUsage,
  type UsagePeriod,
} from '../host/usage';
import type { MemoryActivityBot, UsageBot } from '../host/wire';
import { BotAvatar } from './bot-avatar';
import { useDesignTheme } from './design/theme';
import { chart } from './design/chart';
import { space } from './design/tokens';
import { useMounted } from './mounted';
import { Button } from './primitives/button';
import { Segmented } from './primitives/segmented';
import { SettingsGroupItem, SettingsRow, SettingsSection } from './primitives/settings-row';
import { Text } from './primitives/text';
import { DayBars } from './primitives/day-bars';
import { dayLabel } from '../host/usage-days';
import { ChevronRightIcon } from './shell/icons';
import { tokenAmount, UsageBars, useLoaded, type Loaded } from './shell/usage-card';
import { t } from './strings';

const AVATAR = 28;
const SPARK_WIDTH = space.x6 * 3;

export interface UsageSources {
  loadUsage(period: UsagePeriod): Promise<OverviewUsage>;
  loadMoreUsage(current: OverviewUsage): Promise<OverviewUsage>;
  loadMemory(): Promise<OverviewMemory>;
  loadMoreMemory(current: OverviewMemory): Promise<OverviewMemory>;
}

type Row =
  | { kind: 'bot'; bot: UsageBot; total: number | null }
  | { kind: 'memory'; bot: MemoryActivityBot }
  | { kind: 'note'; text: string; tone: 'muted' | 'danger'; retry?: () => void }
  | { kind: 'loading' }
  | { kind: 'more'; busy: boolean; onPress(): void };

type Framed = Row & { key: string; first: boolean; last: boolean };

function frame(prefix: string, rows: Row[]): Framed[] {
  return rows.map((row, index) => ({
    ...row,
    key: `${prefix}:${row.kind === 'bot' || row.kind === 'memory' ? row.bot.slug : row.kind}`,
    first: index === 0,
    last: index === rows.length - 1,
  }));
}

function stateRows<T>(
  state: Loaded<T>,
  retry: () => void,
  rows: (value: T) => Row[],
  more: (value: T) => Row | undefined,
): Row[] {
  if (state.value === undefined) {
    if (state.status === 'failed')
      return [{ kind: 'note', tone: 'danger', text: `${t.usageFailed} ${state.error}`, retry }];
    return [{ kind: 'loading' }];
  }
  const tail = more(state.value);
  return [
    ...rows(state.value),
    ...(state.status === 'failed'
      ? [{ kind: 'note', tone: 'danger', text: `${t.usageFailed} ${state.error}`, retry } as Row]
      : []),
    ...(tail === undefined ? [] : [tail]),
  ];
}

function forPeriod(state: Loaded<OverviewUsage>, period: UsagePeriod): Loaded<OverviewUsage> {
  if (state.value === undefined || state.value.period === period) return state;
  return state.status === 'failed'
    ? { status: 'failed', error: state.error }
    : { status: 'loading' };
}

function UsageSummary({
  state,
  period,
  onPeriod,
  extended,
}: {
  state: Loaded<OverviewUsage>;
  period: UsagePeriod;
  onPeriod(period: UsagePeriod): void;
  extended: boolean;
}) {
  const usage = forPeriod(state, period).value;
  const week = usage === undefined ? undefined : usageWeek(usage);
  const [picked, setPicked] = useState<number>();
  const days = usage === undefined ? undefined : usageChartDays(usage);
  const day = period !== 'today' && picked !== undefined ? days?.[picked] : undefined;
  const notes =
    usage === undefined
      ? []
      : [
          usage.freshness === 'reconciling' ? t.usageReconciling : undefined,
          usage.freshness === 'degraded' ? t.usageDegraded : undefined,
          usageIsPartial(usage) ? t.usagePartial : undefined,
        ].filter((note) => note !== undefined);
  return (
    <View style={{ gap: space.x6, paddingBottom: space.x3 }}>
      <View style={{ paddingHorizontal: space.x5 }}>
        <Segmented
          compact
          label={t.usagePeriod}
          value={period}
          options={[
            { value: 'today', label: t.usageToday },
            { value: 'week', label: t.usagePeriodWeek },
            ...(extended
              ? [
                  { value: 'month' as const, label: t.usageMonth },
                  { value: 'quarter' as const, label: t.usageQuarter },
                ]
              : []),
          ]}
          onChange={(next) => {
            setPicked(undefined);
            onPeriod(next);
          }}
        />
      </View>
      <View style={{ gap: space.x4, paddingHorizontal: space.x5 }}>
        <View style={{ gap: space.x1 }}>
          <Text variant="meta" tone="muted">
            {usage === undefined
              ? t.usageLoading
              : day !== undefined
                ? day.end === undefined
                  ? dayLabel(day.day)
                  : `${dayLabel(day.day)} – ${dayLabel(day.end)}`
                : usage.start === usage.end
                  ? usage.end
                  : `${usage.start} – ${usage.end}`}
          </Text>
          <Text variant="display" accessibilityRole="header" numberOfLines={1}>
            {week === undefined
              ? '—'
              : day !== undefined
                ? tokenAmount(day.tokens, day.partial === true)
                : tokenAmount(week.total, week.partial)}
            <Text tone="muted">{t.usageUnit}</Text>
          </Text>
        </View>
        {period !== 'today' && days !== undefined ? (
          <UsageBars days={days} height={chart.plot} selected={picked} onSelect={setPicked} />
        ) : null}
        {notes.map((note) => (
          <Text key={note} variant="meta" tone="muted">
            {note}
          </Text>
        ))}
      </View>
      {usage === undefined ? null : (
        <View style={{ paddingHorizontal: space.x5 }}>
          <SettingsSection on="raised" title={t.usageKinds}>
            {USAGE_SPLIT.map((kind) => (
              <SettingsRow
                on="raised"
                key={kind}
                title={t.usageKind[kind]}
                trailing={
                  <Text tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
                    {tokenAmount(usage.totals[kind])}
                  </Text>
                }
              />
            ))}
          </SettingsSection>
        </View>
      )}
    </View>
  );
}

function UsageRow({
  row,
  roster,
  onOpenBot,
}: {
  row: Framed;
  roster: readonly RosterBot[];
  onOpenBot(slug: string): void;
}) {
  const theme = useDesignTheme();
  if (row.kind === 'more')
    return (
      <View style={{ paddingHorizontal: space.x5, paddingTop: space.x3 }}>
        <Button label={t.usageMore} busy={row.busy} on="canvas" onPress={row.onPress} />
      </View>
    );
  let body;
  if (row.kind === 'loading')
    body = (
      <View
        style={{
          minHeight: theme.touch,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x3,
          paddingHorizontal: space.x5,
        }}
      >
        <ActivityIndicator />
        <Text variant="meta" tone="muted">
          {t.profileLoading}
        </Text>
      </View>
    );
  else if (row.kind === 'note')
    body = (
      <View style={{ gap: space.x2, paddingHorizontal: space.x5, paddingVertical: space.x4 }}>
        <Text tone={row.tone}>{row.text}</Text>
        {row.retry === undefined ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.tryAgain}
            onPress={row.retry}
            style={{ minHeight: theme.touch, justifyContent: 'center', alignSelf: 'flex-start' }}
          >
            <Text tone="accent" strong>
              {t.tryAgain}
            </Text>
          </Pressable>
        )}
      </View>
    );
  else if (row.kind === 'bot') {
    const { bot } = row;
    const current = bot.current ? roster.find((entry) => entry.slug === bot.slug) : undefined;
    const share = usageShare(bot.totalTokens, row.total);
    body = (
      <SettingsRow
        on="raised"
        title={bot.displayName}
        {...(!bot.current
          ? { detail: t.usageRemoved }
          : share === undefined
            ? {}
            : { detail: t.usageShare(share) })}
        leading={
          current === undefined ? undefined : <BotAvatar bot={current} size={AVATAR} ring={false} />
        }
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
            <Text tone="muted">{tokenAmount(bot.totalTokens, bot.partial === true)}</Text>
            {bot.current ? <ChevronRightIcon color={theme.color.muted} size={space.x5} /> : null}
          </View>
        }
        onPress={bot.current ? () => onOpenBot(bot.slug) : undefined}
      />
    );
  } else {
    const { bot } = row;
    body = (
      <SettingsRow
        on="raised"
        title={bot.displayName}
        detail={bot.state === 'ready' ? t.memoryChanges(bot.total) : t.memoryUnavailable}
        trailing={
          bot.state === 'ready' ? (
            <View style={{ width: SPARK_WIDTH }}>
              <DayBars
                bars={bot.counts.map((value, index) => ({ key: String(index), segments: [value] }))}
                colors={[theme.color.accent]}
                height={space.x6}
                empty={theme.layer.sheet.inset}
                accessibilityLabel={t.memoryChanges(bot.total)}
              />
            </View>
          ) : undefined
        }
      />
    );
  }
  return (
    <SettingsGroupItem on="raised" first={row.first} last={row.last}>
      {body}
    </SettingsGroupItem>
  );
}

export function UsageView({
  sources,
  roster,
  onOpenBot,
}: {
  sources: UsageSources;
  roster: readonly RosterBot[];
  onOpenBot(slug: string): void;
}) {
  const theme = useDesignTheme();
  const [period, setPeriod] = useState<UsagePeriod>('week');
  const [extendedSource, setExtendedSource] = useState<UsageSources>();
  const extended = extendedSource === sources;
  const capability = useMounted<SectionList<Framed>>(() => {
    let live = true;
    void sources.loadUsage('month').then(
      (value) => {
        if (live && value.period === 'month') setExtendedSource(sources);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [sources]);
  const selectedPeriod = extended || period === 'today' ? period : 'week';
  const loadUsage = useMemo(
    () => async () => {
      try {
        return await sources.loadUsage(selectedPeriod);
      } catch (error) {
        if (
          (selectedPeriod === 'month' || selectedPeriod === 'quarter') &&
          error instanceof MethodRefused &&
          error.code === 'invalid-input'
        ) {
          setExtendedSource(undefined);
          setPeriod('week');
          return sources.loadUsage('week');
        }
        throw error;
      }
    },
    [sources, selectedPeriod],
  );
  const loadMemory = useMemo(() => () => sources.loadMemory(), [sources]);
  const usage = useLoaded<OverviewUsage, ViewInstance>(loadUsage);
  const memory = useLoaded<OverviewMemory, ViewInstance>(loadMemory);
  const current = forPeriod(usage.state, selectedPeriod);

  const sections = [
    {
      key: 'bots',
      title: t.usageBots,
      data: frame(
        'bots',
        stateRows(
          current,
          () => usage.read(),
          (value) =>
            value.bots.length === 0
              ? [{ kind: 'note', tone: 'muted', text: t.usageBotsEmpty }]
              : value.bots.map((bot) => ({ kind: 'bot', bot, total: value.totals.totalTokens })),
          (value) =>
            value.nextCursor === undefined
              ? undefined
              : {
                  kind: 'more',
                  busy: usage.state.status === 'loading',
                  onPress: () => usage.read(() => sources.loadMoreUsage(value)),
                },
        ),
      ),
    },
    {
      key: 'memory',
      title: t.memoryActivity,
      data: frame(
        'memory',
        stateRows(
          memory.state,
          () => memory.read(),
          (value) =>
            value.bots.length === 0
              ? [{ kind: 'note', tone: 'muted', text: t.memoryActivityEmpty }]
              : value.bots.map((bot) => ({ kind: 'memory', bot })),
          (value) =>
            value.nextCursor === undefined
              ? undefined
              : {
                  kind: 'more',
                  busy: memory.state.status === 'loading',
                  onPress: () => memory.read(() => sources.loadMoreMemory(value)),
                },
        ),
      ),
    },
  ];

  return (
    <View ref={usage.mount} style={{ flex: 1, backgroundColor: theme.overlay.fill }}>
      <View ref={memory.mount} style={{ flex: 1 }}>
        <SectionList
          nestedScrollEnabled
          ref={capability}
          sections={sections}
          keyExtractor={(row) => row.key}
          stickySectionHeadersEnabled={false}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingVertical: space.x5 }}
          ListHeaderComponent={
            <UsageSummary
              key={selectedPeriod}
              state={usage.state}
              period={selectedPeriod}
              onPeriod={setPeriod}
              extended={extended}
            />
          }
          renderSectionHeader={({ section }) => (
            <Text
              accessibilityRole="header"
              variant="meta"
              tone="muted"
              style={{
                paddingHorizontal: space.x5 * 2,
                paddingTop: space.x6,
                paddingBottom: space.x2,
              }}
            >
              {section.title}
            </Text>
          )}
          renderSectionFooter={({ section }) =>
            section.key === 'memory' ? (
              <Text
                variant="meta"
                tone="muted"
                style={{ paddingHorizontal: space.x5 * 2, paddingTop: space.x2 }}
              >
                {t.memoryActivityHint}
              </Text>
            ) : null
          }
          renderItem={({ item }) => <UsageRow row={item} roster={roster} onOpenBot={onOpenBot} />}
        />
      </View>
    </View>
  );
}
