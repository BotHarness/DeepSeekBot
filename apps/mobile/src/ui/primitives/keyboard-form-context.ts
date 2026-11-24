import { createContext } from 'react';
import type { ViewInstance } from 'react-native';

export const KeyboardFormFooterSpace = createContext(0);
export const KeyboardFormNativeFocus = createContext<
  ((node: ViewInstance, focused: boolean) => void) | undefined
>(undefined);

export function clippedHeight(nativeHeight: number, layoutHeight: number) {
  return layoutHeight > 0 ? Math.max(0, nativeHeight - layoutHeight) : 0;
}

export function revealSnap(offset: number, snaps: readonly number[]) {
  'worklet';
  if (offset <= 0) return undefined;
  let next: number | undefined;
  for (const snap of snaps) if (snap > offset && (next === undefined || snap < next)) next = snap;
  return next;
}
