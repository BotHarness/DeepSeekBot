import { Pressable } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { materialIconButton } from '../design/tokens';
import type { HeaderIconButtonProps } from './header-icon-button';

export function HeaderIconButton({
  label,
  testID,
  selected,
  onPress,
  children,
}: HeaderIconButtonProps) {
  const theme = useDesignTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      android_ripple={{
        color: theme.layer.canvas.pressed,
        borderless: true,
        radius: materialIconButton.container / 2,
      }}
      style={{
        width: theme.touch,
        height: theme.touch,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </Pressable>
  );
}
