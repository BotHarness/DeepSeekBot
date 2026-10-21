import { Button, Host, Image } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  dynamicTypeSize,
  font,
  foregroundStyle,
  frame,
} from '@expo/ui/swift-ui/modifiers';
import { Platform } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { HeaderGlyph, type HeaderActionProps } from './header-glyph';
import { HeaderIconButton } from './header-icon-button';

const symbols = {
  filter: 'line.3.horizontal.decrease',
  search: 'magnifyingglass',
  settings: 'gearshape',
} as const;

export function HeaderAction({ icon, label, testID, active = false, onPress }: HeaderActionProps) {
  const theme = useDesignTheme();
  if (Number.parseInt(String(Platform.Version), 10) < 26)
    return (
      <HeaderIconButton label={label} testID={testID} selected={active} onPress={onPress}>
        <HeaderGlyph icon={icon} active={active} />
      </HeaderIconButton>
    );
  return (
    <Host
      key={theme.scheme}
      testID={testID}
      colorScheme={theme.scheme}
      style={{ width: theme.touch, height: theme.touch }}
    >
      <Button
        onPress={onPress}
        modifiers={[
          buttonStyle('glass'),
          buttonBorderShape('circle'),
          accessibilityLabel(label),
          accessibilityAddTraits(active ? ['isSelected'] : []),
          foregroundStyle(active ? theme.color.accent : theme.color.fg),
        ]}
      >
        <Image
          systemName={symbols[icon]}
          modifiers={[
            font({ textStyle: 'body', weight: 'medium' }),
            dynamicTypeSize({ max: 'xxxLarge' }),
            frame({ width: theme.touch - space.x5, height: theme.touch - space.x5 }),
          ]}
        />
      </Button>
    </Host>
  );
}
