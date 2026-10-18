import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
  type ScrollViewInstance,
} from 'react-native';

import {
  ACTIVITY_WINDOWS,
  activityDetail,
  newerWindow,
  olderWindow,
  type ActivityDetail,
  type ActivityWindow,
  type ModelUsage,
} from '../../host/bot-activity';
import type { RosterBot } from '../../host/client';
import { compactTokenCount, dayLabel, weekdayLabel } from '../../host/usage-days';
import type { ProfileActivity } from '../../host/wire';
import { botColor } from '../bot-color';
import { chart, heatTones, seriesTones } from '../design/chart';
import { AccentProvider, useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { DayBars } from '../primitives/day-bars';
import { DayHeat } from '../primitives/day-heat';
import { Segmented } from '../primitives/segmented';
import { Text } from '../primitives/text';
import { ChevronLeftIcon, ChevronRightIcon } from '../shell/icons';
import { t } from '../strings';
import { tokenTotalText } from './activity-glance';

const ICON = 20;

export type ActivityQuery = { weeks: ActivityWindow; before?: string };

type Loaded =
  | { status: 'loading' }
  | { status: 'ready'; value: ProfileActivity }
  | { status: 'failed'; error: string };

function percent(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.round((part / whole) * 100);
}

function Heading({ children }: { children: string }) {
  return (
    <Text
      accessibilityRole="header"
      variant="meta"
      tone="muted"
      strong
      style={{
        paddingHorizontal: space.x5,
        paddingTop: space.x5,
        paddingBottom: space.x3,
      }}
    >
      {children}
    </Text>
  );
}

function Card({ children }: { children: ReactNode }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        gap: space.x4,
        paddingHorizontal: space.x5,
        paddingVertical: space.x4,
        borderRadius: radius.md,
        backgroundColor: theme.layer.raised.fill,
      }}
    >
      {children}
    </View>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <View
      style={{
        width: space.x3,
        height: space.x3,
        borderRadius: radius.xs,
        backgroundColor: color,
      }}
    />
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
      <Swatch color={color} />
      <Text variant="meta" tone="muted" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="meta" strong>
        {value}
      </Text>
    </View>
  );
}

function barLabel(detail: ActivityDetail, day: string): string | undefined {
  return detail.buckets.length <= 7 ? weekdayLabel(day) : undefined;
}

function nullableCount(value: number | null): string {
  return value === null ? t.activityUnknown : compactTokenCount(value);
}

function ModelRow({ model, last }: { model: ModelUsage; last: boolean }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        paddingBottom: last ? 0 : space.x4,
        borderBottomWidth: last ? 0 : edge.hairline,
        borderBottomColor: theme.color.divider,
      }}
    >
      <View style={{ flex: 1, gap: space.x1 }}>
        <Text numberOfLines={1}>{model.model === '' ? t.activityUnknown : model.model}</Text>
        <Text variant="meta" tone="muted" numberOfLines={2}>
          {[
            model.provider,
            `${t.activityInput} ${nullableCount(model.input)}`,
            `${t.activityCached} ${nullableCount(model.cacheRead)}`,
            `${t.activityOutput} ${nullableCount(model.output)}`,
          ]
            .filter((part) => part !== '')
            .join(' · ')}
        </Text>
      </View>
      <Text strong>{nullableCount(model.total)}</Text>
    </View>
  );
}

function TokenCard({ detail, range }: { detail: ActivityDetail; range: string }) {
  const theme = useDesignTheme();
  const tones = seriesTones(theme, 3, theme.layer.raised.fill);
  const total = tokenTotalText(detail.total, false);
  const read = detail.split.cached + detail.split.uncached;
  const label = t.activityTokens(total);
  return (
    <>
      <Heading>{t.activityTokensLabel}</Heading>
      <Card>
        <Text variant="title">{label}</Text>
        <DayBars
          bars={detail.buckets.map((bucket) => ({
            key: bucket.key,
            segments: [bucket.split.cached, bucket.split.uncached, bucket.split.output],
            label: barLabel(detail, bucket.first),
          }))}
          colors={tones}
          height={chart.plot}
          empty={theme.layer.raised.inset}
          accessibilityLabel={t.activityChart(t.activityTokensLabel, range, label)}
        />
        <View style={{ gap: space.x3 }}>
          <LegendRow
            color={tones[0]!}
            label={t.activityCached}
            value={compactTokenCount(detail.split.cached)}
          />
          <LegendRow
            color={tones[1]!}
            label={t.activityInput}
            value={compactTokenCount(detail.split.uncached)}
          />
          <LegendRow
            color={tones[2]!}
            label={t.activityOutput}
            value={compactTokenCount(detail.split.output)}
          />
        </View>
        {detail.total.status === 'unknown' ? null : (
          <Text variant="meta" tone="muted">
            {t.activityShares(
              percent(detail.split.cached, read),
              percent(detail.split.output, read + detail.split.output),
            )}
          </Text>
        )}
        {detail.total.status === 'partial' ||
        detail.total.status === 'unknown' ||
        detail.models.some(
          (model) =>
            model.input === null ||
            model.output === null ||
            model.cacheRead === null ||
            model.cacheWrite === null,
        ) ? (
          <Text variant="meta" tone="muted">
            {t.usagePartial}
          </Text>
        ) : null}
      </Card>
      {detail.models.length === 0 ? null : (
        <>
          <Heading>{t.activityByModel}</Heading>
          <Card>
            {detail.models.map((model, index) => (
              <ModelRow key={model.key} model={model} last={index === detail.models.length - 1} />
            ))}
          </Card>
        </>
      )}
    </>
  );
}

function EventsCard({ detail, range }: { detail: ActivityDetail; range: string }) {
  const theme = useDesignTheme();
  const total = t.activityCount(detail.events);
  return (
    <>
      <Heading>{t.activityEvents}</Heading>
      <Card>
        <Text variant="title">{total}</Text>
        <DayBars
          bars={detail.buckets.map((bucket) => ({
            key: bucket.key,
            segments: [bucket.events],
            label: barLabel(detail, bucket.first),
          }))}
          colors={[theme.color.accent]}
          height={chart.spark}
          empty={theme.layer.raised.inset}
          accessibilityLabel={t.activityChart(t.activityEvents, range, total)}
        />
        {detail.reasons.length === 0 ? (
          <Text tone="muted">{t.activityEmpty}</Text>
        ) : (
          <View style={{ gap: space.x3 }}>
            {detail.reasons.map((entry) => (
              <View
                key={entry.reason}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.x3,
                }}
              >
                <Text variant="meta" tone="muted" style={{ flex: 1 }}>
                  {t.activityReason[entry.reason] ?? entry.reason}
                </Text>
                <Text variant="meta" strong>
                  {String(entry.count)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </>
  );
}

function MemoryCard({ detail, range }: { detail: ActivityDetail; range: string }) {
  const theme = useDesignTheme();
  const total = t.activityCount(detail.commits);
  return (
    <>
      <Heading>{t.activityMemory}</Heading>
      <Card>
        <Text variant="title">{total}</Text>
        <DayHeat
          first={detail.first}
          last={detail.last}
          counts={detail.commitDays}
          tones={heatTones(theme, theme.layer.raised.fill, theme.layer.raised.inset)}
          accessibilityLabel={t.activityChart(t.activityMemory, range, total)}
        />
        {detail.commits === 0 ? <Text tone="muted">{t.activityEmpty}</Text> : null}
      </Card>
    </>
  );
}

function PageButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: theme.touch,
        height: theme.touch,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.round,
        opacity: disabled ? 0.35 : 1,
        backgroundColor: pressed ? theme.layer.canvas.pressed : 'transparent',
      })}
    >
      {icon}
    </Pressable>
  );
}

function Detail({
  activity,
  onQuery,
}: {
  activity: ProfileActivity;
  onQuery(query: ActivityQuery): void;
}) {
  const theme = useDesignTheme();
  const detail = activityDetail(activity);
  const range = t.activityRange(dayLabel(detail.first), dayLabel(detail.last));
  const weeks = activity.weeks as ActivityWindow;
  const newer = newerWindow(activity);
  const reachedStart = activity.createdDay !== undefined && detail.first <= activity.createdDay;
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
        <PageButton
          label={t.activityEarlier}
          icon={<ChevronLeftIcon color={theme.color.fg} size={ICON} />}
          disabled={reachedStart}
          onPress={() => onQuery({ weeks, before: olderWindow(activity) })}
        />
        <Text strong style={{ flex: 1, textAlign: 'center' }}>
          {range}
        </Text>
        <PageButton
          label={t.activityLater}
          icon={<ChevronRightIcon color={theme.color.fg} size={ICON} />}
          disabled={activity.before === undefined}
          onPress={() => onQuery(newer === undefined ? { weeks } : { weeks, before: newer })}
        />
      </View>
      <TokenCard detail={detail} range={range} />
      <EventsCard detail={detail} range={range} />
      <MemoryCard detail={detail} range={range} />
    </>
  );
}

export function ActivityDetailView({
  bot,
  load,
}: {
  bot: RosterBot;
  load: (query: ActivityQuery) => Promise<ProfileActivity>;
}) {
  const theme = useDesignTheme();
  const [query, setQuery] = useState<ActivityQuery>({
    weeks: ACTIVITY_WINDOWS[0],
  });
  const [state, setState] = useState<Loaded>({ status: 'loading' });
  const latest = useRef(0);
  const read = useCallback(
    (next: ActivityQuery) => {
      const request = ++latest.current;
      setQuery(next);
      setState({ status: 'loading' });
      load(next).then(
        (value) => {
          if (request === latest.current) setState({ status: 'ready', value });
        },
        (error: unknown) => {
          if (request === latest.current)
            setState({
              status: 'failed',
              error: error instanceof Error ? error.message : String(error),
            });
        },
      );
    },
    [load],
  );
  const mount = useMounted<ScrollViewInstance>(() => read({ weeks: ACTIVITY_WINDOWS[0] }), [read]);
  return (
    <AccentProvider accent={botColor(bot)}>
      <ScrollView
        ref={mount}
        style={{ flex: 1, backgroundColor: theme.overlay.fill }}
        contentContainerStyle={{ padding: space.x5, gap: space.x3 }}
      >
        <Segmented
          label={t.activityWindowLabel}
          options={ACTIVITY_WINDOWS.map((weeks) => ({
            value: String(weeks),
            label: t.activityWindow[weeks] ?? String(weeks),
          }))}
          value={String(query.weeks)}
          onChange={(value) => read({ weeks: Number(value) as ActivityWindow })}
        />
        {state.status === 'ready' ? (
          <Detail activity={state.value} onQuery={read} />
        ) : state.status === 'loading' ? (
          <View style={{ padding: space.x6, alignItems: 'center' }}>
            <ActivityIndicator />
          </View>
        ) : (
          <View style={{ gap: space.x3, paddingTop: space.x3 }}>
            <Text variant="meta" tone="danger">{`${t.profileFailed} ${state.error}`}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.tryAgain}
              onPress={() => read(query)}
              style={{
                minHeight: theme.touch,
                justifyContent: 'center',
                alignSelf: 'flex-start',
              }}
            >
              <Text tone="accent" strong>
                {t.tryAgain}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </AccentProvider>
  );
}
