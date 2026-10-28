import { type ComponentProps } from 'react';
import { View } from 'react-native';
import { HostScope } from '../../host/host-scope';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { NativePageHeader, NativePageNavigation } from '../primitives/native-page-navigation';
import { BotProfileContent } from './bot-profile-content';
import { ChannelDetailsScreen } from './channel-details-screen';
import { ConversationScreen } from './conversation-screen';
import { GroupProfileContent } from './group-profile-content';
import { profilePageTarget } from './profile-page-target';
import { ProfilePagingContext, type ProfilePaging } from './profile-paging';

export type ConversationPageSource = ComponentProps<typeof ConversationScreen>;

export function useConversationPagePair(
  source: ConversationPageSource | undefined,
  paging: ProfilePaging,
) {
  const { client } = useHostSession(source?.expectedHostId);
  const snapshot = useHostSnapshot(client, paging.focused);
  if (source === undefined) return undefined;
  const target = profilePageTarget(source.place, source.expectedHostId, snapshot.roster);
  const identity = JSON.stringify([source.expectedHostId, source.place]);
  const profile =
    target === undefined ? (
      <LoadingIndicator />
    ) : target.kind === 'bot' ? (
      <BotProfileContent
        slug={target.slug}
        hostId={target.hostId}
        channelId={paging.activity?.channelId}
        activityMessageId={paging.activity?.messageId}
        onClose={paging.close}
      />
    ) : target.kind === 'pair' ? (
      <ChannelDetailsScreen
        hostId={target.hostId}
        channelId={target.channelId}
        onClose={paging.close}
      />
    ) : (
      <GroupProfileContent id={target.channelId} hostId={target.hostId} onClose={paging.close} />
    );
  return {
    chat: (
      <ProfilePagingContext key={identity} value={paging}>
        <View
          testID="retained-chat-page"
          collapsable={false}
          accessibilityElementsHidden={!paging.focused || paging.visible}
          style={{ flex: 1 }}
        >
          <NativePageNavigation>
            <ConversationScreen {...source} active={paging.focused && !paging.visible} />
          </NativePageNavigation>
        </View>
      </ProfilePagingContext>
    ),
    profile: (
      <ProfilePagingContext key={identity} value={paging}>
        <View
          testID="retained-profile-page"
          collapsable={false}
          accessibilityElementsHidden={!paging.focused || !paging.visible}
          onAccessibilityEscape={paging.close}
          style={{ flex: 1 }}
        >
          <NativePageNavigation>
            <HostScope value={target?.hostId}>{profile}</HostScope>
            <NativePageHeader onBack={paging.close} backID="profile-back" />
          </NativePageNavigation>
        </View>
      </ProfilePagingContext>
    ),
  };
}
