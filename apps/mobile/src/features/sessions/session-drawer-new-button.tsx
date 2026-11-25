import { Pressable } from 'react-native';
import { capsuleRadius } from '../../ui/design/large-text-fallback';
import { useDesignTheme } from '../../ui/design/theme';
import { glassPress, space } from '../../ui/design/tokens';
import { Text } from '../../ui/primitives/text';
import { PlusIcon } from '../../ui/shell/icons';

export function SessionDrawerNewButton({ label, onPress }: { label: string; onPress(): void }) {
  const theme = useDesignTheme();
  return (
    <Pressable
      testID="session-drawer-new"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        paddingHorizontal: space.x5,
        borderRadius: capsuleRadius(theme.fontScale),
        backgroundColor: theme.color.fg,
        opacity: pressed ? glassPress.dim : 1,
      })}
    >
      <PlusIcon color={theme.color.base} size={theme.type.body.size * theme.fontScale} />
      <Text strong numberOfLines={1} style={{ color: theme.color.base }}>
        {label}
      </Text>
    </Pressable>
  );
}
