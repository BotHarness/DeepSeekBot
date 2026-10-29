import type { ReactNode } from 'react';
import type { RecentChat } from './recent-chats';
export type ChatsSheetRequest = { chat: RecentChat | undefined; active: boolean; enabled: boolean };
export function ChatsSheetRoot({ children }: { children: ReactNode }) {
  return children;
}
export function ChatsSheetRegistration(_props: ChatsSheetRequest) {
  return null;
}
