import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

const readActive = () => AppState.currentState === 'active';

function subscribeActive(notify: () => void) {
  const subscription = AppState.addEventListener('change', notify);
  return () => subscription.remove();
}

export function useAppActive(): boolean {
  return useSyncExternalStore(subscribeActive, readActive);
}
