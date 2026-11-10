import type { ReactNode } from 'react';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { edgeFade, space } from '../design/tokens';

export function ComposerAnimatedFade({
  inset,
  measuredCover,
  color,
  children,
}: {
  inset: SharedValue<number>;
  measuredCover: number;
  color: string;
  children: ReactNode;
}) {
  const solid = useAnimatedStyle(() => ({
    height: Math.max(0, inset.value - edgeFade.bottom - space.x3 - space.x2),
  }));
  const follower = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          measuredCover - Math.max(0, inset.value - edgeFade.bottom - space.x3 - space.x2),
      },
    ],
  }));
  return (
    <>
      <Animated.View
        testID="composer-fade-solid"
        pointerEvents="none"
        style={[
          { position: 'absolute', bottom: -1, left: 0, right: 0, backgroundColor: color },
          solid,
        ]}
      />
      <Animated.View
        testID="composer-fade-follower"
        pointerEvents="none"
        style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, follower]}
      >
        {children}
      </Animated.View>
    </>
  );
}
