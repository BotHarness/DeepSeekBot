import { useState, type ReactNode } from 'react';
import { Image, Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MessageAttachment } from '../../host/conversation';
import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { CloseIcon, ShareIcon } from '../shell/icons';
import { t } from '../strings';
import {
  clampTo,
  dismissDirection,
  doubleTapZoom,
  fitContain,
  panBounds,
  pinchZoom,
  settleZoom,
  type Zoom,
} from './zoom-math';

const SPRING = { damping: 20, stiffness: 220 };
const TAP_SLOP = 10;

function RoundButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress(): void;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={space.x3}
      style={{
        width: theme.touch,
        height: theme.touch,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.color.surface,
      }}
    >
      {children}
    </Pressable>
  );
}

function ZoomableImage({
  attachment,
  onClose,
  onShare,
}: {
  attachment: MessageAttachment;
  onClose(): void;
  onShare(attachment: MessageAttachment): Promise<void>;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const frame = useWindowDimensions();
  const [chrome, setChrome] = useState(true);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const fitted = fitContain(natural, frame);

  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const dismiss = useSharedValue(0);
  const start = useSharedValue({ scale: 1, x: 0, y: 0, focalX: 0, focalY: 0 });

  const animateTo = (target: Zoom) => {
    'worklet';
    scale.value = withSpring(target.scale, SPRING);
    x.value = withSpring(target.x, SPRING);
    y.value = withSpring(target.y, SPRING);
  };
  const center = (focalX: number, focalY: number) => {
    'worklet';
    return { x: focalX - frame.width / 2, y: focalY - frame.height / 2 };
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
      const next = pinchZoom(start.value, center(event.focalX, event.focalY), event.scale);
      scale.value = next.scale;
      x.value = next.x;
      y.value = next.y;
    })
    .onEnd(() => {
      animateTo(settleZoom({ scale: scale.value, x: x.value, y: y.value }, fitted, frame));
    });

  const pan = Gesture.Pan()
    .maxPointers(1)
    .onStart(() => {
      start.value = { ...start.value, x: x.value, y: y.value };
    })
    .onUpdate((event) => {
      if (scale.value > 1.01) {
        x.value = start.value.x + event.translationX;
        y.value = start.value.y + event.translationY;
      } else dismiss.value = event.translationY;
    })
    .onEnd((event) => {
      if (scale.value > 1.01) {
        const limit = panBounds(fitted, frame, scale.value);
        x.value =
          Math.abs(x.value) > limit.x
            ? withSpring(clampTo(x.value, limit.x), SPRING)
            : withDecay({ velocity: event.velocityX, clamp: [-limit.x, limit.x] });
        y.value =
          Math.abs(y.value) > limit.y
            ? withSpring(clampTo(y.value, limit.y), SPRING)
            : withDecay({ velocity: event.velocityY, clamp: [-limit.y, limit.y] });
        return;
      }
      const direction = dismissDirection(dismiss.value, event.velocityY);
      if (direction !== 0) {
        dismiss.value = withTiming(direction * frame.height, { duration: 180 }, (finished) => {
          if (finished === true) runOnJS(onClose)();
        });
      } else dismiss.value = withSpring(0, SPRING);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDistance(TAP_SLOP)
    .onEnd((event) => {
      animateTo(
        doubleTapZoom(
          { scale: scale.value, x: x.value, y: y.value },
          center(event.x, event.y),
          fitted,
          frame,
        ),
      );
    });

  const singleTap = Gesture.Tap()
    .maxDistance(TAP_SLOP)
    .onEnd(() => runOnJS(setChrome)(!chrome));

  const gesture = Gesture.Simultaneous(
    Gesture.Simultaneous(pinch, pan),
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const imageStyle = useAnimatedStyle(() => {
    const drag = Math.min(1, Math.abs(dismiss.value) / frame.height);
    return {
      transform: [
        { translateX: x.value },
        { translateY: y.value + dismiss.value },
        { scale: scale.value * (1 - drag * 0.3) },
      ],
    };
  });
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, (Math.abs(dismiss.value) / frame.height) * 4 * 0.5),
  }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: dismiss.value === 0 ? 1 : 0,
  }));

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        style={{ flex: 1, overflow: 'hidden' }}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: theme.color.base,
            },
            backdropStyle,
          ]}
        />
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            collapsable={false}
          >
            {attachment.source === undefined ? null : (
              <Animated.View style={imageStyle}>
                <Image
                  source={attachment.source}
                  resizeMode="contain"
                  accessibilityLabel={attachment.name}
                  accessibilityHint={t.viewerHint}
                  onLoad={({ nativeEvent }) => {
                    const size = nativeEvent.source as typeof natural | undefined;
                    if (size !== undefined) setNatural({ width: size.width, height: size.height });
                  }}
                  style={{ width: fitted.width, height: fitted.height }}
                />
              </Animated.View>
            )}
          </Animated.View>
        </GestureDetector>
        {chrome ? (
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: insets.top + space.x3,
                left: space.x5,
                right: space.x5,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.x4,
              },
              chromeStyle,
            ]}
          >
            <RoundButton label={t.closeViewer} onPress={onClose}>
              <CloseIcon color={theme.color.fg} size={theme.type.title.line} />
            </RoundButton>
            <Text numberOfLines={1} ellipsizeMode="middle" style={{ flex: 1, textAlign: 'center' }}>
              {attachment.name}
            </Text>
            <RoundButton
              label={t.shareFile(attachment.name)}
              onPress={() => void onShare(attachment)}
            >
              <ShareIcon color={theme.color.fg} size={theme.type.title.line} />
            </RoundButton>
          </Animated.View>
        ) : null}
      </View>
    </GestureHandlerRootView>
  );
}

export function ImageViewer({
  attachment,
  onClose,
  onShare,
}: {
  attachment: MessageAttachment | undefined;
  onClose(): void;
  onShare(attachment: MessageAttachment): Promise<void>;
}) {
  return (
    <Modal
      visible={attachment !== undefined}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {attachment === undefined ? null : (
        <ZoomableImage
          key={attachment.key}
          attachment={attachment}
          onClose={onClose}
          onShare={onShare}
        />
      )}
    </Modal>
  );
}
