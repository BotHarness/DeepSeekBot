import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { scrollChrome } from '../design/tokens';
import { scrollChromeStep, type ScrollChromeState } from './scroll-chrome-model';

type Chrome = { hidden: SharedValue<boolean>; pinned: SharedValue<boolean> };
const Context = createContext<Chrome | undefined>(undefined);

function useLocalChrome(): Chrome {
  const hidden = useSharedValue(false);
  const pinned = useSharedValue(false);
  return useMemo(() => ({ hidden, pinned }), [hidden, pinned]);
}

export function ScrollChromeProvider({ children }: { children: ReactNode }) {
  const chrome = useLocalChrome();
  return <Context.Provider value={chrome}>{children}</Context.Provider>;
}

export function useScrollChrome() {
  const local = useLocalChrome();
  return useContext(Context) ?? local;
}

export function useChromeProgress() {
  const { hidden, pinned } = useScrollChrome();
  return useDerivedValue(() =>
    withTiming(hidden.value && !pinned.value ? 1 : 0, { duration: scrollChrome.duration }),
  );
}

export function useChromeHidden() {
  const { hidden, pinned } = useScrollChrome();
  const [value, setValue] = useState(false);
  useAnimatedReaction(
    () => hidden.value && !pinned.value,
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
  useLayoutEffect(() => {
    if (!active) return;
    hidden.value = false;
    pinned.value = pin;
    return () => {
      pinned.value = false;
    };
  }, [active, pin, hidden, pinned]);
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
      if (!active || pinned.value) return;
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
