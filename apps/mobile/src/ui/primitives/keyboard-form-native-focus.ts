import type { Ref } from 'react';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

export function useNativeFormScroll(
  ref: Ref<KeyboardAwareScrollViewRef> | undefined,
  _enabled: boolean,
  _bottomOffset: number,
  _snaps?: readonly number[],
) {
  return { ref, focus: undefined };
}
