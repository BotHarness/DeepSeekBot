import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { WHEEL_STEP } from '../../host/computer-viewer';
import { buttonColors } from '../design/controls';
import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { MouseButtonIcon } from '../shell/icons';
import { t } from '../strings';

type Axis = 'horizontal' | 'vertical';

export function ComputerWheelButton({
  side,
  enabled,
  compact,
  onClick,
  onScroll,
}: {
  side: 'left' | 'right';
  enabled: boolean;
  compact: boolean;
  onClick(): void;
  onScroll(axis: Axis, steps: number): void;
}) {
  const theme = useDesignTheme();
  const colors = buttonColors(theme, 'secondary', 'canvas');
  const width = theme.touch * 1.75;
  const minHeight = theme.touch * (compact ? 1.25 : 1.5);
  const height = useSharedValue(minHeight);
  const axis = useSharedValue<Axis>(side === 'left' ? 'horizontal' : 'vertical');
  const thumb = useSharedValue(0);
  const sent = useSharedValue(0);
  const pressing = useSharedValue(false);
  const dragging = useSharedValue(false);
  const pan = Gesture.Pan()
    .enabled(enabled)
    .maxPointers(1)
    .minDistance(10)
    .onStart((event) => {
      dragging.set(true);
      sent.set(0);
      axis.set(
        Math.abs(event.translationX) > Math.abs(event.translationY) ? 'horizontal' : 'vertical',
      );
    })
    .onUpdate((event) => {
      const horizontal = axis.get() === 'horizontal';
      const distance = horizontal ? event.translationX : event.translationY;
      const travel = ((horizontal ? width : height.get()) - space.x3 * 2 - space.x5) / 2;
      thumb.set(Math.max(-travel, Math.min(travel, distance)));
      const steps = Math.trunc(distance / WHEEL_STEP);
      const delta = steps - sent.get();
      if (delta !== 0) {
        sent.set(steps);
        scheduleOnRN(onScroll, axis.get(), delta);
      }
    })
    .onFinalize(() => {
      dragging.set(false);
      thumb.set(
        withSpring(0, { duration: 200, dampingRatio: 1, reduceMotion: ReduceMotion.System }),
      );
    });
  const tap = Gesture.Tap()
    .enabled(enabled)
    .maxDistance(10)
    .onBegin(() => pressing.set(true))
    .onEnd((_event, success) => {
      if (success) scheduleOnRN(onClick);
    })
    .onFinalize(() => pressing.set(false));
  const buttonStyle = useAnimatedStyle(() => ({
    backgroundColor: pressing.get() || dragging.get() ? colors.pressed : colors.fill,
  }));
  const horizontalStyle = useAnimatedStyle(() => ({
    opacity: axis.get() === 'horizontal' ? 1 : 0,
  }));
  const verticalStyle = useAnimatedStyle(() => ({ opacity: axis.get() === 'vertical' ? 1 : 0 }));
  const horizontalThumb = useAnimatedStyle(() => ({ transform: [{ translateX: thumb.get() }] }));
  const verticalThumb = useAnimatedStyle(() => ({ transform: [{ translateY: thumb.get() }] }));
  const ink = enabled ? colors.label : theme.color.muted;
  const label = side === 'left' ? t.computerLeftClick : t.computerRightClick;
  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <Animated.View
        testID={`computer-video-${side}-click`}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t.computerVideoWheelHint}
        accessibilityState={{ disabled: !enabled }}
        accessibilityActions={[
          { name: 'activate', label },
          { name: 'scroll-left', label: t.computerVideoScrollLeft },
          { name: 'scroll-right', label: t.computerVideoScrollRight },
          { name: 'scroll-up', label: t.computerVideoScrollUp },
          { name: 'scroll-down', label: t.computerVideoScrollDown },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (!enabled) return;
          switch (nativeEvent.actionName) {
            case 'activate':
              onClick();
              break;
            case 'scroll-left':
              onScroll('horizontal', -1);
              break;
            case 'scroll-right':
              onScroll('horizontal', 1);
              break;
            case 'scroll-up':
              onScroll('vertical', -1);
              break;
            case 'scroll-down':
              onScroll('vertical', 1);
              break;
          }
        }}
        onLayout={(event) => height.set(event.nativeEvent.layout.height)}
        style={[
          {
            width,
            minHeight,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            padding: space.x3,
          },
          buttonStyle,
        ]}
      >
        <MouseButtonIcon side={side} size={theme.type.body.line} color={ink} mark={ink} />
        <Text variant="meta" style={{ color: ink }}>
          {label}
        </Text>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              bottom: space.x2,
              left: space.x3,
              right: space.x3,
              height: space.x2,
              borderRadius: radius.round,
              backgroundColor: theme.layer.well.fill,
            },
            horizontalStyle,
          ]}
        >
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: '50%',
                marginLeft: -space.x5 / 2,
                width: space.x5,
                height: space.x2,
                borderRadius: radius.round,
                backgroundColor: ink,
              },
              horizontalThumb,
            ]}
          />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              right: space.x2,
              top: space.x3,
              bottom: space.x3,
              width: space.x2,
              borderRadius: radius.round,
              backgroundColor: theme.layer.well.fill,
            },
            verticalStyle,
          ]}
        >
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: '50%',
                marginTop: -space.x5 / 2,
                height: space.x5,
                width: space.x2,
                borderRadius: radius.round,
                backgroundColor: ink,
              },
              verticalThumb,
            ]}
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}
