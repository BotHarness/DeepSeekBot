import { useLocalSearchParams } from 'expo-router';

import { ConversationScreen } from '../../src/ui/chat/conversation-screen';

export default function DmScreen() {
  const { slug, focus, focusRequest, hostId } = useLocalSearchParams<{
    slug: string;
    hostId?: string;
    focus?: string;
    focusRequest?: string;
  }>();
  return (
    <ConversationScreen
      expectedHostId={hostId}
      place={{ kind: 'dm', slug }}
      focus={focus}
      focusRequest={focusRequest}
    />
  );
}
