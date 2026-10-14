import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { ColorRole } from '../design/resolve-theme';
import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from './text';

export function SettingsRow({
  title,
  detail,
  tone = 'fg',
  onPress,
}: {
  title: string;
  detail?: string;
  tone?: ColorRole;
  onPress?: () => void;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={onPress === undefined}
      accessibilityRole={onPress === undefined ? undefined : 'button'}
      accessibilityLabel={detail === undefined ? title : `${title}, ${detail}`}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        justifyContent: 'center',
        gap: space.x1,
        paddingHorizontal: space.x5,
        paddingVertical: space.x3,
        backgroundColor: pressed ? theme.color.hover : theme.color.elevated,
      })}
    >
      <Text tone={tone}>{title}</Text>
      {detail === undefined ? null : (
        <Text variant="meta" tone="muted" numberOfLines={2}>
          {detail}
        </Text>
      )}
    </Pressable>
  );
}

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const theme = useDesignTheme();
  return (
    <View style={{ gap: space.x2 }}>
      <Text variant="meta" tone="muted" style={{ paddingHorizontal: space.x5 }}>
        {title}
      </Text>
      <View style={{ backgroundColor: theme.color.elevated }}>{children}</View>
    </View>
  );
}
