import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import {
  frame,
  padding,
  presentationDetents,
  presentationDragIndicator,
} from '@expo/ui/swift-ui/modifiers';
import { useRef, useState } from 'react';
import { Modal, View, useWindowDimensions } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { SystemSheet, systemSheetBackdrop } from '../primitives/system-sheet';
import type { SheetFrameProps } from './sheet-frame';
import { sheetContentCap, sheetDetent, type SheetDetent } from './sheet-detent';

export function SheetFrame({
  visible,
  label,
  onClose,
  onDismissed,
  children,
  avoidKeyboard,
  fill,
  resizable,
}: SheetFrameProps) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardState((state) => (state.isVisible ? state.height : 0));
  const [content, setContent] = useState<number>();
  const [shown, setShown] = useState(false);
  const [round, setRound] = useState(0);
  const [detent, setDetent] = useState<SheetDetent>('medium');
  const open = useRef(visible);
  open.current = visible;
  if (visible && !shown) setShown(true);
  if (fill)
    return (
      <Modal
        visible={visible}
        presentationStyle="pageSheet"
        backdropColor={systemSheetBackdrop()}
        animationType="slide"
        onRequestClose={onClose}
        onDismiss={onDismissed}
      >
        <View
          accessibilityLabel={label}
          onAccessibilityEscape={onClose}
          style={{
            flex: 1,
            paddingTop: space.x6,
            paddingBottom: Math.max(insets.bottom, keyboard) + space.x5,
          }}
        >
          <SystemSheet value>{children}</SystemSheet>
        </View>
      </Modal>
    );
  if (!visible && !shown) return null;
  const room = { window: height, top: insets.top, bottom: insets.bottom, touch: theme.touch };
  const typing = avoidKeyboard || keyboard > 0;
  const resizing = resizable === true && !typing;
  return (
    <Host
      key={round}
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
          setDetent('medium');
          onDismissed?.();
        }}
      >
        <Group
          modifiers={[
            frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'top' }),
            padding({ top: space.x6 }),
            resizing
              ? presentationDetents(['medium', 'large'], {
                  selection: detent,
                  onSelectionChange: (next) => setDetent(next === 'large' ? 'large' : 'medium'),
                })
              : presentationDetents([sheetDetent(room, content, typing)]),
            presentationDragIndicator('visible'),
          ]}
        >
          <RNHostView matchContents={resizable === true ? false : { vertical: true }}>
            <View
              accessibilityLabel={label}
              onAccessibilityEscape={onClose}
              onLayout={(event) => setContent(event.nativeEvent.layout.height)}
              style={
                resizable === true
                  ? { flex: 1, paddingBottom: space.x5 }
                  : { maxHeight: sheetContentCap(room, keyboard), paddingBottom: space.x5 }
              }
            >
              <SystemSheet value>{children}</SystemSheet>
            </View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}
