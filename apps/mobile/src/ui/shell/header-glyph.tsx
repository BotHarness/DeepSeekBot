import { useDesignTheme } from '../design/theme';
import { ActivitySearchIcon, SettingsIcon } from './icons';

export type HeaderActionIcon = 'search' | 'settings';

export type HeaderActionProps = {
  icon: HeaderActionIcon;
  label: string;
  testID: string;
  onPress(): void;
};

const glyphs = {
  search: { Glyph: ActivitySearchIcon, size: 'size' },
  settings: { Glyph: SettingsIcon, size: 'line' },
} as const;

export function HeaderGlyph({ icon }: { icon: HeaderActionIcon }) {
  const theme = useDesignTheme();
  const { Glyph, size } = glyphs[icon];
  return <Glyph color={theme.color.fg} size={theme.type.title[size]} />;
}
