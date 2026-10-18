import { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, View, type ViewInstance } from 'react-native';

import { compactTokenCount, weekdayLabel } from '../../host/usage-days';
import { usageWeek, type OverviewUsage } from '../../host/usage';
import { useDesignTheme } from '../design/theme';
import { chart } from '../design/chart';
import type { LayerName } from '../design/layers';
import { androidSettings, radius, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Text } from '../primitives/text';
import { DayBars, type DayBar } from '../primitives/day-bars';
import { t } from '../strings';
import { ChevronRightIcon } from './icons';

export type Loaded<T> =
  | { status: 'loading'; value?: T | undefined }
  | { status: 'ready'; value: T }
  | { status: 'failed'; error: string; value?: T | undefined };

export function useLoaded<T, N>(load: (() => Promise<T>) | undefined) {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' });
  const latest = useRef(0);
  const read = useCallback(
    (next: (() => Promise<T>) | undefined = load) => {
      if (next === undefined) return () => undefined;
      const id = ++latest.current;
      const live = () => latest.current === id;
      setState((current) => ({ status: 'loading', value: current.value }));
      next().then(
        (value) => live() && setState({ status: 'ready', value }),
        (error: unknown) =>
          live() &&
          setState((current) => ({
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            value: current.value,
          })),
      );
      return () => {
        if (live()) latest.current += 1;
      };
    },
    [load],
  );
  const mount = useMounted<N>(() => read(), [read]);
  return { state, read, mount };
}

export function tokenAmount(tokens: number | null, partial = false): string {
  if (tokens === null) return t.usageUnknown;
  return partial ? `${compactTokenCount(tokens)}+` : compactTokenCount(tokens);
}

type Day = { day: string; end?: string; tokens: number | null; partial?: boolean };

export function dayBars(days: readonly Day[]): DayBar[] {
  return days.map(({ day, tokens }) => ({
    key: day,
    segments: [tokens ?? 0],
    ...(days.length <= 7 ? { label: weekdayLabel(day) } : {}),
  }));
}

export function daysLabel(days: readonly Day[]): string {
  return days
    .map(({ day, end, tokens, partial }) =>
      t.usageBar(end === undefined ? day : `${day} – ${end}`, tokenAmount(tokens, partial)),
    )
    .join(', ');
}

const EMPTY_WEEK: DayBar[] = Array.from({ length: 7 }, (_, index) => ({
  key: String(index),
  segments: [0],
}));

export function UsageBars({
  days,
  height,
  on = 'sheet',
  selected,
  onSelect,
}: {
  days: readonly Day[] | undefined;
  height: number;
  on?: LayerName;
  selected?: number | undefined;
  onSelect?: (index?: number) => void;
}) {
  const theme = useDesignTheme();
  return (
    <DayBars
      bars={days === undefined ? EMPTY_WEEK : dayBars(days)}
      colors={[theme.color.accent]}
      height={height}
      empty={theme.layer[on].inset}
      accessibilityLabel={days === undefined ? t.usageLoading : daysLabel(days)}
      selected={selected}
      {...(onSelect === undefined ? {} : { onSelect })}
    />
  );
}

export function UsageCard({
  load,
  on = 'raised',
  onOpen,
}: {
  load: (() => Promise<OverviewUsage>) | undefined;
  on?: LayerName;
  onOpen(): void;
}) {
  const theme = useDesignTheme();
  const { state, read, mount } = useLoaded<OverviewUsage, ViewInstance>(load);
  const week = state.value === undefined ? undefined : usageWeek(state.value);
  const amount = week === undefined ? undefined : tokenAmount(week.total, week.partial);
  return (
    <View ref={mount}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={amount === undefined ? t.usage : t.usageCard(amount)}
        onPress={onOpen}
        style={({ pressed }) => ({
          gap: space.x4,
          padding: space.x5,
          borderRadius: Platform.OS === 'android' ? androidSettings.radius : radius.md,
          backgroundColor: pressed ? theme.layer[on].pressed : theme.layer[on].fill,
        })}
      >
        <View
          style={{
            flexDirection: theme.largeText ? 'column' : 'row',
            alignItems: theme.largeText ? 'flex-start' : 'center',
            gap: space.x3,
          }}
        >
          <Text strong style={theme.largeText ? undefined : { flex: 1 }}>
            {t.usage}
          </Text>
          <Text variant="meta" tone="muted">
            {t.usageWeek}
          </Text>
          <ChevronRightIcon color={theme.color.muted} size={space.x5} />
        </View>
        <Text variant="display">
          {amount === undefined ? '—' : amount}
          <Text tone="muted">{t.usageUnit}</Text>
        </Text>
        {theme.largeText ? null : <UsageBars days={week?.days} height={chart.spark} on={on} />}
      </Pressable>
      {state.status === 'loading' && state.value === undefined ? (
        <Text
          variant="meta"
          tone="muted"
          style={{ padding: space.x3, paddingHorizontal: space.x5 }}
        >
          {t.usageLoading}
        </Text>
      ) : null}
      {state.status === 'failed' ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x3,
            paddingHorizontal: space.x5,
          }}
        >
          <Text variant="meta" tone="danger" style={{ flex: 1 }}>
            {`${t.usageFailed} ${state.error}`}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.tryAgain}
            onPress={() => read()}
            style={{ minHeight: theme.touch, justifyContent: 'center' }}
          >
            <Text tone="accent" strong>
              {t.tryAgain}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
