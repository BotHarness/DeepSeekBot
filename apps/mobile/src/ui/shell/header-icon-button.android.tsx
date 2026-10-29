import { Host, Icon, IconButton, IconToggleButton } from '@expo/ui/jetpack-compose';
import { semantics, testID as composeTestID } from '@expo/ui/jetpack-compose/modifiers';

import { useMaterialRoles } from '../design/material-tokens';
import { useDesignTheme } from '../design/theme';
import { materialIconButton } from '../design/tokens';
import type { HeaderIcon, HeaderIconButtonProps } from './header-icon-button';

const icons: Record<HeaderIcon, number> = {
  back: require('../../../assets/header/arrow-back.xml'),
  close: require('../../../assets/header/close.xml'),
  clear: require('../../../assets/header/close.xml'),
  filter: require('../../../assets/header/filter-list.xml'),
  search: require('../../../assets/header/search.xml'),
  settings: require('../../../assets/header/settings.xml'),
  edit: require('../../../assets/header/edit.xml'),
  add: require('../../../assets/header/add.xml'),
  browser: require('../../../assets/header/language.xml'),
  computer: require('../../../assets/header/computer.xml'),
  'hand-back': require('../../../assets/header/do-not-touch.xml'),
  tob: require('../../../assets/header/tob-mode.xml'),
};

const navigation = new Set<HeaderIcon>(['back', 'close']);

export function HeaderIconButton({
  icon,
  label,
  testID,
  selected,
  onPress,
}: HeaderIconButtonProps) {
  const theme = useDesignTheme();
  const roles = useMaterialRoles();
  const content = navigation.has(icon) ? roles.onSurface : roles.onSurfaceVariant;
  const modifiers = [
    semantics({ contentDescription: label }),
    ...(testID === undefined ? [] : [composeTestID(testID)]),
  ];
  const glyph = <Icon source={icons[icon]} size={materialIconButton.iconSize} />;
  return (
    <Host
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      style={{ width: materialIconButton.target, height: materialIconButton.target }}
    >
      {selected === undefined ? (
        <IconButton onClick={onPress} colors={{ contentColor: content }} modifiers={modifiers}>
          {glyph}
        </IconButton>
      ) : (
        <IconToggleButton
          checked={selected}
          onCheckedChange={() => onPress()}
          colors={{ contentColor: content, checkedContentColor: roles.primary }}
          modifiers={modifiers}
        >
          {glyph}
        </IconToggleButton>
      )}
    </Host>
  );
}
