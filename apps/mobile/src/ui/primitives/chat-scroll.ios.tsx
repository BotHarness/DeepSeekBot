import type { ChatKeyboardCoordination } from './chat-scroll';
import { chatKeyboardOffset, nativeChatKeyboard, useChatBottom } from './chat-keyboard';
import { useKeyboardChatScroll, useKeyboardOverlayStyle } from './keyboard-chat-scroll';

function useNativeChatScrollAdapter(keyboard: ChatKeyboardCoordination, held: boolean) {
  const bottom = useChatBottom();
  return useKeyboardChatScroll(keyboard, held, {
    inverted: false,
    offset: chatKeyboardOffset(bottom),
    inset: bottom.safe,
    floor: 0,
  });
}

function useNativeChatOverlayStyle() {
  return useKeyboardOverlayStyle(chatKeyboardOffset(useChatBottom()));
}

export const useChatScrollAdapter = nativeChatKeyboard
  ? useNativeChatScrollAdapter
  : (_keyboard: ChatKeyboardCoordination, _held: boolean) => undefined;

export const useChatOverlayStyle = nativeChatKeyboard ? useNativeChatOverlayStyle : () => undefined;

export function useTimelineIslandFloor(): number {
  return 0;
}
