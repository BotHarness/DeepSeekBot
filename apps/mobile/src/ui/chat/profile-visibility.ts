import { useIsFocused } from 'expo-router';
import { createContext, useContext, useEffect, type EffectCallback } from 'react';

// Routes are visible by default; retained panels supply their presentation state.
export const ProfileVisibility = createContext(true);
export const RevealProfileConversation = createContext<(() => void) | undefined>(undefined);

export function useProfileFocused(): boolean {
  const focused = useIsFocused();
  return useContext(ProfileVisibility) && focused;
}

export function useProfileFocusEffect(effect: EffectCallback): void {
  const focused = useProfileFocused();
  useEffect(() => (focused ? effect() : undefined), [focused, effect]);
}
