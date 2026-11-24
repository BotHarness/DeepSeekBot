import type { ChatKeyboardCoordination } from './chat-scroll';
import { useChatBottom } from './chat-keyboard';
import { useKeyboardChatScroll, useKeyboardOverlayStyle } from './keyboard-chat-scroll';

export function useChatScrollAdapter(keyboard: ChatKeyboardCoordination, held: boolean) {
  const { island } = useChatBottom();
  return useKeyboardChatScroll(keyboard, held, { inverted: true, offset: island, inset: 0 });
}

export function useChatOverlayStyle() {
  return useKeyboardOverlayStyle(useChatBottom().island);
}
