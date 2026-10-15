import { useLocalSearchParams } from 'expo-router';

import { ConversationScreen } from '../../src/ui/chat/conversation-screen';

export default function ChannelScreen() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  return <ConversationScreen place={{ kind: 'channel', channelId: id }} focus={focus} />;
}
