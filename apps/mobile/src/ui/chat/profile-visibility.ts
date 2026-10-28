import { useIsFocused } from 'expo-router';
import { createContext, useContext, useLayoutEffect, type EffectCallback } from 'react';

export const ProfileVisibility = createContext(true);
export const RevealProfileConversation = createContext<(() => void) | undefined>(undefined);

export function useProfileFocused(): boolean {
  const focused = useIsFocused();
  return useContext(ProfileVisibility) && focused;
}

export function useProfileFocusEffect(effect: EffectCallback): void {
  const focused = useProfileFocused();
  useLayoutEffect(() => (focused ? effect() : undefined), [focused, effect]);
}
