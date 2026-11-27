import { useDesignTheme, type DesignTheme } from '../design/theme';
import {
  ActivityFilterIcon,
  ArchiveIcon,
  ActivitySearchIcon,
  BrowserIcon,
  ChevronLeftIcon,
  CloseIcon,
  ComputerIcon,
  HandBackIcon,
  MenuIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  MoreIcon,
  SettingsIcon,
} from './icons';

export type HeaderIcon =
  | 'back'
  | 'close'
  | 'clear'
  | 'archive'
  | 'filter'
  | 'search'
  | 'settings'
  | 'edit'
  | 'add'
  | 'browser'
  | 'computer'
  | 'hand-back'
  | 'call'
  | 'more'
  | 'menu';

const glyphs = {
  menu: { Glyph: MenuIcon, size: (theme) => theme.type.title.line },
  more: { Glyph: MoreIcon, size: (theme) => theme.type.title.size },
  back: { Glyph: ChevronLeftIcon, size: (theme) => theme.type.title.line },
  close: { Glyph: CloseIcon, size: (theme) => theme.type.title.line },
  clear: { Glyph: CloseIcon, size: (theme) => theme.type.title.size },
  archive: { Glyph: ArchiveIcon, size: (theme) => theme.type.title.size },
  filter: { Glyph: ActivityFilterIcon, size: (theme) => theme.type.title.size },
  search: { Glyph: ActivitySearchIcon, size: (theme) => theme.type.title.size },
  settings: { Glyph: SettingsIcon, size: (theme) => theme.type.title.line },
  edit: { Glyph: PencilIcon, size: (theme) => theme.type.title.line },
  add: { Glyph: PlusIcon, size: (theme) => theme.type.title.line },
  browser: { Glyph: BrowserIcon, size: (theme) => theme.touch / 2 },
  computer: { Glyph: ComputerIcon, size: (theme) => theme.touch / 2 },
  'hand-back': { Glyph: HandBackIcon, size: (theme) => theme.touch / 2 },
  call: { Glyph: PhoneIcon, size: (theme) => theme.type.title.line },
} satisfies Record<HeaderIcon, { Glyph: typeof CloseIcon; size(theme: DesignTheme): number }>;

export function HeaderIconGlyph({ icon, selected }: { icon: HeaderIcon; selected?: boolean }) {
  const theme = useDesignTheme();
  const { Glyph, size } = glyphs[icon];
  const color =
    selected === true ? theme.color.accent : icon === 'clear' ? theme.color.muted : theme.color.fg;
  return <Glyph color={color} size={size(theme)} />;
}
