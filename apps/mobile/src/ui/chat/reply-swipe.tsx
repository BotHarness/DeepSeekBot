import type { ReactNode } from 'react';
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
import { repliesAt, replyTravel } from './reply-swipe-model';

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
  const direction = I18nManager.isRTL ? -1 : 1;
  const arm = () => haptic('selection');
  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX(direction * swipeReply.start)
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
      if (repliesAt(event.translationX * direction)) runOnJS(onReply)();
    })
    .onFinalize(() => {
      armed.value = false;
      travel.value = withSpring(0, spring.spatial.fast);
    });
  const moving = useAnimatedStyle(() => ({
    transform: [{ translateX: travel.value * direction }],
  }));
  const hint = useAnimatedStyle(() => {
    const shown = Math.min(1, travel.value / swipeReply.commit);
    return { opacity: shown, transform: [{ scale: 0.6 + shown * 0.4 }] };
  });
  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false}>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              start: space.x3,
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
        <Animated.View style={moving}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}
