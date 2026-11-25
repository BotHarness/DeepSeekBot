import type { ReactNode, RefCallback } from 'react';
import { useRouter } from 'expo-router';
import { Platform, Pressable, View, type ViewInstance } from 'react-native';

import type { DesignTheme } from '../design/theme';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { useStrings } from '../strings';
import { SheetGrabber } from './sheet-grabber';
import { SystemSheet } from './system-sheet';

export function sheetScreenOptions(theme: DesignTheme, full = false) {
  return {
    headerShown: false,
    presentation: 'formSheet' as const,
    sheetAllowedDetents: full || Platform.OS === 'android' ? [1] : [0.75, 1],
    sheetGrabberVisible: true,
    ...(Platform.OS === 'ios' ? {} : { contentStyle: { backgroundColor: theme.overlay.fill } }),
    ...(Platform.OS === 'android' ? { sheetCornerRadius: radius.xl } : {}),
  };
}

export function SheetScreen({
  children,
  onMount,
  onClose,
}: {
  children: ReactNode;
  onMount?: RefCallback<ViewInstance>;
  onClose?: () => void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const router = useRouter();
  const close = onClose ?? (() => router.back());
  return (
    <View
      ref={onMount}
      collapsable={false}
      onAccessibilityEscape={close}
      style={{ flex: 1, backgroundColor: Platform.OS === 'ios' ? undefined : theme.overlay.fill }}
    >
      {Platform.OS === 'android' ? (
        <Pressable
          testID="sheet-screen-handle"
          accessibilityRole="button"
          accessibilityLabel={t.close}
          onPress={close}
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
      <SystemSheet value={Platform.OS === 'ios'}>{children}</SystemSheet>
    </View>
  );
}
