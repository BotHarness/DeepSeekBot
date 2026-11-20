import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import type { CloudWorkspace } from '../../cloud/workspace-directory';
import type { ConnectHost } from '@botharness/host-client/connect-account';
import { accountHostLookId } from '../../host/account-host-look';
import { connectAccount } from '../../host/native-connect-account';
import type { HostGlance } from '../../host/host-glance';
import { SavedHostsWriteError } from '@botharness/host-client/hosts';
import { hostSession } from '../../host/host-session';
import { useHostLook } from '../../host/native-host-look';
import {
  hostColorInk,
  hostTileFill,
  shownHostName,
} from '@botharness/host-client/ui/design/host-look';
import { pressTint, useDesignTheme, type DesignTheme } from '../design/theme';
import { radius, space, workspaceStack } from '../design/tokens';
import { useLiquidGlass } from '../primitives/drawer-material';
import { SettingsRow } from '../primitives/settings-row';
import { DrawerListItem } from '../primitives/drawer-list-item';
import { CountBadge } from '../primitives/count-badge';
import { Text } from '../primitives/text';
import { showActionMenu, showAppDialog } from '../primitives/app-dialog';
import { useStrings, t } from '../strings';
import { HostTile } from './host-tile';
import {
  AccountComputerRow,
  ComputerRowLabel,
  ComputerTile,
  computerStatusDot,
} from './computer-row';
import { ActionMenuButton, type MenuAction } from '../primitives/action-menu-button';
import { ContextMenuArea, nativeContextMenu } from '../primitives/context-menu';
import { MENU_SYMBOL } from '../primitives/menu-symbols';
import { addressLines, hostRowBadge, type HostDrawerRow } from './host-drawer-model';
import { CloudIcon } from './icons';
import { noticeHostKept } from '../unpair-notice';
import { settle, closeThen, hostDrawer } from './host-drawer-state';

function statusText(glance: HostGlance): string {
  if (glance.refusal === 'sign-in-required') return t.hostSignInRequired;
  if (glance.refusal === 'member-suspended') return t.hostMemberSuspended;
  const status = glance.status;
  return status === 'online'
    ? t.hostOnline
    : status === 'offline'
      ? t.hostOffline
      : status === 'refused'
        ? t.hostRefused
        : t.hostChecking;
}

function isMemberHost(hostId: string): boolean {
  return hostSession
    .getState()
    .hosts.some((host) => host.hostId === hostId && host.member !== undefined);
}

function confirmUnpair(row: HostDrawerRow, name: string): void {
  const member = isMemberHost(row.hostId);
  showAppDialog(
    member ? t.teamSignIn.signOutTitle.replace('{host}', name) : t.unpairHost(name),
    member ? t.teamSignIn.signOutBody : t.unpairHostDetail,
    [
      { text: t.cancel, style: 'cancel' },
      {
        text: member ? t.teamSignIn.signOut : t.unpair,
        style: 'destructive',
        onPress: () => {
          if (hostSession.getState().hosts.length <= 1) settle(false);
          return hostSession.unpair(row.hostId).then(
            (result) => {
              if (result?.current === true && row.current && router.canDismiss())
                router.dismissAll();
              noticeHostKept(result, name);
            },
            (error: unknown) =>
              error instanceof SavedHostsWriteError
                ? showAppDialog(
                    `${t.unpairFailed} ${t.savedComputersKeychainFailed}`,
                    t.savedComputersErrorDetail(error.message),
                    [{ text: t.done }],
                  )
                : showAppDialog(
                    `${t.unpairFailed} ${error instanceof Error ? error.message : String(error)}`,
                    undefined,
                    [{ text: t.done }],
                  ),
          );
        },
      },
    ],
  );
}

function hostMenuActions(row: HostDrawerRow, name: string): MenuAction[] {
  const member = isMemberHost(row.hostId);
  return [
    ...(row.glance.refusal === 'sign-in-required'
      ? [
          {
            label: t.teamSignIn.again,
            icon: 'person' as const,
            run: () =>
              closeThen(() =>
                router.push({ pathname: '/pair/team', params: { host: row.hostId } }),
              ),
          },
        ]
      : []),
    {
      label: t.connectionRoutes.title,
      icon: 'connection',
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
    ...(member
      ? [
          {
            label: t.teamSignIn.switchAccount,
            icon: 'person' as const,
            run: () =>
              closeThen(() =>
                router.push({
                  pathname: '/pair/team',
                  params: { host: row.hostId, switch: '1' },
                }),
              ),
          },
        ]
      : []),
    {
      label: member ? t.teamSignIn.signOut : t.unpair,
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

export function rowStyle(theme: DesignTheme, glass: boolean, active: boolean, selected = false) {
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

function BadgedHostTile({ glance, children }: { glance: HostGlance; children: ReactNode }) {
  const t = useStrings();
  const badge = hostRowBadge(glance);
  return (
    <View style={{ paddingTop: space.x2, paddingRight: space.x2 }}>
      {children}
      {badge === undefined ? null : (
        <View
          testID="drawer-host-badge"
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, right: 0 }}
        >
          <CountBadge
            compact
            count={badge.count}
            tone={badge.tone}
            label={
              badge.tone === 'needs-you' ? t.hostPending(badge.count) : t.hostUnread(badge.count)
            }
          />
        </View>
      )}
    </View>
  );
}

function hostRowLabel(
  t: ReturnType<typeof useStrings>,
  row: HostDrawerRow,
  name: string,
  selected: boolean,
): string {
  const pending = row.glance.pending ?? 0;
  const unread = row.glance.unread ?? 0;
  return [
    name,
    selected ? t.showing : undefined,
    statusText(row.glance),
    pending > 0 ? t.hostPending(pending) : undefined,
    unread > 0 ? t.hostUnread(unread) : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(', ');
}

export const loadAccountName = () => connectAccount.email().then((email) => email ?? undefined);

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

export function StackedHostTiles({ rows }: { rows: readonly HostDrawerRow[] }) {
  return (
    <View testID="drawer-all-stack" style={{ flexDirection: 'row' }}>
      {rows.slice(0, workspaceStack.max).map((row, index) => (
        <StackedHostTile key={row.hostId} row={row} first={index === 0} />
      ))}
    </View>
  );
}

export function HostRow({ row, selected }: { row: HostDrawerRow; selected: boolean }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const android = !glass && Platform.OS === 'android';
  const look = useHostLook(row.hostId);
  const name = shownHostName(look, row.hostName);
  const status = statusText(row.glance);
  const dot = computerStatusDot(theme, row.glance.status);
  const tile = (
    <BadgedHostTile glance={row.glance}>
      <ComputerTile look={look} name={name} current={selected} />
    </BadgedHostTile>
  );
  if (Platform.OS === 'android') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: space.x4 }}>
        <View style={{ flex: 1 }}>
          <DrawerListItem
            testID={'drawer-host-' + row.hostId}
            label={name}
            detail={status}
            detailDot={dot}
            singleLine
            accessibilityLabel={hostRowLabel(t, row, name, selected)}
            selected={selected}
            leading={tile}
            onPress={() => closeThen(() => void hostDrawer.select(row.hostId))}
            onLongPress={() => openHostMenu(row, name)}
          />
        </View>
        <ActionMenuButton
          label={t.hostMore(name)}
          actions={hostMenuActions(row, name)}
          onOpen={() => openHostMenu(row, name)}
        />
      </View>
    );
  }
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
          accessibilityLabel={hostRowLabel(t, row, name, selected)}
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
          {tile}
          <ComputerRowLabel name={name} status={status} dot={dot} />
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

export function HostFormRow({ row, selected }: { row: HostDrawerRow; selected: boolean }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const look = useHostLook(row.hostId);
  const name = shownHostName(look, row.hostName);
  return (
    <SettingsRow
      testID={`drawer-host-${row.hostId}`}
      title={name}
      detail={statusText(row.glance)}
      detailDot={computerStatusDot(theme, row.glance.status)}
      singleLine
      leading={
        <BadgedHostTile glance={row.glance}>
          <ComputerTile
            look={look}
            name={name}
            current={selected}
            size={workspaceStack.tile}
            rest="transparent"
          />
        </BadgedHostTile>
      }
      accessory={
        <ActionMenuButton
          label={t.hostMore(name)}
          actions={hostMenuActions(row, name)}
          onOpen={() => openHostMenu(row, name)}
        />
      }
      selected={selected}
      accessibilityLabel={hostRowLabel(t, row, name, selected)}
      onPress={() => void hostDrawer.select(row.hostId)}
    />
  );
}

export function FooterRow({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: ReactNode;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  if (Platform.OS === 'android')
    return <DrawerListItem label={label} leading={icon} onPress={onPress} />;
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

export function CloudServiceRow({
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
  if (Platform.OS === 'android')
    return (
      <DrawerListItem
        label={name}
        detail={[t.cloudJoin.signIn, connectionAddress(server)].join(' · ')}
        leading={<CloudIcon color={theme.color.muted} size={theme.type.title.line + space.x3} />}
        onPress={onPress}
      />
    );
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

export function AccountHostRow({
  host,
  onPress,
  form = false,
}: {
  host: ConnectHost;
  onPress(): void;
  form?: boolean;
}) {
  const look = useHostLook(accountHostLookId(host.id));
  return (
    <AccountComputerRow
      host={host}
      look={look}
      form={form}
      onPress={onPress}
      onCustomize={() =>
        closeThen(() => router.push({ pathname: '/host-look', params: { account: host.id } }))
      }
    />
  );
}

export function WorkspaceRow({
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
  if (Platform.OS === 'android')
    return (
      <DrawerListItem
        label={workspace.name}
        selected={selected}
        disabled={disabled}
        testID={'workspace-cloud-' + workspace.instanceId + '-' + workspace.organizationId}
        detail={[
          workspace.role === 'guest' ? t.workspaceGuest : t.cloudOrganizations[workspace.role],
          new URL(server).host,
        ].join(' · ')}
        leading={<CloudIcon color={theme.color.muted} size={theme.type.title.line + space.x3} />}
        onPress={onPress}
      />
    );
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
