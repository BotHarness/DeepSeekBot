export interface MenuViewer {
  readonly kind: 'owner' | 'member';
  readonly owner: boolean;
  readonly permissions: readonly string[];
}

const NEEDS: Readonly<Record<string, string>> = {
  bot: 'bots.createPrivate',
  channel: 'channels.create',
  'message-person': 'dm.humans',
};

export const MEMBER_MENU_ITEMS: ReadonlySet<string> = new Set([
  'bot',
  'channel',
  'section',
  'public-channels',
  'message-person',
  'message-bot',
]);

export function menuItemAllowed(id: string, viewer: MenuViewer | undefined): boolean {
  if (viewer === undefined || viewer.owner) return true;
  if (viewer.kind === 'member' && !MEMBER_MENU_ITEMS.has(id)) return false;
  const needed = NEEDS[id];
  return needed === undefined || viewer.permissions.includes(needed);
}
