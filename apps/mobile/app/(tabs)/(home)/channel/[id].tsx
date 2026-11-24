import { useLocalSearchParams } from 'expo-router';

import { ConversationPages } from '../../../../src/ui/chat/conversation-pages';
import { TabIslandScreen } from '../../../../src/ui/shell/tab-island-screen';

export default function ChannelScreen() {
  const { id, focus, focusRequest, focusWindow, hostId } = useLocalSearchParams<{
    id: string;
    hostId?: string;
    focus?: string;
    focusRequest?: string;
    focusWindow?: string;
  }>();
  return (
    <TabIslandScreen>
      <ConversationPages
        expectedHostId={hostId}
        place={{ kind: 'channel', channelId: id }}
        focus={focus}
        focusRequest={focusRequest}
        latestWindowOnly={focusWindow === 'latest'}
      />
    </TabIslandScreen>
  );
}
