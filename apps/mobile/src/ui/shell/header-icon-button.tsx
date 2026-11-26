import { Pressable } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius } from '../design/tokens';
import { HeaderIconGlyph, type HeaderIcon } from './header-icon-glyph';

export type { HeaderIcon } from './header-icon-glyph';

export type HeaderIconButtonProps = {
  icon: HeaderIcon;
  label: string;
  testID?: string | undefined;
  selected?: boolean | undefined;
  onPress(): void;
};

export function HeaderIconButton({
  icon,
  label,
  testID,
  selected,
  onPress,
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
      <HeaderIconGlyph icon={icon} selected={selected === true} />
    </Pressable>
  );
}
