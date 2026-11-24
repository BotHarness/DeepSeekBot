import { useFocusEffect, useNavigation } from 'expo-router';
import { createContext, use, useCallback, useState } from 'react';

export const EntranceSettled = createContext<boolean | undefined>(undefined);

const settleFallbackMs = 700;

export function useEntranceSettled(): boolean {
  const owned = use(EntranceSettled);
  const navigation = useNavigation();
  const [settled, setSettled] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (owned !== undefined) return;
      const timer = setTimeout(() => setSettled(true), settleFallbackMs);
      const stop = navigation.addListener(
        'transitionEnd' as never,
        ((event: { data?: { closing?: boolean } }) => {
          if (event.data?.closing !== true) setSettled(true);
        }) as never,
      );
      return () => {
        clearTimeout(timer);
        stop();
      };
    }, [navigation, owned]),
  );
  return owned ?? settled;
}
