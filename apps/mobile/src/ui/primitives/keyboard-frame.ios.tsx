import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  KeyboardAvoidingView,
  KeyboardProvider,
  KeyboardStickyView,
  useKeyboardState,
} from 'react-native-keyboard-controller';

import {
  chatKeyboardOffset,
  composerKeyboardGap,
  nativeChatKeyboard,
  useChatBottom,
} from './chat-keyboard';
import type { KeyboardChatFrameProps } from './keyboard-frame';

function usePaddedListBottomSafeArea(): number {
  const bottom = useChatBottom().safe;
  const open = useKeyboardState((state) => state.isVisible);
  return open ? 0 : bottom;
}

function useStickyListBottomSafeArea(): number {
  return useChatBottom().safe;
}

export const useListBottomSafeArea = nativeChatKeyboard
  ? useStickyListBottomSafeArea
  : usePaddedListBottomSafeArea;

export function KeyboardRoot({ children }: { children: ReactNode }) {
  return <KeyboardProvider>{children}</KeyboardProvider>;
}

function StickyChatFrame({
  children,
  composer,
  background,
  backgroundColor,
  onMount,
  onComposerLayout,
}: KeyboardChatFrameProps) {
  const bottom = useChatBottom();
  return (
    <View ref={onMount} style={{ flex: 1, backgroundColor }}>
      {background}
      <View style={{ flex: 1, marginBottom: bottom.island }}>
        <View style={{ flex: 1 }}>{children}</View>
        <KeyboardStickyView
          offset={{ closed: 0, opened: chatKeyboardOffset(bottom) }}
          onLayout={onComposerLayout}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
        >
          {composer}
        </KeyboardStickyView>
      </View>
    </View>
  );
}

function PaddedChatFrame({
  children,
  composer,
  background,
  backgroundColor,
  onMount,
  onComposerLayout,
}: KeyboardChatFrameProps) {
  const bottom = useChatBottom();
  return (
    <View ref={onMount} style={{ flex: 1, backgroundColor }}>
      {background}
      <KeyboardAvoidingView
        style={{ flex: 1, marginBottom: bottom.island }}
        behavior="padding"
        keyboardVerticalOffset={-composerKeyboardGap(bottom.safe)}
      >
        <View style={{ flex: 1 }}>
          {children}
          <View
            onLayout={onComposerLayout}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
          >
            {composer}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export const KeyboardChatFrame = nativeChatKeyboard ? StickyChatFrame : PaddedChatFrame;
