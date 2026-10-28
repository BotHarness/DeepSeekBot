import { useFocusEffect, useIsFocused } from 'expo-router';
import { createContext, useCallback, useContext, type EffectCallback } from 'react';

export const ProfileVisibility = createContext(true);
export const RevealProfileConversation = createContext<(() => void) | undefined>(undefined);

export function useProfileFocused(): boolean {
  const focused = useIsFocused();
  return useContext(ProfileVisibility) && focused;
}

export function useProfileFocusEffect(effect: EffectCallback): void {
  const focused = useProfileFocused();
  useFocusEffect(useCallback(() => (focused ? effect() : undefined), [focused, effect]));
}
