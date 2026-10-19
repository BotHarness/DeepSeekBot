import type { ReactNode, RefCallback } from 'react';
import { useRouter } from 'expo-router';
import { Platform, Pressable, View, type ViewInstance } from 'react-native';

import type { DesignTheme } from '../design/theme';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { t } from '../strings';
import { SheetGrabber } from './sheet-grabber';

export function sheetScreenOptions(theme: DesignTheme, full = false) {
  return {
    headerShown: false,
    presentation: 'formSheet' as const,
    sheetAllowedDetents: full ? [1] : [0.75, 1],
    sheetGrabberVisible: true,
    contentStyle: { backgroundColor: theme.overlay.fill },
    ...(Platform.OS === 'android' ? { sheetCornerRadius: radius.xl } : {}),
  };
}

export function SheetScreen({
  children,
  onMount,
  onClose,
  modalGrabber = false,
}: {
  children: ReactNode;
  onMount?: RefCallback<ViewInstance>;
  onClose?: () => void;
  modalGrabber?: boolean;
}) {
  const theme = useDesignTheme();
  const router = useRouter();
  const close = onClose ?? (() => router.back());
  return (
    <View
      ref={onMount}
      onAccessibilityEscape={onClose}
      style={{ flex: 1, backgroundColor: theme.overlay.fill }}
    >
      {Platform.OS === 'ios' && modalGrabber ? (
        <Pressable
          testID="sheet-modal-handle"
          accessible
          accessibilityRole="button"
          accessibilityLabel={t.close}
          onPress={close}
          onAccessibilityTap={close}
          onAccessibilityEscape={close}
          style={({ pressed }) => ({
            alignSelf: 'center',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: theme.touch + space.x6,
            minHeight: theme.touch,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <SheetGrabber />
        </Pressable>
      ) : null}
      {Platform.OS === 'android' ? (
        <Pressable
          testID="sheet-screen-handle"
          accessibilityRole="button"
          accessibilityLabel={t.close}
          onPress={onClose ?? (() => router.back())}
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: theme.touch,
            paddingVertical: space.x3,
          }}
        >
          <SheetGrabber />
        </Pressable>
      ) : null}
      {children}
    </View>
  );
}
