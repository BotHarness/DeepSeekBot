import type { ProfileActivitySource } from '../chat/profile-paging';
import { useIsFocused, useSegments } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Keyboard, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useHostSession } from '../../host/host-session';
import { useConversationPagePair } from '../chat/conversation-page-pair';
import { useDesignTheme } from '../design/theme';
import { useMounted } from '../mounted';
import { useSystemReducedMotion } from '../primitives/use-system-reduced-motion';
import { ChatsPagingContext } from './chats-paging';
import { WorkspacePanel } from './host-drawer';
import { lastChatSource } from './last-chat-source';
import { lastChat, useRecentChats } from './recent-chats';
import { bindWorkspacePaging, closeWorkspacePage, openWorkspacePage } from './workspace-paging';

export function WorkspacePager({ children }: { children: ReactNode }) {
  const theme = useDesignTheme();
  const segments = useSegments();
  const shellFocused = useIsFocused();
  const reduced = useSystemReducedMotion();
  const { hosts } = useHostSession();
  const recent = useRecentChats();
  const [page, setPage] = useState(1);
  const [forward, setForward] = useState(false);
  const [profileEnabled, setProfileEnabled] = useState(false);
  const [activity, setActivity] = useState<ProfileActivitySource>();
  const home = shellFocused && segments.some((segment) => segment === '(home)');
  const next = lastChat(
    recent,
    hosts.map((host) => host.hostId),
  );
  const [retained, setRetained] = useState(next);
  if (home && page === 1 && retained?.href !== next?.href) setRetained(next);
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
  const mount = useMounted<PagerView>(
    (pager) => {
      native.current = pager;
      const release = bindWorkspacePaging({
        open: () => (reduced ? pager.setPageWithoutAnimation(0) : pager.setPage(0)),
        close: () => (reduced ? pager.setPageWithoutAnimation(1) : pager.setPage(1)),
      });
      return () => {
        native.current = null;
        release();
      };
    },
    [reduced],
  );
  const open = useCallback(() => move(3), [move]);
  const close = useCallback(() => move(2), [move]);
  const leaveChat = useCallback(() => move(1), [move]);
  const paging = useMemo(
    () => ({
      visible: page === 3,
      activity,
      setActivity,
      focused: home && page >= 2,
      open,
      close,
      leaveChat,
      setEnabled: setProfileEnabled,
    }),
    [page, home, open, close, leaveChat, activity],
  );
  const pair = useConversationPagePair(source, paging);
  const limit = Math.max(
    page + 1,
    !home || !forward || pair === undefined ? 2 : profileEnabled ? 4 : 3,
  );
  return (
    <PagerView
      ref={mount}
      testID="workspace-pager"
      style={{ flex: 1, backgroundColor: theme.color.base }}
      stableNativePages
      initialPage={1}
      scrollEnabled={home}
      pageLimit={limit}
      keyboardDismissMode="on-drag"
      overdrag={false}
      layoutDirection="ltr"
      onPageSelected={(event) => setPage(event.nativeEvent.position)}
    >
      <View
        key="workspaces"
        testID="workspace-page"
        collapsable={false}
        accessibilityElementsHidden={page !== 0}
        onAccessibilityEscape={() => closeWorkspacePage()}
        style={{ width: '100%', height: '100%' }}
      >
        <WorkspacePanel page active={home && page === 0} />
      </View>
      <View
        key="chats"
        testID="workspace-chats-page"
        collapsable={false}
        accessibilityElementsHidden={page !== 1}
        onAccessibilityEscape={
          home
            ? () => {
                openWorkspacePage();
              }
            : undefined
        }
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
