import { useState } from 'react';
import { Platform, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { LayerName } from '../design/layers';
import { spring } from '../design/motion';
import { segmentCorners } from '../design/segment-corners';
import { useDesignTheme } from '../design/theme';
import { androidSettings, edge, radius, space } from '../design/tokens';
import { SettingsFooter, SettingsHeading } from './settings-row';
import { useSheetGroupFill } from './sheet-group-fill';
import { SystemSymbol } from './system-symbol';
import { dropIndex, type TabOrderItem, type TabOrderListProps } from './tab-order-list-model';
import { Text } from './text';
import { useSystemReducedMotion } from './use-system-reduced-motion';

export type { TabOrderItem, TabOrderListProps } from './tab-order-list-model';

const android = Platform.OS === 'android';

export function TabOrderList({
  title,
  footer,
  items,
  on = 'sheet',
  copy,
  onMove,
}: TabOrderListProps) {
  const theme = useDesignTheme();
  const [heights, setHeights] = useState<Record<string, number>>({});
  const rowHeights = items.map((item) => heights[item.key] ?? theme.touch);
  const gap = android ? androidSettings.segmentGap : 0;
  return (
    <View style={{ gap: android ? androidSettings.sectionGap : space.x2 }}>
      <SettingsHeading>{title}</SettingsHeading>
      <View
        testID="tab-order-list"
        style={android ? { gap } : { borderRadius: radius.md, overflow: 'hidden' }}
      >
        {items.map((item, index) => (
          <TabOrderRow
            key={item.key}
            item={item}
            index={index}
            count={items.length}
            heights={rowHeights}
            gap={gap}
            on={on}
            copy={copy}
            onLayout={(event) => {
              const height = event.nativeEvent.layout.height;
              setHeights((known) =>
                known[item.key] === height ? known : { ...known, [item.key]: height },
              );
            }}
            onMove={onMove}
          />
        ))}
      </View>
      {footer === undefined ? null : <SettingsFooter>{footer}</SettingsFooter>}
    </View>
  );
}

function TabOrderRow({
  item,
  index,
  count,
  heights,
  gap,
  on,
  copy,
  onLayout,
  onMove,
}: {
  item: TabOrderItem;
  index: number;
  count: number;
  heights: readonly number[];
  gap: number;
  on: LayerName;
  copy: TabOrderListProps['copy'];
  onLayout(event: LayoutChangeEvent): void;
  onMove(from: number, destination: number): void;
}) {
  const theme = useDesignTheme();
  const layer = useSheetGroupFill(on);
  const reduced = useSystemReducedMotion();
  const offset = useSharedValue(0);
  const lifted = useSharedValue(0);
  const spaced = heights.map((height) => height + gap);
  const commit = (translation: number) => {
    const destination = dropIndex(spaced, index, translation);
    if (destination !== index && destination !== index + 1) onMove(index, destination);
  };
  const pan = Gesture.Pan()
    .onStart(() => {
      lifted.value = 1;
    })
    .onUpdate((event) => {
      offset.value = event.translationY;
    })
    .onEnd((event) => {
      runOnJS(commit)(event.translationY);
    })
    .onFinalize(() => {
      lifted.value = 0;
      offset.value = reduced ? 0 : withSpring(0, spring.release);
    });
  const moving = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
    zIndex: lifted.value,
    backgroundColor: lifted.value === 1 ? layer.pressed : layer.fill,
  }));
  const actions = [
    ...(index > 0 ? [{ name: 'up', label: copy.moveUp(item.label) }] : []),
    ...(index < count - 1 ? [{ name: 'down', label: copy.moveDown(item.label) }] : []),
  ];
  const first = index === 0;
  const last = index === count - 1;
  return (
    <Animated.View
      onLayout={onLayout}
      testID={`tab-order-${item.key}`}
      accessible
      accessibilityLabel={item.label}
      accessibilityValue={{ text: copy.position(index + 1, count) }}
      accessibilityActions={actions}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'up') onMove(index, index - 1);
        if (event.nativeEvent.actionName === 'down') onMove(index, index + 2);
      }}
      style={[
        {
          minHeight: android ? androidSettings.rowHeight : theme.touch,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x4,
          paddingLeft: space.x5,
          ...(android
            ? segmentCorners(first, last)
            : { borderBottomWidth: last ? 0 : edge.hairline, borderColor: layer.divider }),
        },
        moving,
      ]}
    >
      {item.avatar ?? (
        <SystemSymbol
          name={item.symbol}
          size={theme.type.title.line * theme.fontScale}
          color={theme.color.fg}
        />
      )}
      <Text style={{ flex: 1, paddingVertical: space.x3 }}>{item.label}</Text>
      <GestureDetector gesture={pan}>
        <View
          testID={`tab-order-handle-${item.key}`}
          style={{
            minWidth: theme.touch,
            minHeight: theme.touch,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SystemSymbol
            name={{ ios: 'line.3.horizontal', android: 'drag_handle' }}
            size={theme.type.title.line * theme.fontScale}
            color={theme.color.muted}
          />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}
