import { useLocalSearchParams } from 'expo-router';

import { ConversationPages } from '../../src/ui/chat/conversation-pages';

export default function DmScreen() {
  const { slug, focus, focusRequest, hostId, compose } = useLocalSearchParams<{
    slug: string;
    hostId?: string;
    focus?: string;
    focusRequest?: string;
    compose?: string;
  }>();
  return (
    <ConversationPages
      expectedHostId={hostId}
      place={{ kind: 'dm', slug }}
      focus={focus}
      focusRequest={focusRequest}
      composeOnOpen={compose === '1'}
    />
  );
}
