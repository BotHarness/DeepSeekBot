import { Stack, useIsFocused, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Keyboard, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useHostSession } from '../../host/host-session';
import { useDesignTheme } from '../design/theme';
import { useSystemReducedMotion } from '../primitives/use-system-reduced-motion';
import { leaveScreen } from '../shell/leave-screen';
import { useConversationPagePair } from './conversation-page-pair';
import { ConversationScreen } from './conversation-screen';

export function ConversationPages(props: ComponentProps<typeof ConversationScreen>) {
  const theme = useDesignTheme();
  const focused = useIsFocused();
  const router = useRouter();
  const reduced = useSystemReducedMotion();
  const initial = useHostSession();
  const [origin, setOrigin] = useState(props.expectedHostId ?? initial.saved?.hostId);
  if (origin === undefined && initial.saved) setOrigin(initial.saved.hostId);
  const hostId = props.expectedHostId ?? origin;
  const pager = useRef<PagerView>(null);
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const move = useCallback(
    (page: number) => {
      Keyboard.dismiss();
      if (reduced) pager.current?.setPageWithoutAnimation(page);
      else pager.current?.setPage(page);
    },
    [reduced],
  );
  const open = useCallback(() => move(1), [move]);
  const close = useCallback(() => move(0), [move]);
  const leaveChat = useCallback(() => leaveScreen(router), [router]);
  const paging = useMemo(
    () => ({ visible, focused, open, close, leaveChat, setEnabled }),
    [visible, focused, open, close, leaveChat],
  );
  const pages = useConversationPagePair({ ...props, expectedHostId: hostId }, paging);
  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: !visible }} />
      <PagerView
        ref={pager}
        testID="conversation-profile-pager"
        style={{ flex: 1, backgroundColor: theme.color.base }}
        initialPage={0}
        scrollEnabled={focused && (visible || enabled)}
        overdrag={false}
        keyboardDismissMode="on-drag"
        layoutDirection="ltr"
        onPageSelected={(event) => setVisible(event.nativeEvent.position === 1)}
      >
        <View key="chat" collapsable={false} style={{ width: '100%', height: '100%' }}>
          {pages?.chat}
        </View>
        <View key="profile" collapsable={false} style={{ width: '100%', height: '100%' }}>
          {pages?.profile}
        </View>
      </PagerView>
    </>
  );
}
