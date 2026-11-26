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

export function moveVisibleTab(
  order: readonly TabSlot[],
  sessionsTab: boolean,
  from: number,
  destination: number,
): readonly TabSlot[] {
  const visible = [...visibleTabs(order, sessionsTab)];
  if (from < 0 || from >= visible.length) return order;
  const target = Math.min(Math.max(destination, 0), visible.length);
  const [moved] = visible.splice(from, 1);
  if (moved === undefined) return order;
  visible.splice(target > from ? target - 1 : target, 0, moved);
  if (sessionsTab) return parseTabOrder(visible);
  const at = Math.min(order.indexOf('sessions'), visible.length);
  visible.splice(at < 0 ? visible.length : at, 0, 'sessions');
  return parseTabOrder(visible);
}

export function isDefaultTabOrder(order: readonly TabSlot[]): boolean {
  return order.every((slot, index) => slot === defaultTabOrder[index]);
}
