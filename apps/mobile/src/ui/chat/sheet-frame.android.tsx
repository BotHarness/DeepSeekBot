import { Host, ModalBottomSheet, RNHostView } from '@expo/ui/jetpack-compose';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import type { SheetFrameProps } from './sheet-frame';

export function SheetFrame({ visible, label, onClose, children }: SheetFrameProps) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardState((state) => (state.isVisible ? state.height : 0));
  if (!visible) return null;
  return (
    <Host
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
      <ModalBottomSheet onDismissRequest={onClose} skipPartiallyExpanded>
        <RNHostView matchContents={{ vertical: true }}>
          <View
            accessibilityLabel={label}
            onAccessibilityEscape={onClose}
            style={{
              maxHeight: height - insets.top - insets.bottom - theme.touch * 2 - keyboard,
              paddingBottom: space.x5,
            }}
          >
            {children}
          </View>
        </RNHostView>
      </ModalBottomSheet>
    </Host>
  );
}
