import type { ReactNode } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { SheetGrabber } from '../primitives/sheet-grabber';
import { useStrings } from '../strings';

export interface SheetFrameProps {
  visible: boolean;
  label: string;
  onClose(): void;
  children: ReactNode;
  avoidKeyboard: boolean;
  animationType: 'none' | 'slide' | 'fade';
}

function Grabber() {
  return (
    <View style={{ alignSelf: 'center', marginBottom: space.x3 }}>
      <SheetGrabber />
    </View>
  );
}

export function SheetFrame({
  visible,
  label,
  onClose,
  children,
  avoidKeyboard,
  animationType,
}: SheetFrameProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType={animationType} onRequestClose={onClose}>
      {visible ? (
        <KeyboardAvoidingView
          behavior="padding"
          enabled={avoidKeyboard}
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: theme.scrim,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.cancel}
            onPress={onClose}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            }}
          />
          <View
            accessibilityViewIsModal
            accessibilityLabel={label}
            onAccessibilityEscape={onClose}
            style={{
              maxHeight: height - insets.top - theme.touch,
              backgroundColor: theme.overlay.fill,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              paddingTop: space.x3,
              paddingBottom: Math.max(insets.bottom, space.x5),
              overflow: 'hidden',
            }}
          >
            <Grabber />
            {children}
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </Modal>
  );
}
