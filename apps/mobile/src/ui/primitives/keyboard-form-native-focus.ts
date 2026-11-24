import type { Ref } from 'react';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

export type RevealBand = { start: number; end: number };

export function useNativeFormScroll(
  ref: Ref<KeyboardAwareScrollViewRef> | undefined,
  _enabled: boolean,
  _bottomOffset: number,
  _revealPast: number,
  _revealEnd: number,
  _revealBands: readonly RevealBand[],
) {
  return { ref, focus: undefined };
}
