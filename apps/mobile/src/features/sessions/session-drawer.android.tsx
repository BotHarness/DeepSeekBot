import { Host, RNHostView } from '@expo/ui/jetpack-compose';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { useFocusEffect } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { View, type ViewInstance, type ViewProps } from 'react-native';
import { useMounted } from '../../ui/mounted';
import { holdBack } from '../../ui/shell/back-owner';
import { useDesignTheme } from '../../ui/design/theme';
import { SessionDrawerContent } from './session-drawer-content';
import {
  closeSessionDrawer,
  sessionDrawer,
  useDrawerPlace,
  useSessionDrawer,
} from './session-drawer-state';
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
  useFocusEffect(useCallback(() => () => closeSessionDrawer(false), []));
  const holdBackWhileOpen = useMounted<ViewInstance>(() => {
    const held = holdBack(() => {
      closeSessionDrawer();
      return true;
    });
    return () => held.remove();
  }, []);
  return (
    <View style={{ flex: 1 }}>
      {state.open ? <View ref={holdBackWhileOpen} /> : null}
      <Host colorScheme={theme.scheme} seedColor={theme.color.accent} style={{ flex: 1 }}>
        <Native
          open={state.open}
          gesturesEnabled={place.edge > 0}
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
              <View
                style={{ flex: 1 }}
                importantForAccessibility={state.open ? 'no-hide-descendants' : 'auto'}
              >
                {children}
              </View>
            </RNHostView>
          </Slot>
        </Native>
      </Host>
    </View>
  );
}
