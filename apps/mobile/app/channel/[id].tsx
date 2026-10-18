import { useLocalSearchParams } from 'expo-router';

import { ConversationScreen } from '../../src/ui/chat/conversation-screen';

export default function ChannelScreen() {
  const { id, focus, focusWindow, hostId, deviceId, retained } = useLocalSearchParams<{
    id: string;
    hostId?: string;
    deviceId?: string;
    retained?: string;
    focus?: string;
    focusWindow?: string;
  }>();
  return (
    <ConversationScreen
      expectedHostId={hostId}
      expectedDeviceId={deviceId}
      retainedOnly={retained === '1'}
      place={{ kind: 'channel', channelId: id }}
      focus={focus}
      latestWindowOnly={focusWindow === 'latest'}
    />
  );
}
