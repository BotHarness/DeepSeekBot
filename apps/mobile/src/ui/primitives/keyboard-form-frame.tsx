import { useState, type ReactNode } from 'react';
import { View, type ColorValue } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardFormFooterSpace } from './keyboard-form-context';

export function KeyboardFormFrame({
  children,
  footer,
  backgroundColor,
}: {
  children: ReactNode;
  footer: ReactNode;
  backgroundColor: ColorValue;
}) {
  const insets = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);
  return (
    <KeyboardFormFooterSpace.Provider value={footer ? footerHeight : 0}>
      <View style={{ flex: 1, backgroundColor }} testID="keyboard-form-frame">
        <View style={{ flex: 1, overflow: 'hidden' }}>{children}</View>
        {footer ? (
          <KeyboardStickyView
            offset={{ closed: 0, opened: insets.bottom }}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor }}
            onLayout={({ nativeEvent }) =>
              setFooterHeight((current) =>
                current === nativeEvent.layout.height ? current : nativeEvent.layout.height,
              )
            }
          >
            {footer}
          </KeyboardStickyView>
        ) : null}
      </View>
    </KeyboardFormFooterSpace.Provider>
  );
}
