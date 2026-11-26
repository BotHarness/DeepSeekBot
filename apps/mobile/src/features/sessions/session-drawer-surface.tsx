import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle } from 'react-native-reanimated';
import { useDesignTheme } from '../../ui/design/theme';
import { useSystemReducedMotion } from '../../ui/primitives/use-system-reduced-motion';
import { useStrings } from '../../ui/strings';
import { useSessionDrawerChrome } from './session-drawer-chrome';
import { SessionDrawerContent } from './session-drawer-content';
import {
  sessionDrawerSwipe as swipe,
  sessionDrawerWidth,
  settleSessionDrawer,
} from './session-drawer-model';
import {
  closeSessionDrawer,
  sessionDrawer,
  sessionDrawerProgress as progress,
  useDrawerPlace,
  useSessionDrawer,
} from './session-drawer-state';

function clamp(value: number): number {
  'worklet';
  return Math.min(1, Math.max(0, value));
}

function reveal(): void {
  sessionDrawer.reveal();
}

function settle(open: boolean, velocity: number): void {
  sessionDrawer.settle(open, velocity);
}

export function SessionDrawerSurface({ children }: { children: ReactNode }) {
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  const reduced = useSystemReducedMotion();
  const width = sessionDrawerWidth(useWindowDimensions().width);
  const state = useSessionDrawer();
  const place = useDrawerPlace();
  const holdBackWhileOpen = useSessionDrawerChrome();

  const openPan = Gesture.Pan()
    .enabled(place.edge > 0 && !state.open)
    .activeOffsetX(swipe.activeX)
    .failOffsetY([-swipe.failY, swipe.failY])
    .onStart(() => {
      runOnJS(reveal)();
    })
    .onUpdate((event) => {
      if (!reduced) progress.value = clamp(event.translationX / width);
    })
    .onEnd((event) => {
      runOnJS(settle)(
        settleSessionDrawer(clamp(event.translationX / width), event.velocityX),
        event.velocityX / width,
      );
    });

  const closePan = Gesture.Pan()
    .enabled(state.open)
    .activeOffsetX(-swipe.activeX)
    .failOffsetY([-swipe.failY, swipe.failY])
    .onUpdate((event) => {
      if (!reduced) progress.value = clamp(1 + event.translationX / width);
    })
    .onEnd((event) => {
      runOnJS(settle)(
        settleSessionDrawer(clamp(1 + event.translationX / width), event.velocityX),
        event.velocityX / width,
      );
    });

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value - 1) * width }],
  }));

  return (
    <GestureDetector gesture={Gesture.Race(openPan, closePan)}>
      <View style={{ flex: 1, backgroundColor: theme.color.base }} collapsable={false}>
        <View
          style={{ flex: 1 }}
          importantForAccessibility={state.open ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={state.open}
        >
          {children}
        </View>
        {state.shown ? (
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }, scrimStyle]}
            pointerEvents={state.open ? 'auto' : 'none'}
          >
            <Pressable
              testID="session-drawer-scrim"
              accessibilityRole="button"
              accessibilityLabel={t.closeDrawer}
              onPress={() => closeSessionDrawer()}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        ) : null}
        <Animated.View
          accessible={false}
          accessibilityViewIsModal={state.open}
          accessibilityElementsHidden={!state.open}
          importantForAccessibility={state.open ? 'auto' : 'no-hide-descendants'}
          onAccessibilityEscape={() => closeSessionDrawer()}
          pointerEvents={state.open ? 'auto' : 'none'}
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width,
              backgroundColor: theme.color.base,
            },
            panelStyle,
          ]}
        >
          {state.open ? <View ref={holdBackWhileOpen} /> : null}
          <SessionDrawerContent active={state.open || state.shown} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
