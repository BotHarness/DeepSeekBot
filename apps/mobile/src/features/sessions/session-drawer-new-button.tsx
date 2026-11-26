import { Pressable } from 'react-native';
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
        flex: 1,
        height: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.x2,
        paddingHorizontal: space.x5,
        borderRadius: theme.touch / 2,
        backgroundColor: theme.color.accent,
        opacity: pressed ? glassPress.dim : 1,
      })}
    >
      <PlusIcon
        color={theme.color.onAccent}
        size={theme.type.body.size * Math.min(theme.fontScale, 1.4)}
      />
      <Text
        strong
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
        style={{ flexShrink: 1, color: theme.color.onAccent }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
