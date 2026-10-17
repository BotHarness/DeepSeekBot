import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActionSheetIOS,
  Alert,
  BackHandler,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  makeMutable,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createHostClient } from '../../host/client';
import { createHostGlances, liveGlance, type HostStatus } from '../../host/host-glance';
import { hostSession, useHostSession, useHostSnapshot, useInbox } from '../../host/host-session';
import { nativeCarrier } from '../../host/native-carrier';
import { useHostLook } from '../../host/native-host-look';
import { shownHostName, type HostLook } from '../design/host-look';
import { glassShadow, useDesignTheme } from '../design/theme';
import { useMounted } from '../mounted';
import { drawerSpring, edge, motion, radius, scrim, space } from '../design/tokens';
import { CountBadge } from '../primitives/count-badge';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { HostTile } from './host-tile';
import {
  createHostDrawer,
  drawerWidth,
  EDGE_WIDTH,
  hostDrawerRows,
  hostRowBadge,
  settleOpen,
  type HostDrawerRow,
} from './host-drawer-model';
import { ActivityIcon, MoreIcon, PlusIcon } from './icons';

export const hostDrawer = createHostDrawer({
  switchTo: (hostId) => hostSession.switchTo(hostId),
  pair: () => router.push('/pair'),
  notifications: () => router.push('/notifications'),
});

const glances = createHostGlances((host) =>
  createHostClient({ routes: host.routes, credential: host.credential, carrier: nativeCarrier() }),
);

const progress = makeMutable(0);

const DRAG_START = 10;
const VERTICAL_FAIL = 15;

function hidden(): void {
  hostDrawer.hidden();
}

function slide(open: boolean, velocity = 0): void {
  progress.value = withSpring(
    open ? 1 : 0,
    { ...drawerSpring, velocity, clamp: { min: 0, max: 1 }, reduceMotion: ReduceMotion.System },
    (finished) => {
      if (finished === true && !open) runOnJS(hidden)();
    },
  );
}

function settle(open: boolean, velocity = 0): void {
  if (open) hostDrawer.open();
  else hostDrawer.close();
  slide(open, velocity);
}

function reveal(): void {
  hostDrawer.reveal();
}

export function focusOn(node: ViewInstance): void {
  AccessibilityInfo.sendAccessibilityEvent?.(node, 'focus');
}

export function openHostDrawer(): void {
  settle(true);
}

export function useHostDrawerOpen(): boolean {
  return useSyncExternalStore(hostDrawer.subscribe, () => hostDrawer.getSnapshot().open);
}

function clamp(value: number): number {
  'worklet';
  return Math.min(1, Math.max(0, value));
}

export function HostDrawerEdge({ children }: { children: ReactNode }) {
  const width = drawerWidth(useWindowDimensions().width);
  const reduced = useReducedMotion();
  const { hosts } = useHostSession();
  const pan = Gesture.Pan()
    .enabled(hosts.length > 0)
    .hitSlop({ left: 0, width: EDGE_WIDTH })
    .activeOffsetX(DRAG_START)
    .failOffsetY([-VERTICAL_FAIL, VERTICAL_FAIL])
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
  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }} collapsable={false}>
        {children}
      </View>
    </GestureDetector>
  );
}

function statusText(status: HostStatus): string {
  return status === 'online' ? t.hostOnline : status === 'offline' ? t.hostOffline : t.hostChecking;
}

function closeThen(action: () => void): void {
  settle(false);
  action();
}

function confirmUnpair(row: HostDrawerRow, name: string): void {
  Alert.alert(t.unpairHost(name), t.unpairHostDetail, [
    { text: t.cancel, style: 'cancel' },
    {
      text: t.unpair,
      style: 'destructive',
      onPress: () => void hostSession.unpair(row.hostId).catch(() => undefined),
    },
  ]);
}

function openHostMenu(row: HostDrawerRow, name: string): void {
  const actions = [
    {
      label: t.hostCustomize,
      run: () =>
        closeThen(() => router.push({ pathname: '/host-look', params: { hostId: row.hostId } })),
    },
    ...(row.current
      ? []
      : [{ label: t.showHost, run: () => closeThen(() => void hostDrawer.select(row.hostId)) }]),
    { label: t.unpair, run: () => confirmUnpair(row, name), destructive: true },
  ];
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: name,
        options: [...actions.map((action) => action.label), t.cancel],
        destructiveButtonIndex: actions.findIndex((action) => action.destructive === true),
        cancelButtonIndex: actions.length,
      },
      (index) => actions[index]?.run(),
    );
    return;
  }
  Alert.alert(name, undefined, [
    { text: t.cancel, style: 'cancel' },
    ...actions.map((action) => ({
      text: action.label,
      style: action.destructive === true ? ('destructive' as const) : ('default' as const),
      onPress: action.run,
    })),
  ]);
}

function DrawerTile({ look, name, current }: { look: HostLook; name: string; current: boolean }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        padding: space.x1,
        borderRadius: radius.lg,
        borderWidth: edge.focus,
        borderColor: current ? theme.color.fg : theme.layer.sheet.fill,
      }}
    >
      <HostTile
        hostName={name}
        avatar={look.avatar}
        size={theme.touch}
        fill={theme.layer.sheet.inset}
        letter={theme.color.fg}
      />
    </View>
  );
}

function HostRow({ row }: { row: HostDrawerRow }) {
  const theme = useDesignTheme();
  const look = useHostLook(row.hostId);
  const name = shownHostName(look, row.hostName);
  const pending = row.glance.pending ?? 0;
  const unread = row.glance.unread ?? 0;
  const badge = hostRowBadge(row.glance);
  const status = statusText(row.glance.status);
  const dot =
    row.glance.status === 'online'
      ? theme.color.success
      : row.glance.status === 'checking'
        ? theme.color.warning
        : theme.color.subtle;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: space.x2 }}>
      <Pressable
        onPress={() => closeThen(() => void hostDrawer.select(row.hostId))}
        onLongPress={() => openHostMenu(row, name)}
        accessibilityRole="button"
        accessibilityLabel={[
          name,
          row.current ? t.showing : undefined,
          status,
          pending > 0 ? t.hostPending(pending) : undefined,
          unread > 0 ? t.hostUnread(unread) : undefined,
        ]
          .filter((part) => part !== undefined)
          .join(', ')}
        accessibilityState={{ selected: row.current }}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: theme.touch + space.x6,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x4,
          paddingLeft: space.x4,
          paddingVertical: space.x3,
          backgroundColor: pressed ? theme.layer.sheet.pressed : theme.layer.sheet.fill,
        })}
      >
        <DrawerTile look={look} name={name} current={row.current} />
        <View style={{ flex: 1, gap: space.x1 }}>
          <Text strong numberOfLines={1}>
            {name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
            <View
              style={{
                width: space.x3,
                height: space.x3,
                borderRadius: radius.round,
                backgroundColor: dot,
              }}
            />
            <Text variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
              {status}
            </Text>
          </View>
        </View>
        {badge === undefined ? null : (
          <CountBadge
            count={badge.count}
            tone={badge.tone}
            label={
              badge.tone === 'needs-you' ? t.hostPending(badge.count) : t.hostUnread(badge.count)
            }
          />
        )}
      </Pressable>
      <Pressable
        onPress={() => openHostMenu(row, name)}
        accessibilityRole="button"
        accessibilityLabel={t.hostMore(name)}
        hitSlop={space.x2}
        style={({ pressed }) => ({
          width: theme.touch,
          height: theme.touch,
          borderRadius: radius.round,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? theme.layer.sheet.pressed : theme.layer.sheet.fill,
        })}
      >
        <MoreIcon color={theme.color.muted} size={theme.type.title.size + space.x2} />
      </Pressable>
    </View>
  );
}

function FooterRow({ label, icon, onPress }: { label: string; icon: ReactNode; onPress(): void }) {
  const theme = useDesignTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x5,
        paddingHorizontal: space.x5,
        paddingVertical: space.x3,
        backgroundColor: pressed ? theme.layer.sheet.pressed : theme.layer.sheet.fill,
      })}
    >
      {icon}
      <Text style={{ flex: 1 }}>{label}</Text>
    </Pressable>
  );
}

export function HostDrawer() {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const width = drawerWidth(useWindowDimensions().width);
  const reduced = useReducedMotion();
  const state = useSyncExternalStore(hostDrawer.subscribe, hostDrawer.getSnapshot);
  const { saved, hosts, client, inbox } = useHostSession();
  const connection = useHostSnapshot(client).connection;
  const list = useInbox(inbox);
  const glanceMap = useSyncExternalStore(glances.subscribe, glances.getSnapshot);
  const currentId = saved?.hostId;
  const icon = theme.type.title.size + space.x2;

  const rows = useMemo(
    () => hostDrawerRows(hosts, currentId, glanceMap, liveGlance(connection, list)),
    [hosts, currentId, glanceMap, connection, list],
  );

  const heading = useMounted<ViewInstance>(
    (node) => {
      if (!state.open) return;
      const stopWatching = glances.watch(hosts);
      const focus = setTimeout(() => focusOn(node), motion.drawer);
      const back = BackHandler.addEventListener('hardwareBackPress', () => {
        settle(false);
        return true;
      });
      return () => {
        stopWatching();
        clearTimeout(focus);
        back.remove();
      };
    },
    [state.open, hosts],
  );

  const fade = theme.scheme === 'dark' ? scrim.dark : scrim.light;
  const backdropStyle = useAnimatedStyle(() => ({ opacity: clamp(progress.value) * fade }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value - 1) * width }],
  }));

  const swipe = Gesture.Pan()
    .enabled(state.open)
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
        style={StyleSheet.absoluteFill}
        pointerEvents={state.open ? 'auto' : 'none'}
        accessibilityElementsHidden={!state.open}
        importantForAccessibility={state.open ? 'auto' : 'no-hide-descendants'}
      >
        {state.open ? <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} /> : null}
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
            accessibilityLabel={t.closeComputers}
            onPress={() => settle(false)}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[
            {
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
            panelStyle,
          ]}
        >
          <View
            ref={heading}
            accessible
            accessibilityRole="header"
            accessibilityLabel={t.computers}
            style={{
              paddingTop: insets.top + space.x5,
              paddingHorizontal: space.x5,
              paddingBottom: space.x4,
            }}
          >
            <Text variant="display">{t.computers}</Text>
          </View>
          <FlatList
            style={{ flex: 1 }}
            data={rows}
            keyExtractor={(row) => row.hostId}
            contentContainerStyle={{ paddingBottom: space.x4 }}
            renderItem={({ item }) => <HostRow row={item} />}
          />
          <View
            style={{
              borderTopWidth: edge.hairline,
              borderTopColor: theme.layer.sheet.divider,
              paddingTop: space.x3,
              paddingBottom: insets.bottom + space.x3,
            }}
          >
            <FooterRow
              label={t.pairAnother}
              icon={<PlusIcon color={theme.color.fg} size={icon} />}
              onPress={() => closeThen(() => hostDrawer.pairNew())}
            />
            <FooterRow
              label={t.cloud.title}
              icon={<PlusIcon color={theme.color.fg} size={icon} />}
              onPress={() => closeThen(() => router.push('/cloud-services'))}
            />
            <FooterRow
              label={t.notifications}
              icon={<ActivityIcon color={theme.color.fg} size={icon} />}
              onPress={() => closeThen(() => hostDrawer.openNotifications())}
            />
          </View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
