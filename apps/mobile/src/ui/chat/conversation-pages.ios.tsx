import { Stack, useIsFocused } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Keyboard, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import { HostScope } from '../../host/host-scope';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { profilePageTarget } from './profile-page-target';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { useDesignTheme } from '../design/theme';
import { NativePageHeader, NativePageNavigation } from '../primitives/native-page-navigation';
import { useSystemReducedMotion } from '../primitives/use-system-reduced-motion';
import { BotProfileContent } from './bot-profile-content';
import { ChannelDetailsScreen } from './channel-details-screen';
import { ConversationScreen } from './conversation-screen';
import { GroupProfileContent } from './group-profile-content';
import { ProfilePagingContext } from './profile-paging';

export function ConversationPages(props: ComponentProps<typeof ConversationScreen>) {
  const theme = useDesignTheme();
  const focused = useIsFocused();
  const reduced = useSystemReducedMotion();
  const initial = useHostSession();
  const [origin, setOrigin] = useState(props.expectedHostId ?? initial.saved?.hostId);
  if (origin === undefined && initial.saved) setOrigin(initial.saved.hostId);
  const hostId = props.expectedHostId ?? origin;
  const { client } = useHostSession(hostId);
  const snapshot = useHostSnapshot(client);
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
  const paging = useMemo(
    () => ({ visible, focused, open, close, setEnabled }),
    [visible, focused, open, close],
  );
  const target = profilePageTarget(props.place, hostId, snapshot.roster);
  const profile =
    target === undefined ? (
      <LoadingIndicator />
    ) : target.kind === 'bot' ? (
      <BotProfileContent slug={target.slug} hostId={target.hostId} onClose={close} />
    ) : target.kind === 'pair' ? (
      <ChannelDetailsScreen hostId={target.hostId} channelId={target.channelId} onClose={close} />
    ) : (
      <GroupProfileContent id={target.channelId} hostId={target.hostId} onClose={close} />
    );
  return (
    <ProfilePagingContext value={paging}>
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
        <View
          key="chat"
          testID="retained-chat-page"
          collapsable={false}
          accessibilityElementsHidden={visible}
          style={{ width: '100%', height: '100%' }}
        >
          <NativePageNavigation>
            <ConversationScreen {...props} expectedHostId={hostId} />
          </NativePageNavigation>
        </View>
        <View
          key="profile"
          testID="retained-profile-page"
          collapsable={false}
          accessibilityElementsHidden={!visible}
          onAccessibilityEscape={close}
          style={{ width: '100%', height: '100%' }}
        >
          <NativePageNavigation>
            <HostScope value={target?.hostId}>{profile}</HostScope>
            <NativePageHeader onBack={close} backID="profile-back" />
          </NativePageNavigation>
        </View>
      </PagerView>
    </ProfilePagingContext>
  );
}
