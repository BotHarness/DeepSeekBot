import { useLocalSearchParams } from 'expo-router';

import { ConversationPages } from '../../src/ui/chat/conversation-pages';

export default function ChannelScreen() {
  const { id, focus, focusRequest, deviceId, retained, focusWindow, hostId } =
    useLocalSearchParams<{
      id: string;
      hostId?: string;
      deviceId?: string;
      retained?: string;
      focus?: string;
      focusRequest?: string;
      focusWindow?: string;
    }>();
  return (
    <ConversationPages
      expectedHostId={hostId}
      expectedDeviceId={deviceId}
      retainedOnly={retained === '1'}
      place={{ kind: 'channel', channelId: id }}
      focus={focus}
      focusRequest={focusRequest}
      latestWindowOnly={focusWindow === 'latest'}
    />
  );
}
