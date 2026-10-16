import { useLocalSearchParams } from 'expo-router';

import { ConversationScreen } from '../../src/ui/chat/conversation-screen';

export default function ChannelScreen() {
  const { id, focus, focusWindow } = useLocalSearchParams<{
    id: string;
    focus?: string;
    focusWindow?: string;
  }>();
  return (
    <ConversationScreen
      place={{ kind: 'channel', channelId: id }}
      focus={focus}
      latestWindowOnly={focusWindow === 'latest'}
    />
  );
}
