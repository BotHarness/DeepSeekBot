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
