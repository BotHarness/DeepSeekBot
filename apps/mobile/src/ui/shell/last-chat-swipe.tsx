import { ChatsSheetRegistration } from './chats-sheet-root';
import { swipeChatTarget } from './swipe-chat-target';
import { router, useIsFocused } from 'expo-router';
import type { ReactNode } from 'react';
import { View, Platform } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useHostSession } from '../../host/host-session';
import { useHeaderOverlap } from '../chat/native-header';
import { useDesignTheme } from '../design/theme';
import { ListSkeleton } from '../primitives/list-skeleton';
import { useHostDrawerOpen } from './host-drawer';
import { lastChat, useRecentChats, type RecentChat } from './recent-chats';
import { swipeHref } from './swipe-entry';
import { SwipeOpen } from './swipe-open';
import { SwipePreview } from './swipe-preview';

export function LastChatSwipe({
  enabled,
  candidates,
  travel,
  children,
}: {
  enabled: boolean;
  candidates?: readonly RecentChat[];
  travel: SharedValue<number>;
  children: ReactNode;
}) {
  const { hosts } = useHostSession();
  const recent = useRecentChats();
  const drawerOpen = useHostDrawerOpen();
  const focused = useIsFocused();
  const previous = lastChat(
    recent,
    hosts.map((host) => host.hostId),
  );
  const chat = candidates === undefined ? previous : swipeChatTarget(recent, candidates);
  if (Platform.OS === 'android')
    return (
      <>
        <ChatsSheetRegistration
          chat={enabled ? chat : undefined}
          active={focused}
          enabled={enabled && !drawerOpen}
        />
        {children}
      </>
    );
  const href = chat?.href;
  return (
    <SwipeOpen
      enabled={enabled && href !== undefined && !drawerOpen}
      travel={travel}
      onOpen={() => {
        if (href !== undefined) router.navigate(swipeHref(href));
      }}
    >
      {children}
    </SwipeOpen>
  );
}

export function LastChatPreview({ travel }: { travel: SharedValue<number> }) {
  const theme = useDesignTheme();
  if (Platform.OS === 'android') return null;
  return (
    <SwipePreview travel={travel} color={theme.color.base}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <ListSkeleton layout="messages" />
      </View>
    </SwipePreview>
  );
}

export function ChatsSwipePreview({ travel }: { travel: SharedValue<number> }) {
  const theme = useDesignTheme();
  const headerOverlap = useHeaderOverlap();
  return (
    <SwipePreview travel={travel} color={theme.color.base}>
      <View style={{ paddingTop: headerOverlap }}>
        <ListSkeleton />
      </View>
    </SwipePreview>
  );
}
