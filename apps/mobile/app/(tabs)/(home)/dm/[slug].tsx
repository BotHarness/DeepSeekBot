import { useLocalSearchParams } from 'expo-router';

import { ConversationPages } from '../../../../src/ui/chat/conversation-pages';
import { TabIslandScreen } from '../../../../src/ui/shell/tab-island-screen';

export default function DmScreen() {
  const { slug, focus, focusRequest, hostId } = useLocalSearchParams<{
    slug: string;
    hostId?: string;
    focus?: string;
    focusRequest?: string;
  }>();
  return (
    <TabIslandScreen>
      <ConversationPages
        expectedHostId={hostId}
        place={{ kind: 'dm', slug }}
        focus={focus}
        focusRequest={focusRequest}
      />
    </TabIslandScreen>
  );
}
