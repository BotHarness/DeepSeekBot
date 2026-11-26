import { Host, ModalBottomSheet, RNHostView } from '@expo/ui/jetpack-compose';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { SystemSheet } from '../primitives/system-sheet';
import type { SheetFrameProps } from './sheet-frame';

export function SheetFrame({
  visible,
  label,
  onClose,
  children,
  resizable,
  androidFill,
}: SheetFrameProps) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardState((state) => (state.isVisible ? state.height : 0));
  const contentHeight = height - insets.top - insets.bottom - theme.touch * 2 - keyboard;
  if (!visible) return null;
  return (
    <Host
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
      <ModalBottomSheet onDismissRequest={onClose} skipPartiallyExpanded={resizable !== true}>
        <RNHostView matchContents={{ vertical: true }}>
          <View
            accessibilityLabel={label}
            onAccessibilityEscape={onClose}
            style={
              resizable === true
                ? { height: contentHeight }
                : {
                    maxHeight: contentHeight,
                    height: androidFill ? contentHeight : undefined,
                    paddingBottom: space.x5,
                  }
            }
          >
            <SystemSheet value>{children}</SystemSheet>
          </View>
        </RNHostView>
      </ModalBottomSheet>
    </Host>
  );
}
