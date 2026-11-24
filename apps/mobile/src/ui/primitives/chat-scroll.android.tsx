import type { ChatKeyboardCoordination } from './chat-scroll';
import { useChatBottom } from './chat-keyboard';
import { useKeyboardChatScroll, useKeyboardOverlayStyle } from './keyboard-chat-scroll';

export function useChatScrollAdapter(keyboard: ChatKeyboardCoordination, held: boolean) {
  const { island } = useChatBottom();
  return useKeyboardChatScroll(keyboard, held, {
    inverted: true,
    offset: 0,
    inset: 0,
    floor: island,
  });
}

export function useChatOverlayStyle() {
  return useKeyboardOverlayStyle(0, useChatBottom().island);
}
