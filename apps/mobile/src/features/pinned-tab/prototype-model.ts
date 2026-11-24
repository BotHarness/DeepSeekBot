export type PinnedTarget =
  | { kind: 'bot'; slug: string; name: string; unread: number }
  | { kind: 'channel'; name: string; unread: number };

export type PinnedPrototype = 'detached' | 'item' | 'avatar' | 'badge';

export type PinnedTabSlot = 'chats' | 'pinned' | 'activity' | 'sessions' | 'settings';

export type PinnedIslandProps = {
  prototype: PinnedPrototype;
  target: PinnedTarget;
  selected: PinnedTabSlot;
  onSelect(slot: PinnedTabSlot): void;
};

export const pinnedTabOrder: readonly PinnedTabSlot[] = [
  'chats',
  'pinned',
  'activity',
  'sessions',
  'settings',
];
