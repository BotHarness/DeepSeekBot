import { useLocalSearchParams } from 'expo-router';

import { ConversationScreen } from '../../src/ui/chat/conversation-screen';

export default function DmScreen() {
  const { slug, focus } = useLocalSearchParams<{ slug: string; focus?: string }>();
  return <ConversationScreen place={{ kind: 'dm', slug }} focus={focus} />;
}
