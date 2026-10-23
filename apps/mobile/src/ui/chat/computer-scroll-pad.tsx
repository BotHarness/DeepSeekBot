import { useLayoutEffect, useMemo, type ReactNode } from 'react';
import { AppState, type ViewInstance } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { createHeldScroll } from '../../host/held-scroll';
import { buttonColors } from '../design/controls';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { useMounted } from '../mounted';

export function ComputerScrollPad({
  enabled,
  compact,
  onScroll,
  children,
}: {
  enabled: boolean;
  compact: boolean;
  children?: ReactNode;
  onScroll(axis: 'horizontal' | 'vertical', steps: number): Promise<boolean>;
}) {
  const theme = useDesignTheme();
  const colors = buttonColors(theme, 'secondary', 'canvas');
  const size = useSharedValue({ width: theme.touch * 2, height: theme.touch * 1.5 });
  const thumb = useSharedValue({ x: 0, y: 0 });
  const repeat = useMemo(() => createHeldScroll(), []);
  useLayoutEffect(() => {
    repeat.configure(enabled && AppState.currentState === 'active', onScroll);
    const subscription = AppState.addEventListener('change', (state) => {
      repeat.configure(enabled && state === 'active', onScroll);
    });
    return () => subscription.remove();
  }, [repeat, enabled, onScroll]);
  const mount = useMounted<ViewInstance>(() => {
    return () => {
      repeat.configure(false, async () => false);
    };
  }, [repeat]);
  const dragging = useSharedValue(false);
  const gesture = Gesture.Pan()
    .enabled(enabled)
    .maxPointers(1)
    .minDistance(3)
    .onStart(() => {
      scheduleOnRN(repeat.start);
      dragging.set(true);
    })
    .onUpdate((event) => {
      const bounds = size.get();
      thumb.set({
        x: Math.max(
          -bounds.width / 2 + space.x5,
          Math.min(bounds.width / 2 - space.x5, event.translationX),
        ),
        y: Math.max(
          -bounds.height / 2 + space.x5,
          Math.min(bounds.height / 2 - space.x5, event.translationY),
        ),
      });
      scheduleOnRN(repeat.move, {
        x: event.translationX / Math.max(1, bounds.width / 2 - space.x5),
        y: event.translationY / Math.max(1, bounds.height / 2 - space.x5),
      });
    })
    .onFinalize(() => {
      dragging.set(false);
      scheduleOnRN(repeat.stop);
      thumb.set({ x: 0, y: 0 });
    });
  const thumbStyle = useAnimatedStyle(() => ({
    opacity: dragging.get() ? 1 : 0,
    transform: [{ translateX: thumb.get().x }, { translateY: thumb.get().y }],
  }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        ref={mount}
        testID="computer-video-scroll-pad"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t.computerVideoScrollPad}
        accessibilityHint={t.computerVideoScrollPadHint}
        accessibilityState={{ disabled: !enabled }}
        accessibilityActions={[
          { name: 'increment', label: t.computerVideoScrollDown },
          { name: 'decrement', label: t.computerVideoScrollUp },
          { name: 'scroll-left', label: t.computerVideoScrollLeft },
          { name: 'scroll-right', label: t.computerVideoScrollRight },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (!enabled) return;
          const action = nativeEvent.actionName;
          if (action === 'increment' || action === 'decrement')
            onScroll('vertical', action === 'increment' ? 1 : -1);
          if (action === 'scroll-left' || action === 'scroll-right')
            onScroll('horizontal', action === 'scroll-right' ? 1 : -1);
        }}
        onLayout={({ nativeEvent }) => size.set(nativeEvent.layout)}
        style={{
          flex: 1,
          minWidth: theme.touch,
          minHeight: theme.touch * (compact ? 1.25 : 1.5),
          borderRadius: radius.md,
          backgroundColor: colors.fill,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {children ?? (
          <Text variant="meta" tone={enabled ? 'fg' : 'muted'}>
            {t.computerVideoScrollPad}
          </Text>
        )}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              width: space.x6,
              height: space.x6,
              borderRadius: radius.round,
              borderWidth: edge.focus,
              borderColor: colors.label,
              backgroundColor: theme.layer.well.fill,
            },
            thumbStyle,
          ]}
        />
      </Animated.View>
    </GestureDetector>
  );
}
