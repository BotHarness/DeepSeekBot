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
  return {
    scroll: { ref, ...(bottomOffset === undefined ? {} : { bottomOffset }) },
    onFieldLayout: (event: LayoutChangeEvent) => setFieldBottom(bottomOf(event)),
    onSubmitLayout: (event: LayoutChangeEvent) => {
      const bottom = bottomOf(event);
      if (bottom === submitBottom) return;
      setSubmitBottom(bottom);
      requestAnimationFrame(() => ref.current?.assureFocusedInputVisible());
    },
  };
}
