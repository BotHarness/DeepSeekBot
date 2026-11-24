import { useSyncExternalStore } from 'react';
import { Keyboard } from 'react-native';
import { makeMutable, runOnJS, withSpring } from 'react-native-reanimated';
import { spring } from '../../ui/design/motion';

export interface SessionDrawerState {
  open: boolean;
  shown: boolean;
}

let state: SessionDrawerState = { open: false, shown: false };
const listeners = new Set<() => void>();

export const sessionDrawerProgress = makeMutable(0);

function publish(next: SessionDrawerState): void {
  if (next.open === state.open && next.shown === state.shown) return;
  state = next;
  for (const listener of listeners) listener();
}

function hidden(): void {
  if (!state.open) publish({ open: false, shown: false });
}

export const sessionDrawer = {
  getSnapshot: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  reveal() {
    Keyboard.dismiss();
    publish({ open: state.open, shown: true });
  },
  settle(open: boolean, velocity = 0, animate = true) {
    if (open) Keyboard.dismiss();
    publish({ open, shown: true });
    if (!animate) {
      sessionDrawerProgress.value = open ? 1 : 0;
      if (!open) hidden();
      return;
    }
    sessionDrawerProgress.value = withSpring(
      open ? 1 : 0,
      { ...spring.release, velocity, overshootClamping: true },
      (finished) => {
        if (finished === true && !open) runOnJS(hidden)();
      },
    );
  },
  nativeChange(open: boolean) {
    if (open) Keyboard.dismiss();
    publish({ open, shown: true });
    sessionDrawerProgress.value = withSpring(open ? 1 : 0, {
      ...spring.effects.default,
      overshootClamping: true,
    });
  },
};

export function openSessionDrawer(): void {
  sessionDrawer.settle(true);
}

export function closeSessionDrawer(animate = true): void {
  if (state.open || state.shown) sessionDrawer.settle(false, 0, animate);
}

export function useSessionDrawer(): SessionDrawerState {
  return useSyncExternalStore(sessionDrawer.subscribe, sessionDrawer.getSnapshot);
}

type Place = { edge: number; sessionId: string | undefined };
let place: Place = { edge: 0, sessionId: undefined };
const placeListeners = new Set<() => void>();

function setPlace(next: Place): void {
  place = next;
  for (const listener of placeListeners) listener();
}

export function enterDrawerRoot(sessionId?: string): () => void {
  setPlace({ edge: place.edge + 1, sessionId });
  return () => {
    setPlace({
      edge: place.edge - 1,
      sessionId: place.sessionId === sessionId ? undefined : place.sessionId,
    });
  };
}

export function drawerPlace(): Place {
  return place;
}

export function useDrawerPlace(): Place {
  return useSyncExternalStore((listener) => {
    placeListeners.add(listener);
    return () => {
      placeListeners.delete(listener);
    };
  }, drawerPlace);
}
