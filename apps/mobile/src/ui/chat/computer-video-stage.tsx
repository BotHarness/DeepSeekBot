import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type ViewInstance } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { fittedFrame, moveCursor, stagePoint } from '../../host/browser-viewer';
import { pointer } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { PointerArrow } from '../shell/icons';
import { t } from '../strings';
import { useMounted } from '../mounted';
import { pinchZoom, settleZoom, type Size } from './zoom-math';

type Point = { x: number; y: number };
const SPRING = { duration: 400, dampingRatio: 1, reduceMotion: ReduceMotion.System };
const TAP_SLOP = 10;

export function ComputerVideoStage({
  frame,
  driving,
  cursor,
  onClick,
  children,
}: {
  frame: Size;
  driving: boolean;
  cursor: SharedValue<Point>;
  onClick(point: Point, button: 'left' | 'right'): void;
  children(size: Size): ReactNode;
}) {
  const theme = useDesignTheme();
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const origin = useSharedValue({ scale: 1, x: 0, y: 0, focalX: 0, focalY: 0 });
  const panOrigin = useSharedValue({ x: 0, y: 0 });
  const cursorOrigin = useSharedValue({ x: 0, y: 0 });
  const pinched = useSharedValue(false);
  const pinching = useSharedValue(false);
  const fit = fittedFrame(frame, stage);
  const pointerSize = theme.touch * 0.75;
  const mount = useMounted<ViewInstance>(() => {
    scale.set(1);
    x.set(0);
    y.set(0);
    cursor.set({ x: frame.width / 2, y: frame.height / 2 });
  }, [frame.width, frame.height]);

  const stopAnimation = () => {
    'worklet';
    cancelAnimation(scale);
    cancelAnimation(x);
    cancelAnimation(y);
  };

  const layout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setStage({ width, height });
    scale.set(1);
    x.set(0);
    y.set(0);
    cursor.set({ x: frame.width / 2, y: frame.height / 2 });
  };
  const zoom = () => {
    'worklet';
    return { scale: scale.get(), x: x.get(), y: y.get() };
  };
  const settle = () => {
    'worklet';
    const next = settleZoom(zoom(), fit, stage);
    scale.set(withSpring(next.scale, SPRING));
    x.set(withSpring(next.x, SPRING));
    y.set(withSpring(next.y, SPRING));
  };

  const pinch = Gesture.Pinch()
    .onStart((event) => {
      stopAnimation();
      pinching.set(true);
      pinched.set(true);
      origin.set({
        ...zoom(),
        focalX: event.focalX - stage.width / 2,
        focalY: event.focalY - stage.height / 2,
      });
    })
    .onUpdate((event) => {
      const next = pinchZoom(
        origin.get(),
        {
          x: event.focalX - stage.width / 2,
          y: event.focalY - stage.height / 2,
        },
        event.scale,
      );
      scale.set(next.scale);
      x.set(next.x);
      y.set(next.y);
    })
    .onFinalize(() => {
      if (!pinching.get()) return;
      pinching.set(false);
      settle();
    });

  const previewPan = Gesture.Pan()
    .minPointers(2)
    .averageTouches(true)
    .onStart(() => {
      stopAnimation();
      pinched.set(pinching.get());
      panOrigin.set({ x: x.get(), y: y.get() });
    })
    .onUpdate((event) => {
      if (pinched.get()) return;
      x.set(panOrigin.get().x + event.translationX);
      y.set(panOrigin.get().y + event.translationY);
    })
    .onFinalize(() => {
      if (!pinched.get()) settle();
    });

  const trackpad = Gesture.Pan()
    .maxPointers(1)
    .minDistance(TAP_SLOP)
    .onStart(() => {
      cursorOrigin.set(cursor.get());
    })
    .onUpdate((event) => {
      cursor.set(
        moveCursor(
          cursorOrigin.get(),
          {
            x: event.translationX,
            y: event.translationY,
          },
          frame,
          stage,
          zoom(),
        ),
      );
    });

  const tap = Gesture.Tap()
    .onTouchesDown((event, manager) => {
      if (event.numberOfTouches > 1) manager.fail();
    })
    .maxDistance(TAP_SLOP)
    .onEnd((_event, success) => {
      if (success && driving) scheduleOnRN(onClick, cursor.get(), 'left');
    });
  const rightClick = Gesture.LongPress()
    .numberOfPointers(1)
    .onTouchesDown((event, manager) => {
      if (event.numberOfTouches > 1) manager.fail();
    })
    .maxDistance(TAP_SLOP)
    .onStart(() => {
      if (driving) scheduleOnRN(onClick, cursor.get(), 'right');
    });
  const gesture = Gesture.Simultaneous(
    pinch,
    previewPan,
    Gesture.Race(trackpad, Gesture.Exclusive(rightClick, tap)),
  );
  const pictureStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));
  const cursorStyle = useAnimatedStyle(() => {
    if (frame.width <= 0 || frame.height <= 0) return { opacity: 0 };
    const at = stagePoint(cursor.get(), frame, stage, zoom());
    return {
      opacity: frame.width > 0 && frame.height > 0 ? 1 : 0,
      transform: [{ translateX: at.x - pointerSize / 8 }, { translateY: at.y - pointerSize / 8 }],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <View
        testID="computer-video-trackpad"
        ref={mount}
        onLayout={layout}
        accessible
        accessibilityLabel={t.computerVideoTrackpad}
        accessibilityHint={t.computerVideoTrackpadHint}
        accessibilityRole="button"
        accessibilityState={{ disabled: !driving }}
        accessibilityActions={
          driving
            ? [
                { name: 'activate', label: t.computerLeftClick },
                { name: 'longpress', label: t.computerRightClick },
              ]
            : []
        }
        onAccessibilityAction={({ nativeEvent }) => {
          if (
            driving &&
            (nativeEvent.actionName === 'activate' || nativeEvent.actionName === 'longpress')
          )
            onClick(cursor.get(), nativeEvent.actionName === 'longpress' ? 'right' : 'left');
        }}
        style={{ flex: 1, overflow: 'hidden', backgroundColor: theme.color.surface }}
      >
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', ...fit }, pictureStyle]}
        >
          {children(fit)}
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: 0, top: 0 }, cursorStyle]}
        >
          <PointerArrow size={pointerSize} fill={pointer.fill} rim={pointer.rim} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
