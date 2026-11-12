import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatKeyboardCoordination } from './chat-scroll';
import { composerKeyboardGap, nativeChatKeyboard } from './chat-keyboard';
import { useKeyboardChatScroll, useKeyboardOverlayStyle } from './keyboard-chat-scroll';

function useNativeChatScrollAdapter(keyboard: ChatKeyboardCoordination, held: boolean) {
  const bottom = useSafeAreaInsets().bottom;
  return useKeyboardChatScroll(keyboard, held, {
    inverted: false,
    offset: composerKeyboardGap(bottom),
    inset: bottom,
  });
}

function useNativeChatOverlayStyle() {
  return useKeyboardOverlayStyle(composerKeyboardGap(useSafeAreaInsets().bottom));
}

export const useChatScrollAdapter = nativeChatKeyboard
  ? useNativeChatScrollAdapter
  : (_keyboard: ChatKeyboardCoordination, _held: boolean) => undefined;

export const useChatOverlayStyle = nativeChatKeyboard ? useNativeChatOverlayStyle : () => undefined;
