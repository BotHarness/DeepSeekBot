import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { LayerName } from '../design/layers';
import type { ColorRole } from '../design/resolve-theme';
import { edge, radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from './text';

export function SettingsRow({
  title,
  detail,
  tone = 'fg',
  strong = false,
  leading,
  trailing,
  selected,
  accessibilityLabel,
  on = 'sheet',
  onPress,
}: {
  title: string;
  detail?: string;
  tone?: ColorRole;
  strong?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  accessibilityLabel?: string;
  on?: LayerName;
  onPress?: (() => void) | undefined;
}) {
  const theme = useDesignTheme();
  const layer = theme.layer[on];
  return (
    <Pressable
      onPress={onPress}
      disabled={onPress === undefined}
      accessibilityRole={onPress === undefined ? undefined : 'button'}
      accessibilityLabel={
        onPress === undefined
          ? undefined
          : (accessibilityLabel ?? (detail === undefined ? title : `${title}, ${detail}`))
      }
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        paddingHorizontal: space.x5,
        paddingVertical: space.x3,
        backgroundColor: pressed ? layer.pressed : layer.fill,
      })}
    >
      {leading}
      <View style={{ flex: 1, gap: space.x1 }}>
        <Text tone={tone} strong={strong} numberOfLines={1}>
          {title}
        </Text>
        {detail === undefined ? null : (
          <Text variant="meta" tone="muted" numberOfLines={2}>
            {detail}
          </Text>
        )}
      </View>
      {trailing}
    </Pressable>
  );
}

export function SettingsSection({
  title,
  footer,
  on = 'sheet',
  children,
}: {
  title?: string;
  footer?: string;
  on?: LayerName;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  return (
    <View style={{ gap: space.x2 }}>
      {title === undefined ? null : <SettingsHeading>{title}</SettingsHeading>}
      <View
        style={{
          backgroundColor: theme.layer[on].fill,
          borderRadius: radius.md,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
      {footer === undefined ? null : <SettingsFooter>{footer}</SettingsFooter>}
    </View>
  );
}

export function SettingsHeading({ children }: { children: string }) {
  return (
    <Text
      variant="meta"
      tone="muted"
      accessibilityRole="header"
      style={{ paddingHorizontal: space.x5 }}
    >
      {children}
    </Text>
  );
}

export function SettingsFooter({ children }: { children: string }) {
  return (
    <Text variant="meta" tone="muted" style={{ paddingHorizontal: space.x5 }}>
      {children}
    </Text>
  );
}

export function SettingsGroupItem({
  first,
  last,
  on = 'sheet',
  children,
}: {
  first: boolean;
  last: boolean;
  on?: LayerName;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const layer = theme.layer[on];
  return (
    <View
      style={{
        marginHorizontal: space.x5,
        backgroundColor: layer.fill,
        borderTopLeftRadius: first ? radius.md : 0,
        borderTopRightRadius: first ? radius.md : 0,
        borderBottomLeftRadius: last ? radius.md : 0,
        borderBottomRightRadius: last ? radius.md : 0,
        borderTopWidth: first ? 0 : edge.hairline,
        borderTopColor: layer.divider,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}
