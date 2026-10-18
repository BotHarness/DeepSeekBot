import { useLocalSearchParams } from 'expo-router';

import { ConversationScreen } from '../../src/ui/chat/conversation-screen';

export default function DmScreen() {
  const { slug, focus, hostId, deviceId, retained } = useLocalSearchParams<{
    slug: string;
    hostId?: string;
    deviceId?: string;
    retained?: string;
    focus?: string;
  }>();
  return (
    <ConversationScreen
      expectedHostId={hostId}
      expectedDeviceId={deviceId}
      retainedOnly={retained === '1'}
      place={{ kind: 'dm', slug }}
      focus={focus}
    />
  );
}
