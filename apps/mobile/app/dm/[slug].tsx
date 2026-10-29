import { useLocalSearchParams } from 'expo-router';

import { ConversationPages } from '../../src/ui/chat/conversation-pages';

export default function DmScreen() {
  const { slug, focus, focusRequest, deviceId, retained, hostId } = useLocalSearchParams<{
    slug: string;
    hostId?: string;
    deviceId?: string;
    retained?: string;
    focus?: string;
    focusRequest?: string;
  }>();
  return (
    <ConversationPages
      expectedHostId={hostId}
      expectedDeviceId={deviceId}
      retainedOnly={retained === '1'}
      place={{ kind: 'dm', slug }}
      focus={focus}
      focusRequest={focusRequest}
    />
  );
}
