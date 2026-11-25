export type TabSlot = 'chats' | 'pinned' | 'activity' | 'sessions' | 'settings';

export type TabRoute = '(home)' | '(pinned)' | '(activity)' | '(sessions)' | '(settings)';

export const defaultTabOrder: readonly TabSlot[] = [
  'chats',
  'pinned',
  'activity',
  'sessions',
  'settings',
];

const routes: Record<TabSlot, TabRoute> = {
  chats: '(home)',
  pinned: '(pinned)',
  activity: '(activity)',
  sessions: '(sessions)',
  settings: '(settings)',
};

export function tabRoute(slot: TabSlot): TabRoute {
  return routes[slot];
}

export function tabSlotOf(route: string): TabSlot | undefined {
  return defaultTabOrder.find((slot) => routes[slot] === route);
}

export function parseTabOrder(stored: unknown): readonly TabSlot[] {
  if (!Array.isArray(stored)) return defaultTabOrder;
  const kept = defaultTabOrder.filter((slot) => stored.includes(slot));
  const ordered = [...kept].sort((a, b) => stored.indexOf(a) - stored.indexOf(b));
  const missing = defaultTabOrder.filter((slot) => !ordered.includes(slot));
  const next = [...ordered, ...missing];
  return next.every((slot, index) => slot === defaultTabOrder[index]) ? defaultTabOrder : next;
}

export function visibleTabs(order: readonly TabSlot[], sessionsTab: boolean): readonly TabSlot[] {
  return sessionsTab ? order : order.filter((slot) => slot !== 'sessions');
}
