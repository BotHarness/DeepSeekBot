import { Host, RNHostView } from '@expo/ui/jetpack-compose';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import { useDesignTheme } from '../design/theme';
import type { NativeHostDrawerProps } from './native-host-drawer';

type NativeDrawerProps = ViewProps & {
  open: boolean;
  gesturesEnabled: boolean;
  closeLabel: string;
  onOpenChange(event: { nativeEvent: { open: boolean } }): void;
};

const installed = requireOptionalNativeModule('DismissibleDrawer') !== null;

export const nativeHostDrawer = installed && process.env.EXPO_PUBLIC_ANDROID_NATIVE_DRAWER === 'on';

const NativeDrawer = installed
  ? requireNativeView<NativeDrawerProps>('DismissibleDrawer', 'DismissibleDrawerView')
  : undefined;
const Slot = requireNativeView<{ slotName: string; children: ReactNode }>('ExpoUI', 'SlotView');

export function NativeHostDrawer({
  open,
  enabled,
  closeLabel,
  panel,
  children,
  onOpenChange,
}: NativeHostDrawerProps) {
  const theme = useDesignTheme();
  if (NativeDrawer === undefined) return children;
  return (
    <Host colorScheme={theme.scheme} seedColor={theme.color.accent} style={{ flex: 1 }}>
      <NativeDrawer
        open={open}
        gesturesEnabled={enabled}
        closeLabel={closeLabel}
        onOpenChange={(event) => onOpenChange(event.nativeEvent.open)}
      >
        <Slot slotName="panel">
          <RNHostView>
            <View style={{ flex: 1 }}>{panel}</View>
          </RNHostView>
        </Slot>
        <Slot slotName="content">
          <RNHostView>
            <View
              style={{ flex: 1 }}
              importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}
            >
              {children}
            </View>
          </RNHostView>
        </Slot>
      </NativeDrawer>
    </Host>
  );
}
