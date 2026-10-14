import { useState } from 'react';
import { Image, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import {
  fittedFrame,
  moveCursor,
  pagePoint,
  scrollFor,
  stagePoint,
  type BrowserFrame,
  type BrowserInput,
} from '../../host/browser-viewer';
import { radius, edge } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { t } from '../strings';
import { settleZoom } from './zoom-math';

export type BrowserTouchMode = 'direct' | 'trackpad';

const SPRING = { damping: 20, stiffness: 220 };
const TAP_SLOP = 10;
const LONG_PRESS_MS = 500;

export function BrowserStage({
  frame,
  interactive,
  mode,
  onInput,
}: {
  frame: BrowserFrame;
  interactive: boolean;
  mode: BrowserTouchMode;
  onInput(input: BrowserInput): void;
}) {
  const theme = useDesignTheme();
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const page = { width: frame.width, height: frame.height };
  const fit = fittedFrame(page, stage);
  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const start = useSharedValue({ scale: 1, x: 0, y: 0, focalX: 0, focalY: 0 });
  const cursor = useSharedValue({ x: frame.width / 2, y: frame.height / 2 });
  const lastPan = useSharedValue({ x: 0, y: 0 });
  const direct = mode === 'direct';

  const layout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setStage({ width, height });
  };

  const zoom = () => {
    'worklet';
    return { scale: scale.value, x: x.value, y: y.value };
  };

  const clickAt = (point: { x: number; y: number }, button: 'left' | 'right') => {
    'worklet';
    runOnJS(onInput)({ kind: 'click', x: point.x, y: point.y, button });
  };

  const press = (touchX: number, touchY: number, button: 'left' | 'right') => {
    'worklet';
    if (!interactive) return;
    if (!direct) return clickAt(cursor.value, button);
    const point = pagePoint({ x: touchX, y: touchY }, page, stage, zoom());
    if (point !== undefined) clickAt(point, button);
  };

  const scroll = (dragY: number) => {
    'worklet';
    if (Math.abs(dragY) < TAP_SLOP * 2) return;
    const { direction, amount } = scrollFor(dragY);
    runOnJS(onInput)({ kind: 'scroll', direction, amount });
  };

  const center = (focalX: number, focalY: number) => {
    'worklet';
    return { x: focalX - stage.width / 2, y: focalY - stage.height / 2 };
  };

  const pinch = Gesture.Pinch()
    .onStart((event) => {
      const focal = center(event.focalX, event.focalY);
      start.value = {
        scale: scale.value,
        x: x.value,
        y: y.value,
        focalX: focal.x,
        focalY: focal.y,
      };
    })
    .onUpdate((event) => {
      const origin = start.value;
      const next = Math.min(6, Math.max(0.6, origin.scale * event.scale));
      const focal = center(event.focalX, event.focalY);
      scale.value = next;
      x.value = focal.x - ((origin.focalX - origin.x) / origin.scale) * next;
      y.value = focal.y - ((origin.focalY - origin.y) / origin.scale) * next;
    })
    .onEnd(() => {
      const settled = settleZoom(zoom(), fit, stage);
      scale.value = withSpring(settled.scale, SPRING);
      x.value = withSpring(settled.x, SPRING);
      y.value = withSpring(settled.y, SPRING);
    });

  const panView = (translationX: number, translationY: number) => {
    'worklet';
    x.value = start.value.x + translationX;
    y.value = start.value.y + translationY;
  };

  const settleView = () => {
    'worklet';
    const settled = settleZoom(zoom(), fit, stage);
    x.value = withSpring(settled.x, SPRING);
    y.value = withSpring(settled.y, SPRING);
  };

  const twoFingers = Gesture.Pan()
    .minPointers(2)
    .onStart(() => {
      start.value = { ...start.value, x: x.value, y: y.value };
    })
    .onUpdate((event) => {
      if (scale.value > 1.01) panView(event.translationX, event.translationY);
    })
    .onEnd((event) => {
      if (scale.value > 1.01) return settleView();
      if (interactive && !direct) scroll(event.translationY);
    });

  const oneFinger = Gesture.Pan()
    .maxPointers(1)
    .minDistance(TAP_SLOP)
    .onStart(() => {
      start.value = { ...start.value, x: x.value, y: y.value };
      lastPan.value = { x: 0, y: 0 };
    })
    .onUpdate((event) => {
      if (interactive && !direct) {
        cursor.value = moveCursor(
          cursor.value,
          { x: event.translationX - lastPan.value.x, y: event.translationY - lastPan.value.y },
          page,
          stage,
          zoom(),
        );
        lastPan.value = { x: event.translationX, y: event.translationY };
        return;
      }
      if (!interactive && scale.value > 1.01) panView(event.translationX, event.translationY);
    })
    .onEnd((event) => {
      if (interactive && direct) return scroll(event.translationY);
      if (!interactive && scale.value > 1.01) settleView();
    });

  const tap = Gesture.Tap()
    .maxDistance(TAP_SLOP)
    .onEnd((event) => press(event.x, event.y, 'left'));

  const longPress = Gesture.LongPress()
    .minDuration(LONG_PRESS_MS)
    .maxDistance(TAP_SLOP)
    .onStart((event) => press(event.x, event.y, 'right'));

  const gesture = Gesture.Simultaneous(
    pinch,
    twoFingers,
    Gesture.Race(oneFinger, Gesture.Exclusive(longPress, tap)),
  );

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  const cursorStyle = useAnimatedStyle(() => {
    const point = stagePoint(cursor.value, page, stage, zoom());
    return {
      opacity: interactive && !direct ? 1 : 0,
      transform: [
        { translateX: point.x - theme.touch / 4 },
        { translateY: point.y - theme.touch / 4 },
      ],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <View
        onLayout={layout}
        accessible
        accessibilityLabel={t.browserView}
        style={{ flex: 1, overflow: 'hidden', backgroundColor: theme.color.surface }}
      >
        <Animated.View style={[{ position: 'absolute', ...fit }, imageStyle]}>
          <Image
            source={{ uri: frame.uri }}
            fadeDuration={0}
            resizeMode="contain"
            style={{ width: fit.width, height: fit.height }}
          />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              width: theme.touch / 2,
              height: theme.touch / 2,
              borderRadius: radius.round,
              borderWidth: edge.focus,
              borderColor: theme.color.onAccent,
              backgroundColor: theme.color.accent,
            },
            cursorStyle,
          ]}
        />
      </View>
    </GestureDetector>
  );
}
