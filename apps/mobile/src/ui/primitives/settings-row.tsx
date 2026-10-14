import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from './text';

export function SettingsGroup({ children }: { children: ReactNode }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        backgroundColor: theme.color.surface,
        borderRadius: radius.md,
        paddingHorizontal: space.x5,
      }}
    >
      {children}
    </View>
  );
}

export function SettingsRow({
  label,
  trailing,
  strong = false,
  onPress,
  accessibilityLabel,
  selected,
}: {
  label: string;
  trailing?: ReactNode;
  strong?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  selected?: boolean;
}) {
  const theme = useDesignTheme();
  const content = (
    <>
      <Text numberOfLines={1} strong={strong} style={{ flexShrink: 1 }}>
        {label}
      </Text>
      {trailing}
    </>
  );
  const layout = {
    minHeight: theme.touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x4,
  } as const;
  if (onPress === undefined) return <View style={layout}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={({ pressed }) => ({ ...layout, opacity: pressed ? 0.6 : 1 })}
    >
      {content}
    </Pressable>
  );
}
