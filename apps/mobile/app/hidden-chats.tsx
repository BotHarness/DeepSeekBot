import { useLocalSearchParams } from 'expo-router';

import { HiddenChatsScreen } from '../src/ui/chat/hidden-chats-screen';

export default function HiddenChatsRoute() {
  const { hostId } = useLocalSearchParams<{ hostId: string }>();
  return <HiddenChatsScreen hostId={hostId} />;
}
