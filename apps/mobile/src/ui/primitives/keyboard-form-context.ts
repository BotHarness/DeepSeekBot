import { createContext } from 'react';
import type { ViewInstance } from 'react-native';

export const KeyboardFormFooterSpace = createContext(0);
export const KeyboardFormVisibleHeight = createContext(0);
export const KeyboardFormNativeFocus = createContext<
  ((node: ViewInstance, focused: boolean) => void) | undefined
>(undefined);

export function clippedHeight(scrollHeight: number, visibleHeight: number) {
  return visibleHeight > 0 ? Math.max(0, scrollHeight - visibleHeight) : 0;
}
