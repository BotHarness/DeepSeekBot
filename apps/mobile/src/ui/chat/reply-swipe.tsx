import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { I18nManager, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useDesignTheme } from '../design/theme';
import { spring } from '../design/motion';
import { space, swipeReply } from '../design/tokens';
import { haptic } from '../haptics';
import { ReplyIcon } from '../shell/icons';
import { ReplySwipeBlocker, type SwipeBlocker } from './reply-swipe-context';
import { horizontalSwipeOwner, repliesAt, replyTravel } from './reply-swipe-model';

export function ReplySwipe({
  enabled,
  onReply,
  children,
}: {
  enabled: boolean;
  onReply(): void;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const travel = useSharedValue(0);
  const armed = useSharedValue(false);
  const direction = I18nManager.isRTL ? 1 : -1;
  const reply = useRef(onReply);
  reply.current = onReply;
  const arm = useCallback(() => haptic('selection'), []);
  const fire = useCallback(() => reply.current(), []);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetX(direction * swipeReply.start)
        .failOffsetX(-direction * swipeReply.backFail)
        .failOffsetY([-swipeReply.verticalFail, swipeReply.verticalFail])
        .onStart(() => {
          armed.value = false;
        })
        .onUpdate((event) => {
          const x = event.translationX * direction;
          travel.value = replyTravel(x);
          if (armed.value === repliesAt(x)) return;
          armed.value = repliesAt(x);
          if (armed.value) runOnJS(arm)();
        })
        .onEnd((event) => {
          if (repliesAt(event.translationX * direction)) runOnJS(fire)();
        })
        .onFinalize(() => {
          armed.value = false;
          travel.value = withSpring(0, spring.spatial.fast);
        }),
    [enabled, direction, arm, fire, armed, travel],
  );
  const blocker = useMemo<SwipeBlocker>(
    () =>
      function SwipeBlocker({
        children: scroller,
        blocking,
      }: {
        children: ReactNode;
        blocking: boolean;
      }) {
        const native = useMemo(
          () => Gesture.Native().enabled(blocking).blocksExternalGesture(pan),
          [blocking],
        );
        return <GestureDetector gesture={native}>{scroller}</GestureDetector>;
      },
    [pan],
  );
  const moving = useAnimatedStyle(() => ({
    transform: [{ translateX: travel.value * direction }],
  }));
  const hint = useAnimatedStyle(() => {
    const shown = Math.min(1, travel.value / swipeReply.commit);
    return { opacity: shown, transform: [{ scale: 0.6 + shown * 0.4 }] };
  });
  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false} nativeID={enabled ? horizontalSwipeOwner : undefined}>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              end: space.x3,
              justifyContent: 'center',
            },
            hint,
          ]}
        >
          <View
            style={{
              width: swipeReply.icon,
              height: swipeReply.icon,
              borderRadius: swipeReply.icon / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.layer.raised.fill,
            }}
          >
            <ReplyIcon color={theme.color.muted} size={theme.type.meta.line} />
          </View>
        </Animated.View>
        <Animated.View style={moving}>
          <ReplySwipeBlocker.Provider value={enabled ? blocker : undefined}>
            {children}
          </ReplySwipeBlocker.Provider>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
