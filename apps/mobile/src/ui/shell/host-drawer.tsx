import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSyncExternalStore, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import { useHostSession } from '../../host/host-session';
import { glassShadow, useDesignTheme } from '../design/theme';
import { useMounted } from '../mounted';
import { radius, scrim, sidebar } from '../design/tokens';
import { SidebarMaterial, useLiquidGlass } from '../primitives/drawer-material';
import { useStrings } from '../strings';
import { drawerSwipe, drawerWidth, settleOpen } from './host-drawer-model';
import { ComputerIcon } from './icons';
import { NativeHostDrawer, nativeHostDrawer } from './native-host-drawer';
import {
  useHostDrawerOpen,
  dock,
  dockedOpenChange,
  reveal,
  progress,
  settle,
  openHostDrawer,
  useDocked,
  hostDrawer,
} from './host-drawer-state';
import { WorkspacePanel } from './workspace-panel';
export { hostDrawer, focusOn, openHostDrawer, useHostDrawerOpen } from './host-drawer-state';
export { WorkspacePanel } from './workspace-panel';

const DRAG_START = 10;
const VERTICAL_FAIL = 15;

function clamp(value: number): number {
  'worklet';
  return Math.min(1, Math.max(0, value));
}

export function HostDrawerEdge({
  children,
  anywhere = false,
  enabled = true,
}: {
  children: ReactNode;
  anywhere?: boolean;
  enabled?: boolean;
}) {
  if (anywhere && nativeHostDrawer) return <DockedHostDrawer>{children}</DockedHostDrawer>;
  return (
    <PanHostDrawerEdge anywhere={anywhere} enabled={enabled}>
      {children}
    </PanHostDrawerEdge>
  );
}

function DockedHostDrawer({ children }: { children: ReactNode }) {
  const t = useStrings();
  const { hosts } = useHostSession();
  const open = useHostDrawerOpen();
  const focused = useIsFocused();
  const mount = useMounted<ViewInstance>(() => {
    if (!focused) return;
    dock(1);
    return () => {
      dockedOpenChange(false);
      dock(-1);
    };
  }, [focused]);
  return (
    <View ref={mount} style={{ flex: 1 }} collapsable={false}>
      <NativeHostDrawer
        open={open && focused}
        enabled={hosts.length > 0}
        closeLabel={t.closeWorkspaces}
        panel={<HostDrawerPanel docked />}
        onOpenChange={dockedOpenChange}
      >
        {children}
      </NativeHostDrawer>
    </View>
  );
}

function PanHostDrawerEdge({
  children,
  anywhere,
  enabled,
}: {
  children: ReactNode;
  anywhere: boolean;
  enabled: boolean;
}) {
  const width = drawerWidth(useWindowDimensions().width, Platform.OS);
  const reduced = useReducedMotion();
  const { hosts } = useHostSession();
  const swipe = drawerSwipe(Platform.OS, anywhere);
  const pan = Gesture.Pan()
    .enabled(enabled && hosts.length > 0)
    .activeOffsetX(swipe.activeX)
    .failOffsetY([-swipe.failY, swipe.failY])
    .onStart(() => {
      runOnJS(reveal)();
    })
    .onUpdate((event) => {
      if (!reduced) progress.value = clamp(event.translationX / width);
    })
    .onEnd((event) => {
      runOnJS(settle)(
        settleOpen(clamp(event.translationX / width), event.velocityX),
        event.velocityX / width,
      );
    });
  if (swipe.hitSlop) pan.hitSlop(swipe.hitSlop);
  const pushed = useAnimatedStyle(() => ({
    transform: [{ translateX: swipe.push ? clamp(progress.value) * width : 0 }],
  }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ flex: 1 }, pushed]} collapsable={false}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

export function WorkspaceButton() {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <Pressable
      onPress={openHostDrawer}
      accessibilityRole="button"
      accessibilityLabel={t.workspaces}
      style={({ pressed }) => ({
        minWidth: theme.touch,
        minHeight: theme.touch,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.round,
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
      })}
    >
      <ComputerIcon color={theme.color.fg} size={theme.type.title.line} />
    </Pressable>
  );
}

export function HostDrawer() {
  return useDocked() ? null : <HostDrawerPanel docked={false} />;
}

function HostDrawerPanel({ docked }: { docked: boolean }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const width = drawerWidth(useWindowDimensions().width, Platform.OS);
  const reduced = useReducedMotion();
  const state = useSyncExternalStore(hostDrawer.subscribe, hostDrawer.getSnapshot);
  const fade = theme.scheme === 'dark' ? scrim.dark : scrim.light;
  const backdropStyle = useAnimatedStyle(() => ({ opacity: clamp(progress.value) * fade }));
  const travel = glass ? width + sidebar.inset : width;
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value - 1) * travel }],
  }));

  const swipe = Gesture.Pan()
    .enabled(state.open && !docked)
    .activeOffsetX(-DRAG_START)
    .failOffsetY([-VERTICAL_FAIL, VERTICAL_FAIL])
    .onUpdate((event) => {
      if (!reduced) progress.value = clamp(1 + event.translationX / width);
    })
    .onEnd((event) => {
      runOnJS(settle)(
        settleOpen(clamp(1 + event.translationX / width), event.velocityX),
        event.velocityX / width,
      );
    });

  return (
    <GestureDetector gesture={swipe}>
      <View
        style={docked ? { flex: 1 } : StyleSheet.absoluteFill}
        pointerEvents={state.open ? 'auto' : 'none'}
        accessibilityElementsHidden={!state.open}
        importantForAccessibility={state.open ? 'auto' : 'no-hide-descendants'}
      >
        {state.open ? <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} /> : null}
        {docked ? null : (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: theme.scheme === 'dark' ? theme.layer.canvas.fill : theme.color.fg,
              },
              backdropStyle,
            ]}
          >
            <Pressable
              style={{ flex: 1 }}
              accessibilityRole="button"
              accessibilityLabel={t.closeWorkspaces}
              onPress={() => settle(false)}
            />
          </Animated.View>
        )}
        <Animated.View
          accessibilityViewIsModal
          accessible={false}
          onAccessibilityEscape={() => settle(false)}
          style={[
            docked
              ? { flex: 1 }
              : glass
                ? {
                    position: 'absolute',
                    top: sidebar.inset,
                    bottom: sidebar.inset,
                    left: sidebar.inset,
                    width,
                    borderRadius: sidebar.radius,
                    overflow: 'hidden',
                  }
                : {
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width,
                    backgroundColor: theme.overlay.fill,
                    borderTopRightRadius: radius.lg,
                    borderBottomRightRadius: radius.lg,
                    boxShadow: glassShadow(theme.scheme),
                    overflow: 'hidden',
                  },
            docked ? undefined : panelStyle,
          ]}
        >
          {glass ? <SidebarMaterial cornerRadius={sidebar.radius} /> : null}
          <WorkspacePanel active={state.shown} docked={docked} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
