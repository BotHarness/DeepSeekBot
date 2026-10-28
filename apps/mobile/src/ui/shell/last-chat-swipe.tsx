import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useHostSession } from '../../host/host-session';
import { useHostDrawerOpen } from './host-drawer';
import { lastChat, useRecentChats } from './recent-chats';
import { SwipeOpen } from './swipe-open';

export function LastChatSwipe({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { hosts } = useHostSession();
  const recent = useRecentChats();
  const drawerOpen = useHostDrawerOpen();
  const chat = lastChat(
    recent,
    hosts.map((host) => host.hostId),
  );
  const href = chat?.href;
  return (
    <SwipeOpen
      enabled={enabled && href !== undefined && !drawerOpen}
      onOpen={() => {
        if (href !== undefined) router.navigate(href);
      }}
    >
      {children}
    </SwipeOpen>
  );
}
