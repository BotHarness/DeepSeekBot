import type { Ref } from 'react';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

export function useNativeFormScroll(
  ref: Ref<KeyboardAwareScrollViewRef> | undefined,
  _enabled: boolean,
  _bottomOffset: number,
) {
  return { ref, focus: undefined };
}
