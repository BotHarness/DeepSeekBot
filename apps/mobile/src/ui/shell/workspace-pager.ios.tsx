import type { ProfileActivitySource } from '../chat/profile-paging';
import { useIsFocused, useSegments } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Keyboard, View, type ViewInstance } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useHostSession } from '../../host/host-session';
import { useConversationPagePair } from '../chat/conversation-page-pair';
import { useDesignTheme } from '../design/theme';
import { useMounted } from '../mounted';
import { useSystemReducedMotion } from '../primitives/use-system-reduced-motion';
import { ChatsPagingContext, chatsListSegments } from './chats-paging';
import { lastChatSource } from './last-chat-source';
import { lastChat, useRecentChats } from './recent-chats';

export function WorkspacePager({ children }: { children: ReactNode }) {
  const theme = useDesignTheme();
  const segments = useSegments();
  const shellFocused = useIsFocused();
  const reduced = useSystemReducedMotion();
  const { hosts } = useHostSession();
  const recent = useRecentChats();
  const [page, setPage] = useState(0);
  const [forward, setForward] = useState(false);
  const [profileEnabled, setProfileEnabled] = useState(false);
  const [activity, setActivity] = useState<ProfileActivitySource>();
  const home = shellFocused && chatsListSegments(segments);
  const stacked =
    shellFocused &&
    segments.some((segment) => segment === '(home)') &&
    !chatsListSegments(segments);
  const next = lastChat(
    recent,
    hosts.map((host) => host.hostId),
  );
  const [retained, setRetained] = useState(next);
  if (home && page === 0 && retained?.href !== next?.href) setRetained(next);
  const source = useMemo(() => lastChatSource(retained), [retained]);
  const native = useRef<PagerView | null>(null);
  const move = useCallback(
    (index: number) => {
      Keyboard.dismiss();
      if (reduced) native.current?.setPageWithoutAnimation(index);
      else native.current?.setPage(index);
    },
    [reduced],
  );
  const mount = useMounted<PagerView>((pager) => {
    native.current = pager;
    return () => {
      native.current = null;
    };
  }, []);
  const snap = useMounted<ViewInstance>(() => {
    if (stacked && page !== 0) native.current?.setPageWithoutAnimation(0);
  }, [stacked, page]);
  const open = useCallback(() => move(2), [move]);
  const close = useCallback(() => move(1), [move]);
  const leaveChat = useCallback(() => move(0), [move]);
  const paging = useMemo(
    () => ({
      visible: page === 2,
      activity,
      setActivity,
      focused: home && page >= 1,
      open,
      close,
      leaveChat,
      setEnabled: setProfileEnabled,
    }),
    [page, home, open, close, leaveChat, activity],
  );
  const pair = useConversationPagePair(source, paging);
  const limit = Math.max(page + 1, !home || pair === undefined ? 1 : profileEnabled ? 3 : 2);
  return (
    <PagerView
      ref={mount}
      testID="workspace-pager"
      style={{ flex: 1, backgroundColor: theme.color.base }}
      stableNativePages
      initialPage={0}
      scrollEnabled={home && forward}
      pageLimit={limit}
      keyboardDismissMode="on-drag"
      overdrag={false}
      layoutDirection="ltr"
      onPageSelected={(event) => setPage(event.nativeEvent.position)}
    >
      <View
        key="chats"
        ref={snap}
        testID="workspace-chats-page"
        collapsable={false}
        accessibilityElementsHidden={page !== 0}
        style={{ width: '100%', height: '100%' }}
      >
        <ChatsPagingContext value={setForward}>{children}</ChatsPagingContext>
      </View>
      <View key="last-chat" collapsable={false} style={{ width: '100%', height: '100%' }}>
        {pair?.chat}
      </View>
      <View key="last-profile" collapsable={false} style={{ width: '100%', height: '100%' }}>
        {pair?.profile}
      </View>
    </PagerView>
  );
}
