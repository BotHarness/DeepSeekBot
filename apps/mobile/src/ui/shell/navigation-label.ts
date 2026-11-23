import type { useStrings } from '../strings';
import type { NavigationDestination } from './navigation-destination';

type Strings = ReturnType<typeof useStrings>;
type Kind = Pick<NavigationDestination, 'activity' | 'settings' | 'sessions'>;

export function navigationLabel(t: Strings, item: Kind): string {
  if (item.settings) return t.settings;
  if (item.activity) return t.activity;
  if (item.sessions) return t.hostSessions.title;
  return t.chats;
}
