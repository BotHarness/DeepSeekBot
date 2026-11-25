import type { ReactNode } from 'react';
import { View, type ColorValue, type LayoutChangeEvent } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  KeyboardAvoidingView,
  KeyboardProvider,
  useKeyboardState,
} from 'react-native-keyboard-controller';

import { useComposerDrop } from './composer-drop';
import { composerKeyboardGap, useChatBottom } from './chat-keyboard';

export interface KeyboardChatFrameProps {
  children: ReactNode;
  composer: ReactNode;
  background?: ReactNode;
  backgroundColor: ColorValue;
  onMount?(node: unknown): void;
  onComposerLayout(event: LayoutChangeEvent): void;
}

export function useListBottomSafeArea(): number {
  const bottom = useChatBottom().safe;
  const open = useKeyboardState((state) => state.isVisible);
  return open ? 0 : bottom;
}

export function KeyboardRoot({ children }: { children: ReactNode }) {
  return <KeyboardProvider>{children}</KeyboardProvider>;
}

export function KeyboardChatFrame({
  children,
  composer,
  background,
  backgroundColor,
  onMount,
  onComposerLayout,
}: KeyboardChatFrameProps) {
  const { safe, island } = useChatBottom();
  const lowered = useComposerDrop(island);
  return (
    <View ref={onMount} style={{ flex: 1, backgroundColor }}>
      {background}
      <KeyboardAvoidingView
        style={{ flex: 1, marginBottom: island }}
        behavior="padding"
        keyboardVerticalOffset={-composerKeyboardGap(safe)}
      >
        <View style={{ flex: 1 }}>
          {children}
          <Animated.View
            onLayout={onComposerLayout}
            style={[{ position: 'absolute', left: 0, right: 0, bottom: 0 }, lowered]}
          >
            {composer}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
