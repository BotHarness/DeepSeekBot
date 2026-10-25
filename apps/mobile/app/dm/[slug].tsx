import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { ConversationScreen } from '../../src/ui/chat/conversation-screen';
import { CreatedBotModelHint } from '../../src/ui/chat/created-bot-model-hint';

export default function DmScreen() {
  const { slug, focus, focusRequest, hostId, created } = useLocalSearchParams<{
    slug: string;
    hostId?: string;
    focus?: string;
    focusRequest?: string;
    created?: string;
  }>();
  return (
    <View style={{ flex: 1 }}>
      {created === '1' ? <CreatedBotModelHint slug={slug} hostId={hostId} /> : null}
      <ConversationScreen
        expectedHostId={hostId}
        place={{ kind: 'dm', slug }}
        focus={focus}
        focusRequest={focusRequest}
      />
    </View>
  );
}
