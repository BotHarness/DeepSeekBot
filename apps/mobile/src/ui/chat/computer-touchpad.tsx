import { Gesture, GestureDetector, type GestureTouchEvent } from 'react-native-gesture-handler';
import { View } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { emptyPad, updatePad } from './computer-trackpad-gestures';
import { buttonColors } from '../design/controls';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';

export function ComputerTouchpad({
  enabled,
  cursor,
  frame,
  onClick,
  onScroll,
}: {
  enabled: boolean;
  cursor: SharedValue<{ x: number; y: number }>;
  frame: { width: number; height: number };
  onClick(point: { x: number; y: number }, button: 'left' | 'right'): void;
  onScroll(point: { x: number; y: number }, axis: 'horizontal' | 'vertical', steps: number): void;
}) {
  const theme = useDesignTheme();
  const colors = buttonColors(theme, 'secondary', 'canvas');
  const state = useSharedValue(emptyPad());
  const width = useSharedValue(theme.touch * 6);
  const handle = (event: GestureTouchEvent, phase: 'down' | 'move' | 'up') => {
    'worklet';
    const touches = event.allTouches.filter(
      (t) => phase !== 'up' || !event.changedTouches.some((c) => c.id === t.id),
    );
    const next = updatePad(
      state.get(),
      phase,
      touches,
      Date.now(),
      phase === 'up' ? event.changedTouches : [],
    );
    state.set(next.state);
    if (!enabled) return;
    if (next.move) {
      const at = cursor.get();
      const speed = frame.width / Math.max(1, width.get());
      cursor.set({
        x: Math.max(0, Math.min(frame.width - 1, at.x + next.move.x * speed)),
        y: Math.max(0, Math.min(frame.height - 1, at.y + next.move.y * speed)),
      });
    }
    if (next.scroll?.x) scheduleOnRN(onScroll, cursor.get(), 'horizontal', next.scroll.x);
    if (next.scroll?.y) scheduleOnRN(onScroll, cursor.get(), 'vertical', next.scroll.y);
    if (next.click) scheduleOnRN(onClick, cursor.get(), next.click);
  };
  const gesture = Gesture.Manual()
    .enabled(enabled)
    .onTouchesDown((event, manager) => {
      manager.activate();
      handle(event, 'down');
    })
    .onTouchesMove((event) => handle(event, 'move'))
    .onTouchesUp((event, manager) => {
      handle(event, 'up');
      if (state.get().touches.length === 0) manager.end();
    })
    .onTouchesCancelled((_event, manager) => {
      state.set(emptyPad());
      manager.fail();
    })
    .onFinalize(() => state.set(emptyPad()));
  return (
    <GestureDetector gesture={gesture}>
      <View
        testID="computer-video-touchpad"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t.computerTouchpad}
        accessibilityHint={t.computerTouchpadHint}
        accessibilityState={{ disabled: !enabled }}
        accessibilityActions={[
          { name: 'activate', label: t.computerLeftClick },
          { name: 'longpress', label: t.computerRightClick },
          { name: 'increment', label: t.computerVideoScrollDown },
          { name: 'decrement', label: t.computerVideoScrollUp },
          { name: 'scroll-left', label: t.computerVideoScrollLeft },
          { name: 'scroll-right', label: t.computerVideoScrollRight },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (!enabled) return;
          const action = nativeEvent.actionName;
          if (action === 'activate' || action === 'longpress')
            onClick(cursor.get(), action === 'activate' ? 'left' : 'right');
          if (action === 'increment' || action === 'decrement')
            onScroll(cursor.get(), 'vertical', action === 'increment' ? 1 : -1);
          if (action === 'scroll-left' || action === 'scroll-right')
            onScroll(cursor.get(), 'horizontal', action === 'scroll-right' ? 1 : -1);
        }}
        onLayout={({ nativeEvent }) => width.set(nativeEvent.layout.width)}
        style={{
          minHeight: theme.touch * 3,
          borderRadius: radius.lg,
          backgroundColor: colors.fill,
          alignItems: 'center',
          justifyContent: 'center',
          padding: space.x4,
        }}
      >
        <Text tone="muted" variant="meta">
          {t.computerTouchpad}
        </Text>
      </View>
    </GestureDetector>
  );
}
