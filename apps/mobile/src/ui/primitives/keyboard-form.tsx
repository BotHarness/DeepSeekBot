import { useContext, useState, type ComponentPropsWithRef } from 'react';
import type { ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import {
  clippedHeight,
  KeyboardFormFooterSpace,
  KeyboardFormNativeFocus,
  KeyboardFormVisibleHeight,
} from './keyboard-form-context';
import { useNativeFormScroll } from './keyboard-form-native-focus';

export function KeyboardFormScroll(props: ComponentPropsWithRef<typeof KeyboardAwareScrollView>) {
  const theme = useDesignTheme();
  const footerHeight = useContext(KeyboardFormFooterSpace);
  const visibleHeight = useContext(KeyboardFormVisibleHeight);
  const [height, setHeight] = useState(0);
  const { enabled = true, contentContainerStyle, bottomOffset, ref, onScroll, ...rest } = props;
  const reserved = footerHeight > 0 ? footerHeight + clippedHeight(height, visibleHeight) : 0;
  const clearance = Math.max(
    bottomOffset ??
      Math.max(theme.touch, theme.type.body.line * theme.fontScale + space.x6) + space.x6,
    footerHeight + space.x3,
  );
  const native = useNativeFormScroll(ref, enabled, clearance);
  return (
    <KeyboardFormNativeFocus.Provider value={native.focus}>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={clearance}
        {...rest}
        ref={native.ref}
        onScroll={(event) => {
          const next = event.nativeEvent.layoutMeasurement.height;
          setHeight((current) => (current === next ? current : next));
          onScroll?.(event);
        }}
        enabled={enabled}
        contentContainerStyle={[
          contentContainerStyle,
          ...(reserved > 0 ? [{ paddingBottom: reserved + space.x5 }] : []),
        ]}
        automaticallyAdjustKeyboardInsets={false}
      />
    </KeyboardFormNativeFocus.Provider>
  );
}

export function renderKeyboardFormScroll(props: ScrollViewProps) {
  return <KeyboardFormScroll {...props} />;
}
