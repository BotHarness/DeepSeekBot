import type { Conversation } from '../chat/conversations';
import { floatingToolbar } from '../design/tokens';
import type { TabMenuEntry } from './tab-menu-model';
import type { TabSlot } from './tab-slots';

export type NavigationDestination = {
  key: string;
  slot: TabSlot;
  focused: boolean;
  count: number;
  name: string;
  accessibilityLabel: string;
  conversation?: Conversation | undefined;
  onPress(): void;
  onLongPress(): void;
  menu?: readonly TabMenuEntry[] | undefined;
};

export function toolbarGap(width: number, count: number): number {
  if (count < 2) return 0;
  const { item, gap, inset, padding } = floatingToolbar;
  const room = width - 2 * (inset + padding) - item * count;
  return Math.max(0, Math.min(gap, Math.floor(room / (count - 1))));
}
