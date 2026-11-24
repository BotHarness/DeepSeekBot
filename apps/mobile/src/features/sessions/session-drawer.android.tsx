import { Host, RNHostView } from '@expo/ui/jetpack-compose';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { useDesignTheme } from '../../ui/design/theme';
import { SessionDrawerContent } from './session-drawer-content';
import { sessionDrawer, useSessionDrawer } from './session-drawer-state';
import { SessionDrawerSurface } from './session-drawer-surface';

type NativeDrawerProps = ViewProps & {
  open: boolean;
  gesturesEnabled: boolean;
  containerColor: string;
  onOpenChange(event: { nativeEvent: { open: boolean } }): void;
};

const module = requireOptionalNativeModule<{ hasSessionDrawer?(): boolean }>('DismissibleDrawer');
const NativeDrawer =
  typeof module?.hasSessionDrawer === 'function'
    ? requireNativeView<NativeDrawerProps>('DismissibleDrawer', 'SessionDrawerView')
    : undefined;
const Slot = requireNativeView<{ slotName: string; children: ReactNode }>('ExpoUI', 'SlotView');

export function SessionDrawer({ children }: { children: ReactNode }) {
  if (NativeDrawer === undefined) return <SessionDrawerSurface>{children}</SessionDrawerSurface>;
  return (
    <SessionDrawerSurface nativeDrawer={<ComposeSessionDrawer Native={NativeDrawer} />}>
      {children}
    </SessionDrawerSurface>
  );
}

function ComposeSessionDrawer({ Native }: { Native: NonNullable<typeof NativeDrawer> }) {
  const theme = useDesignTheme();
  const state = useSessionDrawer();
  return (
    <Host colorScheme={theme.scheme} seedColor={theme.color.accent} style={{ flex: 1 }}>
      <Native
        open={state.open}
        gesturesEnabled={state.open}
        containerColor={theme.color.base}
        onOpenChange={(event) => sessionDrawer.nativeChange(event.nativeEvent.open)}
      >
        <Slot slotName="panel">
          <RNHostView>
            <View style={{ flex: 1 }}>
              <SessionDrawerContent active={state.open} />
            </View>
          </RNHostView>
        </Slot>
        <Slot slotName="content">
          <RNHostView>
            <View style={{ flex: 1 }} />
          </RNHostView>
        </Slot>
      </Native>
    </Host>
  );
}
