import { useContext, useState, type ComponentPropsWithRef } from 'react';
import { View, type ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import {
  clippedHeight,
  KeyboardFormFooterSpace,
  KeyboardFormNativeFocus,
} from './keyboard-form-context';
import { useNativeFormScroll } from './keyboard-form-native-focus';

export function KeyboardFormScroll(
  props: ComponentPropsWithRef<typeof KeyboardAwareScrollView> & { revealPast?: number },
) {
  const theme = useDesignTheme();
  const footerHeight = useContext(KeyboardFormFooterSpace);
  const [nativeHeight, setNativeHeight] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState(0);
  const {
    enabled = true,
    contentContainerStyle,
    bottomOffset,
    ref,
    onScroll,
    onLayout,
    children,
    revealPast = 0,
    ...rest
  } = props;
  const clipped = clippedHeight(nativeHeight, layoutHeight);
  const clearance = Math.max(
    bottomOffset ??
      Math.max(theme.touch, theme.type.body.line * theme.fontScale + space.x6) + space.x6,
    footerHeight + space.x3,
  );
  const native = useNativeFormScroll(ref, enabled, clearance, revealPast);
  return (
    <KeyboardFormNativeFocus.Provider value={native.focus}>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={clearance}
        {...rest}
        ref={native.ref}
        onLayout={(event) => {
          const next = event.nativeEvent.layout.height;
          setLayoutHeight((current) => (current === next ? current : next));
          onLayout?.(event);
        }}
        onScroll={(event) => {
          const next = event.nativeEvent.layoutMeasurement.height;
          setNativeHeight((current) => (current === next ? current : next));
          onScroll?.(event);
        }}
        enabled={enabled}
        contentContainerStyle={[
          contentContainerStyle,
          ...(footerHeight > 0 ? [{ paddingBottom: footerHeight + space.x5 }] : []),
        ]}
        automaticallyAdjustKeyboardInsets={false}
      >
        {children}
        {clipped > 0 ? (
          <View testID="keyboard-form-clipped-space" style={{ height: clipped }} />
        ) : null}
      </KeyboardAwareScrollView>
    </KeyboardFormNativeFocus.Provider>
  );
}

export function renderKeyboardFormScroll(props: ScrollViewProps) {
  return <KeyboardFormScroll {...props} />;
}
