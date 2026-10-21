import { router, usePathname, useGlobalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  AccessibilityInfo,
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

import { cloudClient, useCloudSnapshot } from '../../cloud/native';
import { cloudAvailable } from '../../cloud/available';
import { cloudError } from '../../cloud/client';
import {
  createWorkspaceDirectory,
  cloudViewScope,
  type CloudWorkspace,
  type WorkspaceDirectoryEntry,
} from '../../cloud/workspace-directory';
import { createHostClient } from '../../host/client';
import { createHostGlances, liveGlance, type HostStatus } from '../../host/host-glance';
import { hostSession, useHostSession, useHostSnapshot, useInbox } from '../../host/host-session';
import { nativeCarrier } from '../../host/native-carrier';
import { useHostLook } from '../../host/native-host-look';
import { hostColorInk, hostTileFill, shownHostName, type HostLook } from '../design/host-look';
import { glassShadow, pressTint, useDesignTheme, type DesignTheme } from '../design/theme';
import { useMounted } from '../mounted';
import { drawerSpring, edge, motion, radius, scrim, sidebar, space } from '../design/tokens';
import { SidebarMaterial, useLiquidGlass } from '../primitives/drawer-material';
import { CountBadge } from '../primitives/count-badge';
import { Text } from '../primitives/text';
import { showActionMenu, showAppDialog } from '../primitives/app-dialog';
import { t } from '../strings';
import { HostTile } from './host-tile';
import { ActionMenuButton, type MenuAction } from '../primitives/action-menu-button';
import { WorkspaceTabs, type WorkspaceTab } from './workspace-tabs';
import { WorkspaceAddButton } from './workspace-add';
import {
  addressLines,
  createHostDrawer,
  drawerWidth,
  EDGE_WIDTH,
  hostDrawerRows,
  hostRowBadge,
  settleOpen,
  type HostDrawerRow,
} from './host-drawer-model';
import { ActivityIcon, CloudIcon, ComputerIcon, PlusIcon } from './icons';
import { noticeHostKept } from '../unpair-notice';

export const hostDrawer = createHostDrawer({
  switchTo: async (hostId) => {
    const switched = await hostSession.switchTo(hostId);
    if (switched) router.replace('/');
    return switched;
  },
  pair: () => router.push('/pair'),
  notifications: () => router.push('/notifications'),
});

const glances = createHostGlances((host) =>
  createHostClient({ routes: host.routes, credential: host.credential, carrier: nativeCarrier() }),
);

const progress = makeMutable(0);
const workspaceDirectory = createWorkspaceDirectory(cloudClient);

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
  const width = drawerWidth(useWindowDimensions().width, Platform.OS);
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
  showAppDialog(t.unpairHost(name), t.unpairHostDetail, [
    { text: t.cancel, style: 'cancel' },
    {
      text: t.unpair,
      style: 'destructive',
      onPress: () => {
        if (hostSession.getState().hosts.length <= 1) settle(false);
        return hostSession.unpair(row.hostId).then(
          (result) => {
            if (result?.current === true && row.current && router.canDismiss()) router.dismissAll();
            noticeHostKept(result, name);
          },
          (error: unknown) =>
            showAppDialog(
              `${t.unpairFailed} ${error instanceof Error ? error.message : String(error)}`,
              undefined,
              [{ text: t.done }],
            ),
        );
      },
    },
  ]);
}

function hostMenuActions(row: HostDrawerRow, name: string): MenuAction[] {
  return [
    {
      label: t.hostCustomize,
      icon: 'settings',
      run: () =>
        closeThen(() => router.push({ pathname: '/host-look', params: { hostId: row.hostId } })),
    },
    ...(row.current
      ? []
      : [
          {
            label: t.showHost,
            icon: 'computer' as const,
            run: () => closeThen(() => void hostDrawer.select(row.hostId)),
          },
        ]),
    {
      label: t.unpair,
      icon: 'close',
      run: () => confirmUnpair(row, name),
      destructive: true,
    },
  ];
}

function openHostMenu(row: HostDrawerRow, name: string): void {
  showActionMenu(
    name,
    hostMenuActions(row, name).map((action) => ({
      text: action.label,
      style: action.destructive === true ? ('destructive' as const) : ('default' as const),
      onPress: action.run,
    })),
  );
}

function rowStyle(theme: DesignTheme, glass: boolean, active: boolean, selected = false) {
  if (!glass && Platform.OS === 'android')
    return {
      marginHorizontal: space.x4,
      borderRadius: radius.round,
      overflow: 'hidden' as const,
      backgroundColor: selected
        ? theme.layer.sheet.chosen
        : active
          ? theme.layer.sheet.pressed
          : 'transparent',
    };
  if (!glass)
    return {
      backgroundColor: active || selected ? theme.layer.sheet.pressed : theme.layer.sheet.fill,
    };
  return {
    marginHorizontal: space.x3,
    borderRadius: radius.lg,
    backgroundColor: active || selected ? pressTint(theme.color.fg) : 'transparent',
  };
}

function DrawerTile({ look, name, current }: { look: HostLook; name: string; current: boolean }) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  return (
    <View
      style={{
        padding: space.x1,
        borderRadius: radius.lg,
        borderWidth: edge.focus,
        borderColor: current ? theme.color.fg : glass ? 'transparent' : theme.layer.sheet.fill,
      }}
    >
      <HostTile
        hostName={name}
        icon={look.icon}
        size={theme.type.title.line + space.x3}
        fill={hostTileFill(theme.scheme, theme.color, look.color, theme.layer.sheet.inset)}
        ink={
          look.color === undefined
            ? theme.color.fg
            : hostColorInk(theme.scheme, theme.color, look.color)
        }
      />
    </View>
  );
}

function HostRow({ row, address }: { row: HostDrawerRow; address: string }) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const android = !glass && Platform.OS === 'android';
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
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', paddingRight: space.x2 },
        glass || android ? rowStyle(theme, glass, false, row.current) : null,
      ]}
    >
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
          minHeight: theme.touch + space.x3,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x4,
          paddingLeft: glass || android ? space.x3 : space.x4,
          paddingVertical: space.x3,
          borderRadius: glass ? radius.lg : android ? radius.round : 0,
          backgroundColor: glass
            ? pressed
              ? pressTint(theme.color.fg)
              : 'transparent'
            : android
              ? pressed
                ? pressTint(theme.color.fg)
                : 'transparent'
              : pressed
                ? theme.layer.sheet.pressed
                : theme.layer.sheet.fill,
        })}
      >
        <DrawerTile look={look} name={name} current={row.current} />
        <View style={{ flex: 1, gap: space.x1 }}>
          <Text strong numberOfLines={theme.largeText ? undefined : 1}>
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
            <Text
              variant="meta"
              tone="muted"
              {...(address
                ? addressLines(theme.largeText, Platform.OS)
                : { numberOfLines: theme.largeText ? undefined : 1 })}
              style={{ flexShrink: 1 }}
            >
              {address || status}
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
      <ActionMenuButton
        label={t.hostMore(name)}
        actions={hostMenuActions(row, name)}
        onOpen={() => openHostMenu(row, name)}
      />
    </View>
  );
}

function FooterRow({ label, icon, onPress }: { label: string; icon: ReactNode; onPress(): void }) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
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
        paddingHorizontal: glass ? space.x4 : space.x5,
        paddingVertical: space.x3,
        ...rowStyle(theme, glass, pressed),
      })}
    >
      {icon}
      <Text style={{ flex: 1 }}>{label}</Text>
    </Pressable>
  );
}

function connectionAddress(route: string | undefined): string {
  try {
    return route ? new URL(route).host : '';
  } catch {
    return '';
  }
}

function CloudServiceRow({
  name,
  server,
  onPress,
}: {
  name: string;
  server: string;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[name, t.cloudJoin.signIn, connectionAddress(server)].join(', ')}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch + space.x3,
        padding: space.x4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        ...rowStyle(theme, glass, pressed),
      })}
    >
      <CloudIcon color={theme.color.muted} size={theme.type.title.line + space.x3} />
      <View style={{ flex: 1, gap: space.x1 }}>
        <Text strong numberOfLines={theme.largeText ? undefined : 1}>
          {name}
        </Text>
        <Text variant="meta" tone="muted" {...addressLines(theme.largeText, Platform.OS)}>
          {connectionAddress(server)}
        </Text>
      </View>
    </Pressable>
  );
}

export function WorkspaceButton() {
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

type WorkspaceDrawerItem =
  | { kind: 'host'; key: string; row: HostDrawerRow }
  | { kind: 'workspace'; key: string; workspace: CloudWorkspace; server: string }
  | { kind: 'status'; key: string; entry: WorkspaceDirectoryEntry };

function WorkspaceRow({
  workspace,
  server,
  selected,
  disabled,
  onPress,
}: {
  workspace: CloudWorkspace;
  server: string;
  selected: boolean;
  disabled: boolean;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={[
        workspace.name,
        workspace.role === 'guest' ? t.workspaceGuest : t.cloudOrganizations[workspace.role],
        new URL(server).host,
      ].join(', ')}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        padding: space.x4,
        minHeight: theme.touch + space.x3,
        ...rowStyle(theme, glass, pressed, selected),
      })}
    >
      <HostTile
        hostName={workspace.name}
        size={theme.type.title.line + space.x3}
        fill={theme.layer.sheet.inset}
        ink={theme.color.fg}
      />
      <View style={{ flex: 1, gap: space.x1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
          <Text strong numberOfLines={theme.largeText ? undefined : 1} style={{ flexShrink: 1 }}>
            {workspace.name}
          </Text>
          <CloudIcon color={theme.color.subtle} size={theme.type.body.size} />
        </View>
        <Text variant="meta" tone="muted" numberOfLines={theme.largeText ? undefined : 1}>
          {workspace.role === 'guest' ? t.workspaceGuest + ' · ' : ''}
          {new URL(server).host}
        </Text>
      </View>
    </Pressable>
  );
}

export function HostDrawer() {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const insets = useSafeAreaInsets();
  const width = drawerWidth(useWindowDimensions().width, Platform.OS);
  const reduced = useReducedMotion();
  const state = useSyncExternalStore(hostDrawer.subscribe, hostDrawer.getSnapshot);
  const { saved, hosts, client, inbox } = useHostSession();
  const connection = useHostSnapshot(client).connection;
  const list = useInbox(inbox);
  const glanceMap = useSyncExternalStore(glances.subscribe, glances.getSnapshot);
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ instanceId?: string; organizationId?: string }>();
  const cloud = useCloudSnapshot();
  const directory = useSyncExternalStore(
    workspaceDirectory.subscribe,
    workspaceDirectory.getSnapshot,
  );
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState<string>();
  const cloudRoute = pathname.startsWith('/cloud-');
  const [tab, setTab] = useState<WorkspaceTab>(cloudRoute ? 'cloud' : 'computers');
  const tabMount = useMounted<ViewInstance>(() => {
    if (state.open) setTab(cloudRoute ? 'cloud' : 'computers');
  }, [state.open, cloudRoute]);
  const currentId = cloudRoute ? undefined : saved?.hostId;
  const cloudKey = JSON.stringify(cloud.rows.map(cloudViewScope));
  const cloudMount = useMounted<ViewInstance>(() => {
    if (!state.open || tab !== 'cloud' || !cloud.ready) return;
    void workspaceDirectory.refresh(cloud.rows);
    return () => workspaceDirectory.clear();
  }, [state.open, tab, cloud.ready, cloudKey]);
  const choose = async (workspace: CloudWorkspace) => {
    if (selecting || cloud.busy || directory.busy) return;
    setSelecting(true);
    setSelectionError(undefined);
    try {
      if (workspace.role === 'guest') await cloudClient.whoami(workspace.instanceId);
      else await cloudClient.useOrganization(workspace.instanceId, workspace.organizationId);
      closeThen(() =>
        router.push({
          pathname: '/cloud-channels',
          params: {
            instanceId: workspace.instanceId,
            organizationId: workspace.organizationId,
            guest: workspace.role === 'guest' ? 'true' : 'false',
          },
        }),
      );
    } catch (error) {
      setSelectionError(cloudError(error));
    } finally {
      setSelecting(false);
    }
  };
  const icon = theme.type.title.size + space.x2;

  const rows = useMemo(
    () => hostDrawerRows(hosts, currentId, glanceMap, liveGlance(connection, list)),
    [hosts, currentId, glanceMap, connection, list],
  );

  const tabFocus = useMounted<ViewInstance>(
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

  const drawerRows: WorkspaceDrawerItem[] =
    tab === 'computers'
      ? rows.map((row) => ({ kind: 'host', key: 'host:' + row.hostId, row }))
      : directory.entries.flatMap((entry): WorkspaceDrawerItem[] => [
          ...entry.workspaces.map((workspace): WorkspaceDrawerItem => ({
            kind: 'workspace',
            key: entry.instanceId + ':' + workspace.organizationId,
            workspace,
            server: entry.server,
          })),
          { kind: 'status', key: entry.instanceId + ':status', entry },
        ]);
  const fade = theme.scheme === 'dark' ? scrim.dark : scrim.light;
  const backdropStyle = useAnimatedStyle(() => ({ opacity: clamp(progress.value) * fade }));
  const travel = glass ? width + sidebar.inset : width;
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value - 1) * travel }],
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
        ref={cloudMount}
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
            accessibilityLabel={t.closeWorkspaces}
            onPress={() => settle(false)}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          accessible={false}
          onAccessibilityEscape={() => settle(false)}
          style={[
            glass
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
            panelStyle,
          ]}
        >
          {glass ? <SidebarMaterial cornerRadius={sidebar.radius} /> : null}
          <View
            ref={tabMount}
            style={{
              paddingTop: Math.max(insets.top - (glass ? sidebar.inset : 0), 0) + space.x5,
              paddingHorizontal: space.x5,
              paddingBottom: space.x4,
            }}
          >
            {cloudAvailable && (
              <WorkspaceTabs value={tab} onChange={setTab} selectedRef={tabFocus} />
            )}
          </View>
          <WorkspaceAddButton
            glass={glass}
            label={tab === 'computers' ? t.pairAnother : t.workspaceAdd.join}
            onPress={() =>
              closeThen(() => {
                if (tab === 'computers') hostDrawer.pairNew();
                else router.push('/cloud-join');
              })
            }
          />
          <FlatList<WorkspaceDrawerItem>
            key={tab}
            style={{ flex: 1 }}
            data={drawerRows}
            keyExtractor={(row) => row.key}
            contentContainerStyle={{ paddingBottom: space.x4 }}
            renderItem={({ item }) => {
              if (item.kind === 'host')
                return (
                  <HostRow
                    row={item.row}
                    address={connectionAddress(
                      hosts.find((host) => host.hostId === item.row.hostId)?.routes[0],
                    )}
                  />
                );
              if (item.kind === 'workspace')
                return (
                  <WorkspaceRow
                    workspace={item.workspace}
                    server={item.server}
                    selected={
                      cloudRoute &&
                      params.instanceId === item.workspace.instanceId &&
                      params.organizationId === item.workspace.organizationId
                    }
                    disabled={selecting || cloud.busy || directory.busy}
                    onPress={() => void choose(item.workspace)}
                  />
                );
              const entry = item.entry;
              if (!entry.hasSession)
                return (
                  <CloudServiceRow
                    name={
                      cloud.rows.find((row) => row.config.instanceId === entry.instanceId)?.config
                        .name ?? entry.instanceId
                    }
                    server={entry.server}
                    onPress={() => closeThen(() => router.push('/cloud-services'))}
                  />
                );
              return (
                <View style={{ paddingHorizontal: space.x5, gap: space.x2 }}>
                  {!!entry.error && (
                    <Text accessibilityLiveRegion="polite">
                      {new URL(entry.server).host}: {entry.error}
                    </Text>
                  )}
                  {!directory.busy &&
                    !entry.error &&
                    entry.workspaces.length === 0 &&
                    entry.membersAfter === null &&
                    entry.guestsAfter === null && <Text tone="muted">{t.workspaceEmpty}</Text>}
                  {!directory.busy &&
                    (entry.error || entry.membersAfter !== null || entry.guestsAfter !== null) && (
                      <FooterRow
                        label={entry.error ? t.retry : t.cloudOrganizations.more}
                        icon={<PlusIcon color={theme.color.fg} size={icon} />}
                        onPress={() => void workspaceDirectory.more(entry.instanceId)}
                      />
                    )}
                </View>
              );
            }}
            ListFooterComponent={
              <View>
                {tab === 'cloud' && directory.busy && (
                  <Text style={{ padding: space.x5 }} accessibilityLiveRegion="polite">
                    {t.workspaceLoading}
                  </Text>
                )}
                {tab === 'cloud' && !!selectionError && (
                  <Text style={{ padding: space.x5 }} accessibilityLiveRegion="polite">
                    {selectionError}
                  </Text>
                )}
                {tab === 'cloud' &&
                  cloud.ready &&
                  !directory.busy &&
                  directory.entries.length === 0 && (
                    <Text style={{ padding: space.x5 }} tone="muted">
                      {t.workspaceEmpty}
                    </Text>
                  )}
                {tab === 'computers' && rows.length === 0 && (
                  <Text style={{ padding: space.x5 }} tone="muted">
                    {t.workspaceAdd.noComputers}
                  </Text>
                )}
              </View>
            }
          />
          <View
            style={{
              paddingTop: space.x2,
              paddingBottom: Math.max(insets.bottom - (glass ? sidebar.inset : 0), 0) + space.x2,
              borderTopWidth: edge.hairline,
              borderTopColor: theme.layer.sheet.edge,
            }}
          >
            {tab === 'cloud' && (
              <FooterRow
                label={t.workspaceAdd.manage}
                icon={<CloudIcon color={theme.color.fg} size={icon} />}
                onPress={() => closeThen(() => router.push('/cloud-services'))}
              />
            )}
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
