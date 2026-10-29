import { useDesignTheme } from '../design/theme';
import { materialIconButton } from '../design/tokens';
import { SystemSymbol } from '../primitives/system-symbol';
import type { HeaderActionIcon } from './header-glyph';

const symbols = {
  filter: { android: 'filter_list' },
  search: { android: 'search' },
  settings: { android: 'settings' },
  tob: { android: 'expand_circle_down' },
} as const;

export function HeaderGlyph({ icon, active }: { icon: HeaderActionIcon; active: boolean }) {
  const theme = useDesignTheme();
  return (
    <SystemSymbol
      name={symbols[icon]}
      color={active ? theme.color.accent : theme.color.fg}
      size={materialIconButton.iconSize}
    />
  );
}
