import { useSyncExternalStore } from 'react';

export const DOCK_FALLBACK_QUERY =
  '(max-width: 960px), (max-width: 1000px) and (max-height: 500px)';

function channelDockViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    !window.matchMedia(DOCK_FALLBACK_QUERY).matches
  );
}

function subscribeChannelDockViewport(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(DOCK_FALLBACK_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

export function useChannelDockViewport(): boolean {
  return useSyncExternalStore(subscribeChannelDockViewport, channelDockViewport, () => false);
}
