import * as QuickActions from 'expo-quick-actions';
import { router } from 'expo-router';
import { useCallback, useRef, type RefCallback } from 'react';

let handledInitial = false;

export function quickActionHref(action: QuickActions.Action | undefined): string | undefined {
  const href = action?.params?.href;
  return typeof href === 'string' && href.startsWith('/') && !href.startsWith('//')
    ? href
    : undefined;
}

function open(action: QuickActions.Action) {
  const href = quickActionHref(action);
  if (href !== undefined) router.navigate(href);
}

export function useQuickActionRouting(): RefCallback<unknown> {
  const subscription = useRef<{ remove(): void } | undefined>(undefined);
  return useCallback((node: unknown) => {
    subscription.current?.remove();
    subscription.current = undefined;
    if (node === null) return;
    const initial = QuickActions.initial;
    if (!handledInitial && initial !== undefined) {
      handledInitial = true;
      setTimeout(() => open(initial));
    }
    subscription.current = QuickActions.addListener(open);
  }, []);
}
