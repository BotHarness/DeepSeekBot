import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { swipeOpen } from '../design/tokens';
import { swipeOpenProgress, swipeOpens } from './swipe-open-model';

export function SwipeOpen({
  enabled,
  onOpen,
  testID,
  children,
}: {
  enabled: boolean;
  onOpen(): void;
  testID?: string;
  children: ReactNode;
}) {
  const opened = useSharedValue(false);
  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX(-swipeOpen.start)
    .failOffsetY([-swipeOpen.verticalFail, swipeOpen.verticalFail])
    .onStart(() => {
      opened.value = false;
    })
    .onUpdate((event) => {
      if (opened.value || swipeOpenProgress(event.translationX) < 1) return;
      opened.value = true;
      runOnJS(onOpen)();
    })
    .onEnd((event) => {
      if (opened.value || !swipeOpens(event.translationX, event.velocityX)) return;
      opened.value = true;
      runOnJS(onOpen)();
    });
  return (
    <GestureDetector gesture={pan}>
      <View testID={testID} style={{ flex: 1 }} collapsable={false}>
        {children}
      </View>
    </GestureDetector>
  );
}
