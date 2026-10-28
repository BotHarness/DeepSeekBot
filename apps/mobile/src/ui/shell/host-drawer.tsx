import { router, useIsFocused, usePathname, useGlobalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  AccessibilityInfo,
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
import { computerEnvironmentKey } from '../../host/conversation-environments';
import { conversationFilter, useConversationFilter } from '../../host/native-conversation-filter';

import type { ConnectHost } from '../../host/connect-account';
import { connectAccount } from '../../host/native-connect-account';
import { liveGlance, type HostStatus } from '../../host/host-glance';
import {
  hostSession,
  useHostSession,
  useHostSnapshot,
  useInbox,
  useHostSessions,
} from '../../host/host-session';

import { useHostLook } from '../../host/native-host-look';
import { hostColorInk, hostTileFill, shownHostName, type HostLook } from '../design/host-look';
import { glassShadow, pressTint, useDesignTheme, type DesignTheme } from '../design/theme';
import { useMounted } from '../mounted';
import { spring } from '../design/motion';
import { edge, motion, radius, scrim, sidebar, space, workspaceStack } from '../design/tokens';
import { HeaderCircleButton } from '../chat/header-chrome';
import { HumanAvatarButton } from './human-avatar';
import { SidebarMaterial, useLiquidGlass } from '../primitives/drawer-material';
import { SettingsForm } from '../primitives/settings-form';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { CountBadge } from '../primitives/count-badge';
import { Text } from '../primitives/text';
import { showActionMenu, showAppDialog } from '../primitives/app-dialog';
import { useStrings, t } from '../strings';
import { HostTile } from './host-tile';
import { ActionMenuButton, type MenuAction } from '../primitives/action-menu-button';
import { ContextMenuArea, nativeContextMenu } from '../primitives/context-menu';
import { MENU_SYMBOL } from '../primitives/menu-symbols';
import { WorkspaceTabs, type WorkspaceTab } from './workspace-tabs';
import { WorkspaceAddButton } from './workspace-add';
import { useFloatingTabInset } from './floating-tab-inset';
import {
  addressLines,
  createHostDrawer,
  drawerSwipe,
  drawerWidth,
  hostDrawerRows,
  hostRowBadge,
  settleOpen,
  unpairedAccountHosts,
  type HostDrawerRow,
} from './host-drawer-model';
import { ActivityIcon, ChatsIcon, CloudIcon, ComputerIcon, PlusIcon } from './icons';
import { noticeHostKept } from '../unpair-notice';
import { chooseCloudWorkspace, showWorkspaceRoot } from './native-workspace-navigation';
import { holdBack } from './back-owner';
import { NativeHostDrawer, nativeHostDrawer } from './native-host-drawer';

export const hostDrawer = createHostDrawer({
  switchTo: (hostId, current) => hostSession.switchTo(hostId, current),
  showView: (hostId) => {
    conversationFilter.set(hostId === undefined ? 'all' : computerEnvironmentKey(hostId));
    if (!showWorkspaceRoot())
      showAppDialog(t.channelOpeningNotReady, undefined, [{ text: t.done }]);
  },
  pair: () => router.push('/pair'),
  notifications: () => router.push('/notifications'),
  failed: () => showAppDialog(t.channelOpeningFailed, undefined, [{ text: t.done }]),
});

const progress = makeMutable(0);
const workspaceDirectory = createWorkspaceDirectory(cloudClient);

const DRAG_START = 10;
const VERTICAL_FAIL = 15;

let docked = 0;
const dockedWatchers = new Set<() => void>();

function dock(by: number): void {
  docked += by;
  for (const watcher of dockedWatchers) watcher();
}

function watchDocked(watcher: () => void): () => void {
  dockedWatchers.add(watcher);
  return () => dockedWatchers.delete(watcher);
}

function useDocked(): boolean {
  return useSyncExternalStore(watchDocked, () => docked > 0);
}

function hidden(): void {
  hostDrawer.hidden();
}

function slide(open: boolean, velocity = 0): void {
  progress.value = withSpring(
    open ? 1 : 0,
    { ...spring.release, velocity, overshootClamping: true },
    (finished) => {
      if (finished === true && !open) runOnJS(hidden)();
    },
  );
}

function settle(open: boolean, velocity = 0): void {
  if (open) hostDrawer.open();
  else hostDrawer.close();
  if (docked === 0) slide(open, velocity);
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

function dockedOpenChange(open: boolean): void {
  if (open) {
    hostDrawer.open();
    return;
  }
  hostDrawer.close();
  hostDrawer.hidden();
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
      label: t.connectionRoutes.title,
      icon: 'computer',
      run: () =>
        closeThen(() =>
          router.push({ pathname: '/host-connection', params: { hostId: row.hostId } }),
        ),
    },
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
      icon: action.icon,
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

const loadAccountName = () => connectAccount.email().then((email) => email ?? undefined);

function StackedHostTile({ row, first }: { row: HostDrawerRow; first: boolean }) {
  const theme = useDesignTheme();
  const look = useHostLook(row.hostId);
  return (
    <View
      style={{
        marginLeft: first ? 0 : -workspaceStack.overlap,
        padding: workspaceStack.ring,
        borderRadius: radius.md,
        backgroundColor: theme.layer.sheet.fill,
      }}
    >
      <HostTile
        hostName={shownHostName(look, row.hostName)}
        icon={look.icon}
        size={workspaceStack.tile}
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

function StackedHostTiles({ rows }: { rows: readonly HostDrawerRow[] }) {
  return (
    <View testID="drawer-all-stack" style={{ flexDirection: 'row' }}>
      {rows.slice(0, workspaceStack.max).map((row, index) => (
        <StackedHostTile key={row.hostId} row={row} first={index === 0} />
      ))}
    </View>
  );
}

function HostRow({
  row,
  address,
  selected,
}: {
  row: HostDrawerRow;
  address: string;
  selected: boolean;
}) {
  const t = useStrings();
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
        glass || android ? rowStyle(theme, glass, false, selected) : null,
      ]}
    >
      <ContextMenuArea
        fill
        actions={hostMenuActions(row, name).map((action) => ({
          key: action.label,
          label: action.label,
          systemImage: MENU_SYMBOL[action.icon],
          run: action.run,
          ...(action.destructive === true ? { destructive: true } : {}),
        }))}
      >
        <Pressable
          testID={`drawer-host-${row.hostId}`}
          onPress={() => closeThen(() => void hostDrawer.select(row.hostId))}
          {...(nativeContextMenu ? {} : { onLongPress: () => openHostMenu(row, name) })}
          accessibilityRole="button"
          accessibilityLabel={[
            name,
            selected ? t.showing : undefined,
            status,
            pending > 0 ? t.hostPending(pending) : undefined,
            unread > 0 ? t.hostUnread(unread) : undefined,
          ]
            .filter((part) => part !== undefined)
            .join(', ')}
          accessibilityState={{ selected }}
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
          <DrawerTile look={look} name={name} current={selected} />
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
      </ContextMenuArea>
      <ActionMenuButton
        label={t.hostMore(name)}
        actions={hostMenuActions(row, name)}
        onOpen={() => openHostMenu(row, name)}
      />
    </View>
  );
}

function HostFormRow({
  row,
  address,
  selected,
}: {
  row: HostDrawerRow;
  address: string;
  selected: boolean;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const look = useHostLook(row.hostId);
  const name = shownHostName(look, row.hostName);
  const pending = row.glance.pending ?? 0;
  const unread = row.glance.unread ?? 0;
  const badge = hostRowBadge(row.glance);
  const status = statusText(row.glance.status);
  return (
    <SettingsRow
      testID={`drawer-host-${row.hostId}`}
      title={name}
      detail={[status, address].filter((part) => part !== '').join(' · ')}
      leading={
        <HostTile
          hostName={name}
          icon={look.icon}
          size={workspaceStack.tile}
          fill={hostTileFill(theme.scheme, theme.color, look.color, theme.layer.sheet.inset)}
          ink={
            look.color === undefined
              ? theme.color.fg
              : hostColorInk(theme.scheme, theme.color, look.color)
          }
        />
      }
      {...(selected ? { control: { kind: 'check' as const } } : {})}
      trailing={
        badge === undefined ? undefined : (
          <CountBadge
            count={badge.count}
            tone={badge.tone}
            label={
              badge.tone === 'needs-you' ? t.hostPending(badge.count) : t.hostUnread(badge.count)
            }
          />
        )
      }
      accessory={
        <ActionMenuButton
          label={t.hostMore(name)}
          actions={hostMenuActions(row, name)}
          onOpen={() => openHostMenu(row, name)}
        />
      }
      selected={selected}
      accessibilityLabel={[
        name,
        selected ? t.showing : undefined,
        status,
        pending > 0 ? t.hostPending(pending) : undefined,
        unread > 0 ? t.hostUnread(unread) : undefined,
      ]
        .filter((part) => part !== undefined)
        .join(', ')}
      onPress={() => void hostDrawer.select(row.hostId)}
    />
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
  const t = useStrings();
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

function AccountHostRow({ host, onPress }: { host: ConnectHost; onPress(): void }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const status = host.online ? t.pairAccount.pair : t.pairAccount.offline;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        host.online
          ? t.pairAccount.pairWith(host.name)
          : [t.pairAccount.pairWith(host.name), status].join(', ')
      }
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
      <ComputerIcon color={theme.color.muted} size={theme.type.title.line + space.x3} />
      <View style={{ flex: 1, gap: space.x1 }}>
        <Text strong numberOfLines={theme.largeText ? undefined : 1}>
          {host.name}
        </Text>
        <Text variant="meta" tone="muted" numberOfLines={theme.largeText ? undefined : 1}>
          {status}
        </Text>
      </View>
    </Pressable>
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

type WorkspaceDrawerItem =
  | { kind: 'all'; key: string }
  | { kind: 'host'; key: string; row: HostDrawerRow }
  | { kind: 'account-title'; key: string }
  | { kind: 'account'; key: string; host: ConnectHost }
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
  const t = useStrings();
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

export function WorkspacePanel({
  active,
  page = false,
  docked = false,
}: {
  active: boolean;
  page?: boolean;
  docked?: boolean;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const insets = useSafeAreaInsets();
  const bottom = useFloatingTabInset();
  const { saved, hosts, client, inbox } = useHostSession();
  const [filter] = useConversationFilter();
  const connection = useHostSnapshot(client).connection;
  const list = useInbox(inbox);
  const feeds = useHostSessions();
  const glanceMap = useMemo(
    () =>
      Object.fromEntries(
        feeds.map((host) => [
          host.saved.hostId,
          {
            ...liveGlance(host.snapshot.connection, host.attention),
            ...(host.attention.status === 'ready'
              ? {
                  unread: Object.values(host.attention.unread ?? {}).filter((count) => count > 0)
                    .length,
                }
              : {}),
          },
        ]),
      ),
    [feeds],
  );
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
    if (active) setTab(cloudRoute ? 'cloud' : 'computers');
  }, [active, cloudRoute]);
  const [linked, setLinked] = useState<ConnectHost[]>([]);
  const accountMount = useMounted<ViewInstance>(() => {
    if (!active || tab !== 'computers') return;
    let live = true;
    setLinked([]);
    void connectAccount.email().then(async (email) => {
      if (email === null) return;
      const listed = await connectAccount.hosts();
      if (live && listed.ok) setLinked(listed.value);
    });
    return () => {
      live = false;
    };
  }, [active, tab]);
  const currentId = cloudRoute ? undefined : saved?.hostId;
  const cloudKey = JSON.stringify(cloud.rows.map(cloudViewScope));
  const cloudMount = useMounted<ViewInstance>(() => {
    if (!active || tab !== 'cloud' || !cloud.ready) return;
    void workspaceDirectory.refresh(cloud.rows);
    return () => workspaceDirectory.clear();
  }, [active, tab, cloud.ready, cloudKey]);
  const choose = async (workspace: CloudWorkspace) => {
    if (selecting || cloud.busy || directory.busy) return;
    const current = hostDrawer.beginWorkspaceSelection();
    setSelecting(true);
    setSelectionError(undefined);
    try {
      if (await chooseCloudWorkspace(workspace, current)) settle(false);
    } catch (error) {
      if (current()) setSelectionError(cloudError(error));
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
      if (!active || page) return;

      const focus = setTimeout(() => focusOn(node), motion.drawer);
      const back = docked
        ? undefined
        : holdBack(() => {
            settle(false);
            return true;
          });
      return () => {
        clearTimeout(focus);
        back?.remove();
      };
    },
    [active, page, docked, hosts],
  );

  const unpaired = unpairedAccountHosts(linked, hosts);
  const drawerRows: WorkspaceDrawerItem[] =
    tab === 'computers'
      ? [
          { kind: 'all', key: 'all' },
          ...rows.map((row): WorkspaceDrawerItem => ({
            kind: 'host',
            key: 'host:' + row.hostId,
            row,
          })),
          ...(unpaired.length === 0
            ? []
            : [
                { kind: 'account-title', key: 'account-title' } as const,
                ...unpaired.map((host): WorkspaceDrawerItem => ({
                  kind: 'account',
                  key: 'account:' + host.id,
                  host,
                })),
              ]),
        ]
      : directory.entries.flatMap((entry): WorkspaceDrawerItem[] => [
          ...entry.workspaces.map((workspace): WorkspaceDrawerItem => ({
            kind: 'workspace',
            key: entry.instanceId + ':' + workspace.organizationId,
            workspace,
            server: entry.server,
          })),
          { kind: 'status', key: entry.instanceId + ':status', entry },
        ]);
  const top = (
    <>
      <View
        ref={tabMount}
        style={{
          paddingTop: Math.max(insets.top - (glass ? sidebar.inset : 0), 0) + space.x5,
          paddingHorizontal: space.x5,
          paddingBottom: space.x4,
        }}
      >
        {cloudAvailable && <WorkspaceTabs value={tab} onChange={setTab} selectedRef={tabFocus} />}
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
    </>
  );
  const status = (
    <View ref={page ? undefined : accountMount}>
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
      {tab === 'cloud' && cloud.ready && !directory.busy && directory.entries.length === 0 && (
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
  );
  const actions = (
    <View
      style={{
        paddingTop: space.x2,
        paddingBottom: page
          ? bottom
          : Math.max(insets.bottom - (glass ? sidebar.inset : 0), 0) + space.x2,
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
  );

  const allSelected = !cloudRoute && filter === 'all';
  const title = (
    <View
      ref={tabMount}
      style={{
        paddingTop: insets.top + space.x2,
        paddingHorizontal: space.x5,
        paddingBottom: space.x3,
        gap: space.x4,
      }}
    >
      <Text variant="display" accessibilityRole="header" numberOfLines={1}>
        {t.workspaces}
      </Text>
      {cloudAvailable && <WorkspaceTabs value={tab} onChange={setTab} selectedRef={tabFocus} />}
    </View>
  );
  const form = (
    <SettingsForm testID="workspace-panel">
      <SettingsSection>
        <SettingsRow
          testID="workspace-pair"
          title={t.pairAnother}
          tone="accent"
          icon="add"
          iconTone="accent"
          onPress={() => hostDrawer.pairNew()}
        />
      </SettingsSection>
      <SettingsSection footer={rows.length === 0 ? t.workspaceAdd.noComputers : undefined}>
        <SettingsRow
          testID="drawer-all"
          title={t.allEnvironmentsRow}
          leading={
            rows.length > 0 ? (
              <StackedHostTiles rows={rows} />
            ) : (
              <ChatsIcon color={theme.color.accent} size={workspaceStack.tile} />
            )
          }
          {...(allSelected ? { control: { kind: 'check' as const } } : {})}
          selected={allSelected}
          onPress={() => hostDrawer.selectAll()}
        />
        {rows.map((row) => (
          <HostFormRow
            key={row.hostId}
            row={row}
            selected={!cloudRoute && filter === computerEnvironmentKey(row.hostId)}
            address={connectionAddress(hosts.find((host) => host.hostId === row.hostId)?.routes[0])}
          />
        ))}
      </SettingsSection>
      {unpaired.length === 0 ? null : (
        <SettingsSection title={t.pairAccount.drawerTitle}>
          {unpaired.map((host) => (
            <SettingsRow
              key={host.id}
              title={host.name}
              detail={host.online ? t.pairAccount.pair : t.pairAccount.offline}
              icon="computer"
              accessibilityLabel={
                host.online
                  ? t.pairAccount.pairWith(host.name)
                  : [t.pairAccount.pairWith(host.name), t.pairAccount.offline].join(', ')
              }
              onPress={() =>
                router.push({ pathname: '/pair/account', params: { account: host.id } })
              }
            />
          ))}
        </SettingsSection>
      )}
    </SettingsForm>
  );
  const bar = (
    <View
      ref={accountMount}
      testID="workspace-panel-bar"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space.x4,
        paddingTop: space.x2,
        paddingBottom: Math.max(insets.bottom, space.x4),
      }}
    >
      <HumanAvatarButton
        testID="workspace-account"
        loadName={loadAccountName}
        onPress={() => router.push('/settings')}
      />
      <HeaderCircleButton
        testID="workspace-notifications"
        label={t.notifications}
        onPress={() => hostDrawer.openNotifications()}
      >
        <ActivityIcon color={theme.color.fg} size={theme.type.title.line} />
      </HeaderCircleButton>
    </View>
  );

  if (page && tab === 'computers')
    return (
      <View ref={cloudMount} style={{ flex: 1, backgroundColor: theme.overlay.fill }}>
        {title}
        {form}
        {bar}
      </View>
    );

  return (
    <View
      ref={cloudMount}
      style={{ flex: 1, ...(page ? { backgroundColor: theme.overlay.fill } : {}) }}
    >
      {page ? title : top}
      <FlatList<WorkspaceDrawerItem>
        key={tab}
        testID={page ? 'workspace-panel' : undefined}
        style={{ flex: 1 }}
        data={drawerRows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={{ paddingBottom: page ? 0 : space.x4 }}
        ListHeaderComponent={
          page ? (
            <WorkspaceAddButton
              glass={glass}
              label={t.workspaceAdd.join}
              onPress={() => router.push('/cloud-join')}
            />
          ) : undefined
        }
        renderItem={({ item }) => {
          if (item.kind === 'all')
            return (
              <Pressable
                ref={cloudAvailable ? undefined : tabFocus}
                testID="drawer-all"
                accessibilityRole="button"
                accessibilityLabel={page ? t.allEnvironmentsRow : t.allEnvironments}
                accessibilityState={{ selected: !cloudRoute && filter === 'all' }}
                onPress={() => closeThen(() => hostDrawer.selectAll())}
                android_ripple={{ color: pressTint(theme.color.fg), foreground: true }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.x4,
                  minHeight: theme.touch + space.x3,
                  padding: space.x4,
                  ...rowStyle(theme, glass, pressed, !cloudRoute && filter === 'all'),
                  overflow: 'hidden',
                })}
              >
                {page && rows.length > 0 ? (
                  <StackedHostTiles rows={rows} />
                ) : (
                  <ChatsIcon
                    color={theme.color.accent}
                    size={theme.type.body.line * theme.fontScale}
                  />
                )}
                <Text strong style={{ flexShrink: 1 }}>
                  {page ? t.allEnvironmentsRow : t.allEnvironments}
                </Text>
              </Pressable>
            );
          if (item.kind === 'host')
            return (
              <HostRow
                row={item.row}
                selected={!cloudRoute && filter === computerEnvironmentKey(item.row.hostId)}
                address={connectionAddress(
                  hosts.find((host) => host.hostId === item.row.hostId)?.routes[0],
                )}
              />
            );
          if (item.kind === 'account-title')
            return (
              <Text
                variant="meta"
                tone="muted"
                accessibilityRole="header"
                style={{
                  paddingHorizontal: space.x5,
                  paddingTop: space.x4,
                  paddingBottom: space.x2,
                }}
              >
                {t.pairAccount.drawerTitle}
              </Text>
            );
          if (item.kind === 'account')
            return (
              <AccountHostRow
                host={item.host}
                onPress={() =>
                  closeThen(() =>
                    router.push({
                      pathname: '/pair/account',
                      params: { account: item.host.id },
                    }),
                  )
                }
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
          <>
            {status}
            {page && tab === 'cloud' ? (
              <FooterRow
                label={t.workspaceAdd.manage}
                icon={<CloudIcon color={theme.color.fg} size={icon} />}
                onPress={() => router.push('/cloud-services')}
              />
            ) : null}
          </>
        }
      />
      {page ? bar : actions}
    </View>
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
          <WorkspacePanel active={state.open} docked={docked} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
