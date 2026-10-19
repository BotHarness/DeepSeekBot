import { Pressable } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { MoreIcon } from './icons';

export type HostMenuAction = {
  label: string;
  icon: 'settings' | 'computer' | 'close';
  run(): void;
  destructive?: boolean;
};

export type HostMenuButtonProps = {
  label: string;
  actions: HostMenuAction[];
  onOpen(): void;
};

export function HostMenuButton({ label, onOpen }: HostMenuButtonProps) {
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
