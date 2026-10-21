import { useDesignTheme } from '../design/theme';
import { ActivityFilterIcon, ActivitySearchIcon, SettingsIcon } from './icons';

export type HeaderActionIcon = 'filter' | 'search' | 'settings';

export type HeaderActionProps = {
  icon: HeaderActionIcon;
  label: string;
  testID: string;
  active?: boolean;
  onPress(): void;
};

const glyphs = {
  filter: { Glyph: ActivityFilterIcon, size: 'size' },
  search: { Glyph: ActivitySearchIcon, size: 'size' },
  settings: { Glyph: SettingsIcon, size: 'line' },
} as const;

export function HeaderGlyph({ icon, active }: { icon: HeaderActionIcon; active: boolean }) {
  const theme = useDesignTheme();
  const { Glyph, size } = glyphs[icon];
  return (
    <Glyph color={active ? theme.color.accent : theme.color.fg} size={theme.type.title[size]} />
  );
}
