import { Platform, Pressable, View } from 'react-native';
import type { ConnectHost } from '../../host/connect-account';
import type { HostStatus } from '../../host/host-glance';
import { hostColorInk, hostTileFill, shownHostName, type HostLook } from '../design/host-look';
import { useDesignTheme, type DesignTheme } from '../design/theme';
import { edge, radius, space, workspaceStack } from '../design/tokens';
import { DrawerListItem } from '../primitives/drawer-list-item';
import { SettingsRow } from '../primitives/settings-row';
import { useLiquidGlass } from '../primitives/drawer-material';
import { ActionMenuButton, type MenuAction } from '../primitives/action-menu-button';
import { showActionMenu } from '../primitives/app-dialog';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { HostTile } from './host-tile';

export function ComputerTile({
  look,
  name,
  current,
  size,
  rest,
}: {
  look: HostLook;
  name: string;
  current: boolean;
  size?: number;
  rest?: string;
}) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  return (
    <View
      style={{
        padding: space.x1,
        borderRadius: radius.lg,
        borderWidth: edge.focus,
        borderColor: current
          ? theme.color.fg
          : (rest ?? (glass ? 'transparent' : theme.layer.sheet.fill)),
      }}
    >
      <HostTile
        hostName={name}
        icon={look.icon}
        size={size ?? theme.type.title.line + space.x3}
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

export function computerStatusDot(theme: DesignTheme, status: HostStatus): string {
  return status === 'online'
    ? theme.color.success
    : status === 'checking'
      ? theme.color.warning
      : theme.color.danger;
}

export function ComputerRowLabel({
  name,
  status,
  dot,
}: {
  name: string;
  status: string;
  dot: string;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: space.x1 }}>
      <Text strong numberOfLines={1} ellipsizeMode="tail">
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
  );
}

export function AccountComputerRow({
  host,
  look,
  onPress,
  onCustomize,
  form = false,
}: {
  host: ConnectHost;
  look: HostLook;
  onCustomize(): void;
  onPress(): void;
  form?: boolean;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const name = shownHostName(look, host.name);
  const status = host.online ? t.pairAccount.online : t.pairAccount.offline;
  const dot = computerStatusDot(theme, host.online ? 'online' : 'offline');
  const actions: MenuAction[] = [
    {
      label: t.hostCustomize,
      icon: 'settings',
      run: onCustomize,
    },
  ];
  const openMenu = () =>
    showActionMenu(
      name,
      actions.map((action) => ({ text: action.label, icon: action.icon, onPress: action.run })),
    );
  const menu = <ActionMenuButton label={t.hostMore(name)} actions={actions} onOpen={openMenu} />;
  const label = [t.pairAccount.pairWith(name), status].join(', ');
  const tile = (
    <ComputerTile
      look={look}
      name={name}
      current={false}
      {...(form ? { size: workspaceStack.tile, rest: 'transparent' } : {})}
    />
  );
  if (form)
    return (
      <SettingsRow
        testID={'workspace-account-' + host.id}
        title={name}
        detail={status}
        detailDot={dot}
        singleLine
        leading={tile}
        accessory={menu}
        accessibilityLabel={label}
        onPress={onPress}
      />
    );
  if (Platform.OS === 'android')
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: space.x4 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <DrawerListItem
            label={name}
            detail={status}
            detailDot={dot}
            singleLine
            testID={'workspace-account-' + host.id}
            accessibilityLabel={label}
            leading={tile}
            onPress={onPress}
            onLongPress={openMenu}
          />
        </View>
        {menu}
      </View>
    );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: space.x2 }}>
      <Pressable
        testID={'workspace-account-' + host.id}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        onLongPress={openMenu}
        style={({ pressed }) => ({
          flex: 1,
          minWidth: 0,
          minHeight: theme.touch + space.x3,
          padding: space.x4,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x4,
          borderRadius: glass ? radius.lg : 0,
          backgroundColor: pressed ? theme.layer.sheet.pressed : 'transparent',
        })}
      >
        {tile}
        <ComputerRowLabel name={name} status={status} dot={dot} />
      </Pressable>
      {menu}
    </View>
  );
}
