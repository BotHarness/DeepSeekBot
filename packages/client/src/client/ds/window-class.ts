import { useSyncExternalStore } from 'react';
import { TOBS_BREAKPOINTS } from './tobs-tokens.generated.js';

export type WindowClass = 'compact' | 'medium' | 'expanded';

const medium = `(min-width: ${TOBS_BREAKPOINTS.medium})`;
const expanded = `(min-width: ${TOBS_BREAKPOINTS.expanded})`;
const mediumWidth = Number.parseFloat(TOBS_BREAKPOINTS.medium);
const expandedWidth = Number.parseFloat(TOBS_BREAKPOINTS.expanded);

export function viewportMedia(query: string): MediaQueryList | undefined {
  return typeof matchMedia === 'function' ? matchMedia(query) : undefined;
}

export function layoutViewportWidth(): number {
  return typeof document === 'undefined' ? 0 : (document.body?.clientWidth ?? 0);
}

export function getWindowClass(): WindowClass {
  const width = layoutViewportWidth();
  if (width > 0)
    return width >= expandedWidth ? 'expanded' : width >= mediumWidth ? 'medium' : 'compact';
  if (viewportMedia(expanded)?.matches) return 'expanded';
  if (viewportMedia(medium)?.matches === false) return 'compact';
  return typeof matchMedia === 'function' ? 'medium' : 'expanded';
}

export function subscribeLayoutViewport(
  mediaQueries: readonly string[],
  onChange: () => void,
): () => void {
  const queries = mediaQueries.map(viewportMedia);
  for (const query of queries) query?.addEventListener('change', onChange);
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(onChange) : undefined;
  if (typeof document !== 'undefined' && document.body) resize?.observe(document.body);
  return () => {
    for (const query of queries) query?.removeEventListener('change', onChange);
    resize?.disconnect();
  };
}

export const subscribeWindowClass = (onChange: () => void): (() => void) =>
  subscribeLayoutViewport([medium, expanded], onChange);

const serverWindowClass = (): WindowClass => 'expanded';

export function useWindowClass(): WindowClass {
  return useSyncExternalStore(subscribeWindowClass, getWindowClass, serverWindowClass);
}
