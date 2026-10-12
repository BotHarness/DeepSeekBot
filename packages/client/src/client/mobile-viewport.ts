import { useSyncExternalStore } from 'react';

export const MOBILE_BOT_QUERY = '(max-width: 760px), (max-width: 1000px) and (max-height: 500px)';

export function mobileBotViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(MOBILE_BOT_QUERY).matches
  );
}

export function subscribeMobileBotViewport(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(MOBILE_BOT_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

export function useMobileBotViewport(): boolean {
  return useSyncExternalStore(subscribeMobileBotViewport, mobileBotViewport, () => false);
}
