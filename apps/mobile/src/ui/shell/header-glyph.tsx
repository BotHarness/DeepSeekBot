import { useDesignTheme } from '../design/theme';
import {
  ActivityFilterIcon,
  ActivitySearchIcon,
  ArchiveIcon,
  MoreIcon,
  PlusIcon,
  SettingsIcon,
  TobModeIcon,
} from './icons';

export type HeaderActionIcon =
  | 'archive'
  | 'filter'
  | 'more'
  | 'add'
  | 'search'
  | 'settings'
  | 'tob';

export type HeaderActionProps = {
  icon: HeaderActionIcon;
  label: string;
  testID: string;
  active?: boolean;
  onPress(): void;
};

const glyphs = {
  archive: { Glyph: ArchiveIcon, size: 'size' },
  filter: { Glyph: ActivityFilterIcon, size: 'size' },
  add: { Glyph: PlusIcon, size: 'line' },
  more: { Glyph: MoreIcon, size: 'size' },
  search: { Glyph: ActivitySearchIcon, size: 'size' },
  settings: { Glyph: SettingsIcon, size: 'line' },
  tob: { Glyph: TobModeIcon, size: 'line' },
} as const;

export function HeaderGlyph({ icon, active }: { icon: HeaderActionIcon; active: boolean }) {
  const theme = useDesignTheme();
  const { Glyph, size } = glyphs[icon];
  return (
    <Glyph color={active ? theme.color.accent : theme.color.fg} size={theme.type.title[size]} />
  );
}
