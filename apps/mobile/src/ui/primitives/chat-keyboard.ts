import { createContext, use } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '../design/tokens';

export const nativeChatKeyboard = process.env.EXPO_PUBLIC_CHAT_KEYBOARD !== 'padding';

export function composerKeyboardGap(safeBottom: number): number {
  return Math.max(0, safeBottom - space.x3);
}

export const ChatIslandInset = createContext(0);

export type ChatBottom = { safe: number; island: number };

export function chatBottom(safeBottom: number, island: number): ChatBottom {
  return island > 0 ? { safe: 0, island } : { safe: safeBottom, island: 0 };
}

export function useChatBottom(): ChatBottom {
  return chatBottom(useSafeAreaInsets().bottom, use(ChatIslandInset));
}

export function chatKeyboardOffset({ safe, island }: ChatBottom): number {
  return composerKeyboardGap(safe) + island;
}
