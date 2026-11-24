import { badgeCount } from '../primitives/badge-count';
import type { useStrings } from '../strings';
import type { TabSlot } from './tab-slots';

type Strings = ReturnType<typeof useStrings>;

export function navigationLabel(t: Strings, slot: TabSlot, pinnedName?: string): string {
  if (slot === 'settings') return t.settings;
  if (slot === 'activity') return t.activity;
  if (slot === 'sessions') return t.hostSessions.title;
  if (slot === 'pinned') return pinnedName ?? t.pinnedTab.title;
  return t.chats;
}

export function navigationAccessibilityLabel(
  t: Strings,
  slot: TabSlot,
  count: number,
  pinnedLabel?: string,
): string {
  if (slot === 'pinned') return pinnedLabel ?? t.pinnedTab.title;
  const name = navigationLabel(t, slot);
  return slot === 'activity' && count > 0
    ? `${name}, ${t.activityPendingLabel(badgeCount(count))}`
    : name;
}
