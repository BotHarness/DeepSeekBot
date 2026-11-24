import { useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';

const bottomOf = ({ nativeEvent }: LayoutChangeEvent) =>
  nativeEvent.layout.y + nativeEvent.layout.height;

export function useKeyboardFormSubmit() {
  const theme = useDesignTheme();
  const ref = useRef<KeyboardAwareScrollViewRef>(null);
  const [fieldBottom, setFieldBottom] = useState(0);
  const [submitBottom, setSubmitBottom] = useState(0);
  const bottomOffset =
    submitBottom > fieldBottom
      ? Math.max(
          theme.touch + space.x6 * 2,
          submitBottom - fieldBottom + space.x6 * Math.max(1, theme.fontScale),
        )
      : undefined;
  const revealEnd = bottomOffset === undefined ? 0 : fieldBottom + bottomOffset;
  return {
    scroll: { ref, ...(bottomOffset === undefined ? {} : { bottomOffset, revealEnd }) },
    revealEnd,
    onFieldLayout: (event: LayoutChangeEvent) => setFieldBottom(bottomOf(event)),
    onSubmitLayout: (event: LayoutChangeEvent) => {
      const bottom = bottomOf(event);
      if (bottom === submitBottom) return;
      setSubmitBottom(bottom);
      requestAnimationFrame(() => ref.current?.assureFocusedInputVisible());
    },
  };
}
