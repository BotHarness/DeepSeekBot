import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  KeyboardAvoidingView,
  KeyboardProvider,
  KeyboardStickyView,
  useKeyboardState,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { composerKeyboardGap, nativeChatKeyboard } from './chat-keyboard';
import type { KeyboardChatFrameProps } from './keyboard-frame';

function usePaddedListBottomSafeArea(): number {
  const bottom = useSafeAreaInsets().bottom;
  const open = useKeyboardState((state) => state.isVisible);
  return open ? 0 : bottom;
}

function useStickyListBottomSafeArea(): number {
  return useSafeAreaInsets().bottom;
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
  const gap = composerKeyboardGap(useSafeAreaInsets().bottom);
  return (
    <View ref={onMount} style={{ flex: 1, backgroundColor }}>
      {background}
      <View style={{ flex: 1 }}>{children}</View>
      <KeyboardStickyView
        offset={{ closed: 0, opened: gap }}
        onLayout={onComposerLayout}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      >
        {composer}
      </KeyboardStickyView>
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
  const gap = composerKeyboardGap(useSafeAreaInsets().bottom);
  return (
    <View ref={onMount} style={{ flex: 1, backgroundColor }}>
      {background}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={-gap}>
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
