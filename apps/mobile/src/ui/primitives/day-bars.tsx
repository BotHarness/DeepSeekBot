import { Pressable, View } from 'react-native';

import { chart } from '../design/chart';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from './text';

export interface DayBar {
  key: string;
  segments: readonly number[];
  label?: string | undefined;
}

export function barTotal(bar: DayBar): number {
  return bar.segments.reduce((sum, value) => sum + Math.max(0, value), 0);
}

export function barHeights(bars: readonly DayBar[], height: number): number[][] {
  const peak = Math.max(0, ...bars.map(barTotal));
  return bars.map((bar) =>
    bar.segments.map((value) => (peak === 0 ? 0 : (Math.max(0, value) / peak) * height)),
  );
}

export function DayBars({
  bars,
  colors,
  height,
  empty,
  accessibilityLabel,
  selected,
  onSelect,
}: {
  bars: readonly DayBar[];
  colors: readonly string[];
  height: number;
  empty: string;
  accessibilityLabel: string;
  selected?: number | undefined;
  onSelect?: (index?: number) => void;
}) {
  const theme = useDesignTheme();
  const heights = barHeights(bars, height);
  const labelled = bars.some((bar) => bar.label !== undefined);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: bars.length > 14 ? space.x1 : space.x2,
      }}
    >
      {bars.map((bar, index) => {
        const segments = heights[index] ?? [];
        const total = segments.reduce((sum, value) => sum + value, 0);
        return (
          <Pressable
            key={bar.key}
            {...(onSelect === undefined ? {} : { testID: `day-bar-${bar.key}` })}
            disabled={onSelect === undefined}
            onPress={() => onSelect?.(selected === index ? undefined : index)}
            style={{
              flex: 1,
              alignItems: 'center',
              gap: space.x2,
              opacity: selected === undefined || selected === index ? 1 : chart.dim,
            }}
          >
            <View
              style={{ height, width: '100%', alignItems: 'center', justifyContent: 'flex-end' }}
            >
              {total === 0 ? (
                <View
                  style={{
                    width: '100%',
                    maxWidth: chart.bar,
                    height: chart.stub,
                    borderRadius: radius.xs,
                    backgroundColor: empty,
                  }}
                />
              ) : (
                <View
                  style={{
                    width: '100%',
                    maxWidth: chart.bar,
                    height: Math.max(chart.stub, total),
                    borderTopLeftRadius: radius.xs,
                    borderTopRightRadius: radius.xs,
                    overflow: 'hidden',
                    flexDirection: 'column-reverse',
                  }}
                >
                  {segments.map((value, segment) =>
                    value === 0 ? null : (
                      <View
                        key={segment}
                        style={{
                          height: total < chart.stub ? chart.stub : value,
                          backgroundColor: colors[segment] ?? theme.color.accent,
                        }}
                      />
                    ),
                  )}
                </View>
              )}
            </View>
            {labelled ? (
              <Text variant="meta" tone="muted" numberOfLines={1}>
                {bar.label ?? ''}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
