import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { spring } from '../design/motion';
import { swipeOpen } from '../design/tokens';
import { swipeOpenTravel, swipeOpens } from './swipe-open-model';

export function SwipeOpen({
  enabled,
  onOpen,
  travel,
  testID,
  children,
}: {
  enabled: boolean;
  onOpen(): void;
  travel: SharedValue<number>;
  testID?: string;
  children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const opened = useSharedValue(false);
  const open = () => {
    onOpen();
    setTimeout(() => {
      travel.value = 0;
    }, swipeOpen.settle);
  };
  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX(-swipeOpen.start)
    .failOffsetY([-swipeOpen.verticalFail, swipeOpen.verticalFail])
    .onStart(() => {
      opened.value = false;
    })
    .onUpdate((event) => {
      if (opened.value) return;
      travel.value = swipeOpenTravel(event.translationX, width);
    })
    .onEnd((event) => {
      if (opened.value) return;
      const release = {
        ...spring.spatial.fast,
        overshootClamping: true,
        velocity: -event.velocityX,
      };
      if (!swipeOpens(event.translationX, event.velocityX)) {
        travel.value = withSpring(0, release);
        return;
      }
      opened.value = true;
      travel.value = withSpring(width, release, (finished) => {
        if (finished) runOnJS(open)();
      });
    });
  return (
    <GestureDetector gesture={pan}>
      <View testID={testID} style={{ flex: 1 }} collapsable={false}>
        {children}
      </View>
    </GestureDetector>
  );
}
