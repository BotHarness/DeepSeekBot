import { createContext } from 'react';
import type { ViewInstance } from 'react-native';

export const KeyboardFormFooterSpace = createContext(0);
export const KeyboardFormNativeFocus = createContext<
  ((node: ViewInstance, focused: boolean) => void) | undefined
>(undefined);
