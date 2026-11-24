import { Stack, router, usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewInstance } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { spring } from '../design/motion';
import { useDesignTheme } from '../design/theme';
import { useMounted } from '../mounted';
import { useSystemReducedMotion } from '../primitives/use-system-reduced-motion';
import { EntranceSettled } from './entrance-settled';
import { leaveScreen } from './leave-screen';
import { StackRoot } from './stack-root';
import { tobEntryOrigin } from './tob-entry-origin';
import { containerTransformFade, containerTransformFrame } from './tob-mode-model';

function leave(): void {
  leaveScreen(router);
}

export function TobEntranceStack() {
  const theme = useDesignTheme();
  const screen = useWindowDimensions();
  const reduced = useSystemReducedMotion();
  const [origin] = useState(tobEntryOrigin.read);
  const progress = useSharedValue(reduced ? 1 : 0);
  const [settled, setSettled] = useState(reduced);
  const [leaving, setLeaving] = useState(false);

  const mount = useMounted<ViewInstance>(() => {
    if (!reduced)
      progress.value = withSpring(1, { ...spring.spatial.default, overshootClamping: true }, () =>
        runOnJS(setSettled)(true),
      );
  }, []);

  usePreventRemove(!reduced && !leaving, ({ repeat }) => {
    setLeaving(true);
    progress.value = withSpring(0, { ...spring.release, overshootClamping: true }, () =>
      runOnJS(repeat)(),
    );
  });

  const container = useAnimatedStyle(() => {
    const frame = containerTransformFrame(origin, screen, reduced ? 1 : progress.value);
    return {
      left: frame.x,
      top: frame.y,
      width: frame.width,
      height: frame.height,
      borderRadius: frame.radius,
    };
  });
  const content = useAnimatedStyle(() => {
    const frame = containerTransformFrame(origin, screen, reduced ? 1 : progress.value);
    return {
      left: -frame.x,
      top: frame.height - screen.height,
      opacity: containerTransformFade(reduced ? 1 : progress.value).content,
    };
  });
  const source = useAnimatedStyle(() => ({
    opacity: containerTransformFade(reduced ? 1 : progress.value).origin,
  }));

  return (
    <Animated.View
      testID="tob-entrance"
      collapsable={false}
      onAccessibilityEscape={leave}
      style={[
        { position: 'absolute', overflow: 'hidden', backgroundColor: theme.color.base },
        container,
      ]}
    >
      <Animated.View
        style={[{ position: 'absolute', width: screen.width, height: screen.height }, content]}
      >
        <View ref={mount} style={{ flex: 1 }} collapsable={false}>
          <EntranceSettled value={settled}>
            <StackRoot value>
              <Stack
                screenOptions={{
                  headerShadowVisible: false,
                  contentStyle: { backgroundColor: theme.color.base },
                }}
              />
            </StackRoot>
          </EntranceSettled>
        </View>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.layer.raised.fill }, source]}
      />
    </Animated.View>
  );
}
