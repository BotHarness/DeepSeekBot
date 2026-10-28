import { router } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { useHostSession } from '../../host/host-session';
import { lastChatSwipe } from '../design/tokens';
import { useHostDrawerOpen } from './host-drawer';
import { lastChatProgress, opensLastChat } from './last-chat-swipe-model';
import { lastChat, useRecentChats } from './recent-chats';

export function LastChatSwipe({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { hosts } = useHostSession();
  const recent = useRecentChats();
  const drawerOpen = useHostDrawerOpen();
  const chat = lastChat(
    recent,
    hosts.map((host) => host.hostId),
  );
  const opened = useSharedValue(false);
  const href = chat?.href;

  const open = useCallback(() => {
    if (href !== undefined) router.navigate(href);
  }, [href]);

  const pan = Gesture.Pan()
    .enabled(enabled && chat !== undefined && !drawerOpen)
    .activeOffsetX(-lastChatSwipe.start)
    .failOffsetY([-lastChatSwipe.verticalFail, lastChatSwipe.verticalFail])
    .onStart(() => {
      opened.value = false;
    })
    .onUpdate((event) => {
      if (opened.value || lastChatProgress(event.translationX) < 1) return;
      opened.value = true;
      runOnJS(open)();
    })
    .onEnd((event) => {
      if (opened.value || !opensLastChat(event.translationX, event.velocityX)) return;
      opened.value = true;
      runOnJS(open)();
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }} collapsable={false}>
        {children}
      </View>
    </GestureDetector>
  );
}
