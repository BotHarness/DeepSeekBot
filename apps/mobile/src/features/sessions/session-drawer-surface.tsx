import { useFocusEffect } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewInstance,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle } from 'react-native-reanimated';
import { useDesignTheme } from '../../ui/design/theme';
import { space } from '../../ui/design/tokens';
import { useMounted } from '../../ui/mounted';
import { useSystemReducedMotion } from '../../ui/primitives/use-system-reduced-motion';
import { holdBack } from '../../ui/shell/back-owner';
import { useStrings } from '../../ui/strings';
import { SessionDrawerBlur } from './session-drawer-blur';
import { SessionDrawerContent } from './session-drawer-content';
import {
  sessionDrawerSwipe,
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

const CONTENT_FADE = 0.5;

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

export function SessionDrawerSurface({
  children,
  nativeDrawer,
}: {
  children: ReactNode;
  nativeDrawer?: ReactNode;
}) {
  const native = nativeDrawer !== undefined;
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  const reduced = useSystemReducedMotion();
  const width = sessionDrawerWidth(useWindowDimensions().width);
  const state = useSessionDrawer();
  const place = useDrawerPlace();
  const swipe = sessionDrawerSwipe(Platform.OS);

  useFocusEffect(useCallback(() => () => closeSessionDrawer(false), []));
  const holdBackWhileOpen = useMounted<ViewInstance>(() => {
    const held = holdBack(() => {
      closeSessionDrawer();
      return true;
    });
    return () => held.remove();
  }, []);

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
  if (swipe.hitSlop) openPan.hitSlop(swipe.hitSlop);

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

  const contentStyle = useAnimatedStyle(() => ({
    opacity: native ? 1 : 1 - CONTENT_FADE * progress.value,
    transform: [{ translateX: progress.value * width }],
  }));
  const blurStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const drawerStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: (progress.value - 1) * space.x6 }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.base }}>
      <GestureDetector gesture={openPan}>
        <Animated.View
          style={[{ flex: 1 }, contentStyle]}
          collapsable={false}
          importantForAccessibility={state.open ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={state.open}
        >
          {children}
          {state.shown ? (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, blurStyle]}>
              <SessionDrawerBlur />
            </Animated.View>
          ) : null}
        </Animated.View>
      </GestureDetector>
      {native ? (
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents={state.open ? 'auto' : 'none'}
          accessibilityViewIsModal={state.open}
        >
          {state.open ? <View ref={holdBackWhileOpen} /> : null}
          {nativeDrawer}
        </View>
      ) : state.shown ? (
        <GestureDetector gesture={closePan}>
          <View
            style={StyleSheet.absoluteFill}
            pointerEvents={state.open ? 'auto' : 'none'}
            accessibilityViewIsModal={state.open}
          >
            {state.open ? <View ref={holdBackWhileOpen} /> : null}
            <Pressable
              testID="session-drawer-close-strip"
              accessibilityRole="button"
              accessibilityLabel={t.closeDrawer}
              onPress={() => closeSessionDrawer()}
              style={{ position: 'absolute', top: 0, bottom: 0, left: width, right: 0 }}
            />
            <Animated.View
              accessible={false}
              onAccessibilityEscape={() => closeSessionDrawer()}
              style={[
                {
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width,
                  backgroundColor: theme.color.base,
                },
                drawerStyle,
              ]}
            >
              <SessionDrawerContent active={state.open} />
            </Animated.View>
          </View>
        </GestureDetector>
      ) : null}
    </View>
  );
}
