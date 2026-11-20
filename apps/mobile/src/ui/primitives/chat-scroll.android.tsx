import type { ChatKeyboardCoordination } from './chat-scroll';
import { useKeyboardChatScroll, useKeyboardOverlayStyle } from './keyboard-chat-scroll';

const SHAPE = { inverted: true, offset: 0, inset: 0 };

export function useChatScrollAdapter(keyboard: ChatKeyboardCoordination, held: boolean) {
  return useKeyboardChatScroll(keyboard, held, SHAPE);
}

export function useChatOverlayStyle() {
  return useKeyboardOverlayStyle(0);
}
