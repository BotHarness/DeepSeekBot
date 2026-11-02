import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import {
  frame,
  padding,
  presentationDetents,
  presentationDragIndicator,
} from '@expo/ui/swift-ui/modifiers';
import { useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import type { SheetFrameProps } from './sheet-frame';
import { sheetContentCap, sheetDetent } from './sheet-detent';

export function SheetFrame({
  visible,
  label,
  onClose,
  onDismissed,
  children,
  avoidKeyboard,
}: SheetFrameProps) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardState((state) => (state.isVisible ? state.height : 0));
  const [content, setContent] = useState<number>();
  const [shown, setShown] = useState(false);
  const [round, setRound] = useState(0);
  const open = useRef(visible);
  open.current = visible;
  if (visible && !shown) setShown(true);
  if (!visible && !shown) return null;
  const room = { window: height, top: insets.top, bottom: insets.bottom, touch: theme.touch };
  return (
    <Host
      key={`${theme.scheme}-${round}`}
      colorScheme={theme.scheme}
      pointerEvents="none"
      style={{ position: 'absolute' }}
    >
      <BottomSheet
        isPresented={visible}
        onIsPresentedChange={(presented) => {
          if (!presented) onClose();
        }}
        onDismiss={() => {
          if (open.current) {
            setRound((value) => value + 1);
            return;
          }
          setShown(false);
          setContent(undefined);
          onDismissed?.();
        }}
      >
        <Group
          modifiers={[
            frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'top' }),
            padding({ top: space.x6 }),
            presentationDetents([sheetDetent(room, content, avoidKeyboard || keyboard > 0)]),
            presentationDragIndicator('visible'),
          ]}
        >
          <RNHostView matchContents={{ vertical: true }}>
            <View
              accessibilityLabel={label}
              onAccessibilityEscape={onClose}
              onLayout={(event) => setContent(event.nativeEvent.layout.height)}
              style={{
                maxHeight: sheetContentCap(room, keyboard),
                paddingBottom: space.x5,
              }}
            >
              {children}
            </View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}
