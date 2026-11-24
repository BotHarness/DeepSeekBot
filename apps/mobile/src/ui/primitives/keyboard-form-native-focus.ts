import { useMemo, type Ref } from 'react';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

export type RevealBand = { start: number; end: number };

export function revealStops(revealPast: number, revealBands: readonly RevealBand[]) {
  const stops = revealBands
    .flatMap((band) => [band.start, band.end])
    .filter((stop) => stop > revealPast);
  return revealPast > 0 ? [revealPast, ...stops].sort((a, b) => a - b) : undefined;
}

export function useNativeFormScroll(
  ref: Ref<KeyboardAwareScrollViewRef> | undefined,
  _enabled: boolean,
  _bottomOffset: number,
  revealPast: number,
  _revealEnd: number,
  revealBands: readonly RevealBand[],
) {
  const snapToOffsets = useMemo(
    () => revealStops(revealPast, revealBands),
    [revealPast, revealBands],
  );
  return { ref, focus: undefined, snapToOffsets };
}
