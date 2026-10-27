import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, View, type ViewInstance } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { spring } from '../design/motion';
import { useMounted } from '../mounted';
import { scrollChromeStep, type ScrollChromeState } from './scroll-chrome-model';

type Chrome = {
  hidden: SharedValue<boolean>;
  pinned: SharedValue<boolean>;
  screenReader: SharedValue<boolean>;
};
const Context = createContext<Chrome | undefined>(undefined);

function useLocalChrome(): Chrome {
  const hidden = useSharedValue(false);
  const pinned = useSharedValue(false);
  const screenReader = useSharedValue(Platform.OS === 'android');
  return useMemo(() => ({ hidden, pinned, screenReader }), [hidden, pinned, screenReader]);
}

export function ScrollChromeProvider({ children }: { children: ReactNode }) {
  const chrome = useLocalChrome();
  const { screenReader } = chrome;
  const mount = useMounted<ViewInstance>(() => {
    if (Platform.OS !== 'android') return;
    let active = true;
    let changed = false;
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (active && !changed) screenReader.set(enabled);
      })
      .catch(() => {});
    const listener = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      changed = true;
      if (active) screenReader.set(enabled);
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [screenReader]);
  return (
    <Context.Provider value={chrome}>
      <View ref={mount} style={{ flex: 1 }}>
        {children}
      </View>
    </Context.Provider>
  );
}

export function useScrollChrome() {
  const local = useLocalChrome();
  return useContext(Context) ?? local;
}

export function useChromeProgress() {
  const { hidden, pinned, screenReader } = useScrollChrome();
  return useDerivedValue(() =>
    withSpring(hidden.get() && !pinned.get() && !screenReader.get() ? 1 : 0, spring.effects.fast),
  );
}

export function useChromeHidden() {
  const { hidden, pinned, screenReader } = useScrollChrome();
  const [value, setValue] = useState(false);
  useAnimatedReaction(
    () => hidden.get() && !pinned.get() && !screenReader.get(),
    (next, previous) => {
      if (next !== previous) scheduleOnRN(setValue, next);
    },
  );
  return value;
}

export function CollapsingToolbar({
  travel,
  height,
  children,
}: {
  travel: number;
  height: number;
  children: ReactNode;
}) {
  const progress = useChromeProgress();
  const hidden = useChromeHidden();
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -travel * progress.value }],
    opacity: 1 - progress.value,
  }));
  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, height }, style]}
    >
      {children}
    </Animated.View>
  );
}

export function useChromeScroll(active = true, pin = false) {
  const { hidden, pinned } = useScrollChrome();
  const scrolling = useSharedValue(false);
  useFocusEffect(
    useCallback(() => {
      scrolling.value = active;
      if (!active) return;
      hidden.value = false;
      pinned.value = pin;
      return () => {
        scrolling.value = false;
        pinned.value = false;
      };
    }, [active, pin, hidden, pinned, scrolling]),
  );
  return useAnimatedScrollHandler<ScrollChromeState>({
    onBeginDrag(event, context) {
      context.offset = Math.max(0, event.contentOffset.y);
      context.travel = 0;
    },
    onEndDrag(_event, context) {
      context.travel = 0;
    },
    onMomentumEnd(_event, context) {
      context.travel = 0;
    },
    onScroll(event, context) {
      if (!scrolling.value || pinned.value) return;
      const next = scrollChromeStep(
        { offset: context.offset ?? 0, travel: context.travel ?? 0, hidden: hidden.value },
        event.contentOffset.y,
        event.contentSize.height - event.layoutMeasurement.height,
      );
      context.offset = next.offset;
      context.travel = next.travel;
      if (hidden.value !== next.hidden) hidden.value = next.hidden;
    },
  });
}
