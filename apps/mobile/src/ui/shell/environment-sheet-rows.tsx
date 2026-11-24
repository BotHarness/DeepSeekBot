import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
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
import { clampScaledIconSize } from '../design/scaled-icon-size';
import { useDesignTheme, type DesignTheme } from '../design/theme';
import { radius, space, workspaceStack } from '../design/tokens';
import { SettingsRow } from '../primitives/settings-row';
import { CountBadge } from '../primitives/count-badge';
import { showActionMenu, showAppDialog } from '../primitives/app-dialog';
import { useStrings, t } from '../strings';
import { HostTile } from './host-tile';
import { AccountComputerRow, ComputerTile, computerStatusDot } from './computer-row';
import { ActionMenuButton, type MenuAction } from '../primitives/action-menu-button';
import { hostRowBadge, type HostDrawerRow } from './host-drawer-model';
import { CloudIcon } from './icons';
import { noticeHostKept } from '../unpair-notice';
import { closeEnvironmentSheet, closeThen, hostDrawer } from './host-drawer-state';

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
          if (hostSession.getState().hosts.length <= 1) closeEnvironmentSheet();
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

function tileSize(theme: DesignTheme): number {
  return clampScaledIconSize(
    workspaceStack.tile,
    theme.fontScale,
    workspaceStack.tile * workspaceStack.tileMaxScale,
  );
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
        size={tileSize(theme)}
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
            size={tileSize(theme)}
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
      onPress={() => closeThen(() => void hostDrawer.select(row.hostId))}
    />
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

export function WorkspaceFormRow({
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
  const role = workspace.role === 'guest' ? t.workspaceGuest : t.cloudOrganizations[workspace.role];
  const host = new URL(server).host;
  return (
    <SettingsRow
      testID={'workspace-cloud-' + workspace.instanceId + '-' + workspace.organizationId}
      title={workspace.name}
      detail={[role, host].join(' · ')}
      singleLine
      leading={
        <HostTile
          hostName={workspace.name}
          size={tileSize(theme)}
          fill={theme.layer.sheet.inset}
          ink={theme.color.fg}
        />
      }
      {...(selected ? { control: { kind: 'check' as const } } : {})}
      selected={selected}
      accessibilityLabel={[workspace.name, role, host].join(', ')}
      onPress={disabled ? undefined : onPress}
    />
  );
}

export function CloudServiceFormRow({
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
  const address = connectionAddress(server);
  return (
    <SettingsRow
      title={name}
      detail={[t.cloudJoin.signIn, address].join(' · ')}
      singleLine
      leading={<CloudIcon color={theme.color.muted} size={tileSize(theme)} />}
      accessibilityLabel={[name, t.cloudJoin.signIn, address].join(', ')}
      onPress={onPress}
    />
  );
}

function connectionAddress(route: string | undefined): string {
  try {
    return route ? new URL(route).host : '';
  } catch {
    return '';
  }
}
