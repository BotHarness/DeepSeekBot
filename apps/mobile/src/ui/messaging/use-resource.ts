import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';

import type { Loaded, Resource } from '../../host/messaging-settings';

const LOADING = { status: 'loading' } as const;

export function useResource<T>(source: Resource<T> | undefined): Loaded<T> {
  const subscribe = useCallback(
    (listener: () => void) => source?.subscribe(listener) ?? (() => undefined),
    [source],
  );
  const read = useCallback((): Loaded<T> => source?.get() ?? LOADING, [source]);
  return useSyncExternalStore(subscribe, read, read);
}

export function useFocusedResource<T>(source: Resource<T> | undefined): Loaded<T> {
  useFocusEffect(
    useCallback(() => {
      void source?.load();
    }, [source]),
  );
  return useResource(source);
}

export function staleChange(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  return /stale|conflict|revision|unavailable/u.test(code);
}
