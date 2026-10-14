import { MOBILE_BOT_QUERY } from './mobile-viewport.js';

export const BOT_MODE_SIDEBAR_QUERY = '(min-width: 960px)';

function matches(query: string): boolean {
  return window.matchMedia(query).matches;
}

export function botModeSidebarViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    matches(BOT_MODE_SIDEBAR_QUERY) &&
    !matches(MOBILE_BOT_QUERY)
  );
}

export function subscribeBotModeSidebarViewport(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const queries = [window.matchMedia(BOT_MODE_SIDEBAR_QUERY), window.matchMedia(MOBILE_BOT_QUERY)];
  for (const query of queries) query.addEventListener('change', listener);
  return () => {
    for (const query of queries) query.removeEventListener('change', listener);
  };
}
