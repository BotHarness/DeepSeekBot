import { Stack, router, usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { Platform, View, useWindowDimensions, type ViewInstance } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { spring } from '../design/motion';
import { useDesignTheme } from '../design/theme';
import { topEntrance } from '../design/tokens';
import { useMounted } from '../mounted';
import { useSystemReducedMotion } from '../primitives/use-system-reduced-motion';
import { leaveScreen } from './leave-screen';
import { StackRoot } from './stack-root';
import { closesTopEntrance, topEntranceDrag } from './tob-mode-model';

function leave(): void {
  leaveScreen(router);
}

export function TopEntranceStack() {
  const theme = useDesignTheme();
  const { height } = useWindowDimensions();
  const reduced = useSystemReducedMotion();
  const offset = useSharedValue(reduced ? 0 : -height);
  const drag = useSharedValue(0);
  const [leaving, setLeaving] = useState(false);

  const mount = useMounted<ViewInstance>(() => {
    if (!reduced)
      offset.value = withSpring(0, { ...spring.spatial.default, overshootClamping: true });
  }, []);

  usePreventRemove(!reduced && !leaving, ({ repeat }) => {
    setLeaving(true);
    offset.value = withSpring(-height, { ...spring.release, overshootClamping: true }, () =>
      runOnJS(repeat)(),
    );
  });

  const back = Gesture.Pan()
    .enabled(Platform.OS === 'ios')
    .hitSlop({ left: 0, width: topEntrance.edge })
    .activeOffsetX(topEntrance.start)
    .failOffsetY([-topEntrance.verticalFail, topEntrance.verticalFail])
    .onUpdate((event) => {
      drag.value = topEntranceDrag(event.translationX);
    })
    .onEnd((event) => {
      if (closesTopEntrance(event.translationX, event.velocityX)) runOnJS(leave)();
      else drag.value = withSpring(0, { ...spring.release, overshootClamping: true });
    });

  const slide = useAnimatedStyle(() => ({
    transform: [
      { translateY: reduced ? 0 : offset.value },
      { translateX: reduced ? 0 : drag.value },
    ],
  }));

  return (
    <GestureDetector gesture={back}>
      <Animated.View
        testID="top-entrance"
        collapsable={false}
        onAccessibilityEscape={leave}
        style={[{ flex: 1, backgroundColor: theme.color.base }, slide]}
      >
        <View ref={mount} style={{ flex: 1 }} collapsable={false}>
          <StackRoot value>
            <Stack
              screenOptions={{
                headerShadowVisible: false,
                contentStyle: { backgroundColor: theme.color.base },
              }}
            />
          </StackRoot>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}
