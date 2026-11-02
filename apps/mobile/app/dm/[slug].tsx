import { useLocalSearchParams } from 'expo-router';

import { ConversationPages } from '../../src/ui/chat/conversation-pages';

export default function DmScreen() {
  const { slug, focus, focusRequest, hostId } = useLocalSearchParams<{
    slug: string;
    hostId?: string;
    focus?: string;
    focusRequest?: string;
  }>();
  return (
    <ConversationPages
      expectedHostId={hostId}
      place={{ kind: 'dm', slug }}
      focus={focus}
      focusRequest={focusRequest}
    />
  );
}
