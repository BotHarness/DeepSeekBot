import { useContext, type ComponentPropsWithRef } from 'react';
import type { ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { KeyboardFormFooterSpace } from './keyboard-form-context';

export function KeyboardFormScroll(props: ComponentPropsWithRef<typeof KeyboardAwareScrollView>) {
  const theme = useDesignTheme();
  const footerHeight = useContext(KeyboardFormFooterSpace);
  const { enabled = true, contentContainerStyle, bottomOffset, ...rest } = props;
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      bottomOffset={Math.max(
        bottomOffset ??
          Math.max(theme.touch, theme.type.body.line * theme.fontScale + space.x6) + space.x6,
        footerHeight + space.x3,
      )}
      {...rest}
      enabled={enabled}
      contentContainerStyle={[
        contentContainerStyle,
        ...(footerHeight > 0 ? [{ paddingBottom: footerHeight + space.x5 }] : []),
      ]}
      automaticallyAdjustKeyboardInsets={false}
    />
  );
}

export function renderKeyboardFormScroll(props: ScrollViewProps) {
  return <KeyboardFormScroll {...props} />;
}
