import { Pressable } from 'react-native';

import { useDesignTheme, type DesignTheme } from '../design/theme';
import { radius } from '../design/tokens';
import {
  ActivityFilterIcon,
  ActivitySearchIcon,
  BrowserIcon,
  ChevronLeftIcon,
  CloseIcon,
  ComputerIcon,
  HandBackIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
} from './icons';

export type HeaderIcon =
  | 'back'
  | 'close'
  | 'clear'
  | 'filter'
  | 'search'
  | 'settings'
  | 'edit'
  | 'add'
  | 'browser'
  | 'computer'
  | 'hand-back';

export type HeaderIconButtonProps = {
  icon: HeaderIcon;
  label: string;
  testID?: string | undefined;
  selected?: boolean | undefined;
  onPress(): void;
};

const glyphs = {
  back: { Glyph: ChevronLeftIcon, size: (theme) => theme.type.title.line },
  close: { Glyph: CloseIcon, size: (theme) => theme.type.title.line },
  clear: { Glyph: CloseIcon, size: (theme) => theme.type.title.size },
  filter: { Glyph: ActivityFilterIcon, size: (theme) => theme.type.title.size },
  search: { Glyph: ActivitySearchIcon, size: (theme) => theme.type.title.size },
  settings: { Glyph: SettingsIcon, size: (theme) => theme.type.title.line },
  edit: { Glyph: PencilIcon, size: (theme) => theme.type.title.line },
  add: { Glyph: PlusIcon, size: (theme) => theme.type.title.line },
  browser: { Glyph: BrowserIcon, size: (theme) => theme.touch / 2 },
  computer: { Glyph: ComputerIcon, size: (theme) => theme.touch / 2 },
  'hand-back': { Glyph: HandBackIcon, size: (theme) => theme.touch / 2 },
} satisfies Record<HeaderIcon, { Glyph: typeof CloseIcon; size(theme: DesignTheme): number }>;

export function HeaderIconButton({
  icon,
  label,
  testID,
  selected,
  onPress,
}: HeaderIconButtonProps) {
  const theme = useDesignTheme();
  const { Glyph, size } = glyphs[icon];
  const color =
    selected === true ? theme.color.accent : icon === 'clear' ? theme.color.muted : theme.color.fg;
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
      <Glyph color={color} size={size(theme)} />
    </Pressable>
  );
}
