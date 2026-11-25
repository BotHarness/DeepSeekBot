import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { KeyboardProvider, KeyboardStickyView } from 'react-native-keyboard-controller';

import { useChatBottom } from './chat-keyboard';
import { useComposerDrop } from './composer-drop';
import type { KeyboardChatFrameProps } from './keyboard-frame';

export function useListBottomSafeArea(): number {
  return 0;
}

export function KeyboardRoot({ children }: { children: ReactNode }) {
  return (
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
      {children}
    </KeyboardProvider>
  );
}

export function KeyboardChatFrame({
  children,
  composer,
  background,
  backgroundColor,
  onMount,
  onComposerLayout,
}: KeyboardChatFrameProps) {
  const { island } = useChatBottom();
  const lowered = useComposerDrop(island);
  return (
    <View ref={onMount} style={{ flex: 1, backgroundColor }}>
      {background}
      <View style={{ flex: 1 }}>{children}</View>
      <KeyboardStickyView
        offset={{ closed: 0 - island, opened: 0 }}
        onLayout={onComposerLayout}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      >
        <Animated.View style={lowered}>{composer}</Animated.View>
      </KeyboardStickyView>
    </View>
  );
}
