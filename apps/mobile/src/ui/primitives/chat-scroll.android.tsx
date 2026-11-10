import type { ChatKeyboardCoordination } from './chat-scroll';
import type { SharedValue } from 'react-native-reanimated';
import { useKeyboardChatScroll, useKeyboardOverlayStyle } from './keyboard-chat-scroll';

const SHAPE = { inverted: true, offset: 0, inset: 0 };

export function useChatScrollAdapter(
  keyboard: ChatKeyboardCoordination,
  held: boolean,
  extraContentPadding?: SharedValue<number>,
) {
  return useKeyboardChatScroll(keyboard, held, SHAPE, extraContentPadding);
}

export function useChatOverlayStyle() {
  return useKeyboardOverlayStyle(0);
}
