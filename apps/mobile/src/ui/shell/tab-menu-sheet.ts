import { haptic } from '../haptics';
import { showActionMenu } from '../primitives/app-dialog';
import type { MenuGlyph } from '../primitives/menu-icon';
import { noteTouch } from '../primitives/touch-anchor';
import { ActivityIcon, CodeIcon, PlusIcon } from './icons';
import type { TabMenuEntry, TabMenuGlyph } from './tab-menu-model';

const menuGlyphs: Record<TabMenuGlyph, MenuGlyph> = {
  bot: 'chat',
  channel: 'channel',
  person: 'person',
  session: CodeIcon,
  activity: ActivityIcon,
  new: PlusIcon,
};

export function openTabMenu(
  title: string,
  entries: readonly TabMenuEntry[],
  anchor?: { pageX: number; pageY: number },
): void {
  if (anchor !== undefined) noteTouch({ nativeEvent: anchor });
  haptic('menu');
  showActionMenu(
    title,
    entries.map((entry) => ({
      text: entry.label,
      icon: menuGlyphs[entry.glyph],
      group: entry.glyph === 'new' ? 1 : 0,
      onPress: entry.run,
    })),
  );
}
