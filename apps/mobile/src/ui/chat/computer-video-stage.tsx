import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type ViewInstance } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { fittedFrame, moveCursor, type StageZoom } from '../../host/browser-viewer';
import {
  resizeVideoPreview,
  revealVideoPointer,
  videoPointerPosition,
} from '../../host/local-video-pointer';
import { computerCanvas, pointer } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { PointerArrow } from '../shell/icons';
import { t } from '../strings';
import { useMounted } from '../mounted';
import type { Size } from './zoom-math';
import { videoPinchUpdate } from './computer-video-gestures';
import { ComputerClickRipple, type ComputerClickFeedback } from './computer-click-ripple';

type Point = { x: number; y: number };
const TAP_SLOP = 10;

export function ComputerVideoStage({
  attemptId,
  clickFeedback,
  frame,
  driving,
  controlling,
  revealCursor,
  cursor,
  preview,
  onClick,
  children,
}: {
  attemptId: string;
  clickFeedback: SharedValue<ComputerClickFeedback | undefined>;
  frame: Size;
  driving: boolean;
  controlling: boolean;
  revealCursor: boolean;
  cursor: SharedValue<Point>;
  preview: SharedValue<StageZoom>;
  onClick(point: Point, button: 'left' | 'right'): void;
  children(size: Size): ReactNode;
}) {
  const theme = useDesignTheme();
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const origin = useSharedValue({ scale: 1, x: 0, y: 0, focalX: 0, focalY: 0 });
  const panOrigin = useSharedValue({ x: 0, y: 0 });
  const cursorOrigin = useSharedValue({ x: 0, y: 0 });
  const pinched = useSharedValue(false);
  const pinching = useSharedValue(false);
  const fit = fittedFrame(frame, stage);
  const pointerSize = theme.touch * 0.75;
  const mount = useMounted<ViewInstance>(() => {
    preview.set({ scale: 1, x: 0, y: 0 });
    cursor.set({ x: frame.width / 2, y: frame.height / 2 });
  }, [frame.width, frame.height]);

  const layout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width === stage.width && height === stage.height) return;
    setStage({ width, height });
    if (width !== stage.width) {
      preview.set({ scale: 1, x: 0, y: 0 });
      cursor.set({ x: frame.width / 2, y: frame.height / 2 });
    } else
      preview.set(
        resizeVideoPreview({ frame, before: stage, after: { width, height }, zoom: preview.get() }),
      );
    if (revealCursor)
      preview.set(
        revealVideoPointer({
          point: cursor.get(),
          frame,
          stage: { width, height },
          zoom: preview.get(),
        }),
      );
  };

  const pinch = Gesture.Pinch()
    .onStart((event) => {
      pinching.set(true);
      pinched.set(true);
      origin.set({
        ...preview.get(),
        focalX: event.focalX - stage.width / 2,
        focalY: event.focalY - fit.height / 2,
      });
    })
    .onUpdate((event) => {
      preview.set(
        videoPinchUpdate({
          origin: origin.get(),
          current: preview.get(),
          event,
          center: { x: stage.width / 2, y: fit.height / 2 },
        }),
      );
    })
    .onTouchesUp((event, manager) => {
      if (event.numberOfTouches < 2) manager.end();
    })
    .onFinalize(() => {
      pinching.set(false);
    });

  const previewPan = Gesture.Pan()
    .minPointers(2)
    .averageTouches(true)
    .onStart(() => {
      pinched.set(pinching.get());
      panOrigin.set({ x: preview.get().x, y: preview.get().y });
    })
    .onUpdate((event) => {
      if (pinched.get() || event.numberOfPointers !== 2) return;
      preview.set({
        scale: preview.get().scale,
        x: panOrigin.get().x + event.translationX,
        y: panOrigin.get().y + event.translationY,
      });
    });

  const trackpad = Gesture.Pan()
    .enabled(controlling)
    .maxPointers(1)
    .minDistance(TAP_SLOP)
    .onTouchesDown((event, manager) => {
      if (event.numberOfTouches > 1) manager.fail();
    })
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
          preview.get(),
        ),
      );
    });

  const tap = Gesture.Tap()
    .enabled(driving)
    .onTouchesDown((event, manager) => {
      if (event.numberOfTouches > 1) manager.fail();
    })
    .maxDistance(TAP_SLOP)
    .onEnd((_event, success) => {
      if (success && driving) scheduleOnRN(onClick, cursor.get(), 'left');
    });
  const rightClick = Gesture.LongPress()
    .enabled(driving)
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
  const pictureStyle = useAnimatedStyle(() => {
    const { x, y, scale } = preview.get();
    return { transform: [{ translateX: x }, { translateY: y }, { scale }] };
  });
  const cursorStyle = useAnimatedStyle(() => {
    if (frame.width <= 0 || frame.height <= 0) return { opacity: 0 };
    const at = videoPointerPosition({ point: cursor.get(), frame, stage, zoom: preview.get() });
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
        accessibilityHint={controlling ? t.computerVideoTrackpadHint : t.computerVideoPreviewHint}
        accessibilityRole={controlling ? 'button' : 'image'}
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
        style={{ flex: 1, overflow: 'hidden', backgroundColor: computerCanvas.background }}
      >
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', ...fit, top: 0 }, pictureStyle]}
        >
          {children(fit)}
        </Animated.View>
        {controlling ? (
          <ComputerClickRipple
            feedback={clickFeedback}
            attemptId={attemptId}
            enabled={driving}
            frame={frame}
            stage={stage}
            preview={preview}
          />
        ) : null}
        {controlling ? (
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', left: 0, top: 0 }, cursorStyle]}
          >
            <PointerArrow size={pointerSize} fill={pointer.fill} rim={pointer.rim} />
          </Animated.View>
        ) : null}
      </View>
    </GestureDetector>
  );
}
