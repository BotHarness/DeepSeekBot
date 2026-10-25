import { useLocalSearchParams } from 'expo-router';

import { ConversationScreen } from '../../src/ui/chat/conversation-screen';

export default function DmScreen() {
  const { slug, focus, hostId } = useLocalSearchParams<{
    slug: string;
    hostId?: string;
    focus?: string;
  }>();
  return <ConversationScreen expectedHostId={hostId} place={{ kind: 'dm', slug }} focus={focus} />;
}
