import { useFocusEffect, useIsFocused } from 'expo-router';
import { createContext, useCallback, useContext } from 'react';

export type ProfilePaging = {
  visible: boolean;
  focused: boolean;
  open(): void;
  close(): void;
  leaveChat(): void;
  setEnabled(enabled: boolean): void;
};

export const ProfilePagingContext = createContext<ProfilePaging | undefined>(undefined);

export function useProfilePaging() {
  return useContext(ProfilePagingContext);
}

export function useProfileFocusEffect(effect: () => void | (() => void)) {
  const paging = useProfilePaging();
  const active = paging === undefined || (paging.visible && paging.focused);
  useFocusEffect(useCallback(() => (active ? effect() : undefined), [active, effect]));
}

export function useProfileIsFocused() {
  const focused = useIsFocused();
  const paging = useProfilePaging();
  return focused && (paging === undefined || (paging.visible && paging.focused));
}
