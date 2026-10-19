import { Pressable } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { MoreIcon } from '../shell/icons';

export type MenuAction = {
  label: string;
  icon: 'settings' | 'computer' | 'close' | 'person' | 'remove';
  run(): void;
  destructive?: boolean;
};

export type ActionMenuButtonProps = {
  label: string;
  actions: MenuAction[];
  onOpen(): void;
};

export function ActionMenuButton({ label, onOpen }: ActionMenuButtonProps) {
  const theme = useDesignTheme();
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={label}
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
      <MoreIcon color={theme.color.muted} size={theme.type.title.size + space.x2} />
    </Pressable>
  );
}
