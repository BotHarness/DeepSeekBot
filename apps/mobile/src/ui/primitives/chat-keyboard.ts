import { space } from '../design/tokens';

export const nativeChatKeyboard = process.env.EXPO_PUBLIC_CHAT_KEYBOARD !== 'padding';

export function composerKeyboardGap(safeBottom: number): number {
  return Math.max(0, safeBottom - space.x3);
}
