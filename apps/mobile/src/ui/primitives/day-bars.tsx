import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { chart } from '../design/chart';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { haptic } from '../haptics';
import { useStrings } from '../strings';
import { Text } from './text';

export interface DayBar {
  key: string;
  segments: readonly number[];
  label?: string | undefined;
}

export interface BarReading {
  label: string;
  value: string;
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

export function peakBar(bars: readonly DayBar[]): number | undefined {
  let best: number | undefined;
  bars.forEach((bar, index) => {
    const total = barTotal(bar);
    if (total > 0 && (best === undefined || total > barTotal(bars[best]!))) best = index;
  });
  return best;
}

export function chartSummary(
  label: string,
  bars: readonly DayBar[],
  read: ((index: number) => BarReading) | undefined,
  phrase: (label: string, peak: string) => string,
): string {
  const peak = peakBar(bars);
  return read === undefined || peak === undefined ? label : phrase(label, read(peak).label);
}

function Callout({ reading, x, width }: { reading: BarReading; x: number; width: number }) {
  const theme = useDesignTheme();
  const ios = Platform.OS === 'ios';
  const half = 56;
  const left = Math.max(0, Math.min(width - half * 2, x - half));
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        position: 'absolute',
        bottom: '100%',
        left,
        width: half * 2,
        alignItems: 'center',
        marginBottom: space.x2,
        zIndex: 1,
      }}
    >
      <View
        style={
          ios
            ? {
                paddingHorizontal: space.x3,
                paddingVertical: space.x2,
                borderRadius: radius.sm,
                borderWidth: edge.hairline,
                borderColor: theme.color.border,
                backgroundColor: theme.layer.raised.fill,
                alignItems: 'center',
              }
            : {
                paddingHorizontal: space.x3,
                paddingVertical: space.x2,
                borderRadius: radius.xs,
                backgroundColor: theme.color.fg,
              }
        }
      >
        {ios ? (
          <>
            <Text variant="meta" tone="muted" numberOfLines={1}>
              {reading.label}
            </Text>
            <Text strong numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
              {reading.value}
            </Text>
          </>
        ) : (
          <Text
            variant="meta"
            numberOfLines={1}
            style={{ color: theme.layer.canvas.fill, fontVariant: ['tabular-nums'] }}
          >
            {`${reading.label} · ${reading.value}`}
          </Text>
        )}
      </View>
    </View>
  );
}

export function DayBars({
  bars,
  colors,
  height,
  empty,
  accessibilityLabel,
  selected: chosen,
  onSelect,
  read,
}: {
  bars: readonly DayBar[];
  colors: readonly string[];
  height: number;
  empty: string;
  accessibilityLabel: string;
  selected?: number | undefined;
  onSelect?: (index?: number) => void;
  read?: (index: number) => BarReading;
}) {
  const theme = useDesignTheme();
  const strings = useStrings();
  const [own, setOwn] = useState<number | undefined>();
  const [width, setWidth] = useState(0);
  const controlled = onSelect !== undefined;
  const selected = controlled ? chosen : own;
  const interactive = controlled || read !== undefined;
  const select = (index?: number) => {
    if (index === selected) return;
    if (index !== undefined) haptic('selection');
    if (controlled) onSelect(index);
    else setOwn(index);
  };
  const heights = barHeights(bars, height);
  const labelled = bars.some((bar) => bar.label !== undefined);
  const ios = Platform.OS === 'ios';
  const at = (x: number) =>
    width === 0 ? 0 : Math.max(0, Math.min(bars.length - 1, Math.floor((x / width) * bars.length)));
  const scrub = Gesture.Pan()
    .enabled(ios && interactive)
    .runOnJS(true)
    .activeOffsetX([-space.x2, space.x2])
    .failOffsetY([-space.x4, space.x4])
    .onStart((event) => select(at(event.x)))
    .onUpdate((event) => select(at(event.x)))
    .onFinalize(() => select(undefined));
  const reading = selected === undefined || read === undefined ? undefined : read(selected);
  const step = (by: number) => {
    const next = selected === undefined ? (by > 0 ? 0 : bars.length - 1) : selected + by;
    if (next >= 0 && next < bars.length) select(next);
  };
  const summary = chartSummary(accessibilityLabel, bars, read, strings.chartPeak);
  const gap = bars.length > 14 ? space.x1 : space.x2;
  const column = (width - gap * (bars.length - 1)) / Math.max(1, bars.length);
  const tops = heights.map((segments) => segments.reduce((sum, value) => sum + value, 0));
  return (
    <GestureDetector gesture={scrub}>
      <View
        accessible
        accessibilityLabel={summary}
        {...(read === undefined
          ? { accessibilityRole: 'image' as const }
          : {
              accessibilityRole: 'adjustable' as const,
              ...(reading === undefined
                ? {}
                : { accessibilityValue: { text: `${reading.label}, ${reading.value}` } }),
              accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
              onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) =>
                step(event.nativeEvent.actionName === 'increment' ? 1 : -1),
            })}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap,
        }}
      >
        {reading === undefined || selected === undefined ? null : (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: ios ? 0 : height - Math.max(chart.stub, tops[selected] ?? 0),
              height: 0,
            }}
          >
            <Callout reading={reading} x={(column + gap) * selected + column / 2} width={width} />
          </View>
        )}
        {bars.map((bar, index) => {
          const segments = heights[index] ?? [];
          const total = segments.reduce((sum, value) => sum + value, 0);
          return (
            <Pressable
              key={bar.key}
              {...(interactive ? { testID: `day-bar-${bar.key}` } : {})}
              disabled={!interactive}
              importantForAccessibility="no"
              onPress={() => select(selected === index ? undefined : index)}
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
                {ios && interactive && selected === index ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      width: edge.hairline,
                      backgroundColor: theme.color.muted,
                    }}
                  />
                ) : null}
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
    </GestureDetector>
  );
}
