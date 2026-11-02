import { useContext, type ComponentPropsWithRef } from 'react';
import type { ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { KeyboardFormFooterSpace, KeyboardFormNativeFocus } from './keyboard-form-context';
import { useNativeFormScroll } from './keyboard-form-native-focus';

export function KeyboardFormScroll(props: ComponentPropsWithRef<typeof KeyboardAwareScrollView>) {
  const theme = useDesignTheme();
  const footerHeight = useContext(KeyboardFormFooterSpace);
  const { enabled = true, contentContainerStyle, bottomOffset, ref, ...rest } = props;
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
        enabled={enabled}
        contentContainerStyle={[
          contentContainerStyle,
          ...(footerHeight > 0 ? [{ paddingBottom: footerHeight + space.x5 }] : []),
        ]}
        automaticallyAdjustKeyboardInsets={false}
      />
    </KeyboardFormNativeFocus.Provider>
  );
}

export function renderKeyboardFormScroll(props: ScrollViewProps) {
  return <KeyboardFormScroll {...props} />;
}
