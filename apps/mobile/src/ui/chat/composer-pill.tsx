import { createContext, type ReactNode } from 'react';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

export type ComposerPill = {
  height: SharedValue<number>;
  chrome: SharedValue<number>;
  layout(height: number): void;
};

export const ComposerPillContext = createContext<ComposerPill | undefined>(undefined);

export function ComposerSpacer({
  pill,
  extra,
  children,
}: {
  pill: ComposerPill;
  extra: number;
  children: ReactNode;
}) {
  const { height, chrome } = pill;
  const style = useAnimatedStyle(() => ({
    height: Math.max(0, chrome.get() + height.get()) + extra,
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export function ComposerFollower({
  pill,
  measured,
  children,
}: {
  pill: ComposerPill;
  measured: number;
  children: ReactNode;
}) {
  const { height, chrome } = pill;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: measured - Math.max(0, chrome.get() + height.get()) }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, style]}
    >
      {children}
    </Animated.View>
  );
}
