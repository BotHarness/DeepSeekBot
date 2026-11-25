import { Host, RNHostView } from '@expo/ui/jetpack-compose';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
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

const module = requireOptionalNativeModule<{ hasModalSessionDrawer?(): boolean }>(
  'DismissibleDrawer',
);
const NativeDrawer =
  typeof module?.hasModalSessionDrawer === 'function'
    ? requireNativeView<NativeDrawerProps>('DismissibleDrawer', 'SessionDrawerView')
    : undefined;
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
            <View
              style={{ flex: 1, backgroundColor: theme.color.base }}
              importantForAccessibility={state.open ? 'no-hide-descendants' : 'auto'}
            >
              {children}
            </View>
          </RNHostView>
        </Slot>
      </Native>
    </Host>
  );
}
