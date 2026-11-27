import { Host, RNHostView } from '@expo/ui/jetpack-compose';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ReactNode } from 'react';
import { I18nManager, View, type ViewProps } from 'react-native';
import { useDesignTheme } from '../../ui/design/theme';
import { useSessionDrawerChrome } from './session-drawer-chrome';
import { SessionDrawerContent } from './session-drawer-content';
import { sessionDrawer, useDrawerPlace, useSessionDrawer } from './session-drawer-state';
import { SessionDrawerSurface } from './session-drawer-surface';

type NativeDrawerProps = ViewProps & {
  open: boolean;
  gesturesEnabled: boolean;
  containerColor: string;
  onOpenChange(event: { nativeEvent: { open: boolean } }): void;
  onProgress(event: { nativeEvent: { progress: number } }): void;
};

type NativeDrawerContentProps = ViewProps & {
  drawerSwipeEnabled?: boolean;
  rtl?: boolean;
};

const module = requireOptionalNativeModule<{
  hasModalSessionDrawer?(): boolean;
  hasSessionDrawerContentGate?(): boolean;
}>('DismissibleDrawer');
const NativeDrawer =
  typeof module?.hasModalSessionDrawer === 'function'
    ? requireNativeView<NativeDrawerProps>('DismissibleDrawer', 'SessionDrawerView')
    : undefined;
const NativeContentGate =
  typeof module?.hasSessionDrawerContentGate === 'function'
    ? requireNativeView<NativeDrawerContentProps>('DismissibleDrawer', 'SessionDrawerContentGate')
    : undefined;
const DrawerContent = NativeContentGate ?? View;
const Slot = requireNativeView<{ slotName: string; children: ReactNode }>('ExpoUI', 'SlotView');

export function SessionDrawer({ children }: { children: ReactNode }) {
  if (NativeDrawer === undefined) return <SessionDrawerSurface>{children}</SessionDrawerSurface>;
  return <ComposeSessionDrawer Native={NativeDrawer}>{children}</ComposeSessionDrawer>;
}

function ComposeSessionDrawer({
  Native,
  children,
}: {
  Native: NonNullable<typeof NativeDrawer>;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const state = useSessionDrawer();
  const place = useDrawerPlace();
  const holdBackWhileOpen = useSessionDrawerChrome();
  const gateProps = NativeContentGate
    ? { drawerSwipeEnabled: place.edge > 0 && !state.open && !state.shown, rtl: I18nManager.isRTL }
    : {};
  return (
    <Host colorScheme={theme.scheme} seedColor={theme.color.accent} style={{ flex: 1 }}>
      <Native
        open={state.open}
        gesturesEnabled={place.edge > 0 || state.open}
        containerColor={theme.color.base}
        onOpenChange={({ nativeEvent }) => sessionDrawer.nativeChange(nativeEvent.open)}
        onProgress={({ nativeEvent }) => sessionDrawer.nativeProgress(nativeEvent.progress)}
      >
        <Slot slotName="panel">
          <RNHostView>
            <View style={{ flex: 1 }}>
              {state.open ? <View ref={holdBackWhileOpen} /> : null}
              <SessionDrawerContent active={state.open || state.shown} />
            </View>
          </RNHostView>
        </Slot>
        <Slot slotName="content">
          <RNHostView>
            <DrawerContent
              {...gateProps}
              style={{ flex: 1, backgroundColor: theme.color.base }}
              importantForAccessibility={state.open ? 'no-hide-descendants' : 'auto'}
            >
              {children}
            </DrawerContent>
          </RNHostView>
        </Slot>
      </Native>
    </Host>
  );
}
