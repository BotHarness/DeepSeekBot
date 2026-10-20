import * as QuickActions from 'expo-quick-actions';
import { router } from 'expo-router';
import type { RefCallback } from 'react';

import { hostSession } from '../../host/host-session';
import { useMounted } from '../mounted';

let handledInitial = false;

export function quickActionHref(action: QuickActions.Action | undefined): string | undefined {
  const href = action?.params?.href;
  return typeof href === 'string' && href.startsWith('/') && !href.startsWith('//')
    ? href
    : undefined;
}

type Routing = {
  initial: QuickActions.Action | undefined;
  listen: (handler: (action: QuickActions.Action) => void) => { remove(): void };
  session: { subscribe(listener: () => void): () => void; ready(): boolean };
  navigate: (href: string) => void;
};

export function routeQuickActions({ initial, listen, session, navigate }: Routing): () => void {
  let pending = quickActionHref(initial);
  const drain = () => {
    const href = pending;
    if (href === undefined || !session.ready()) return;
    pending = undefined;
    setTimeout(() => navigate(href), 0);
  };
  const action = listen((next) => {
    pending = quickActionHref(next);
    drain();
  });
  const offSession = session.subscribe(drain);
  drain();
  return () => {
    action.remove();
    offSession();
  };
}

export function useQuickActionRouting(): RefCallback<unknown> {
  return useMounted<unknown>(() => {
    const initial = handledInitial ? undefined : QuickActions.initial;
    handledInitial = true;
    return routeQuickActions({
      initial,
      listen: QuickActions.addListener,
      session: {
        subscribe: hostSession.subscribe,
        ready: () => hostSession.getState().saved !== undefined,
      },
      navigate: (href) => router.navigate(href),
    });
  }, []);
}
