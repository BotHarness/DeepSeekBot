import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { ColorRole } from '../design/resolve-theme';
import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from './text';

export function SettingsRow({
  title,
  detail,
  tone = 'fg',
  strong = false,
  trailing,
  selected,
  accessibilityLabel,
  onPress,
}: {
  title: string;
  detail?: string;
  tone?: ColorRole;
  strong?: boolean;
  trailing?: ReactNode;
  selected?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
}) {
  const theme = useDesignTheme();
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
        backgroundColor: pressed ? theme.layer.sheet.pressed : theme.layer.sheet.fill,
      })}
    >
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

export function SettingsSection({ title, children }: { title?: string; children: ReactNode }) {
  const theme = useDesignTheme();
  return (
    <View style={{ gap: space.x2 }}>
      {title === undefined ? null : (
        <Text variant="meta" tone="muted" style={{ paddingHorizontal: space.x5 }}>
          {title}
        </Text>
      )}
      <View
        style={{
          backgroundColor: theme.layer.sheet.fill,
          borderRadius: radius.md,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}
