import type { Conversation } from '../chat/conversations';
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
