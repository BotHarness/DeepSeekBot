import { Pressable } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { SystemSymbol } from './system-symbol';

export function FavoriteButton({
  label,
  favorite,
  disabled = false,
  testID,
  onPress,
}: {
  label: string;
  favorite: boolean;
  disabled?: boolean;
  testID?: string;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: favorite }}
      hitSlop={space.x2}
      style={({ pressed }) => ({
        width: theme.touch,
        height: theme.touch,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? theme.layer.sheet.pressed : 'transparent',
      })}
    >
      <SystemSymbol
        name={
          favorite ? { ios: 'star.fill', android: 'star' } : { ios: 'star', android: 'star_border' }
        }
        size={theme.type.title.line}
        color={favorite ? theme.color.warning : theme.color.muted}
      />
    </Pressable>
  );
}
