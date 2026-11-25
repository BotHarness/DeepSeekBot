import { requireNativeView } from 'expo';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions, type ViewProps } from 'react-native';
import { spring } from '../../ui/design/motion';
import { useDesignTheme } from '../../ui/design/theme';
import { overlaySidebar } from '../../ui/design/tokens';
import { useStrings } from '../../ui/strings';
import { useSessionDrawerChrome } from './session-drawer-chrome';
import { SessionDrawerContent } from './session-drawer-content';
import { sessionDrawerWidth } from './session-drawer-model';
import {
  closeSessionDrawer,
  sessionDrawer,
  useDrawerPlace,
  useSessionDrawer,
} from './session-drawer-state';
import { SessionDrawerSurface } from './session-drawer-surface';
import { uikitSessionDrawer } from './uikit-session-drawer';

type NativeDrawerProps = ViewProps & {
  open: boolean;
  animated: boolean;
  enabled: boolean;
  spring: { mass: number; stiffness: number; damping: number };
  shadowRadius: number;
  shadowOpacity: number;
  onOpenChange(event: { nativeEvent: { open: boolean } }): void;
  onDragStart(): void;
};

const NativeDrawer = uikitSessionDrawer
  ? requireNativeView<NativeDrawerProps>('SessionDrawer')
  : undefined;

const release = {
  mass: spring.release.mass,
  stiffness: spring.release.stiffness,
  damping: spring.release.damping,
};

export function SessionDrawer({ children }: { children: ReactNode }) {
  if (NativeDrawer === undefined) return <SessionDrawerSurface>{children}</SessionDrawerSurface>;
  return <UIKitSessionDrawer Native={NativeDrawer}>{children}</UIKitSessionDrawer>;
}

function UIKitSessionDrawer({
  Native,
  children,
}: {
  Native: NonNullable<typeof NativeDrawer>;
  children: ReactNode;
}) {
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  const width = sessionDrawerWidth(useWindowDimensions().width);
  const state = useSessionDrawer();
  const place = useDrawerPlace();
  const holdBackWhileOpen = useSessionDrawerChrome();
  return (
    <Native
      style={{ flex: 1, backgroundColor: theme.color.base }}
      open={state.open}
      animated={state.animated}
      enabled={place.edge > 0}
      spring={release}
      shadowRadius={overlaySidebar.shadow.radius}
      shadowOpacity={overlaySidebar.shadow.opacity[theme.scheme]}
      onOpenChange={({ nativeEvent }) => sessionDrawer.nativeChange(nativeEvent.open)}
      onDragStart={() => sessionDrawer.reveal()}
    >
      <View
        collapsable={false}
        style={{ flex: 1 }}
        accessibilityElementsHidden={state.open}
        importantForAccessibility={state.open ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      <Pressable
        collapsable={false}
        testID="session-drawer-scrim"
        accessibilityRole="button"
        accessibilityLabel={t.closeDrawer}
        accessibilityElementsHidden={!state.open}
        pointerEvents={state.open ? 'auto' : 'none'}
        onPress={() => closeSessionDrawer()}
        style={[StyleSheet.absoluteFill, { backgroundColor: overlaySidebar.dim[theme.scheme] }]}
      />
      <View
        collapsable={false}
        testID="session-drawer-panel"
        accessibilityViewIsModal={state.open}
        accessibilityElementsHidden={!state.open}
        onAccessibilityEscape={() => closeSessionDrawer()}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width,
          backgroundColor: theme.color.base,
        }}
      >
        {state.open ? <View ref={holdBackWhileOpen} /> : null}
        <SessionDrawerContent active={state.open || state.shown} />
      </View>
    </Native>
  );
}
