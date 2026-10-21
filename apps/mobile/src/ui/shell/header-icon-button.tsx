import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius } from '../design/tokens';

export type HeaderIconButtonProps = {
  label: string;
  testID?: string | undefined;
  selected?: boolean | undefined;
  onPress(): void;
  children: ReactNode;
};

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
      style={({ pressed }) => ({
        width: theme.touch,
        height: theme.touch,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
      })}
    >
      {children}
    </Pressable>
  );
}
